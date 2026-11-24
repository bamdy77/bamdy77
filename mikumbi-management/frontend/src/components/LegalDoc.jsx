import { Link, useLocation } from "react-router-dom";
import { useBreakpoint } from "../hooks/useBreakpoint";

// Shared layout for the Privacy / Terms / Support pages on BOTH sites.
//  - tabs to switch between the three pages,
//  - "last updated" date and a short summary,
//  - a table of contents (side column on desktop, list on phones),
//  - numbered sections, or an accordion of questions for the Support page,
//  - a contact box at the end.
// Content is passed in as data, so the parents' site (Kiswahili/English)
// and the staff site (English) share one look.
const NAVY = "#16356f";

export default function LegalDoc({ tabs, title, updated, summary, sections = [], faqs, contact, labels }) {
  const { isMobile } = useBreakpoint();
  const { pathname } = useLocation();
  const toc = faqs ? faqs.map((g) => ({ id: g.id, title: g.title })) : sections.map((s) => ({ id: s.id, title: s.title }));

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: isMobile ? "22px 16px 50px" : "36px 24px 70px", color: "#0F172A" }}>
      <nav aria-label={labels.tabsLabel} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 22 }}>
        {tabs.map((t) => {
          const active = pathname === t.to;
          return (
            <Link key={t.to} to={t.to} aria-current={active ? "page" : undefined} style={{
              padding: "8px 16px", borderRadius: 4, fontSize: 15, fontWeight: 700, textDecoration: "none",
              border: `1px solid ${active ? NAVY : "#cbd5e1"}`, background: active ? NAVY : "#fff", color: active ? "#fff" : NAVY,
            }}>{t.label}</Link>
          );
        })}
      </nav>

      <header style={{ background: "#eef4fa", border: "1px solid #d6e3ef", borderRadius: 4, padding: isMobile ? "18px 16px" : "24px 26px", marginBottom: 26 }}>
        <h1 style={{ color: NAVY, fontSize: isMobile ? 24 : 30, fontWeight: 800, margin: "0 0 6px" }}>{title}</h1>
        <div style={{ fontSize: 14, color: "#64748B", marginBottom: summary ? 12 : 0 }}>{labels.updated}: {updated}</div>
        {summary && <p style={{ fontSize: 16, lineHeight: 1.7, margin: 0 }}>{summary}</p>}
      </header>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "240px 1fr", gap: isMobile ? 18 : 32, alignItems: "start" }}>
        <aside style={{ position: isMobile ? "static" : "sticky", top: 16, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 4, padding: "14px 16px" }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#64748B", marginBottom: 8 }}>{labels.contents}</div>
          <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
            {toc.map((s) => (
              <li key={s.id} style={{ fontSize: 14.5 }}>
                <a href={`#${s.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                  style={{ color: NAVY, textDecoration: "none" }}>{s.title}</a>
              </li>
            ))}
          </ol>
        </aside>

        <div style={{ minWidth: 0 }}>
          {!faqs && sections.map((s, i) => (
            <section key={s.id} id={s.id} style={{ scrollMarginTop: 16, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 4, padding: isMobile ? "16px 16px" : "20px 24px", marginBottom: 14 }}>
              <h2 style={{ display: "flex", gap: 10, alignItems: "baseline", color: NAVY, fontSize: isMobile ? 18 : 20, fontWeight: 800, margin: "0 0 10px" }}>
                <span style={{ color: "#C2410C", fontSize: "0.9em" }}>{i + 1}.</span>{s.title}
              </h2>
              <div style={{ fontSize: 16, lineHeight: 1.75 }}>{s.body}</div>
            </section>
          ))}

          {faqs && faqs.map((g) => (
            <section key={g.id} id={g.id} style={{ scrollMarginTop: 16, marginBottom: 20 }}>
              <h2 style={{ color: NAVY, fontSize: isMobile ? 18 : 20, fontWeight: 800, margin: "0 0 10px" }}>{g.title}</h2>
              {g.items.map((q) => (
                <details key={q.q} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 4, marginBottom: 8 }}>
                  <summary style={{ cursor: "pointer", padding: "13px 16px", fontWeight: 700, fontSize: 16, color: "#0F172A" }}>{q.q}</summary>
                  <div style={{ padding: "0 16px 14px", fontSize: 15.5, lineHeight: 1.7 }}>{q.a}</div>
                </details>
              ))}
            </section>
          ))}

          {contact && (
            <div style={{ background: NAVY, color: "#fff", borderRadius: 4, padding: isMobile ? "16px" : "20px 24px", marginTop: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 6 }}>{contact.title}</div>
              <div style={{ fontSize: 15.5, lineHeight: 1.7, color: "#dbe8f3" }}>{contact.body}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const ul = { paddingLeft: 20, margin: "6px 0 0" };
export const li = { marginBottom: 6 };
