import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiFetch, API_BASE } from "../utils/api";
import { THEME } from "../styles/theme";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { SpinnerIcon } from "../components/icons";

const FORMS = ["Form I", "Form II", "Form III", "Form IV"];

export default function IdentityCards() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { isMobile, isTablet } = useBreakpoint();
  // Phones AND tablets alike are treated as "not desktop" here: neither
  // reliably has a browser-embedded PDF viewer plugin the way desktop
  // Chrome/Firefox/Safari/Edge do, so an <iframe src="blob:...pdf"> just
  // renders blank/empty on most of them - it LOOKS like the feature is
  // broken (or like it's silently trying to force a download) even though
  // the PDF itself generated fine. See doPreview/the render section below.
  const isHandheld = isMobile || isTablet;

  const [form, setForm] = useState("Form I");
  const [search, setSearch] = useState("");
  const [students, setStudents] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [layout, setLayout] = useState("single"); // single | grid
  const [previewUrl, setPreviewUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setStudents(null);
    const params = new URLSearchParams();
    if (form) params.set("form", form);
    if (search.trim()) params.set("search", search.trim());
    apiFetch(`/students?${params.toString()}`, {}, token)
      .then((res) => setStudents(Array.isArray(res?.data) ? res.data : []))
      .catch((err) => setError(err.message));
  }, [form, search, token]);

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const selectAllVisible = () => setSelected((prev) => {
    const next = new Set(prev);
    (students || []).forEach((s) => next.add(s.id));
    return next;
  });
  const clearSelection = () => setSelected(new Set());

  useEffect(() => {
    // Any change to the selection or layout invalidates whatever preview
    // is currently showing, so it's never possible to look at a preview
    // that no longer matches what "Print" would actually produce.
    if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
  }, [selected, layout]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchCardsPdf = async () => {
    const ids = Array.from(selected);
    const res = await fetch(`${API_BASE}/id-cards/pdf?student_ids=${ids.join(",")}&layout=${layout}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.message || "Failed to generate Identity Cards.");
    }
    return res.blob();
  };

  const doPreview = async () => {
    if (!selected.size) { setError("Select at least one student."); return; }
    setError(""); setBusy(true);
    try {
      const blob = await fetchCardsPdf();
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      // On phones/tablets, embedding the PDF in an <iframe> almost always
      // just shows a blank box - there's no in-page PDF viewer to render
      // it with, unlike desktop browsers. Open it in its own tab instead,
      // which hands it to the device's actual full PDF viewer (Chrome's
      // built-in one on Android, Safari's on iOS, etc.) - the exact same
      // mechanism "Print" below already uses successfully. Calling
      // window.open() here, directly inside this same tap/click handler,
      // keeps it counted as a genuine user gesture so it isn't blocked as
      // a pop-up.
      if (isHandheld) window.open(url, "_blank");
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const doDownload = async () => {
    if (!selected.size) { setError("Select at least one student."); return; }
    setError(""); setBusy(true);
    try {
      const blob = await fetchCardsPdf();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `Identity-Cards-${layout}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  // Printing straight out of the embedded preview <iframe> is unreliable —
  // some browsers show no Cancel option on the print dialog it triggers,
  // and the printed page can come out blank. Opening the PDF in its own
  // full browser tab uses the browser's native, full-featured PDF viewer
  // instead, where Print/Cancel behave normally.
  const doPrint = async () => {
    if (!selected.size) { setError("Select at least one student."); return; }
    setError(""); setBusy(true);
    try {
      const blob = await fetchCardsPdf();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <div style={{ padding: isMobile ? "16px 12px" : 32, maxWidth: 1100 }}>
      <button onClick={() => navigate("/dashboard/students")} style={backBtn}>← Back to Student Management</button>
      <h2 style={{ color: THEME.heading, fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Student Identity Cards</h2>
      <p style={{ color: THEME.muted, fontSize: 13.5, marginBottom: 20 }}>
        Uses each student's existing enrollment photo (background already replaced automatically) — no separate photo session needed.
      </p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <select value={form} onChange={(e) => setForm(e.target.value)} style={selectStyle}>
          {FORMS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name..." style={{ ...selectStyle, flex: 1, minWidth: 160 }} />
        <button onClick={selectAllVisible} style={secondaryBtn}>Select All</button>
        <button onClick={clearSelection} style={secondaryBtn}>Clear Selection</button>
      </div>

      {error && <p style={{ color: "#B91C1C", fontSize: 12.5, marginBottom: 12 }}>{error}</p>}

      {students === null ? (
        <p style={{ color: THEME.muted, fontSize: 13.5, display: "flex", alignItems: "center", gap: 7 }}><SpinnerIcon size={14} /> Loading...</p>
      ) : !students.length ? (
        <p style={{ color: THEME.muted, fontSize: 13.5 }}>No students found.</p>
      ) : (
        <div style={{
          display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(230px, 1fr))",
          gap: 10, marginBottom: 22, maxHeight: 420, overflowY: "auto", padding: 2,
        }}>
          {students.map((s) => {
            const checked = selected.has(s.id);
            const fullName = [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ");
            return (
              <label key={s.id} style={{
                display: "flex", alignItems: "center", gap: 10, padding: 10, borderRadius: 4, cursor: "pointer",
                border: `1.5px solid ${checked ? THEME.navy : THEME.border}`, background: checked ? `${THEME.navy}0d` : THEME.surface,
              }}>
                <input type="checkbox" checked={checked} onChange={() => toggle(s.id)} />
                <div style={{ width: 34, height: 34, borderRadius: 4, overflow: "hidden", background: "#EFF6FF", flexShrink: 0 }}>
                  {s.photo_url && <img src={s.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: THEME.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fullName}</div>
                  <div style={{ fontSize: 11, color: THEME.muted }}>{s.reg_no || "-"}</div>
                </div>
              </label>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: THEME.text }}>{selected.size} selected</span>
        <div style={{ display: "flex", gap: 10 }}>
          {[["single", "One Per Page"], ["grid", "Multiple Per Page"]].map(([val, label]) => (
            <label key={val} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 4,
              border: `1.5px solid ${layout === val ? THEME.navy : THEME.border}`,
              background: layout === val ? `${THEME.navy}10` : "transparent", cursor: "pointer", fontSize: 12.5,
            }}>
              <input type="radio" name="id_card_layout" checked={layout === val} onChange={() => setLayout(val)} />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <button onClick={doPreview} disabled={busy} style={secondaryBtn}>{busy ? "..." : "Preview"}</button>
        <button onClick={doPrint} disabled={busy} style={secondaryBtn}>{busy ? "..." : "Print"}</button>
        <button onClick={doDownload} disabled={busy} style={primaryBtn}>{busy ? "..." : "Download / Print PDF"}</button>
      </div>

      {previewUrl && (
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: THEME.heading, marginBottom: 4 }}>Preview — this is how it will print</h3>
          {isHandheld ? (
            // No embedded PDF viewer to show inline here on a phone/tablet
            // - it already opened in its own tab (see doPreview) where the
            // device's real PDF viewer can actually render it. This box is
            // just a clear confirmation + a manual retry, in case the
            // automatic open was blocked as a pop-up.
            <div style={{ background: THEME.bg, border: `1px solid ${THEME.border}`, borderRadius: 4, padding: 18, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
              <p style={{ fontSize: 12.5, color: THEME.muted, margin: 0 }}>
                The preview opened in a new tab — phones and tablets don't have a way to show a PDF inside this page directly. If nothing opened (some browsers block pop-ups), tap the button below.
              </p>
              <button onClick={() => window.open(previewUrl, "_blank")} style={secondaryBtn}>Open Preview</button>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 11.5, color: THEME.muted, marginBottom: 8 }}>
                To print, use the "Print" button above instead of the print icon inside this preview. If the box below looks empty, <a href={previewUrl} target="_blank" rel="noopener noreferrer" style={{ color: THEME.navy, fontWeight: 600 }}>open the preview in a new tab</a> instead.
              </p>
              <iframe title="Identity Card Preview" src={previewUrl} style={{ width: "100%", height: 700, border: `1px solid ${THEME.border}`, borderRadius: 4 }} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

const backBtn = {
  display: "inline-flex", alignItems: "center", gap: 6, background: THEME.surface,
  border: `1.5px solid ${THEME.border}`, borderRadius: 4, color: THEME.heading,
  fontWeight: 600, fontSize: 13, cursor: "pointer", marginBottom: 14, padding: "8px 14px",
};
const selectStyle = { padding: "9px 12px", borderRadius: 4, border: `1px solid ${THEME.border}`, fontSize: 13, background: THEME.surface, color: THEME.text };
const primaryBtn = { padding: "9px 18px", borderRadius: 4, border: "none", background: THEME.navy, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" };
const secondaryBtn = { padding: "9px 18px", borderRadius: 4, border: `1px solid ${THEME.border}`, background: THEME.surface, color: THEME.text, fontWeight: 700, fontSize: 13, cursor: "pointer" };
