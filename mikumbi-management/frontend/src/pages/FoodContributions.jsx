import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { apiFetch, API_BASE } from "../utils/api";
import { THEME } from "../styles/theme";
import { showSuccess } from "../components/SuccessModal";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { BedIcon, SunIcon, CalendarIcon, ClockIcon, PlusCircleIcon, CheckIcon, CheckCircleIcon, CloseIcon, ChevronLeftIcon, ChevronRightIcon, SpinnerIcon, EditIcon, EyeIcon, PauseCircleIcon, TrashIcon, LayersIcon, SettingsIcon, UtensilsIcon, DownloadIcon } from "../components/icons";
import { showError } from "../components/ErrorModal";
import { useConfirm } from "../components/ConfirmDialog";
import { ActionMenu, MenuItem } from "../components/ActionMenu";

const unitShort = (u) => (u === "LITRES" ? "L" : u === "PIECES" ? "pcs" : "kg");

const FORMS = ["Form I", "Form II", "Form III", "Form IV"];

// Colored stat card - matches the tinted look Student Management/Timetable
// (and now Contributions Management) already use, instead of the single
// flat neutral card every stat used to share here, which made it hard to
// tell "students who contributed" apart from totals at a glance.
function StatCard({ label, value, sub, color = THEME.navy }) {
  return (
    <div style={{ background: `color-mix(in srgb, ${color} 16%, ${THEME.surface})`, border: `1px solid ${THEME.border}`, borderRadius: 4, padding: "12px 18px", minWidth: 160 }}>
      <div style={{ fontSize: 11.5, color: THEME.muted }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: THEME.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// Two ways to view this page (class_teacher must never reach it at all -
// gated out at the route/menu level):
//  - Recorder (food_teacher): Boarding, Day, Daily Collections. Recording
//    contributions is their job, but History is oversight-only - even the
//    Food Teacher doesn't see it here.
//  - Oversight (admin/second_master): read-only, every class - Daily
//    Collections, History.
export default function FoodContributions() {
  const { user } = useAuth();
  const { isMobile, isTablet } = useBreakpoint();
  const isCompact = isMobile || isTablet;
  const myRoles = user?.roles && user.roles.length ? user.roles : [user?.role];
  const isRecorder = myRoles.includes("food_teacher");
  const isOverseer = !isRecorder && myRoles.some((r) => ["admin", "second_master"].includes(r));
  const [tab, setTab] = useState(isRecorder ? "boarding" : "daily");

  const tabs = isRecorder
    ? [["boarding", "Boarding Students"], ["day", "Day Students"], ["daily", "Daily Collections"], ["status", "Completed / Owing"]]
    : [["types", "Food Types"], ["daily", "Daily Collections"], ["status", "Completed / Owing"], ["history", "History"]];
  const tabIcons = { boarding: BedIcon, day: SunIcon, daily: CalendarIcon, history: ClockIcon, types: SettingsIcon, status: CheckCircleIcon };

  return (
    <div style={{ padding: isMobile ? "16px 12px" : isTablet ? "24px 20px" : 32 }}>
      <h2 style={{ color: THEME.heading, fontSize: isMobile ? 16 : isTablet ? 18 : 20, marginBottom: 4 }}>Manage Foods</h2>
      <p style={{ color: THEME.muted, fontSize: 13.5, marginBottom: 18 }}>
        {isRecorder
          ? "Track food contributions separately for boarding and day students - a student can bring more than one type, and can bring the same type in several installments."
          : "Read-only view - recording contributions is handled by the Food Teacher."}
      </p>
      <div className={isCompact ? "table-scroll" : undefined} style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: isCompact ? "nowrap" : "wrap", paddingBottom: isCompact ? 4 : 0 }}>
        {tabs.map(([key, label]) => {
          const TIcon = tabIcons[key];
          return (
            <button key={key} onClick={() => setTab(key)} style={{ ...(tab === key ? tabActive : tabInactive), ...(isCompact ? tabCompact : {}), display: "inline-flex", alignItems: "center", gap: 6 }}><TIcon size={13} />{label}</button>
          );
        })}
      </div>
      {isRecorder && tab === "boarding" && <FoodList category="boarding" />}
      {isRecorder && tab === "day" && <FoodList category="day" />}
      {tab === "daily" && <FoodDailyCollections showClassFilter={isOverseer} />}
      {tab === "status" && <FoodStatus />}
      {isOverseer && tab === "types" && <FoodTypesManager isMobile={isMobile} isCompact={isCompact} />}
      {isOverseer && tab === "history" && <FoodHistory showClassFilter={true} />}
    </div>
  );
}

// Food Types manager (Head Master / Second Master): add a new food the
// school collects (e.g. KARANGA), rename or hide one, set the amount each
// student must bring in a year (e.g. MAHINDI 30 kg), and order the list.
// The existing foods are shown first so nobody adds a duplicate.
function FoodTypesManager({ isMobile, isCompact }) {
  const { token } = useAuth();
  const [rows, setRows] = useState(null);
  const [label, setLabel] = useState("");
  const [unit, setUnit] = useState("KG");
  const [required, setRequired] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [edit, setEdit] = useState(null); // { id, label, unit, required_qty, used }
  const [saving, setSaving] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const { confirm, ConfirmDialogPortal } = useConfirm();

  const load = useCallback(() => {
    apiFetch("/food/types?all=1", {}, token).then((d) => setRows(d.data || [])).catch((e) => { setRows([]); setMsg({ ok: false, text: e.message }); });
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    if (label.trim().length < 2) return setMsg({ ok: false, text: "Food name must be at least 2 characters." });
    setBusy(true); setMsg(null);
    try {
      await apiFetch("/food/types", { method: "POST", body: JSON.stringify({ label, unit, required_qty: required === "" ? null : Number(required) }) }, token);
      showSuccess("Food Types", `"${label.trim().toUpperCase()}" added.`);
      setLabel(""); setRequired(""); setUnit("KG"); load();
    } catch (err) { setMsg({ ok: false, text: err.message }); } finally { setBusy(false); }
  };
  const patch = async (id, body, okText) => {
    try {
      await apiFetch(`/food/types/${id}`, { method: "PATCH", body: JSON.stringify(body) }, token);
      load();
      if (okText) showSuccess("Food Types", okText);
      return true;
    } catch (err) { showError("Food Types", err.message); return false; }
  };
  const saveEdit = async () => {
    if (edit.label.trim().length < 2) return showError("Food Types", "Food name must be at least 2 characters.");
    setSaving(true);
    const body = { label: edit.label, is_active: edit.is_active, required_qty: edit.required_qty === "" ? null : Number(edit.required_qty) };
    if (!edit.used) body.unit = edit.unit;
    const ok = await patch(edit.id, body, "Food type updated.");
    setSaving(false);
    if (ok) setEdit(null);
  };
  const del = (r) => confirm(`Delete the food type "${r.label}"? This can only be done if nothing has been recorded for it yet.`, async () => {
    try {
      await apiFetch(`/food/types/${r.id}`, { method: "DELETE" }, token);
      load();
      showSuccess("Food Types", `"${r.label}" deleted.`);
    } catch (err) { showError("Food Types", err.message); }
  }, { confirmLabel: "Delete", cancelLabel: "Cancel" });
  const move = async (i, dir) => {
    if (!rows) return;
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const ids = rows.map((r) => r.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
    setSavingOrder(true);
    try { await apiFetch("/food/types/order", { method: "PUT", body: JSON.stringify({ ids }) }, token); }
    catch (err) { showError("Food Types", err.message); load(); }
    finally { setSavingOrder(false); }
  };

  const input = { padding: "9px 12px", borderRadius: 4, border: `1px solid ${THEME.border}`, fontSize: 13.5, background: THEME.surface, color: THEME.text, boxSizing: "border-box" };

  return (
    <section style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 6, padding: isMobile ? 16 : 22, maxWidth: 820, boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}>
      <h3 style={{ margin: "0 0 4px", fontSize: 16.5, color: THEME.heading }}>Food Types</h3>
      <p style={{ margin: "0 0 14px", fontSize: 13, color: THEME.muted, lineHeight: 1.6 }}>
        The foods the school collects (MAHINDI, MCHELE, MAHARAGE…). Add a new one here and the Food Teacher sees it right away - no need for a developer.
        You can also set how much each student must bring in a year (e.g. MAHINDI 30 kg); the system then shows how much every student still owes and when they have completed.
      </p>

      <form onSubmit={add} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.6fr 0.9fr 1fr auto", gap: 8, marginBottom: 10, alignItems: "end" }}>
        <label style={{ display: "grid", gap: 4, fontSize: 11.5, color: THEME.muted }}>Food name
          <input value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. KARANGA" style={input} /></label>
        <label style={{ display: "grid", gap: 4, fontSize: 11.5, color: THEME.muted }}>Unit
          <select value={unit} onChange={(e) => setUnit(e.target.value)} style={input}>
            <option value="KG">Kilograms (kg)</option><option value="LITRES">Litres (L)</option><option value="PIECES">Pieces (pcs)</option>
          </select></label>
        <label style={{ display: "grid", gap: 4, fontSize: 11.5, color: THEME.muted }}>Required / student (optional)
          <input type="number" min="0" step="0.5" value={required} onChange={(e) => setRequired(e.target.value)} placeholder="e.g. 30" style={input} /></label>
        <button type="submit" disabled={busy} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 16px", borderRadius: 4, border: "none", background: THEME.navy, color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>
          {busy ? <SpinnerIcon size={13} /> : <PlusCircleIcon size={13} />}Add
        </button>
      </form>
      {msg && <div style={{ fontSize: 12.5, marginBottom: 10, color: msg.ok ? THEME.success : THEME.danger }}>{msg.text}</div>}

      {!rows ? <div style={{ fontSize: 13, color: THEME.muted }}>Loading…</div> : (
        <div style={{ border: `1px solid ${THEME.border}`, borderRadius: 4, overflow: "hidden" }}>
          {rows.length === 0 && <div style={{ padding: 12, fontSize: 13, color: THEME.muted }}>No food types yet.</div>}
          {rows.map((r, i) => (
            <div key={r.id} style={{ padding: "10px 12px", borderTop: i ? `1px solid ${THEME.border}` : "none", background: r.is_active ? THEME.surface : THEME.bg }}>
              {edit?.id === r.id ? (
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.4fr 0.9fr 1fr", gap: 8 }}>
                  <label style={{ fontSize: 11.5, color: THEME.muted, display: "grid", gap: 4 }}>Name
                    <input value={edit.label} maxLength={60} onChange={(e) => setEdit({ ...edit, label: e.target.value })} style={input} /></label>
                  <label style={{ fontSize: 11.5, color: THEME.muted, display: "grid", gap: 4 }}>Unit
                    <select value={edit.unit} disabled={!!edit.used} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} style={{ ...input, opacity: edit.used ? 0.6 : 1 }}>
                      <option value="KG">kg</option><option value="LITRES">L</option><option value="PIECES">pcs</option>
                    </select></label>
                  <label style={{ fontSize: 11.5, color: THEME.muted, display: "grid", gap: 4 }}>Required / student
                    <input type="number" min="0" step="0.5" value={edit.required_qty ?? ""} onChange={(e) => setEdit({ ...edit, required_qty: e.target.value })} placeholder="none" style={input} /></label>
                  {edit.used > 0 && <div style={{ gridColumn: "1 / -1", fontSize: 11.5, color: THEME.muted }}>The unit can't change - contributions are already recorded for this food.</div>}
                  <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button type="button" onClick={() => setEdit(null)} style={btnSecondary}>Cancel</button>
                    <button type="button" onClick={saveEdit} disabled={saving} style={{ ...btnPrimary, display: "inline-flex", alignItems: "center", gap: 6 }}>{saving && <SpinnerIcon size={11} />}Save</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0 || savingOrder} title="Move up" style={arrowBtn(i === 0)}>▲</button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1 || savingOrder} title="Move down" style={arrowBtn(i === rows.length - 1)}>▼</button>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: r.is_active ? THEME.text : THEME.muted, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {r.label}
                      {!r.is_active && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 7px", borderRadius: 10, background: THEME.border, color: THEME.muted }}>Hidden</span>}
                    </div>
                    <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>
                      {unitShort(r.unit)}
                      {r.required_qty ? ` · ${r.required_qty} ${unitShort(r.unit)} per student` : " · no set amount"}
                      {r.used > 0 && ` · recorded ${r.used} time${r.used > 1 ? "s" : ""}`}
                    </div>
                  </div>
                  <ActionMenu>
                    <MenuItem icon={<EditIcon size={14} />} onClick={() => setEdit({ id: r.id, label: r.label, unit: r.unit, required_qty: r.required_qty ?? "", is_active: r.is_active, used: r.used })}>Edit</MenuItem>
                    <MenuItem icon={r.is_active ? <PauseCircleIcon size={14} /> : <EyeIcon size={14} />} onClick={() => patch(r.id, { is_active: !r.is_active }, r.is_active ? `"${r.label}" hidden.` : `"${r.label}" shown again.`)}>{r.is_active ? "Hide" : "Show"}</MenuItem>
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

// Completed / still-owing list for one food that has a required amount
// (e.g. MAHINDI 30 kg). Shows how much each student has brought and how much
// is left, with a PDF download of exactly the "completed" or "owing" names.
function FoodStatus() {
  const { token } = useAuth();
  const { isMobile, isTablet } = useBreakpoint();
  const isCompact = isMobile || isTablet;
  const [types, setTypes] = useState([]);
  const [type, setType] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [category, setCategory] = useState("");
  const [form, setForm] = useState("");
  const [filter, setFilter] = useState("owing"); // owing | completed | all
  const [data, setData] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    apiFetch("/food/types", {}, token)
      .then((d) => { const withReq = (d.data || []).filter((t) => t.required_qty); setTypes(withReq); setType((t) => t || withReq[0]?.key || ""); })
      .catch((e) => setError(e.message));
  }, [token]);

  const qs = () => `type=${encodeURIComponent(type)}&year=${year}${category ? `&category=${category}` : ""}${form ? `&form=${encodeURIComponent(form)}` : ""}`;
  const load = useCallback(() => {
    if (!type) { setData(null); setSummary(null); return; }
    setError("");
    apiFetch(`/food/status?${qs()}`, {}, token)
      .then((d) => { setData(d.data || []); setSummary(d.summary); })
      .catch((e) => { setError(e.message); setData([]); setSummary(null); });
  }, [token, type, year, category, form]);
  useEffect(load, [load]);

  const typeInfo = types.find((t) => t.key === type);
  const u = typeInfo ? unitShort(typeInfo.unit) : "";
  const shown = (data || []).filter((r) => filter === "all" || (filter === "completed" ? r.completed : !r.completed));

  const downloadPdf = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`${API_BASE}/food/status/pdf?${qs()}&status=${filter}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error("Could not generate PDF.");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `${type}-${filter}-${year}.pdf`;
      document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url);
    } catch (e) { setError(e.message); } finally { setDownloading(false); }
  };

  if (!types.length) return (
    <div style={{ fontSize: 13.5, color: THEME.muted, background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 6, padding: 20 }}>
      No food has a required amount set yet. Go to <b>Food Types</b> and set, for example, MAHINDI 30 kg per student - then this page shows who has completed and who still owes.
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <select value={type} onChange={(e) => setType(e.target.value)} style={{ ...selectStyle, ...(isCompact ? { flex: 1, minWidth: 140 } : {}) }}>
          {types.map((t) => <option key={t.key} value={t.key}>{t.label} ({t.required_qty} {unitShort(t.unit)})</option>)}
        </select>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ ...selectStyle, ...(isCompact ? { flex: 1, minWidth: 90 } : {}) }}>
          {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ ...selectStyle, ...(isCompact ? { flex: 1 } : {}) }}>
          <option value="">All students</option><option value="boarding">Boarding</option><option value="day">Day</option>
        </select>
        <select value={form} onChange={(e) => setForm(e.target.value)} style={{ ...selectStyle, ...(isCompact ? { flex: 1 } : {}) }}>
          <option value="">All classes</option>{FORMS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>

      {summary && (
        <div style={{ display: "flex", gap: 14, marginBottom: 16, flexWrap: "wrap" }}>
          <StatCard label="Completed" value={summary.completed} color={THEME.success} />
          <StatCard label="Still owing" value={summary.owing} color={THEME.danger} />
          <StatCard label="Total still owed" value={`${summary.total_owed} ${u}`} color={THEME.link} />
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        {[["owing", "Still Owing"], ["completed", "Completed"], ["all", "All"]].map(([k, lbl]) => (
          <button key={k} onClick={() => setFilter(k)} style={{ ...(filter === k ? tabActive : tabInactive), ...tabCompact }}>{lbl}</button>
        ))}
        <button onClick={downloadPdf} disabled={downloading || !shown.length} style={{ ...btnRecord, marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", opacity: shown.length ? 1 : 0.5 }}>
          {downloading ? <SpinnerIcon size={13} /> : <DownloadIcon size={13} />}{downloading ? "Generating…" : "Download PDF"}
        </button>
      </div>
      {error && <ErrorBox msg={error} />}

      {isCompact ? (
        <div style={cardList}>
          {shown.map((r) => (
            <div key={r.student_id} className="mk-row-card" style={rowCard}>
              <div style={cardHeadRow}>
                <span style={cardTitle}>{r.name}</span>
                <StatusPill ok={r.completed}>{r.completed ? "Completed" : "Owes"}</StatusPill>
              </div>
              <div style={cardField}><span style={cardFieldLabel}>Class</span><span style={cardFieldValue}>{r.form} · {r.category === "boarding" ? "Boarding" : "Day"}</span></div>
              <div style={cardField}><span style={cardFieldLabel}>Given</span><span style={cardFieldValue}>{r.given} {u} / {r.required} {u}</span></div>
              {!r.completed && <div style={cardField}><span style={cardFieldLabel}>Still owes</span><span style={{ ...cardFieldValue, color: THEME.danger }}>{r.remaining} {u}</span></div>}
            </div>
          ))}
          {!shown.length && <p style={{ fontSize: 13, color: THEME.muted }}>No students in this list.</p>}
        </div>
      ) : (
        <div className="table-scroll" style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, overflow: "hidden" }}>
          <div style={{ display: "flex", padding: "9px 16px", fontSize: 11.5, fontWeight: 700, color: THEME.muted, background: THEME.bg, minWidth: 560 }}>
            <span style={{ flex: 2 }}>Name</span><span style={{ flex: 1 }}>Class</span><span style={{ flex: 1 }}>Given</span><span style={{ flex: 1 }}>Still owes</span><span style={{ flex: 1 }}>Status</span>
          </div>
          {shown.map((r, i) => (
            <div key={r.student_id} style={{ display: "flex", alignItems: "center", padding: "9px 16px", fontSize: 13, borderTop: i ? `1px solid ${THEME.border}` : "none", minWidth: 560 }}>
              <span style={{ flex: 2 }}>{r.name}</span>
              <span style={{ flex: 1, fontSize: 12, color: THEME.muted }}>{r.form} · {r.category === "boarding" ? "B" : "D"}</span>
              <span style={{ flex: 1 }}>{r.given} {u}</span>
              <span style={{ flex: 1, color: r.completed ? THEME.muted : THEME.danger, fontWeight: r.completed ? 400 : 700 }}>{r.completed ? "-" : `${r.remaining} ${u}`}</span>
              <StatusPill ok={r.completed} style={{ flex: 1 }}>{r.completed ? "Completed" : "Owes"}</StatusPill>
            </div>
          ))}
          {!shown.length && <p style={{ padding: 16, fontSize: 13, color: THEME.muted }}>No students in this list.</p>}
        </div>
      )}
    </div>
  );
}

function StatusPill({ ok, children, style }) {
  return <span style={{ ...style, display: "inline-block", fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 10, background: ok ? THEME.successLight : THEME.dangerLight, color: ok ? THEME.success : THEME.danger, width: "fit-content" }}>{children}</span>;
}

const arrowBtn = (disabled) => ({ border: `1px solid ${THEME.border}`, background: THEME.surface, color: disabled ? THEME.border : THEME.muted, borderRadius: 3, width: 20, height: 15, fontSize: 8, lineHeight: 1, cursor: disabled ? "default" : "pointer", padding: 0 });

// Shared by the Food Teacher (sees every class) and the read-only viewers
// (Head Master/Second Master, who may narrow with ?form=, and Class
// Teachers, who are auto-scoped to their own class server-side) - a date
// picker defaulting to today, showing exactly which food items were
// brought that day and by whom.
//
// The backend returns one row per ITEM entry (a student who brought both
// Mahindi and Njugu today has 2 rows; brought Mahindi in two separate
// installments today has 2 Mahindi rows) - grouped here into one row per
// STUDENT instead, same as every other list in this module already does
// (see FoodList and the History tab below). With 10 students each bringing
// several items, this is the difference between 10 rows and 40+ - "View
// details" opens the full item-by-item breakdown for just that student.
function FoodDailyCollections({ showClassFilter }) {
  const { token } = useAuth();
  const { isMobile, isTablet } = useBreakpoint();
  const isCompact = isMobile || isTablet;
  const todayISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Dar_es_Salaam" });
  const [date, setDate] = useState(todayISO());
  const [form, setForm] = useState("");
  const [category, setCategory] = useState("");
  const [rows, setRows] = useState([]);
  const [studentsContributed, setStudentsContributed] = useState(0);
  const [types, setTypes] = useState([]);
  const [error, setError] = useState("");
  const [noClass, setNoClass] = useState(false);
  const [viewStudent, setViewStudent] = useState(null); // grouped student row currently drilled into, or null

  const load = useCallback(() => {
    setError(""); setNoClass(false);
    const params = new URLSearchParams({ date });
    if (form) params.set("form", form);
    if (category) params.set("category", category);
    apiFetch(`/food/daily?${params.toString()}`, {}, token)
      .then((d) => {
        setRows(d.data || []);
        setStudentsContributed(Number(d.students_contributed || 0));
        setTypes(d.types || []);
        if (d.message && !d.data?.length) setNoClass(true);
      })
      .catch((err) => setError(err.message));
  }, [token, date, form, category]);
  useEffect(load, [load]);

  const unitFor = (key) => (types.find((t) => t.key === key)?.unit === "LITRES" ? "L" : "kg");
  const labelFor = (key) => types.find((t) => t.key === key)?.label || key;

  // One group per student, in first-seen order (the backend already orders
  // by created_at ASC, so this reads top-to-bottom as "who contributed
  // first today"). Each group keeps every individual item entry so "View
  // details" can show them all, plus a de-duplicated list of collectors in
  // case more than one person recorded entries for the same student today.
  const grouped = [];
  const byStudent = new Map();
  rows.forEach((r) => {
    let g = byStudent.get(r.student_id);
    if (!g) {
      g = { student_id: r.student_id, first_name: r.first_name, middle_name: r.middle_name, last_name: r.last_name, form: r.form, category: r.category, entries: [] };
      byStudent.set(r.student_id, g);
      grouped.push(g);
    }
    g.entries.push(r);
  });

  return (
    <div>
      <h2 style={{ color: THEME.heading, fontSize: isMobile ? 16 : 20, marginBottom: 4 }}>Daily Collections</h2>
      <p style={{ color: THEME.muted, fontSize: 13.5, marginBottom: 18 }}>Pick a day to see exactly which food items were brought that day, and by whom.</p>

      <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
        <StatCard label={`Students Contributed (${date})`} value={studentsContributed} color={THEME.success} />
        <StatCard label={`Items Recorded (${date})`} value={rows.length} color={THEME.link} />
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...selectStyle, ...(isCompact ? { flex: 1, minWidth: 150 } : {}) }} />
        {showClassFilter && (
          <select value={form} onChange={(e) => setForm(e.target.value)} style={{ ...selectStyle, ...(isCompact ? { flex: 1, minWidth: 130 } : {}) }}>
            <option value="">All Classes</option>
            {FORMS.map((f) => <option key={f}>{f}</option>)}
          </select>
        )}
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ ...selectStyle, ...(isCompact ? { flex: 1, minWidth: 130 } : {}) }}>
          <option value="">Boarding + Day</option>
          <option value="boarding">Boarding Only</option>
          <option value="day">Day Only</option>
        </select>
      </div>

      {error && <ErrorBox msg={error} />}
      {noClass && <ErrorBox msg="You have no class assigned yet - ask the Head Master to assign your class." />}

      {isCompact ? (
        <div style={cardList}>
          {grouped.map((g) => (
            <div key={g.student_id} className="mk-row-card" style={rowCard}>
              <div style={cardHeadRow}>
                <span style={cardTitle}>{[g.first_name, g.middle_name, g.last_name].filter(Boolean).join(" ")}</span>
                <span style={{ fontSize: 12, color: THEME.muted, fontWeight: 600 }}>{g.form}</span>
              </div>
              <div style={cardField}><span style={cardFieldLabel}>Category</span><span style={cardFieldValue}>{g.category === "boarding" ? "Boarding" : "Day"}</span></div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0" }}>
                {g.entries.map((e) => <span key={e.id} style={badge}>{labelFor(e.contribution_type)} {Number(e.quantity)}{unitFor(e.contribution_type)}</span>)}
              </div>
              <button onClick={() => setViewStudent(g)} style={{ ...btnRecord, width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}><ClockIcon size={13} />View details</button>
            </div>
          ))}
          {!grouped.length && !noClass && <p style={{ fontSize: 13, color: THEME.muted }}>No food contributions were recorded on {date}.</p>}
        </div>
      ) : (
      <div className="table-scroll" style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, overflow: "hidden" }}>
        <div style={{ display: "flex", padding: "9px 16px", fontSize: 11.5, fontWeight: 700, color: THEME.muted, background: THEME.bg, minWidth: 620 }}>
          <span style={{ flex: 1.4 }}>Name</span>
          <span style={{ flex: 0.6 }}>Class</span>
          <span style={{ flex: 0.7 }}>Category</span>
          <span style={{ flex: 2 }}>Items Brought</span>
          <span style={{ width: 120 }} />
        </div>
        {grouped.map((g, i) => (
          <div key={g.student_id} style={{ display: "flex", alignItems: "center", padding: "9px 16px", fontSize: 13, borderTop: i > 0 ? `1px solid ${THEME.border}` : "none", flexWrap: "wrap", gap: 6, minWidth: 620 }}>
            <span style={{ flex: 1.4 }}>{[g.first_name, g.middle_name, g.last_name].filter(Boolean).join(" ")}</span>
            <span style={{ flex: 0.6 }}>{g.form}</span>
            <span style={{ flex: 0.7 }}>{g.category === "boarding" ? "Boarding" : "Day"}</span>
            <span style={{ flex: 2, display: "flex", gap: 6, flexWrap: "wrap" }}>
              {g.entries.map((e) => <span key={e.id} style={badge}>{labelFor(e.contribution_type)} {Number(e.quantity)}{unitFor(e.contribution_type)}</span>)}
            </span>
            <span style={{ width: 120 }}><button onClick={() => setViewStudent(g)} style={{ ...btnRecord, display: "inline-flex", alignItems: "center", gap: 6 }}><ClockIcon size={13} />View details</button></span>
          </div>
        ))}
        {!grouped.length && !noClass && <p style={{ padding: 16, fontSize: 13, color: THEME.muted }}>No food contributions were recorded on {date}.</p>}
      </div>
      )}
      {viewStudent && (
        <Modal title={`${date} - ${[viewStudent.first_name, viewStudent.middle_name, viewStudent.last_name].filter(Boolean).join(" ")}`} onClose={() => setViewStudent(null)}>
          <div style={{ display: "grid", gap: 8 }}>
            {viewStudent.entries.map((e) => (
              <div key={e.id} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 10px", background: THEME.bg, borderRadius: 4, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 600 }}>{labelFor(e.contribution_type)}</span>
                  <span>{Number(e.quantity)} {unitFor(e.contribution_type)}</span>
                </div>
                <div style={{ fontSize: 11.5, color: THEME.muted }}>{e.recorded_by_name ? `Collected by ${e.recorded_by_name}` : ""}</div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

function FoodList({ category }) {
  const { token } = useAuth();
  const { isMobile, isTablet } = useBreakpoint();
  const isCompact = isMobile || isTablet;
  const [year, setYear] = useState(new Date().getFullYear());
  const [rows, setRows] = useState([]);
  const [types, setTypes] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [recordFor, setRecordFor] = useState(null); // student row currently recording a contribution for
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(() => {
    setError("");
    apiFetch(`/food/students?category=${category}&year=${year}`, {}, token)
      .then((d) => { setRows(d.data || []); setTypes(d.types || []); })
      .catch((err) => setError(err.message));
  }, [token, category, year]);
  useEffect(load, [load]);

  const filtered = rows.filter((s) => !search.trim() || `${s.first_name} ${s.middle_name || ""} ${s.last_name}`.toLowerCase().includes(search.toLowerCase()));

  const downloadPdf = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`${API_BASE}/food/students/pdf?category=${category}&year=${year}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error("Could not generate PDF.");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `food-contributions-${category}-${year}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) { setError(err.message); }
    finally { setDownloading(false); }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
        <StatCard label="Students" value={rows.length} color={THEME.link} />
        <StatCard label={`Have Contributed (${year})`} value={`${rows.filter((s) => Number(s.entry_count) > 0).length} / ${rows.length}`} color={THEME.success} />
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ ...selectStyle, ...(isCompact ? { flex: 1, minWidth: 90 } : {}) }}>
          {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <input placeholder="Search student name..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...selectStyle, flex: 1, minWidth: isCompact ? "100%" : 200 }} />
        <button onClick={downloadPdf} disabled={downloading} style={{ ...btnRecord, display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
          {downloading ? <SpinnerIcon size={13} /> : null}{downloading ? "Generating..." : "Download PDF"}
        </button>
      </div>
      {error && <ErrorBox msg={error} />}
      {isCompact ? (
        <div style={cardList}>
          {filtered.map((s) => (
            <div key={s.student_id} className="mk-row-card" style={rowCard}>
              <div style={cardHeadRow}>
                <span style={cardTitle}>{[s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ")}</span>
                <span style={{ fontSize: 12, color: THEME.muted, fontWeight: 600 }}>{s.form}</span>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {types.filter((t) => Number(s.totals?.[t.key]) > 0).map((t) => (
                  <span key={t.key} style={{ ...badge, ...(t.required_qty && Number(s.totals[t.key]) < t.required_qty ? { background: THEME.warningLight || "#fef3c7", color: THEME.warning || "#92400e" } : {}) }}>{t.label} {s.totals[t.key]}{t.required_qty ? `/${t.required_qty}` : ""}{unitShort(t.unit)}</span>
                ))}
                {!types.some((t) => Number(s.totals?.[t.key]) > 0) && <span style={{ color: THEME.muted, fontSize: 12 }}>Not contributed yet</span>}
              </div>
              <button onClick={() => setRecordFor(s)} style={{ ...btnRecord, width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}><PlusCircleIcon size={13} />Record Contribution</button>
            </div>
          ))}
          {!filtered.length && <p style={{ fontSize: 13, color: THEME.muted }}>{search ? "No matching student found." : "No students found."}</p>}
        </div>
      ) : (
      <div className="table-scroll" style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, overflow: "hidden" }}>
        <div style={{ display: "flex", padding: "9px 16px", fontSize: 11.5, fontWeight: 700, color: THEME.muted, background: THEME.bg, minWidth: 620 }}>
          <span style={{ flex: 1.3 }}>Name</span><span style={{ flex: 0.6 }}>Class</span><span style={{ flex: 2.5 }}>Contributed so far ({year})</span><span style={{ width: 130 }} />
        </div>
        {filtered.map((s, i) => (
          <div key={s.student_id} style={{ display: "flex", alignItems: "center", padding: "9px 16px", fontSize: 13, borderTop: i > 0 ? `1px solid ${THEME.border}` : "none", flexWrap: "wrap", gap: 6, minWidth: 620 }}>
            <span style={{ flex: 1.3 }}>{[s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ")}</span>
            <span style={{ flex: 0.6 }}>{s.form}</span>
            <span style={{ flex: 2.5, display: "flex", gap: 6, flexWrap: "wrap" }}>
              {types.filter((t) => Number(s.totals?.[t.key]) > 0).map((t) => (
                <span key={t.key} style={{ ...badge, ...(t.required_qty && Number(s.totals[t.key]) < t.required_qty ? { background: THEME.warningLight || "#fef3c7", color: THEME.warning || "#92400e" } : {}) }}>{t.label} {s.totals[t.key]}{t.required_qty ? `/${t.required_qty}` : ""}{unitShort(t.unit)}</span>
              ))}
              {!types.some((t) => Number(s.totals?.[t.key]) > 0) && <span style={{ color: THEME.muted, fontSize: 12 }}>Not contributed yet</span>}
            </span>
            <span style={{ width: 130 }}>
              <button onClick={() => setRecordFor(s)} style={{ ...btnRecord, display: "inline-flex", alignItems: "center", gap: 6 }}><PlusCircleIcon size={13} />Record Contribution</button>
            </span>
          </div>
        ))}
        {!filtered.length && <p style={{ padding: 16, fontSize: 13, color: THEME.muted }}>{search ? "No matching student found." : "No students found."}</p>}
      </div>
      )}
      {recordFor && (
        <RecordModal
          student={recordFor}
          category={category}
          year={year}
          types={types}
          onClose={() => setRecordFor(null)}
          onRecorded={load}
        />
      )}
    </div>
  );
}

// Record-contribution flow: pick a type → enter quantity → Submit → "Una
// uhakika?" (Are you sure?) confirm → "Submitted Successfully" → the modal
// stays open with the type reset, so the food teacher can immediately pick
// ANOTHER type for the same student if they brought more than one item,
// without reopening anything.
function RecordModal({ student, category, year, types, onClose, onRecorded }) {
  const { token } = useAuth();
  const [type, setType] = useState(types[0]?.key || "");
  const [quantity, setQuantity] = useState("");
  const [confirmStep, setConfirmStep] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const typeInfo = types.find((t) => t.key === type);
  const studentName = [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(" ");

  const askConfirm = (e) => {
    e.preventDefault();
    setError("");
    if (!type) { setError("Please choose a type."); return; }
    if (!(Number(quantity) > 0)) { setError("Please enter a valid quantity greater than zero."); return; }
    setConfirmStep(true);
  };

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const data = await apiFetch(`/food/${student.student_id}`, {
        method: "POST",
        body: JSON.stringify({ category, contribution_type: type, quantity, year }),
      }, token);
      showSuccess("Contribution", data.message || "Contribution Successfully Recorded.");
      setConfirmStep(false);
      setQuantity("");
      onRecorded();
    } catch (err) {
      setError(err.message);
      setConfirmStep(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Record Contribution - ${studentName}`} onClose={onClose}>
      {confirmStep ? (
        <div>
          <p style={{ fontSize: 14, marginBottom: 20 }}>
            Are you sure {studentName} is bringing <b>{quantity} {typeInfo?.unit}</b> of <b>{typeInfo?.label}</b>?
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setConfirmStep(false)} style={{ ...btnCancelRed, display: "inline-flex", alignItems: "center", gap: 6 }} disabled={busy}><CloseIcon size={13} />No</button>
            <button onClick={submit} style={{ ...btnPrimary, display: "inline-flex", alignItems: "center", gap: 6 }} disabled={busy}>{busy ? <SpinnerIcon size={13} /> : <CheckIcon size={13} />}{busy ? "Submitting..." : "Yes"}</button>
          </div>
        </div>
      ) : (
        <form onSubmit={askConfirm} style={{ display: "grid", gap: 12 }}>
          {error && <ErrorBox msg={error} />}
          <label style={labelStyle}>Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)} style={selectStyle}>
            {types.map((t) => <option key={t.key} value={t.key}>{t.label} ({t.unit})</option>)}
          </select>
          {typeInfo?.required_qty > 0 && (() => {
            const given = Number(student.totals?.[type] || 0);
            const remaining = Math.max(Math.round((typeInfo.required_qty - given) * 100) / 100, 0);
            return (
              <div style={{ fontSize: 12.5, background: remaining <= 0 ? THEME.successLight : THEME.bg, color: remaining <= 0 ? THEME.success : THEME.text, borderRadius: 4, padding: "8px 11px", lineHeight: 1.5 }}>
                Required this year: <b>{typeInfo.required_qty} {unitShort(typeInfo.unit)}</b>. Already brought: <b>{given} {unitShort(typeInfo.unit)}</b>.{" "}
                {remaining <= 0 ? <b>Completed ✓</b> : <>Still owes: <b style={{ color: THEME.danger }}>{remaining} {unitShort(typeInfo.unit)}</b>.</>}
              </div>
            );
          })()}
          <label style={labelStyle}>Quantity ({typeInfo?.unit})</label>
          <input type="number" min="0.1" step="0.1" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={selectStyle} placeholder={`e.g. 5 ${typeInfo?.unit || ""}`} autoFocus />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
            <button type="button" onClick={onClose} style={{ ...btnSecondary, display: "inline-flex", alignItems: "center", gap: 6 }}><CheckIcon size={13} />Done</button>
            <button type="submit" style={{ ...btnPrimary, display: "inline-flex", alignItems: "center", gap: 6 }}><PlusCircleIcon size={13} />Submit</button>
          </div>
          <p style={{ fontSize: 11.5, color: THEME.muted, margin: 0 }}>Bringing more than one item? Submit this one, then pick the next type - every submission is kept as its own dated record.</p>
        </form>
      )}
    </Modal>
  );
}

function FoodHistory({ showClassFilter = true }) {
  const { token } = useAuth();
  const { isMobile, isTablet } = useBreakpoint();
  const isCompact = isMobile || isTablet;
  const [year, setYear] = useState(new Date().getFullYear());
  const [form, setForm] = useState("");
  const [category, setCategory] = useState("");
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [noClass, setNoClass] = useState(false);
  const [viewStudent, setViewStudent] = useState(null); // student whose full history is currently open

  const load = useCallback(() => {
    setError(""); setNoClass(false);
    const params = new URLSearchParams({ year });
    if (form) params.set("form", form);
    if (category) params.set("category", category);
    apiFetch(`/food/history/students?${params.toString()}`, {}, token)
      .then((d) => {
        setRows(d.data || []);
        if (d.message && !d.data?.length) setNoClass(true);
      })
      .catch((err) => setError(err.message));
  }, [token, year, form, category]);
  useEffect(load, [load]);

  return (
    <div>
      <p style={{ fontSize: 13, color: THEME.muted, marginBottom: 12 }}>Pick a student below to see their full contribution history.</p>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ ...selectStyle, ...(isCompact ? { flex: 1, minWidth: 90 } : {}) }}>
          {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 3 + i).map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        {showClassFilter && (
          <select value={form} onChange={(e) => setForm(e.target.value)} style={{ ...selectStyle, ...(isCompact ? { flex: 1, minWidth: 130 } : {}) }}>
            <option value="">All Classes</option>
            {FORMS.map((f) => <option key={f}>{f}</option>)}
          </select>
        )}
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ ...selectStyle, ...(isCompact ? { flex: 1, minWidth: 130 } : {}) }}>
          <option value="">Boarding + Day</option>
          <option value="boarding">Boarding Only</option>
          <option value="day">Day Only</option>
        </select>
      </div>
      {error && <ErrorBox msg={error} />}
      {noClass && <ErrorBox msg="You have no class assigned yet - ask the Head Master to assign your class." />}
      {isCompact ? (
        <div style={cardList}>
          {rows.map((s) => (
            <div key={s.student_id} className="mk-row-card" style={rowCard}>
              <div style={cardHeadRow}>
                <span style={cardTitle}>{[s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ")}</span>
                <span style={{ fontSize: 12, color: THEME.muted, fontWeight: 600 }}>{s.form}</span>
              </div>
              <div style={cardField}><span style={cardFieldLabel}>Category</span><span style={cardFieldValue}>{s.is_boarding ? "Boarding" : "Day"}</span></div>
              <div style={cardField}><span style={cardFieldLabel}>Contributions</span><span style={cardFieldValue}>{s.entry_count}</span></div>
              <div style={cardField}><span style={cardFieldLabel}>Last Date</span><span style={cardFieldValue}>{new Date(s.last_date).toLocaleDateString("en-GB", { timeZone: "Africa/Dar_es_Salaam" })}</span></div>
              <button onClick={() => setViewStudent(s)} style={{ ...btnRecord, width: "100%", marginTop: 8, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}><ClockIcon size={13} />View History</button>
            </div>
          ))}
          {!rows.length && !noClass && <p style={{ fontSize: 13, color: THEME.muted }}>No contributions recorded for {year}.</p>}
        </div>
      ) : (
      <div className="table-scroll" style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, overflow: "hidden" }}>
        <div style={{ display: "flex", padding: "9px 16px", fontSize: 11.5, fontWeight: 700, color: THEME.muted, background: THEME.bg, minWidth: 620 }}>
          <span style={{ flex: 1.6 }}>Name</span><span style={{ flex: 0.8 }}>Class</span><span style={{ flex: 0.8 }}>Category</span>
          <span style={{ flex: 0.8 }}>Contributions</span><span style={{ flex: 1 }}>Last Date</span><span style={{ width: 110 }} />
        </div>
        {rows.map((s, i) => (
          <div key={s.student_id} style={{ display: "flex", alignItems: "center", padding: "9px 16px", fontSize: 13, borderTop: i > 0 ? `1px solid ${THEME.border}` : "none", flexWrap: "wrap", gap: 6, minWidth: 620 }}>
            <span style={{ flex: 1.6 }}>{[s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ")}</span>
            <span style={{ flex: 0.8 }}>{s.form}</span>
            <span style={{ flex: 0.8 }}>{s.is_boarding ? "Boarding" : "Day"}</span>
            <span style={{ flex: 0.8 }}>{s.entry_count}</span>
            <span style={{ flex: 1 }}>{new Date(s.last_date).toLocaleDateString("en-GB", { timeZone: "Africa/Dar_es_Salaam" })}</span>
            <span style={{ width: 110 }}><button onClick={() => setViewStudent(s)} style={{ ...btnRecord, display: "inline-flex", alignItems: "center", gap: 6 }}><ClockIcon size={13} />View History</button></span>
          </div>
        ))}
        {!rows.length && !noClass && <p style={{ padding: 16, fontSize: 13, color: THEME.muted }}>No contributions recorded for {year}.</p>}
      </div>
      )}
      {viewStudent && <StudentHistoryModal student={viewStudent} year={year} onClose={() => setViewStudent(null)} />}
    </div>
  );
}

// Full, dated list of every installment ONE student brought this year - kept
// out of the main list, which lists students (not installments), so it
// doesn't turn into hundreds of rows once many students have several
// contributions each.
//
// A student who brought NJUGU 3 times used to show 3 separate NJUGU rows,
// interleaved with MAHARAGE, KUNDE, etc. - a jumble on one page. Instead we
// group entries by type (NJUGU appears once, with a running total), and
// tapping that type opens its own dated sub-history - every date it was
// brought, the quantity each time, and who collected it.
function StudentHistoryModal({ student, year, onClose }) {
  const { token } = useAuth();
  const [entries, setEntries] = useState([]);
  const [types, setTypes] = useState([]);
  const [error, setError] = useState("");
  const [openType, setOpenType] = useState(null); // contribution_type currently drilled into, or null

  useEffect(() => {
    apiFetch(`/food/types`, {}, token).then((d) => setTypes(d.data || [])).catch(() => {});
    apiFetch(`/food/student/${student.student_id}/entries?year=${year}`, {}, token)
      .then((d) => setEntries(d.data || []))
      .catch((err) => setError(err.message));
  }, [token, student.student_id, year]);

  const name = [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(" ");

  // One group per contribution_type actually present in this student's
  // entries, in the order defined by TYPES (falls back to first-seen order
  // for any custom type not in that list).
  const groups = types
    .map((t) => ({ type: t, entries: entries.filter((e) => e.contribution_type === t.key) }))
    .filter((g) => g.entries.length > 0);
  const openGroup = openType ? groups.find((g) => g.type.key === openType) : null;

  return (
    <Modal title={openGroup ? `${openGroup.type.label} - ${name}` : `Contribution History - ${name}`} onClose={onClose}>
      {error && <ErrorBox msg={error} />}
      {openGroup ? (
        <div>
          <button onClick={() => setOpenType(null)} style={{ ...btnSecondary, marginBottom: 12, display: "inline-flex", alignItems: "center", gap: 6 }}><ChevronLeftIcon size={13} />Back to all types</button>
          <div style={{ display: "grid", gap: 8 }}>
            {openGroup.entries.map((e) => (
              <div key={e.id} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 10px", background: THEME.bg, borderRadius: 4, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 600 }}>{new Date(e.created_at).toLocaleDateString("en-GB", { timeZone: "Africa/Dar_es_Salaam" })}</span>
                  <span>{Number(e.quantity)} {openGroup.type.unit === "LITRES" ? "L" : "kg"}</span>
                </div>
                <div style={{ fontSize: 11.5, color: THEME.muted }}>{e.recorded_by_name ? `Collected by ${e.recorded_by_name}` : ""}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {groups.map((g) => {
            const total = g.entries.reduce((sum, e) => sum + Number(e.quantity), 0);
            return (
              <button key={g.type.key} onClick={() => setOpenType(g.type.key)} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", textAlign: "left",
                padding: "10px 12px", background: THEME.bg, border: "none", borderRadius: 4, fontSize: 13, cursor: "pointer",
              }}>
                <span style={{ fontWeight: 600 }}>{g.type.label}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ color: THEME.muted, fontSize: 11.5 }}>{g.entries.length} time{g.entries.length > 1 ? "s" : ""}</span>
                  <span>{total} {g.type.unit === "LITRES" ? "L" : "kg"}</span>
                  <span style={{ color: THEME.muted, display: "flex" }}><ChevronRightIcon size={14} /></span>
                </span>
              </button>
            );
          })}
          {!groups.length && !error && <p style={{ fontSize: 13, color: THEME.muted }}>No entries found.</p>}
        </div>
      )}
    </Modal>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: THEME.surface, borderRadius: 4, padding: 22, width: "100%", maxWidth: 420, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 15.5, color: THEME.heading }}>{title}</h3>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: THEME.muted, lineHeight: 1, display: "flex", alignItems: "center" }}><CloseIcon size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ErrorBox({ msg }) {
  return <div style={{ marginBottom: 14, padding: 12, borderRadius: 4, fontSize: 13.5, background: THEME.dangerLight, color: THEME.danger }}>{msg}</div>;
}

const tabActive = { padding: "8px 16px", borderRadius: 4, border: "none", background: THEME.navy, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const tabInactive = { padding: "8px 16px", borderRadius: 4, border: `1px solid ${THEME.border}`, background: THEME.surface, color: THEME.text, fontSize: 13, cursor: "pointer" };
const tabCompact = { padding: "7px 12px", fontSize: 12, flexShrink: 0, whiteSpace: "nowrap" };
const selectStyle = { padding: "8px 12px", border: `1px solid ${THEME.border}`, borderRadius: 4, fontSize: 13 };
const labelStyle = { fontSize: 12, fontWeight: 600, color: THEME.text, margin: 0 };
const badge = { fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 4, background: THEME.successLight, color: THEME.success };
const btnRecord = { padding: "7px 12px", borderRadius: 4, border: `1px solid ${THEME.heading}`, background: THEME.surface, color: THEME.heading, fontSize: 12, fontWeight: 600, cursor: "pointer" };

// Mobile/tablet "row card" - the responsive stand-in for a flex-row table
// column set. Every table in this file that used to force horizontal
// scrolling on a phone or small tablet (via a fixed minWidth) switches to a
// grid of these on isCompact, so nothing sits off-screen.
const cardList = { display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" };
const rowCard = { background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, padding: "12px 14px" };
const cardHeadRow = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 };
const cardTitle = { fontSize: 14, fontWeight: 700, color: THEME.text };
const cardField = { display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5, padding: "3px 0" };
const cardFieldLabel = { color: THEME.muted, flexShrink: 0 };
const cardFieldValue = { color: THEME.text, fontWeight: 600, textAlign: "right" };
const btnPrimary = { padding: "9px 18px", background: THEME.navy, color: "#fff", border: "none", borderRadius: 4, fontWeight: 600, fontSize: 13, cursor: "pointer" };
const btnSecondary = { padding: "9px 18px", background: THEME.surface, color: THEME.heading, border: `1.5px solid ${THEME.heading}`, borderRadius: 4, fontWeight: 600, fontSize: 13, cursor: "pointer" };
const btnCancelRed = { padding: "9px 18px", background: THEME.surface, color: THEME.danger, border: `1.5px solid ${THEME.danger}`, borderRadius: 4, fontWeight: 600, fontSize: 13, cursor: "pointer" };
