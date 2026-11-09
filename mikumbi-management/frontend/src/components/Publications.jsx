import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { apiFetch, API_BASE } from "../utils/api";
import { THEME } from "../styles/theme";
import { SpinnerIcon } from "./icons";
import ErrorBoundary from "./ErrorBoundary";

// This whole file is public-facing (no login) — everything here is written
// in Kiswahili per spec ("Melekezo ya kule yawe ya kiswahili maana kuna
// baadhi ya wazazi hawajui kabisa kingereza").

// `forcedView` ("results" | "joining") lets the public website open this panel
// straight from its own /results and /joining-instructions routes, instead of
// relying on the ?view= query string.
export default function Publications({ forcedView = null }) {
  const [searchParams] = useSearchParams();
  const initialView = forcedView || searchParams.get("view"); // "results" | "joining" | null
  const [tab, setTab] = useState(initialView === "results" || initialView === "joining" ? initialView : null);

  useEffect(() => {
    if (initialView === "results" || initialView === "joining") setTab(initialView);
  }, [initialView]);

  return (
    <section id="publications" style={{ padding: "60px 24px", maxWidth: 1000, margin: "0 auto" }}>
      <h2 style={{ textAlign: "center", color: THEME.heading, fontSize: 24, fontWeight: 800, marginBottom: 8 }}>
        {tab === "joining" ? "Machapisho" : "Machapisho (Publications)"}
      </h2>
      <p style={{ textAlign: "center", color: THEME.muted, fontSize: 14, marginBottom: 28 }}>
        {tab === "joining" ? "Maelekezo ya Kujiunga na Kidato cha Kwanza"
          : tab === "results" ? "Matokeo ya Mwanafunzi"
          : "Matokeo na Maelekezo ya Kujiunga na Kidato cha Kwanza"}
      </p>

      {tab === null ? (
        <div style={{ display: "flex", justifyContent: "center", gap: 20, flexWrap: "wrap" }}>
          <PublicationCard
            title="Matokeo (Results)" subtitle="Angalia matokeo ya mwanafunzi wako mtandaoni"
            color={THEME.navy} bg="#EAF0FF"
            icon={<ResultsIcon color={THEME.navy} />}
            onClick={() => setTab("results")}
          />
          <PublicationCard
            title="Joining Instructions" subtitle="Kwa wanafunzi wanaotarajia kujiunga na Kidato cha Kwanza"
            color="#B7791F" bg="#FFF6E5"
            icon={<JoiningIcon color="#B7791F" />}
            onClick={() => setTab("joining")}
          />
        </div>
      ) : (
        <div>
          <button onClick={() => setTab(null)} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: THEME.surface, border: `1.5px solid ${THEME.border}`, borderRadius: 8,
            color: THEME.heading, fontWeight: 600, fontSize: 13.5,
            cursor: "pointer", marginBottom: 20, padding: "9px 16px",
          }}>← Rudi Nyuma</button>
          <h3 style={{ textAlign: "center", color: THEME.heading, fontSize: 16, fontWeight: 700, marginBottom: 22 }}>
            {tab === "results" ? "Matokeo (Results)" : "Joining Instructions"}
          </h3>
          {tab === "results" ? <ErrorBoundary><ResultsPortal /></ErrorBoundary> : <ErrorBoundary><JoiningInstructionsPanel /></ErrorBoundary>}
        </div>
      )}
    </section>
  );
}

function PublicationCard({ title, subtitle, color, bg, icon, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: 230, maxWidth: "100%", background: bg, border: `1.5px solid ${color}33`, borderRadius: 16,
      padding: "28px 20px", cursor: "pointer", textAlign: "center", transition: "transform 0.15s",
    }}
      onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-3px)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
    >
      <div style={{ marginBottom: 14, display: "flex", justifyContent: "center" }}>{icon}</div>
      <div style={{ fontWeight: 800, fontSize: 17, color }}>{title}</div>
      <div style={{ fontSize: 12.5, color: THEME.muted, marginTop: 6 }}>{subtitle}</div>
    </button>
  );
}

function ResultsIcon({ color }) {
  return (
    <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6h-3" />
      <path d="M14 2v6h6" />
      <path d="M9 13l2 2 4-4" />
    </svg>
  );
}
function JoiningIcon({ color }) {
  return (
    <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6M22 11h-6" />
    </svg>
  );
}
function PdfIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" />
    </svg>
  );
}

// ══════════════════════ RESULTS PORTAL (login-gated, view only) ═══════════
function ResultsPortal() {
  const [step, setStep] = useState("username"); // username | password | results
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState(null);
  const [student, setStudent] = useState(null);
  const [results, setResults] = useState(null);
  const [loadingResults, setLoadingResults] = useState(false);

  const checkUsername = async (e) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      const r = await apiFetch("/public/results/check-username", { method: "POST", body: JSON.stringify({ username }) });
      if (r.valid) setStep("password");
      else setError(r.message || "Namba ya Usajili si sahihi.");
    } catch {
      setError("Hitilafu imetokea. Tafadhali jaribu tena.");
    } finally { setBusy(false); }
  };

  const login = async (e) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      const r = await apiFetch("/public/results/login", { method: "POST", body: JSON.stringify({ username, password }) });
      setToken(r.token); setStudent(r.student); setStep("results");
    } catch (err) {
      setError((err && err.message) || "Namba ya simu na Namba ya Usajili hazilingani.");
    } finally { setBusy(false); }
  };

  useEffect(() => {
    if (step !== "results" || !token) return;
    setLoadingResults(true);
    apiFetch("/public/results/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((d) => setResults(d))
      .catch(() => setResults(null))
      .finally(() => setLoadingResults(false));
  }, [step, token]);

  const logout = () => {
    setStep("username"); setUsername(""); setPassword(""); setToken(null);
    setStudent(null); setResults(null); setError("");
  };

  if (step === "results") {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
          <button onClick={logout} style={smallLinkBtn}>Toka (Logout)</button>
        </div>
        {loadingResults ? (
          <Muted><SpinnerIcon size={14} /> Inapakia matokeo...</Muted>
        ) : !results || !results.results || !results.results.length ? (
          <Muted>Hakuna matokeo yaliyochapishwa kwa sasa kwa mwanafunzi huyu.</Muted>
        ) : (
          <div style={{ display: "grid", gap: 22 }}>
            {results.results.map((r) => <ResultCard key={r.sheet_id} r={r} student={results.student} />)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 380, margin: "0 auto" }}>
      {step === "username" && (
        <form onSubmit={checkUsername} style={{ display: "grid", gap: 12 }}>
          <label style={formLabel}>Namba ya Usajili (Registration Number)</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Mfano: S4005/0001/2025" style={formInput} autoFocus />
          <p style={{ fontSize: 11.5, color: THEME.muted, margin: 0 }}>Namba hii inapatikana kwenye Ripoti ya Mzazi (Parent Report) ya mwanafunzi — "Namba ya Kuingia Mtandaoni (Results)".</p>
          {error && <ErrorMsg>{error}</ErrorMsg>}
          <button type="submit" disabled={busy || !username.trim()} style={primaryBtn}>{busy ? "Inaangalia..." : "Endelea"}</button>
        </form>
      )}
      {step === "password" && (
        <form onSubmit={login} style={{ display: "grid", gap: 12 }}>
          <div style={{ fontSize: 13, color: THEME.text }}>Namba ya Usajili: <b>{username}</b> <button type="button" onClick={() => { setStep("username"); setError(""); }} style={{ ...smallLinkBtn, marginLeft: 8 }}>Badilisha</button></div>
          <label style={formLabel}>Password</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mfano: 0712345678" style={formInput} autoFocus />
          <p style={{ fontSize: 11.5, color: THEME.muted, margin: 0 }}>Andika namba ya simu ya mzazi/mlezi iliyoandikwa wakati mwanafunzi anasajiliwa shuleni.</p>
          {error && <ErrorMsg>{error}</ErrorMsg>}
          <button type="submit" disabled={busy || !password.trim()} style={primaryBtn}>{busy ? "Inaingia..." : "Ingia"}</button>
          <p style={{ fontSize: 11.5, color: THEME.muted, textAlign: "center", margin: 0 }}>Umesahau password? Wasiliana moja kwa moja na Mkuu wa Shule.</p>
        </form>
      )}
    </div>
  );
}

// Styled to echo the Parent Report / NECTA look — navy-blue outer panel,
// cream/yellow inner table.
function ResultCard({ r, student }) {
  const s = r.student || {};
  return (
    <div style={{ background: "#ADD8E6", borderRadius: 12, padding: 14, border: "1px solid #7C93B8" }}>
      <div style={{ textAlign: "center", marginBottom: 10 }}>
        <div style={{ fontWeight: 800, color: "#0A1F5C", fontSize: 15 }}>{student.full_name}</div>
        <div style={{ fontSize: 12, color: "#0A1F5C" }}>{r.form} — {r.exam_type} {r.month ? `(${r.month})` : ""} {r.year}</div>
      </div>
      <div style={{ background: "#FFFEEA", border: "1px solid #7C93B8", borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: "#FCF3C0" }}>
              <th style={thStyle}>Somo</th>
              <th style={thStyle}>Alama</th>
              <th style={thStyle}>Daraja</th>
            </tr>
          </thead>
          <tbody>
            {(r.scores || []).map((sc, i) => (
              <tr key={i}>
                <td style={tdStyle}>{sc.subject_name}</td>
                <td style={{ ...tdStyle, textAlign: "center" }}>{sc.marks}</td>
                <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700 }}>{sc.grade}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: "10px 12px", borderTop: "1px solid #7C93B8", fontSize: 12, color: "#0A1F5C" }}>
          <SummaryChip label="Wastani (GPA)" value={s.gpa} />
          <SummaryChip label="Division" value={s.division} />
          <SummaryChip label="Points" value={s.points} />
          <SummaryChip label="Nafasi (Position)" value={s.position && s.total_students ? `${s.position} / ${s.total_students}` : s.position} />
        </div>
      </div>
    </div>
  );
}
function SummaryChip({ label, value }) {
  if (value === null || value === undefined || value === "") return null;
  return <div><b>{label}:</b> {value}</div>;
}
const thStyle = { padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #7C93B8", fontWeight: 700, color: "#0A1F5C" };
const tdStyle = { padding: "7px 10px", borderBottom: "1px solid #E5D9A0", color: "#0F172A" };

// ══════════════════════ JOINING INSTRUCTIONS (public form) ════════════════
function JoiningInstructionsPanel() {
  const [status, setStatus] = useState(null); // null=loading
  const [step, setStep] = useState("form"); // form | confirm | done
  const [fields, setFields] = useState({ first_name: "", middle_name: "", last_name: "", district: "", ward: "", village: "", exam_number: "", exam_year: new Date().getFullYear() });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { token, message, download_count }

  useEffect(() => {
    apiFetch("/public/joining/status").then(setStatus).catch(() => setStatus({ is_published: false }));
  }, []);

  const set = (k) => (e) => setFields((f) => ({ ...f, [k]: e.target.value }));

  const onSubmitClick = (e) => { e.preventDefault(); setError(""); setStep("confirm"); };

  const confirmYes = async () => {
    setBusy(true); setError("");
    try {
      const r = await apiFetch("/public/joining/submit", { method: "POST", body: JSON.stringify(fields) });
      setResult(r); setStep("done");
    } catch (err) {
      setError((err && err.message) || "Hitilafu imetokea. Tafadhali jaribu tena.");
      setStep("form");
    } finally { setBusy(false); }
  };

  if (status === null) return <Muted><SpinnerIcon size={14} /> Inapakia...</Muted>;

  return (
    <div style={{ maxWidth: 520, margin: "0 auto" }}>
      {!status.is_published ? (
        <Muted>Fomu ya Maelekezo ya kujiunga na kidato cha kwanza bado haijachapishwa mtandaoni. Tafadhali wasiliana na shule kwa maelekezo zaidi.</Muted>
      ) : step === "form" ? (
        <form onSubmit={onSubmitClick} style={{ display: "grid", gap: 12 }}>
          <Field label="Jina la Kwanza" value={fields.first_name} onChange={set("first_name")} required />
          <Field label="Jina la Kati" value={fields.middle_name} onChange={set("middle_name")} />
          <Field label="Jina la Ukoo" value={fields.last_name} onChange={set("last_name")} required />
          <Field label="Wilaya" value={fields.district} onChange={set("district")} required />
          <Field label="Kata" value={fields.ward} onChange={set("ward")} required />
          <Field label="Mtaa/Kijiji" value={fields.village} onChange={set("village")} required />
          <Field label="Namba ya Mtihani wa Darasa la Saba" value={fields.exam_number} onChange={set("exam_number")} placeholder="PS1234567-0001" required />
          <Field label="Mwaka wa Kumaliza Darasa la Saba" value={fields.exam_year} onChange={set("exam_year")} type="number" required />
          {error && <ErrorMsg>{error}</ErrorMsg>}
          <button type="submit" style={primaryBtn}>Wasilisha</button>
        </form>
      ) : step === "confirm" ? (
        <div style={{ textAlign: "center", display: "grid", gap: 16 }}>
          <p style={{ fontSize: 14, color: THEME.text }}>Una uhakika unataka kuwasilisha taarifa hizi?</p>
          <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
            <button onClick={confirmYes} disabled={busy} style={primaryBtn}>{busy ? "Inawasilisha..." : "NDIYO"}</button>
            <button onClick={() => setStep("form")} style={secondaryBtn}>GHAIRI</button>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center", display: "grid", gap: 16 }}>
          <p style={{ fontSize: 14, color: THEME.text }}>{result?.message}</p>
          <a href={`${API_BASE}/public/joining/download-pdf?token=${encodeURIComponent(result.token)}`} target="_blank" rel="noreferrer" style={pdfButton}>
            <PdfIcon /> Pakua Joining Instruction (PDF)
          </a>
          <button onClick={() => { setStep("form"); setResult(null); setFields((f) => ({ ...f, exam_number: "" })); }} style={smallLinkBtn}>Wasilisha taarifa nyingine</button>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = "text", required, placeholder }) {
  return (
    <div>
      <label style={formLabel}>{label}{required ? " *" : ""}</label>
      <input type={type} value={value} onChange={onChange} required={required} placeholder={placeholder} style={formInput} />
    </div>
  );
}

const Muted = ({ children }) => <p style={{ textAlign: "center", color: THEME.muted, fontSize: 13.5, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>{children}</p>;
const ErrorMsg = ({ children }) => <p style={{ color: "#B91C1C", fontSize: 12.5, margin: 0 }}>{children}</p>;

const pdfButton = {
  display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 22px", background: THEME.navy,
  color: "#fff", borderRadius: 8, textDecoration: "none", fontWeight: 600, fontSize: 13.5,
};
const formLabel = { display: "block", fontSize: 12.5, fontWeight: 600, color: THEME.text, marginBottom: 4 };
const formInput = { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${THEME.border}`, fontSize: 13.5, boxSizing: "border-box" };
const primaryBtn = { padding: "11px 20px", borderRadius: 8, border: "none", background: THEME.navy, color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer" };
const secondaryBtn = { padding: "11px 20px", borderRadius: 8, border: `1px solid ${THEME.border}`, background: THEME.surface, color: THEME.text, fontWeight: 700, fontSize: 13.5, cursor: "pointer" };
const smallLinkBtn = { background: "none", border: "none", color: THEME.navy, fontWeight: 600, fontSize: 12, cursor: "pointer", padding: 0, textDecoration: "underline" };
