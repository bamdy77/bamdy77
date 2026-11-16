import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../utils/api";
import { THEME } from "../styles/theme";
import { showError } from "./ErrorModal";
import { useConfirm } from "./ConfirmDialog";
import { ActionMenu, MenuItem } from "./ActionMenu";
import { SpinnerIcon, PlusCircleIcon, EditIcon, EyeIcon, PauseCircleIcon, TrashIcon } from "./icons";

// User Accounts → Exam Types (Head Master / Second Master).
// Adds new exam types for Results Management, sets the Kiswahili name used in
// results SMS, hides types no longer needed, and deletes unused ones.
// Row actions (Edit / Hide / Delete) live in the ⋮ menu, like the accounts list.
const input = { padding: "9px 12px", borderRadius: 4, border: `1px solid ${THEME.border}`, fontSize: 13, background: THEME.surface, color: THEME.text, boxSizing: "border-box" };
const smallBtn = (color) => ({ padding: "5px 10px", borderRadius: 4, border: `1px solid ${color}`, background: THEME.surface, color, fontWeight: 700, fontSize: 12, cursor: "pointer" });

export default function ExamTypesManager({ token, isMobile }) {
  const [rows, setRows] = useState(null);
  const [name, setName] = useState("");
  const [nameSw, setNameSw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }
  const [edit, setEdit] = useState(null); // { id, name, name_sw, used }
  const [saving, setSaving] = useState(false);
  const { confirm, ConfirmDialogPortal } = useConfirm();

  const load = useCallback(() => {
    apiFetch("/exam-types?all=1", {}, token).then((d) => setRows(d.exam_types || [])).catch((e) => { setRows([]); setMsg({ ok: false, text: e.message }); });
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    if (name.trim().length < 3) return setMsg({ ok: false, text: "Please type the exam type name (at least 3 letters)." });
    setBusy(true); setMsg(null);
    try {
      const d = await apiFetch("/exam-types", { method: "POST", body: JSON.stringify({ name, name_sw: nameSw }) }, token);
      setMsg({ ok: true, text: d.message || "Exam type added." }); setName(""); setNameSw(""); load();
    } catch (err) { setMsg({ ok: false, text: err.message }); } finally { setBusy(false); }
  };
  const patch = async (id, body) => {
    try { await apiFetch(`/exam-types/${id}`, { method: "PATCH", body: JSON.stringify(body) }, token); load(); return true; }
    catch (err) { showError(err.message); return false; }
  };
  const saveEdit = async () => {
    if (edit.name.trim().length < 3) return showError("Please type the exam type name (at least 3 letters).");
    setSaving(true);
    const body = { name_sw: edit.name_sw };
    if (!edit.used) body.name = edit.name;
    const ok = await patch(edit.id, body);
    setSaving(false);
    if (ok) setEdit(null);
  };
  const del = (r) => confirm(`Delete the exam type "${r.name}"? This cannot be undone.`, async () => {
    try { await apiFetch(`/exam-types/${r.id}`, { method: "DELETE" }, token); load(); } catch (err) { showError(err.message); }
  }, { confirmLabel: "Delete", cancelLabel: "Cancel" });

  return (
    <section style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, padding: isMobile ? 14 : 18, marginBottom: 28, maxWidth: 760 }}>
      <h3 style={{ margin: "0 0 4px", fontSize: 16, color: THEME.heading }}>Exam Types</h3>
      <p style={{ margin: "0 0 14px", fontSize: 12.5, color: THEME.muted, lineHeight: 1.6 }}>
        The exam types teachers can choose in Results Management. Add a new one when an exam is missing. The Kiswahili name is used in results SMS to parents.
      </p>

      <form onSubmit={add} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.3fr 1.3fr auto", gap: 8, marginBottom: 10 }}>
        <input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Exam type (e.g. Pre-National Examination)" style={input} aria-label="Exam type name" />
        <input value={nameSw} maxLength={160} onChange={(e) => setNameSw(e.target.value)} placeholder="Kiswahili (e.g. Mtihani wa Utangulizi wa Taifa)" style={input} aria-label="Kiswahili name" />
        <button type="submit" disabled={busy} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 16px", borderRadius: 4, border: "none", background: THEME.navy, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          {busy ? <SpinnerIcon size={13} /> : <PlusCircleIcon size={13} />}Add
        </button>
      </form>
      {msg && <div style={{ fontSize: 12.5, marginBottom: 10, color: msg.ok ? THEME.success : THEME.danger }}>{msg.text}</div>}

      {!rows ? <div style={{ fontSize: 13, color: THEME.muted }}>Loading…</div> : (
        <div style={{ border: `1px solid ${THEME.border}`, borderRadius: 4, overflow: "hidden" }}>
          {rows.length === 0 && <div style={{ padding: 12, fontSize: 13, color: THEME.muted }}>No exam types yet.</div>}
          {rows.map((r, i) => (
            <div key={r.id} style={{ padding: "10px 12px", borderTop: i ? `1px solid ${THEME.border}` : "none", background: r.is_active ? THEME.surface : THEME.bg }}>
              {edit?.id === r.id ? (
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
                  <label style={{ fontSize: 11.5, color: THEME.muted, display: "grid", gap: 4 }}>
                    Exam type
                    <input value={edit.name} disabled={!!edit.used} maxLength={120} onChange={(e) => setEdit({ ...edit, name: e.target.value })} style={{ ...input, opacity: edit.used ? 0.6 : 1 }} aria-label="Edit exam type name" />
                  </label>
                  <label style={{ fontSize: 11.5, color: THEME.muted, display: "grid", gap: 4 }}>
                    Kiswahili (for SMS)
                    <input value={edit.name_sw} autoFocus maxLength={160} onChange={(e) => setEdit({ ...edit, name_sw: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEdit(null); }} style={input} aria-label="Edit Kiswahili name" />
                  </label>
                  {edit.used > 0 && <div style={{ gridColumn: "1 / -1", fontSize: 11.5, color: THEME.muted }}>The exam type name cannot change because results already use it. Only the Kiswahili name can be changed.</div>}
                  <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button type="button" onClick={() => setEdit(null)} style={smallBtn(THEME.muted)}>Cancel</button>
                    <button type="button" onClick={saveEdit} disabled={saving} style={{ ...smallBtn(THEME.navy), background: THEME.navy, color: "#fff", display: "inline-flex", alignItems: "center", gap: 6 }}>{saving && <SpinnerIcon size={11} />}Save</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: r.is_active ? THEME.text : THEME.muted, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {r.name}
                      {!r.is_active && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 7px", borderRadius: 10, background: THEME.border, color: THEME.muted }}>Hidden</span>}
                    </div>
                    <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>
                      {r.name_sw || <i>No Kiswahili name</i>}
                      {r.used > 0 && <> · used in {r.used} exam period{r.used === 1 ? "" : "s"}</>}
                    </div>
                  </div>
                  <ActionMenu>
                    <MenuItem icon={<EditIcon size={14} />} onClick={() => setEdit({ id: r.id, name: r.name, name_sw: r.name_sw || "", used: r.used })}>Edit</MenuItem>
                    <MenuItem icon={r.is_active ? <PauseCircleIcon size={14} /> : <EyeIcon size={14} />} onClick={() => patch(r.id, { is_active: !r.is_active })}>{r.is_active ? "Hide" : "Show"}</MenuItem>
                    {r.used === 0 && <MenuItem danger icon={<TrashIcon size={14} />} onClick={() => del(r)}>Delete</MenuItem>}
                  </ActionMenu>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {ConfirmDialogPortal}
    </section>
  );
}
