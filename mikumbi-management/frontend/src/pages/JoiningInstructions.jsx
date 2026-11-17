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
    ...(canSettings ? [["settings", "Edit & Publish"]] : []),
  ];

  return (
    <div style={{ padding: isMobile ? "16px 12px" : 32, maxWidth: 1000 }}>
      {canList && (
        <button onClick={() => navigate("/dashboard/students")} style={{
          display: "inline-flex", alignItems: "center", gap: 6, background: THEME.surface,
          border: `1.5px solid ${THEME.border}`, borderRadius: 4, color: THEME.heading,
          fontWeight: 600, fontSize: 13, cursor: "pointer", marginBottom: 14, padding: "8px 14px",
        }}>← Back to Student Management</button>
      )}
      <h2 style={{ color: THEME.heading, fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Joining Instructions</h2>
      <p style={{ color: THEME.muted, fontSize: 13.5, marginBottom: 18 }}>Form I intake — public applications, in-person issuance, and admission requirements.</p>

      {stats && (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
          <StatChip label="Online" value={stats.online} color={THEME.link} />
          <StatChip label="Issued at School" value={stats.manual} color="#B7791F" />
          <StatChip label="Total Applicants" value={stats.total} color="#166534" />
        </div>
      )}

      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${THEME.border}`, marginBottom: 20, flexWrap: "wrap" }}>
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            padding: "9px 18px", border: "none", background: "none", cursor: "pointer",
            fontWeight: tab === id ? 700 : 500, fontSize: 13.5, color: tab === id ? THEME.link : THEME.muted,
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
    <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, padding: "10px 18px", minWidth: 120 }}>
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

  if (error) return <p style={{ color: THEME.danger, fontSize: 13 }}>{error}</p>;
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
      <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, padding: 14, marginBottom: 18 }}>
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
        {error && <p style={{ color: THEME.danger, fontSize: 12.5, margin: 0 }}>{error}</p>}
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

// Edit & Publish - edit the full Joining Instruction (letter wording,
// sections, Head of School sign-off) BEFORE publishing it, preview the exact
// PDF parents will get, then publish. While published the content is locked
// (the server refuses edits too) - turn the form off first to change it.
function SettingsTab({ token }) {
  const navigate = useNavigate();
  const [settings, setSettings] = useState(null);
  const [content, setContent] = useState(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState("");
  const [hasSignature, setHasSignature] = useState(null);
  const { confirm, ConfirmDialogPortal } = useConfirm();

  const load = () => apiFetch("/joining/settings", {}, token).then((d) => {
    setSettings(d); setContent(d.content); setYear(d.admission_year || new Date().getFullYear()); setDirty(false);
  }).catch((err) => setError(err.message));
  useEffect(() => {
    load();
    apiFetch("/settings/branding", {}, token).then((b) => setHasSignature(!!b?.data?.headmaster_signature_url)).catch(() => setHasSignature(null));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const locked = !!settings?.is_published;
  const update = (patch) => { setContent((c) => ({ ...c, ...patch })); setDirty(true); };
  const updateSection = (idx, patch) => update({ sections: content.sections.map((s, i) => (i === idx ? { ...s, ...patch } : s)) });
  const moveSection = (idx, dir) => {
    const next = [...content.sections];
    const to = idx + dir;
    if (to < 0 || to >= next.length) return;
    [next[idx], next[to]] = [next[to], next[idx]];
    update({ sections: next });
  };
  const removeSection = (idx) => confirm(`Remove section "${content.sections[idx].title || idx + 1}"?`, () => update({ sections: content.sections.filter((_, i) => i !== idx) }), { danger: true });
  const addSection = () => update({ sections: [...content.sections, { title: "SEHEMU MPYA", body: "- " }] });

  const save = async () => {
    setBusy(true); setError("");
    try {
      const d = await apiFetch("/joining/settings", { method: "PUT", body: JSON.stringify({ content, admission_year: Number(year) }) }, token);
      setSettings(d); setContent(d.content); setDirty(false);
      showSuccess("Joining Instructions", "Changes saved. Use Preview to check the PDF, then Publish.");
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const preview = async () => {
    setPreviewing(true); setError("");
    // Open the tab synchronously (inside the click) so pop-up blockers allow it.
    const win = window.open("", "_blank");
    try {
      const res = await fetch(`${API_BASE}/joining/preview-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content, admission_year: Number(year) }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message || "Could not generate the preview.");
      }
      const url = URL.createObjectURL(await res.blob());
      if (win) win.location.href = url;
      else window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      if (win) win.close();
      setError(err.message);
    } finally { setPreviewing(false); }
  };

  const resetDefault = () => confirm("Replace the current wording with the school's original Joining Instruction? (Nothing is saved until you press Save.)", () => {
    setContent(JSON.parse(JSON.stringify(settings.default_content))); setDirty(true);
  });

  const togglePublish = () => {
    const next = !settings.is_published;
    if (next && dirty) { setError("You have unsaved changes - Save them (and Preview) before publishing."); return; }
    confirm(next ? "Publish the Joining Instruction online now? Parents will be able to download it." : "Turn off the online Joining Instruction form? You can then edit it.", async () => {
      setBusy(true); setError("");
      try {
        await apiFetch("/joining/settings/publish", { method: "POST", body: JSON.stringify({ published: next }) }, token);
        showSuccess("Joining Instructions", next ? "Published - parents can now download it." : "Turned off - you can edit it now.");
        load();
      } catch (err) { setError(err.message); } finally { setBusy(false); }
    }, { danger: !next });
  };

  if (!settings || !content) return error ? <p style={{ color: THEME.danger, fontSize: 13 }}>{error}</p> : <Muted><SpinnerIcon size={14} /> Loading...</Muted>;

  const ro = locked;
  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Current status:</span>
        <span style={{ padding: "4px 12px", fontSize: 12, fontWeight: 700, background: settings.is_published ? "#DCFCE7" : "#FEE2E2", color: settings.is_published ? "#166534" : "#B91C1C" }}>
          {settings.is_published ? "Published (Parents can apply)" : "Not Published (draft - editable)"}
        </span>
        <button onClick={togglePublish} disabled={busy} style={settings.is_published ? dangerBtn : primaryBtn}>
          {settings.is_published ? "Turn Off to Edit" : "Publish"}
        </button>
        <button onClick={preview} disabled={previewing} style={secondaryBtn}>{previewing ? "Preparing..." : "Preview PDF"}</button>
      </div>

      {locked && (
        <div style={noteBox}>The Joining Instruction is published, so editing is locked. Press <b>Turn Off to Edit</b>, make your changes, Preview, then Publish again.</div>
      )}
      <div style={{ ...noteBox, background: hasSignature ? THEME.surface : THEME.warningLight }}>
        {hasSignature
          ? "The Head Master's signature uploaded in Settings is placed on every Joining Instruction automatically."
          : "No Head Master's signature has been uploaded yet - the PDF will show a dotted line instead. "}
        {!hasSignature && <button onClick={() => navigate("/dashboard/signature-stamp")} style={linkBtn}>Upload it in Settings → Signature &amp; Stamp</button>}
      </div>

      {error && <p style={{ color: THEME.danger, fontSize: 12.5, margin: "0 0 12px" }}>{error}</p>}

      <fieldset disabled={ro} style={{ border: "none", padding: 0, margin: 0, opacity: ro ? 0.7 : 1 }}>
        <div style={{ ...sectionCard, marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 13.5, color: THEME.heading, marginBottom: 10 }}>PDF appearance (choose before publishing)</div>
          <label style={labelStyle}>Watermark</label>
          <select value={content.watermark || "text"} onChange={(e) => update({ watermark: e.target.value })} style={{ ...inputStyle, maxWidth: 320, marginBottom: 4 }}>
            {WATERMARK_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <p style={{ fontSize: 11.5, color: THEME.muted, margin: "0 0 14px" }}>
            {(WATERMARK_OPTIONS.find((o) => o.id === (content.watermark || "text")) || WATERMARK_OPTIONS[0]).hint}
          </p>
          <label style={labelStyle}>Font</label>
          <select value={content.font || "arimo"} onChange={(e) => update({ font: e.target.value })} style={{ ...inputStyle, maxWidth: 320 }}>
            {FONT_OPTIONS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
          <p style={{ fontSize: 11.5, color: THEME.muted, margin: "8px 0 0" }}>Press <b>Save Changes</b>, then <b>Preview PDF</b> to see how it looks.</p>
        </div>
        <div style={grid2}>
          <LabeledInput label="Admission year (Form I)" type="number" value={year} onChange={(v) => { setYear(v); setDirty(true); }} />
          <LabeledInput label="Phone numbers (WASILIANA NASI), comma separated" value={content.phones} onChange={(v) => update({ phones: v })} />
        </div>
        <LabeledArea label="School address (top right)" rows={3} value={content.address} onChange={(v) => update({ address: v })} />
        <LabeledInput label="Subject line (YAH)" value={content.subject} onChange={(v) => update({ subject: v })} />
        <LabeledArea label="Opening paragraphs (one paragraph per line)" rows={6} value={content.intro} onChange={(v) => update({ intro: v })} />

        <div style={{ ...noteBox, fontSize: 12 }}>
          <b>How to write a section:</b> start a line with <code>- </code> for a numbered item (i, ii, iii…), <code>* </code> for a bullet,
          <code> ## </code> for a sub-heading (e.g. WAVULANA), <code>**</code> for a bold line and <code>NB:</code> for a note.
          Other lines are normal paragraphs. <code>{"{MWAKA}"}</code> is replaced by the admission year.
        </div>

        {content.sections.map((sec, idx) => (
          <div key={idx} style={sectionCard}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontWeight: 800, color: THEME.heading, minWidth: 22 }}>{idx + 1}.</span>
              <input value={sec.title} onChange={(e) => updateSection(idx, { title: e.target.value })} style={{ ...inputStyle, fontWeight: 700 }} placeholder="Section title" />
              <button type="button" onClick={() => moveSection(idx, -1)} disabled={idx === 0} style={iconBtn} title="Move up">↑</button>
              <button type="button" onClick={() => moveSection(idx, 1)} disabled={idx === content.sections.length - 1} style={iconBtn} title="Move down">↓</button>
              <button type="button" onClick={() => removeSection(idx)} style={{ ...iconBtn, color: THEME.danger }} title="Remove">✕</button>
            </div>
            <textarea value={sec.body} onChange={(e) => updateSection(idx, { body: e.target.value })} rows={Math.min(16, Math.max(4, sec.body.split("\n").length + 1))} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }} />
          </div>
        ))}
        <button type="button" onClick={addSection} style={{ ...secondaryBtn, marginBottom: 18 }}>+ Add section</button>

        <LabeledInput label="Closing line" value={content.closing} onChange={(v) => update({ closing: v })} />
        <div style={grid2}>
          <LabeledInput label="Head of School name" value={content.head_name} onChange={(v) => update({ head_name: v })} />
          <LabeledInput label="Title" value={content.head_title} onChange={(v) => update({ head_title: v })} />
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, margin: "6px 0 16px" }}>
          <input type="checkbox" checked={content.include_forms !== false} onChange={(e) => update({ include_forms: e.target.checked })} />
          Attach the forms (Fomu Na. 1 Ahadi ya Mzazi, Na. 2 Ahadi ya Mwanafunzi, Na. 3 Maelezo Binafsi, Na. 4 Medical Examination)
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, margin: "-8px 0 16px" }}>
          <input type="checkbox" checked={content.include_uniform_page !== false} onChange={(e) => update({ include_uniform_page: e.target.checked })} />
          Add the uniform guide page (photos of allowed / not-allowed uniform, faces hidden)
        </label>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={save} disabled={busy || ro} style={primaryBtn}>{busy ? "Saving..." : dirty ? "Save Changes" : "Saved"}</button>
          <button onClick={preview} disabled={previewing} type="button" style={secondaryBtn}>{previewing ? "Preparing..." : "Preview PDF"}</button>
          <button onClick={resetDefault} disabled={ro} type="button" style={secondaryBtn}>Restore original wording</button>
        </div>
      </fieldset>
      {ConfirmDialogPortal}
    </div>
  );
}

function LabeledInput({ label, value, onChange, type = "text" }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={labelStyle}>{label}</label>
      <input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    </div>
  );
}
function LabeledArea({ label, value, onChange, rows = 4 }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={labelStyle}>{label}</label>
      <textarea value={value ?? ""} onChange={(e) => onChange(e.target.value)} rows={rows} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }} />
    </div>
  );
}
const WATERMARK_OPTIONS = [
  { id: "text", label: "MIKUMBI SECONDARY SCHOOL", hint: "Faint school name across the page" },
  { id: "logo", label: "School logo", hint: "Faint badge in the centre, like the ID card" },
  { id: "none", label: "Plain", hint: "No watermark" },
];
const FONT_OPTIONS = [
  { id: "arimo", label: "Arimo (Arial style)" },
  { id: "times", label: "Times New Roman" },
  { id: "helvetica", label: "Helvetica" },
  { id: "courier", label: "Courier (typewriter)" },
];
const labelStyle = { display: "block", fontSize: 12.5, fontWeight: 600, color: THEME.text, marginBottom: 5 };
const grid2 = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 };
const noteBox = { border: `1px solid ${THEME.border}`, background: THEME.surface, padding: "10px 14px", fontSize: 12.5, color: THEME.text, marginBottom: 14, lineHeight: 1.6 };
const sectionCard = { border: `1px solid ${THEME.border}`, background: THEME.surface, padding: 12, marginBottom: 12 };
const iconBtn = { width: 32, height: 32, flexShrink: 0, border: `1px solid ${THEME.border}`, background: THEME.surface, color: THEME.text, cursor: "pointer", fontWeight: 700 };
const linkBtn = { background: "none", border: "none", color: THEME.link, fontWeight: 700, cursor: "pointer", padding: 0, textDecoration: "underline", fontSize: 12.5 };

const Muted = ({ children }) => <p style={{ color: THEME.muted, fontSize: 13.5, display: "flex", alignItems: "center", gap: 7 }}>{children}</p>;
const thStyle = { padding: "8px 10px", textAlign: "left", borderBottom: `1px solid ${THEME.border}`, fontWeight: 700, whiteSpace: "nowrap" };
const tdStyle = { padding: "7px 10px", borderBottom: `1px solid ${THEME.border}`, whiteSpace: "nowrap" };
const inputStyle = { width: "100%", padding: "9px 12px", borderRadius: 4, border: `1px solid ${THEME.border}`, fontSize: 13, boxSizing: "border-box" };
const primaryBtn = { padding: "9px 18px", borderRadius: 4, border: "none", background: THEME.navy, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" };
const secondaryBtn = { padding: "9px 18px", borderRadius: 4, border: `1px solid ${THEME.border}`, background: THEME.surface, color: THEME.text, fontWeight: 700, fontSize: 13, cursor: "pointer" };
const dangerBtn = { padding: "9px 18px", borderRadius: 4, border: "none", background: THEME.dangerSolid, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" };
const smallDangerBtn = { padding: "5px 10px", borderRadius: 4, border: `1px solid ${THEME.danger}`, background: "none", color: THEME.danger, fontWeight: 700, fontSize: 11.5, cursor: "pointer" };
