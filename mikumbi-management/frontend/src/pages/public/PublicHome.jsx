import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import PublicLayout from "../../components/public/PublicLayout";
import NewsSection, { SectionTitle } from "../../components/public/NewsSection";
import SmartImage, { useLoadedImages } from "../../components/public/SmartImage";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { SCHOOL } from "../../styles/theme";
import { siteConfig, toTelHref } from "../../config/siteConfig";
import { API_BASE } from "../../utils/api";
import { useLang } from "../../i18n/publicLang";
import {
  CheckCircleIcon, GraduationCapIcon, MegaphoneIcon, MessageIcon, SchoolIcon, BedIcon, UsersIcon,
  LocationPinIcon, ChevronRightIcon, CloseIcon, ChevronLeftIcon, TrophyIcon,
} from "../../components/icons";

const NAVY = "#0c426f";
const ORANGE = "#F54927";
const GREEN = "#415d43"; // About section colour requested by the school

export default function PublicHome() {
  // Wake the (free-tier) backend while the visitor is reading the page, so
  // News / Results respond quickly when they get to them. Fire-and-forget.
  useEffect(() => { fetch(`${API_BASE}/health`).catch(() => {}); }, []);

  return (
    <PublicLayout>
      <Hero />
      <QuickAccess />
      <NewsSection />
      <About />
      <Boarding />
      <Gallery />
      <Contact />
    </PublicLayout>
  );
}

// ───────────────────────────── Hero ─────────────────────────────
function Hero() {
  const { isMobile, isTablet } = useBreakpoint();
  const { t } = useLang();
  return (
    <section style={{
      position: "relative", color: "#fff", textAlign: "center",
      // Layers (top to bottom): dark-blue overlay, hero photo, the existing
      // banner photo as a fallback, and a plain navy gradient. A missing
      // /assets/hero.jpg simply falls through to the next layer.
      // A light, bottom-weighted shade keeps the school photo clearly
      // visible (it used to sit under a ~90% navy wash) while the text on
      // top stays readable.
      backgroundImage: "linear-gradient(180deg, rgba(7,44,75,0.35) 0%, rgba(7,44,75,0.55) 55%, rgba(7,44,75,0.85) 100%), url(/assets/hero.jpg), url(/assets/picha.png), linear-gradient(160deg, #0c426f 0%, #072C4B 100%)",
      backgroundSize: "cover", backgroundPosition: isMobile ? "center 25%" : "center 30%",
      textShadow: "0 2px 12px rgba(0,0,0,0.45)",
      padding: isMobile ? "70px 20px 96px" : isTablet ? "110px 28px 120px" : "150px 28px 150px",
    }}>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <div style={{ display: "inline-block", fontSize: isMobile ? 13 : 15, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.28)", borderRadius: 4, padding: "6px 16px", marginBottom: 18 }}>
          {t("hero.place")}
        </div>
        <h1 style={{ fontSize: isMobile ? 30.5 : isTablet ? 42.5 : 55, fontWeight: 800, lineHeight: 1.15, marginBottom: 16 }}>
          {t("hero.welcome")}
        </h1>
        <p style={{ fontSize: isMobile ? 17 : 20, lineHeight: 1.65, opacity: 0.94, maxWidth: 640, margin: "0 auto 30px" }}>
          {t("hero.text")}
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          <Link to="/results" className="pub-btn" style={{ ...heroBtn, background: "#C2410C", color: "#fff", boxShadow: "0 2px 6px rgba(0,0,0,0.18)" }}>
            <CheckCircleIcon size={18} />{t("hero.results")}
          </Link>
          <Link to="/joining-instructions" className="pub-btn" style={{ ...heroBtn, background: "#fff", color: NAVY }}>
            <GraduationCapIcon size={18} />{t("hero.joining")}
          </Link>
        </div>
      </div>
    </section>
  );
}

const heroBtn = {
  display: "inline-flex", alignItems: "center", gap: 10, padding: "15px 28px", borderRadius: 4,
  fontWeight: 800, fontSize: 18, textDecoration: "none", minWidth: 210, justifyContent: "center",
};

// ─────────────────────────── Quick access ───────────────────────────
function QuickAccess() {
  const { isMobile, isTablet } = useBreakpoint();
  const { t } = useLang();
  const items = [
    { to: "/results", icon: CheckCircleIcon, title: t("qa.results.title"), text: t("qa.results.text") },
    { to: "/joining-instructions", icon: GraduationCapIcon, title: t("qa.joining.title"), text: t("qa.joining.text") },
    { to: "/#news", icon: MegaphoneIcon, title: t("qa.news.title"), text: t("qa.news.text") },
    { to: "/#contact", icon: MessageIcon, title: t("qa.contact.title"), text: t("qa.contact.text") },
  ];
  return (
    <div style={{ maxWidth: 1100, margin: isMobile ? "-46px auto 0" : "-62px auto 0", padding: "0 18px", position: "relative", zIndex: 2 }}>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : isTablet ? "1fr 1fr" : "repeat(4, 1fr)", gap: isMobile ? 12 : 18 }}>
        {items.map(({ to, icon: Icon, title, text }) => (
          <Link key={title} to={to} className="pub-lift" style={{
            background: "#fff", borderRadius: 4, padding: isMobile ? "16px 14px" : "22px 20px", textDecoration: "none",
            border: "1px solid #e2e8f0", display: "block",
          }}>
            <div style={{ width: 42, height: 42, borderRadius: 4, background: "#eaf2fa", color: NAVY, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}><Icon size={22} /></div>
            <div style={{ color: NAVY, fontWeight: 800, fontSize: isMobile ? 16 : 18, marginBottom: 4 }}>{title}</div>
            <div style={{ color: "#64748B", fontSize: isMobile ? 14 : 15.5, lineHeight: 1.5 }}>{text}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────── About ─────────────────────────────
function About() {
  const { isMobile, isTablet } = useBreakpoint();
  const { t } = useLang();
  const [headPhotoFailed, setHeadPhotoFailed] = useState(false);
  const showHead = !headPhotoFailed;
  return (
    <section id="about" className="pub-section" style={{ background: GREEN, color: "#fff", padding: isMobile ? "48px 18px" : "70px 24px" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: showHead && !isMobile && !isTablet ? "220px 1fr" : "1fr", gap: 32, alignItems: "center", textAlign: showHead && !isMobile && !isTablet ? "left" : "center", marginBottom: 32 }}>
          {showHead && (
            <img
              src="/assets/head-master.jpg" alt={t("about.headAlt")} width="220" height="260" loading="lazy"
              onError={() => setHeadPhotoFailed(true)}
              style={{ width: isMobile ? 160 : 230, height: isMobile ? 190 : 270, objectFit: "cover", objectPosition: "50% 20%", borderRadius: 4, margin: "0 auto", display: "block", boxShadow: "0 10px 26px rgba(0,0,0,0.25)" }}
            />
          )}
          <div>
            <img src="/assets/shule.svg" alt="" width="64" height="64" style={{ height: isMobile ? 48 : 64, width: "auto", marginBottom: 12, display: showHead && !isMobile && !isTablet ? "none" : "inline-block" }} onError={(e) => (e.currentTarget.style.display = "none")} />
            <h2 style={{ fontSize: isMobile ? 25.5 : 32, fontWeight: 800, marginBottom: 12 }}>{t("about.title")}</h2>
            <p style={{ fontSize: isMobile ? 16 : 18, lineHeight: 1.8, color: "rgba(255,255,255,0.93)", maxWidth: 640, margin: showHead && !isMobile && !isTablet ? 0 : "0 auto" }}>
              {t("about.text")}
            </p>
          </div>
        </div>
        <div style={{
          display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: isMobile ? 16 : 20,
          background: "#2f4431", borderRadius: 4, padding: isMobile ? "20px 14px" : "26px 24px",
        }}>
          <Fact label={t("fact.postal")} value={SCHOOL.poBox} />
          <Fact label={t("fact.regNo")} value={SCHOOL.regNo} />
          <Fact label={t("fact.centreNo")} value={SCHOOL.centreNo} />
          <Fact label={t("fact.region")} value={SCHOOL.region} />
        </div>
      </div>
    </section>
  );
}
function Fact({ label, value }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: "rgba(255,255,255,0.75)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 15.5, fontWeight: 700, color: "#fff", overflowWrap: "anywhere" }}>{value}</div>
    </div>
  );
}

// ───────────────────── Academics, Boarding & Hostels ─────────────────────
function Boarding() {
  const { isMobile, isTablet } = useBreakpoint();
  const { t } = useLang();
  const cards = [
    { img: "/assets/classroom.jpg", icon: SchoolIcon, title: t("boarding.academics.title"), text: t("boarding.academics.text") },
    { img: "/assets/girls-hostel.jpg", icon: BedIcon, title: t("boarding.girls.title"), text: t("boarding.girls.text") },
    { img: "/assets/school-ground.jpg", icon: TrophyIcon, title: t("boarding.ground.title"), text: t("boarding.ground.text") },
    { img: "/assets/students.jpg", icon: UsersIcon, title: t("boarding.life.title"), text: t("boarding.life.text") },
  ];
  return (
    <section id="boarding" className="pub-section" style={{ background: "#fff", padding: isMobile ? "48px 18px" : "70px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <SectionTitle title={t("boarding.title")} subtitle={t("boarding.subtitle")} />
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 20 }}>
          {cards.map(({ img, icon: Icon, title, text }) => (
            <article key={title} className="pub-lift" style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 4, overflow: "hidden" }}>
              <SmartImage
                src={img} alt={title} width="400" height="260"
                wrapStyle={{ height: 190, background: `linear-gradient(150deg, ${NAVY}, #165D99)` }}
                fallback={<div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.85)" }}><Icon size={48} /></div>}
              />
              <div style={{ padding: "16px 18px 20px" }}>
                <h3 style={{ color: NAVY, fontSize: 19, fontWeight: 800, marginBottom: 6 }}>{title}</h3>
                <p style={{ color: "#475569", fontSize: 15, lineHeight: 1.65 }}>{text}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────── Gallery ─────────────────────────────
// Photos grouped by category; the buttons above the grid filter them.
const GALLERY_ITEMS = [
  ...[1, 2, 3].map((n) => ({ src: `/assets/gallery-farm-${n}.jpg`, cat: "farm" })),
  ...[1, 2, 3].map((n) => ({ src: `/assets/gallery-hostel-${n}.jpg`, cat: "hostel" })),
  ...[1, 2].map((n) => ({ src: `/assets/gallery-grounds-${n}.jpg`, cat: "grounds" })),
];
const GALLERY = GALLERY_ITEMS.map((g) => g.src);
const GALLERY_CATS = ["all", "farm", "hostel", "grounds"];

function Gallery() {
  const { isMobile, isTablet } = useBreakpoint();
  const { t } = useLang();
  const available = useLoadedImages(GALLERY);
  const [cat, setCat] = useState("all");
  const items = GALLERY_ITEMS.filter((g) => available.includes(g.src) && (cat === "all" || g.cat === cat));
  const loaded = items.map((g) => g.src);
  const [open, setOpen] = useState(null); // index into `loaded`

  useEffect(() => {
    if (open === null) return;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((i) => (i === null ? i : (i + 1) % loaded.length));
      if (e.key === "ArrowLeft") setOpen((i) => (i === null ? i : (i - 1 + loaded.length) % loaded.length));
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); };
  }, [open, loaded.length]);

  if (available.length === 0) return null; // nothing uploaded yet -> hide the whole section

  return (
    <section id="gallery" className="pub-section" style={{ background: "#f4f7fa", padding: isMobile ? "48px 18px" : "70px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <SectionTitle title={t("gallery.title")} subtitle={t("gallery.subtitle")} />
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8, marginBottom: 20 }}>
          {GALLERY_CATS.map((c) => (
            <button key={c} type="button" onClick={() => { setCat(c); setOpen(null); }} aria-pressed={cat === c}
              style={{ padding: "8px 16px", borderRadius: 4, fontSize: 15, fontWeight: 700, cursor: "pointer",
                border: `1px solid ${cat === c ? NAVY : "#cbd5e1"}`, background: cat === c ? NAVY : "#fff", color: cat === c ? "#fff" : NAVY }}>
              {t(`gallery.cat.${c}`)}
            </button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : isTablet ? "repeat(3, 1fr)" : "repeat(3, 1fr)", gap: isMobile ? 10 : 16 }}>
          {items.map(({ src, cat: c }, i) => (
            <button key={src} type="button" className="pub-lift" onClick={() => setOpen(i)} aria-label={t("gallery.open", { n: i + 1 })}
              style={{ position: "relative", padding: 0, border: "none", borderRadius: 4, overflow: "hidden", cursor: "zoom-in", background: "#dbe4ee", aspectRatio: "4 / 3" }}>
              <img src={src} alt={t("gallery.photo", { n: i + 1 })} loading="lazy" decoding="async" width="400" height="300" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 40%", display: "block" }} />
              <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "18px 10px 8px", textAlign: "left",
                background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.65) 100%)", color: "#fff", fontSize: 14, fontWeight: 700 }}>
                {t(`gallery.cat.${c}`)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {open !== null && loaded[open] && (
        <div role="dialog" aria-modal="true" aria-label={t("gallery.viewer")}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(null); }}
          style={{ position: "fixed", inset: 0, background: "rgba(2,12,24,0.92)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <button type="button" onClick={() => setOpen(null)} aria-label={t("common.close")} style={lbBtn({ top: 16, right: 16 })}><CloseIcon size={22} /></button>
          {loaded.length > 1 && (
            <>
              <button type="button" onClick={() => setOpen((open - 1 + loaded.length) % loaded.length)} aria-label={t("gallery.prev")} style={lbBtn({ left: 12, top: "50%" })}><ChevronLeftIcon size={24} /></button>
              <button type="button" onClick={() => setOpen((open + 1) % loaded.length)} aria-label={t("gallery.next")} style={lbBtn({ right: 12, top: "50%" })}><ChevronRightIcon size={24} /></button>
            </>
          )}
          <img src={loaded[open]} alt={t("gallery.photo", { n: open + 1 })} style={{ maxWidth: "100%", maxHeight: "88vh", borderRadius: 4, objectFit: "contain" }} />
        </div>
      )}
    </section>
  );
}
const lbBtn = (pos) => ({
  position: "absolute", ...pos, transform: pos.top === "50%" ? "translateY(-50%)" : "none", width: 44, height: 44, borderRadius: "50%",
  background: "rgba(255,255,255,0.16)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
});

// ───────────────────────────── Contact ─────────────────────────────
function Contact() {
  const { isMobile, isTablet } = useBreakpoint();
  const { t } = useLang();
  const [mapActive, setMapActive] = useState(false);
  const box = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 4, padding: "22px 20px", textAlign: "center" };
  const label = { fontSize: 13, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748B", marginBottom: 8 };
  const val = { color: NAVY, fontWeight: 700, fontSize: 17, lineHeight: 1.6, overflowWrap: "anywhere" };
  return (
    <section id="contact" className="pub-section" style={{ background: "#fff", padding: isMobile ? "48px 18px" : "70px 24px" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <SectionTitle title={t("contact.title")} subtitle={t("contact.subtitle")} />
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 18 }}>
          <div style={box}>
            <div style={{ color: ORANGE, display: "flex", justifyContent: "center", marginBottom: 8 }}><LocationPinIcon size={24} /></div>
            <div style={label}>{t("contact.location")}</div>
            <div style={val}>{SCHOOL.district}<br />{SCHOOL.region}</div>
          </div>
          <div style={box}>
            <div style={label}>{t("contact.postal")}</div>
            <div style={val}>{SCHOOL.poBox}</div>
          </div>
          <div style={box}>
            <div style={label}>{t("contact.phone")}</div>
            <div style={val}>
              {siteConfig.phones.map((p) => (
                <div key={p}><a href={toTelHref(p)} style={{ color: NAVY, textDecoration: "none" }}>{p}</a></div>
              ))}
            </div>
          </div>
          <div style={box}>
            <div style={label}>{t("contact.email")}</div>
            <div style={val}><a href={`mailto:${siteConfig.email}`} style={{ color: NAVY, textDecoration: "none" }}>{siteConfig.email}</a></div>
          </div>
        </div>

        {/* School location - Google Maps embed (no API key needed) plus a
            directions button that opens the Maps app on the parent's phone. */}
        <div style={{ marginTop: 28, border: "1px solid #e2e8f0", borderRadius: 4, overflow: "hidden", background: "#fff" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, padding: isMobile ? "14px 16px" : "16px 20px" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: NAVY, fontWeight: 800, fontSize: 18 }}>
                <span style={{ color: ORANGE, display: "flex" }}><LocationPinIcon size={18} /></span>{t("map.title")}
              </div>
              <div style={{ color: "#64748B", fontSize: 15.5, marginTop: 4 }}>{t("map.text")}</div>
            </div>
            <a href={siteConfig.location.directionsUrl} target="_blank" rel="noopener noreferrer" className="pub-btn"
              style={{ display: "inline-flex", alignItems: "center", gap: 8, background: ORANGE, color: "#fff", textDecoration: "none", fontWeight: 800, fontSize: 15.5, padding: "11px 18px", borderRadius: 4, ...(isMobile ? { width: "100%", justifyContent: "center" } : {}) }}>
              <LocationPinIcon size={16} />{t("map.directions")}
            </a>
          </div>
          {/* The map stays "locked" until tapped, so scrolling the page with
              a finger or mouse wheel never gets trapped inside the map. */}
          <div style={{ position: "relative" }} onMouseLeave={() => setMapActive(false)}>
            <iframe
              title={t("map.frame")}
              src={siteConfig.location.embedUrl}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
              style={{ display: "block", width: "100%", height: isMobile ? 320 : 420, border: 0, pointerEvents: mapActive ? "auto" : "none" }}
            />
            {!mapActive && (
              <button type="button" onClick={() => setMapActive(true)} aria-label={t("map.activate")}
                style={{ position: "absolute", inset: 0, width: "100%", border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 14 }}>
                <span style={{ background: "rgba(12,66,111,0.88)", color: "#fff", fontWeight: 700, fontSize: 15.5, padding: "8px 14px", borderRadius: 4 }}>{t("map.activate")}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
