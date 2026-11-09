import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiFetch, API_BASE } from "../utils/api";
import { THEME } from "../styles/theme";
import { useConfirm } from "../components/ConfirmDialog";
import { showSuccess } from "../components/SuccessModal";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { SpinnerIcon } from "../components/icons";

const LIST_ROLES = ["admin", "second_master"];
const SETTINGS_ROLES = ["admin", "second_master"];
const MANUAL_ROLES = ["admin", "second_master", "academic"];

const emptyFields = { first_name: "", middle_name: "", last_name: "", district: "", ward: "", village: "", exam_number: "", exam_year: new Date().getFullYear() };

// Streams a file the same way whether it's a PDF (inline blob download) or
// a CSV — used by both the blank-PDF button and the applicants-list export.
async function fetchAndSaveFile(path, token, filename) {
  const res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || "Failed to download file.");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export default function JoiningInstructions() {
  const { user, token } = useAuth();
  const { isMobile } = useBreakpoint();
  const navigate = useNavigate();
  const canList = user && LIST_ROLES.includes(user.role);
  const canSettings = user && SETTINGS_ROLES.includes(user.role);
  const canManual = user && MANUAL_ROLES.includes(user.role);

  const [tab, setTab] = useState(canList ? "applications" : "manual");
  const [stats, setStats] = useState(null);

  const loadStats = () => apiFetch("/joining/stats", {}, token).then(setStats).catch(() => {});
  useEffect(() => { if (user) loadStats(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return null;
  if (!canList && !canSettings && !canManual) {
    return (
      <div style={{ padding: 40, maxWidth: 560 }}>
        <h2 style={{ color: THEME.heading, fontSize: 20, marginBottom: 8 }}>Joining Instructions</h2>
        <p style={{ color: THEME.muted, fontSize: 13.5 }}>This page is only available to Admin, Second Master, and Academic Master accounts.</p>
      </div>
    );
  }

  const tabs = [
    ...(canList ? [["applications", "Applications"]] : []),
    ...(canManual ? [["manual", "Issue In Person"]] : []),
    ...(canSettings ? [["settings", "Requirements & Publish"]] : []),
  ];

  return (
    <div style={{ padding: isMobile ? "16px 12px" : 32, maxWidth: 1000 }}>
      {canList && (
        <button onClick={() => navigate("/dashboard/students")} style={{
          display: "inline-flex", alignItems: "center", gap: 6, background: THEME.surface,
          border: `1.5px solid ${THEME.border}`, borderRadius: 8, color: THEME.heading,
          fontWeight: 600, fontSize: 13, cursor: "pointer", marginBottom: 14, padding: "8px 14px",
        }}>← Back to Student Management</button>
      )}
      <h2 style={{ color: THEME.heading, fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Joining Instructions</h2>
      <p style={{ color: THEME.muted, fontSize: 13.5, marginBottom: 18 }}>Form I intake — public applications, in-person issuance, and admission requirements.</p>

      {stats && (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
          <StatChip label="Online" value={stats.online} color={THEME.navy} />
          <StatChip label="Issued at School" value={stats.manual} color="#B7791F" />
          <StatChip label="Total Applicants" value={stats.total} color="#166534" />
        </div>
      )}

      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${THEME.border}`, marginBottom: 20, flexWrap: "wrap" }}>
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            padding: "9px 18px", border: "none", background: "none", cursor: "pointer",
            fontWeight: tab === id ? 700 : 500, fontSize: 13.5, color: tab === id ? THEME.navy : THEME.muted,
            borderBottom: tab === id ? `3px solid ${THEME.navy}` : "3px solid transparent",
          }}>{label}</button>
        ))}
      </div>

      {tab === "applications" && canList && <ApplicationsTab token={token} />}
      {tab === "manual" && canManual && <ManualIssueTab token={token} onIssued={loadStats} />}
      {tab === "settings" && canSettings && <SettingsTab token={token} />}
    </div>
  );
}

function StatChip({ label, value, color }) {
  return (
    <div style={{ background: `${color}12`, border: `1px solid ${color}33`, borderRadius: 10, padding: "10px 18px", minWidth: 120 }}>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11.5, color: THEME.muted }}>{label}</div>
    </div>
  );
}

function ApplicationsTab({ token }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const { confirm, ConfirmDialogPortal } = useConfirm();

  const load = () => apiFetch("/joining/applications", {}, token).then(setRows).catch((err) => setError(err.message));
  useEffect(() => { load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const downloadList = async () => {
    setExporting(true);
    try {
      await fetchAndSaveFile("/joining/applications/export", token, `joining-applications-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (err) { setError(err.message); } finally { setExporting(false); }
  };

  const deleteOne = (row) => {
    confirm(`Delete application for ${[row.first_name, row.middle_name, row.last_name].filter(Boolean).join(" ")}?`, async () => {
      setBusyId(row.id);
      try {
        await apiFetch(`/joining/applications/${row.id}`, { method: "DELETE" }, token);
        setRows((rs) => rs.filter((r) => r.id !== row.id));
      } catch (err) { setError(err.message); } finally { setBusyId(null); }
    }, { danger: true });
  };

  const deleteAll = () => {
    confirm(`Delete ALL (${rows.length}) applications? This cannot be undone.`, async () => {
      setDeletingAll(true);
      try {
        await apiFetch("/joining/applications/all", { method: "DELETE" }, token);
        setRows([]);
        showSuccess("Joining Instructions", "All applications have been deleted.");
      } catch (err) { setError(err.message); } finally { setDeletingAll(false); }
    }, { danger: true });
  };

  if (error) return <p style={{ color: "#B91C1C", fontSize: 13 }}>{error}</p>;
  if (!rows) return <Muted><SpinnerIcon size={14} /> Loading...</Muted>;

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <button onClick={downloadList} disabled={exporting || !rows.length} style={secondaryBtn}>{exporting ? "Downloading..." : "Download List (CSV)"}</button>
        {!!rows.length && <button onClick={deleteAll} disabled={deletingAll} style={dangerBtn}>{deletingAll ? "Deleting..." : "Delete All"}</button>}
      </div>
      {!rows.length ? <Muted>No applicants yet.</Muted> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: THEME.surface }}>
                {["Name", "District", "Ward", "Village/Street", "Exam Number", "Year", "Source", "Downloads", "Date", ""].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={tdStyle}>{[r.first_name, r.middle_name, r.last_name].filter(Boolean).join(" ")}</td>
                  <td style={tdStyle}>{r.district}</td>
                  <td style={tdStyle}>{r.ward}</td>
                  <td style={tdStyle}>{r.village}</td>
                  <td style={tdStyle}>{r.exam_number}</td>
                  <td style={tdStyle}>{r.exam_year}</td>
                  <td style={tdStyle}>{r.source === "online" ? "Online" : "At School"}</td>
                  <td style={tdStyle}>{r.download_count}</td>
                  <td style={{ ...tdStyle, fontSize: 10.5, color: THEME.muted }}>{new Date(r.created_at).toLocaleString("en-GB", { timeZone: "Africa/Dar_es_Salaam" })}</td>
                  <td style={tdStyle}>
                    <button onClick={() => deleteOne(r)} disabled={busyId === r.id} style={smallDangerBtn}>{busyId === r.id ? "..." : "Delete"}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {ConfirmDialogPortal}
    </div>
  );
}

function ManualIssueTab({ token, onIssued }) {
  const [fields, setFields] = useState(emptyFields);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [blankBusy, setBlankBusy] = useState(false);
  const { confirm, ConfirmDialogPortal } = useConfirm();

  const set = (k) => (e) => setFields((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    setError("");
    confirm("Issue a Joining Instruction for this student now?", async () => {
      setBusy(true);
      try {
        const res = await fetch(`${API_BASE}/joining/manual`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(fields),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.message || "Failed to issue Joining Instruction.");
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `Joining-Instruction-${fields.first_name}-${fields.last_name}.pdf`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
        showSuccess("Joining Instruction", "Issued and downloaded successfully.");
        setFields(emptyFields);
        onIssued && onIssued();
      } catch (err) {
        setError(err.message);
      } finally { setBusy(false); }
    }, { danger: false });
  };

  const downloadBlank = async () => {
    setBlankBusy(true);
    try {
      await fetchAndSaveFile("/joining/blank-pdf", token, "Joining-Instruction-Blank-Form.pdf");
    } catch (err) { setError(err.message); } finally { setBlankBusy(false); }
  };

  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ background: "#EAF0FF", border: `1px solid ${THEME.navy}33`, borderRadius: 10, padding: 14, marginBottom: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 12.5, color: THEME.heading, marginBottom: 10 }}>Offline? Get blank form</div>
        <button onClick={downloadBlank} disabled={blankBusy} style={secondaryBtn}>{blankBusy ? "Downloading..." : "Download Blank Form (PDF)"}</button>
      </div>

      <p style={{ fontSize: 12.5, color: THEME.muted, marginBottom: 14 }}>Fill in the details of a student applying in person — they'll receive the same Joining Instruction issued online.</p>
      <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
        <FieldRow label="First Name" value={fields.first_name} onChange={set("first_name")} required />
        <FieldRow label="Middle Name" value={fields.middle_name} onChange={set("middle_name")} />
        <FieldRow label="Last Name" value={fields.last_name} onChange={set("last_name")} required />
        <FieldRow label="District" value={fields.district} onChange={set("district")} required />
        <FieldRow label="Ward" value={fields.ward} onChange={set("ward")} required />
        <FieldRow label="Village/Street" value={fields.village} onChange={set("village")} required />
        <FieldRow label="Exam Number (PS1234567-0001)" value={fields.exam_number} onChange={set("exam_number")} required />
        <FieldRow label="Standard VII Completion Year" value={fields.exam_year} onChange={set("exam_year")} type="number" required />
        {error && <p style={{ color: "#B91C1C", fontSize: 12.5, margin: 0 }}>{error}</p>}
        <button type="submit" disabled={busy} style={primaryBtn}>{busy ? "Issuing..." : "Issue & Download Joining Instruction"}</button>
      </form>
      {ConfirmDialogPortal}
    </div>
  );
}

function FieldRow({ label, value, onChange, type = "text", required }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: THEME.text, marginBottom: 4 }}>{label}{required ? " *" : ""}</label>
      <input type={type} value={value} onChange={onChange} required={required} style={inputStyle} />
    </div>
  );
}

function SettingsTab({ token }) {
  const [settings, setSettings] = useState(null);
  const [text, setText] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { confirm, ConfirmDialogPortal } = useConfirm();

  const load = () => apiFetch("/joining/settings", {}, token).then((d) => {
    setSettings(d); setText(d.requirements_text || ""); setYear(d.admission_year || new Date().getFullYear());
  }).catch((err) => setError(err.message));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setBusy(true); setError("");
    try {
      await apiFetch("/joining/settings", { method: "PUT", body: JSON.stringify({ requirements_text: text, admission_year: Number(year) }) }, token);
      showSuccess("Requirements", "Joining requirements have been saved.");
      load();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const togglePublish = () => {
    const next = !settings.is_published;
    confirm(next ? "Publish Joining Instruction forms online now?" : "Turn off Joining Instruction forms online?", async () => {
      setBusy(true);
      try {
        await apiFetch("/joining/settings/publish", { method: "POST", body: JSON.stringify({ published: next }) }, token);
        showSuccess("Joining Instructions", next ? "Forms have been published online." : "Forms have been turned off.");
        load();
      } catch (err) { setError(err.message); } finally { setBusy(false); }
    }, { danger: !next });
  };

  if (!settings) return <Muted><SpinnerIcon size={14} /> Loading...</Muted>;

  return (
    <div style={{ maxWidth: 620 }}>
      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Current status:</span>
        <span style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: settings.is_published ? "#DCFCE7" : "#FEE2E2", color: settings.is_published ? "#166534" : "#B91C1C" }}>
          {settings.is_published ? "Published (Parents can apply)" : "Not Published"}
        </span>
        <button onClick={togglePublish} disabled={busy} style={settings.is_published ? dangerBtn : primaryBtn}>
          {settings.is_published ? "Turn Off Forms" : "Publish Forms"}
        </button>
      </div>

      <h3 style={{ fontSize: 15, fontWeight: 800, color: THEME.heading, margin: "0 0 14px" }}>
        Joining Instructions for Form I ({year})
      </h3>

      <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: THEME.text, marginBottom: 6 }}>Year (shown in the Joining Instruction header)</label>
      <input type="number" value={year} onChange={(e) => setYear(e.target.value)} style={{ ...inputStyle, maxWidth: 160, marginBottom: 16 }} />

      <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: THEME.text, marginBottom: 6 }}>Joining Requirements (shown on the Joining Instruction)</label>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
      {error && <p style={{ color: "#B91C1C", fontSize: 12.5, margin: "8px 0 0" }}>{error}</p>}
      <button onClick={save} disabled={busy} style={{ ...primaryBtn, marginTop: 12 }}>{busy ? "Saving..." : "Save Requirements"}</button>
      {ConfirmDialogPortal}
    </div>
  );
}

const Muted = ({ children }) => <p style={{ color: THEME.muted, fontSize: 13.5, display: "flex", alignItems: "center", gap: 7 }}>{children}</p>;
const thStyle = { padding: "8px 10px", textAlign: "left", borderBottom: `1px solid ${THEME.border}`, fontWeight: 700, whiteSpace: "nowrap" };
const tdStyle = { padding: "7px 10px", borderBottom: `1px solid ${THEME.border}`, whiteSpace: "nowrap" };
const inputStyle = { width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${THEME.border}`, fontSize: 13, boxSizing: "border-box" };
const primaryBtn = { padding: "9px 18px", borderRadius: 8, border: "none", background: THEME.navy, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" };
const secondaryBtn = { padding: "9px 18px", borderRadius: 8, border: `1px solid ${THEME.border}`, background: THEME.surface, color: THEME.text, fontWeight: 700, fontSize: 13, cursor: "pointer" };
const dangerBtn = { padding: "9px 18px", borderRadius: 8, border: "none", background: "#B91C1C", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" };
const smallDangerBtn = { padding: "5px 10px", borderRadius: 6, border: "1px solid #B91C1C55", background: "none", color: "#B91C1C", fontWeight: 700, fontSize: 11.5, cursor: "pointer" };
