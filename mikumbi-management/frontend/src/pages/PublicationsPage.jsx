import { Link } from "react-router-dom";
import { THEME, SCHOOL } from "../styles/theme";
import Publications from "../components/Publications";

export default function PublicationsPage() {
  return (
    <div style={{ minHeight: "100vh", background: THEME.bg }}>
      <nav style={{
        background: THEME.navy, color: "#fff", padding: "12px 28px",
        display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12,
        position: "sticky", top: 0, zIndex: 50,
      }}>
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: "#fff" }}>
          <img src="/assets/shule.svg" alt="School logo" style={{ height: 38 }} onError={(e) => (e.currentTarget.style.display = "none")} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.2 }}>{SCHOOL.name}</div>
            <div style={{ fontSize: 10.5, opacity: 0.8 }}>{SCHOOL.centreNo} · {SCHOOL.regNo}</div>
          </div>
        </Link>
        <Link to="/" style={{ color: "#fff", fontSize: 13.5, textDecoration: "none", opacity: 0.9 }}>← Back to Home</Link>
      </nav>
      <Publications />
    </div>
  );
}
