import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../utils/api";
import { THEME } from "../styles/theme";
import { showError } from "./ErrorModal";
import { SpinnerIcon, PlusCircleIcon } from "./icons";

// User Accounts → Exam Types (Head Master / Second Master).
// Adds new exam types for Results Management, sets the Kiswahili name used in
// results SMS, hides types no longer needed, and deletes unused ones.
const input = { padding: "9px 12px", borderRadius: 4, border: `1px solid ${THEME.border}`, fontSize: 13, background: THEME.surface, color: THEME.text, boxSizing: "border-box" };
const smallBtn = (color) => ({ padding: "5px 10px", borderRadius: 4, border: `1px solid ${color}`, background: THEME.surface, color, fontWeight: 700, fontSize: 12, cursor: "pointer" });

export default function ExamTypesManager({ token, isMobile }) {
  const [rows, setRows] = useState(null);
  const [name, setName] = useState("");
  const [nameSw, setNameSw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }
  const [swEdit, setSwEdit] = useState(null); // { id, value }

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
    try { await apiFetch(`/exam-types/${id}`, { method: "PATCH", body: JSON.stringify(body) }, token); load(); }
    catch (err) { showError(err.message); }
  };
  const del = async (r) => {
    if (!window.confirm(`Delete the exam type "${r.name}"?`)) return;
    try { await apiFetch(`/exam-types/${r.id}`, { method: "DELETE" }, token); load(); } catch (err) { showError(err.message); }
  };

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
          {rows.map((r, i) => (
            <div key={r.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "9px 12px", borderTop: i ? `1px solid ${THEME.border}` : "none", opacity: r.is_active ? 1 : 0.55 }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: THEME.text }}>{r.name}{!r.is_active && <span style={{ fontWeight: 400, color: THEME.muted }}> (hidden)</span>}</div>
                {swEdit?.id === r.id ? (
                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                    <input value={swEdit.value} autoFocus maxLength={160} onChange={(e) => setSwEdit({ id: r.id, value: e.target.value })} style={{ ...input, flex: 1, padding: "5px 8px", fontSize: 12 }} aria-label="Kiswahili name" />
                    <button type="button" onClick={async () => { await patch(r.id, { name_sw: swEdit.value }); setSwEdit(null); }} style={smallBtn(THEME.navy)}>Save</button>
                    <button type="button" onClick={() => setSwEdit(null)} style={smallBtn(THEME.muted)}>Cancel</button>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: THEME.muted }}>
                    {r.name_sw ? `Kiswahili: ${r.name_sw}` : "Kiswahili: not set"}
                    {" · "}<button type="button" onClick={() => setSwEdit({ id: r.id, value: r.name_sw || "" })} style={{ background: "none", border: "none", padding: 0, color: THEME.navy, textDecoration: "underline", cursor: "pointer", fontSize: 12 }}>edit</button>
                    {r.used > 0 && <> · used in {r.used} exam period{r.used === 1 ? "" : "s"}</>}
                  </div>
                )}
              </div>
              <button type="button" onClick={() => patch(r.id, { is_active: !r.is_active })} style={smallBtn(THEME.navy)}>{r.is_active ? "Hide" : "Show"}</button>
              {r.used === 0 && <button type="button" onClick={() => del(r)} style={smallBtn(THEME.danger)}>Delete</button>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
