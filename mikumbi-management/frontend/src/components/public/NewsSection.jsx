import { useState, useEffect, useRef } from "react";
import { apiFetch } from "../../utils/api";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { MegaphoneIcon, CloseIcon, CalendarIcon, ChevronRightIcon } from "../icons";
import { useLang } from "../../i18n/publicLang";

const NAVY = "#0c426f";
const ORANGE = "#F54927";
const TZ = "Africa/Dar_es_Salaam";

const fmtDate = (iso, lang = "en") => new Date(iso).toLocaleDateString(lang === "sw" ? "sw-TZ" : "en-GB", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" });
const isNew = (iso) => Date.now() - new Date(iso).getTime() < 2 * 24 * 60 * 60 * 1000;

// Loads PUBLIC announcements only (audience "public" or "both" - the server
// filters this, staff-only notices are never returned by this endpoint).
// Retries a few times because the free-tier backend can be asleep (cold start).
function usePublicAnnouncements() {
  const [state, setState] = useState({ loading: true, error: false, items: [] });
  useEffect(() => {
    let cancelled = false;
    let timer;
    const load = (attemptsLeft) => {
      apiFetch("/communications/announcements/public")
        .then((d) => { if (!cancelled) setState({ loading: false, error: false, items: Array.isArray(d.announcements) ? d.announcements : [] }); })
        .catch(() => {
          if (cancelled) return;
          if (attemptsLeft > 0) timer = setTimeout(() => load(attemptsLeft - 1), 5000);
          else setState({ loading: false, error: true, items: [] });
        });
    };
    load(8);
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);
  return state;
}

export default function NewsSection() {
  const { isMobile, isTablet } = useBreakpoint();
  const { loading, error, items } = usePublicAnnouncements();
  const [selected, setSelected] = useState(null);
  const { t, lang } = useLang();

  const [featured, ...rest] = items;

  return (
    <section id="news" className="pub-section" style={{ background: "#f4f7fa", padding: isMobile ? "44px 18px" : "64px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <SectionTitle icon={<MegaphoneIcon size={18} />} title={t("news.title")} subtitle={t("news.subtitle")} />

        {loading && <p style={{ textAlign: "center", color: "#64748B", fontSize: 15.5 }}>{t("news.loading")}</p>}
        {!loading && error && (
          <p style={{ textAlign: "center", color: "#64748B", fontSize: 15.5 }}>
            {t("news.error")}
          </p>
        )}
        {!loading && !error && items.length === 0 && (
          <div style={{ textAlign: "center", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 4, padding: "36px 20px", color: "#64748B", fontSize: 16 }}>
            {t("news.empty")}
          </div>
        )}

        {featured && (
          <article className="pub-lift" style={{
            display: "grid", gridTemplateColumns: isMobile || isTablet ? "1fr" : "260px 1fr", background: "#fff",
            borderRadius: 4, overflow: "hidden", border: "1px solid #e2e8f0", marginBottom: rest.length ? 24 : 0,
          }}>
            <div style={{
              background: `linear-gradient(150deg, ${NAVY}, #165D99)`, color: "#fff", padding: isMobile ? "20px" : "28px 24px",
              display: "flex", flexDirection: isMobile || isTablet ? "row" : "column", alignItems: isMobile || isTablet ? "center" : "flex-start",
              justifyContent: "space-between", gap: 12,
            }}>
              <div>
                <div style={{ fontSize: 13, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.8, marginBottom: 6 }}>{t("news.latest")}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 17 }}><CalendarIcon size={16} />{fmtDate(featured.created_at, lang)}</div>
              </div>
              {isNew(featured.created_at) && <NewTag label={t("news.new")} />}
            </div>
            <div style={{ padding: isMobile ? "20px 18px" : "28px 32px" }}>
              <h3 style={{ color: NAVY, fontSize: isMobile ? 20 : 24.5, fontWeight: 800, lineHeight: 1.3, marginBottom: 10, overflowWrap: "anywhere" }}>{featured.title}</h3>
              <p style={{ color: "#334155", fontSize: 16, lineHeight: 1.7, ...clamp(4), overflowWrap: "anywhere" }}>{featured.message}</p>
              <ReadMore label={t("news.readMore")} onClick={() => setSelected(featured)} />
            </div>
          </article>
        )}

        {rest.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "repeat(2, 1fr)" : "repeat(3, 1fr)", gap: 20 }}>
            {rest.slice(0, 6).map((a) => (
              <article key={a.id} className="pub-lift" style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 4, padding: 20, display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 700, color: "#64748B" }}><CalendarIcon size={14} />{fmtDate(a.created_at, lang)}</span>
                  {isNew(a.created_at) && <NewTag label={t("news.new")} />}
                </div>
                <h3 style={{ color: NAVY, fontSize: 18.5, fontWeight: 800, lineHeight: 1.35, marginBottom: 8, overflowWrap: "anywhere" }}>{a.title}</h3>
                <p style={{ color: "#475569", fontSize: 15, lineHeight: 1.65, flex: 1, ...clamp(3), overflowWrap: "anywhere" }}>{a.message}</p>
                <ReadMore label={t("news.readMore")} onClick={() => setSelected(a)} />
              </article>
            ))}
          </div>
        )}
      </div>
      {selected && <AnnouncementModal item={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}

const clamp = (n) => ({ display: "-webkit-box", WebkitLineClamp: n, WebkitBoxOrient: "vertical", overflow: "hidden" });

export function SectionTitle({ icon, title, subtitle, light = false }) {
  const { isMobile } = useBreakpoint();
  return (
    <div style={{ textAlign: "center", marginBottom: isMobile ? 26 : 38 }}>
      <h2 style={{ color: light ? "#fff" : NAVY, fontSize: isMobile ? 23.5 : 29.5, fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
        {icon}{title}
      </h2>
      <div aria-hidden="true" style={{ width: 64, height: 4, background: ORANGE, borderRadius: 4, margin: "10px auto 10px" }} />
      {subtitle && <p style={{ color: light ? "rgba(255,255,255,0.85)" : "#64748B", fontSize: 16 }}>{subtitle}</p>}
    </div>
  );
}

// "JIPYA / NEW" badge: blinks with a bright glow to draw the eye to fresh
// announcements (animation lives in PublicLayout's <style>; it is switched
// off for visitors who ask their device for reduced motion).
function NewTag({ label = "NEW" }) {
  return <span className="pub-new-tag" style={{ background: ORANGE, color: "#fff", fontSize: 12.5, fontWeight: 800, letterSpacing: "0.08em", padding: "3px 9px", borderRadius: 4, display: "inline-block" }}>{label}</span>;
}

function ReadMore({ onClick, label = "Read more" }) {
  return (
    <button type="button" className="pub-btn" onClick={onClick} style={{
      marginTop: 14, alignSelf: "flex-start", background: "none", border: "none", cursor: "pointer", padding: 0,
      color: ORANGE, fontWeight: 800, fontSize: 15, display: "inline-flex", alignItems: "center", gap: 4,
    }}>{label} <ChevronRightIcon size={14} /></button>
  );
}

function AnnouncementModal({ item, onClose }) {
  const closeRef = useRef(null);
  const { t, lang } = useLang();
  useEffect(() => {
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prevOverflow; document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  return (
    <div
      role="dialog" aria-modal="true" aria-label={item.title}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9000, padding: 16 }}
    >
      <div style={{ background: "#fff", borderRadius: 4, width: "100%", maxWidth: 640, maxHeight: "86vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "20px 22px 0" }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 700, color: "#64748B", marginBottom: 6 }}><CalendarIcon size={14} />{fmtDate(item.created_at, lang)}</div>
            <h3 style={{ color: NAVY, fontSize: 22.5, fontWeight: 800, lineHeight: 1.3, overflowWrap: "anywhere" }}>{item.title}</h3>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={t("common.close")} style={{ background: "#f1f5f9", border: "none", borderRadius: 4, width: 34, height: 34, cursor: "pointer", color: "#475569", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><CloseIcon size={18} /></button>
        </div>
        <p style={{ padding: "16px 22px 24px", color: "#334155", fontSize: 17, lineHeight: 1.75, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item.message}</p>
      </div>
    </div>
  );
}
