import InstallAppButton from "../components/InstallAppButton";
import { useLang } from "../i18n";
import { StaffLangToggle } from "../i18n/StaffLang";
import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { THEME, SCHOOL } from "../styles/theme";
import { IconStudent3D as IconStudents, IconContribution3D as IconContributions, IconTimetable3D as IconTimetable, IconHostel3D as IconHostel, IconResults3D as IconResults, IconTams3D as IconTams, IconCommunication3D as IconCommunications, IconChatbot3D as IconChatbot, IconFood3D as IconFood, IconAnalytics3D as IconAnalytics } from "../components/FeatureIcons";
import HoverMenu from "../components/HoverMenu";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { ChevronDownIcon, MenuIcon, CloseIcon, CheckCircleIcon, TableIcon, LoginIcon, HomeIcon, StarIcon, InfoIcon, BookIcon, GraduationCapIcon, BarChartIcon, ClockIcon, TrendingUpIcon, MessageIcon, CoinsIcon, UtensilsIcon } from "../components/icons";

const FEATURES = [
  { Icon: IconStudents, id: "students" },
  { Icon: IconResults, id: "results" },
  { Icon: IconAnalytics, id: "analytics" },
  { Icon: IconTams, id: "tams" },
  { Icon: IconTimetable, id: "timetable" },
  { Icon: IconHostel, id: "hostel" },
  { Icon: IconContributions, id: "contributions" },
  { Icon: IconFood, id: "food" },
  { Icon: IconCommunications, id: "communications" },
  { Icon: IconChatbot, id: "chatbot" },
];

// Five modules shown as icon "badges" across the hero, mirroring the
// reference design's row of circular icon badges (globe / search / gear) -
// same flat-line-icon-in-a-circle treatment, just five of our own modules
// instead of three generic ones.
const HERO_MODULES = [
  { Icon: GraduationCapIcon, label: "menu.students" },
  { Icon: BarChartIcon,      label: "menu.results" },
  { Icon: ClockIcon,         label: "menu.tams" },
  { Icon: TrendingUpIcon,    label: "menu.analytics" },
  { Icon: MessageIcon,       label: "menu.communications" },
  { Icon: TableIcon,         label: "menu.timetable" },
  { Icon: UtensilsIcon,      label: "menu.food" },
  { Icon: CoinsIcon,         label: "menu.contributions" },
];

// Tileable "S4005" pattern used as the hero's tech-background texture -
// the same idea as the reference design's scattered binary digits, just
// with "S4005" repeating in its place. Built once as a small SVG tile and
// repeated via CSS background-repeat, so it costs nothing to render at any
// hero size and never needs hundreds of individual DOM nodes.
const HERO_CODE_TILE = encodeURIComponent(`
<svg xmlns='http://www.w3.org/2000/svg' width='220' height='150'>
  <text x='2' y='18' font-family='Consolas, Menlo, monospace' font-size='13' fill='rgba(96,165,250,0.30)'>S4005</text>
  <text x='118' y='18' font-family='Consolas, Menlo, monospace' font-size='13' fill='rgba(96,165,250,0.16)'>S4005</text>
  <text x='30' y='50' font-family='Consolas, Menlo, monospace' font-size='13' fill='rgba(96,165,250,0.22)'>S4005</text>
  <text x='150' y='50' font-family='Consolas, Menlo, monospace' font-size='13' fill='rgba(96,165,250,0.32)'>S4005</text>
  <text x='-2' y='82' font-family='Consolas, Menlo, monospace' font-size='13' fill='rgba(96,165,250,0.16)'>S4005</text>
  <text x='100' y='82' font-family='Consolas, Menlo, monospace' font-size='13' fill='rgba(96,165,250,0.26)'>S4005</text>
  <text x='40' y='114' font-family='Consolas, Menlo, monospace' font-size='13' fill='rgba(96,165,250,0.20)'>S4005</text>
  <text x='160' y='114' font-family='Consolas, Menlo, monospace' font-size='13' fill='rgba(96,165,250,0.30)'>S4005</text>
  <text x='8' y='146' font-family='Consolas, Menlo, monospace' font-size='13' fill='rgba(96,165,250,0.14)'>S4005</text>
  <text x='130' y='146' font-family='Consolas, Menlo, monospace' font-size='13' fill='rgba(96,165,250,0.24)'>S4005</text>
</svg>
`.replace(/\s+/g, " ").trim());

export default function Landing() {
  const { isMobile, isTablet, isDesktop } = useBreakpoint();
  const { t } = useLang();
  const isCompact = !isDesktop; // mobile + tablet share the hamburger nav
  const [pubOpen, setPubOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pubRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!pubOpen) return;
    const onOutside = (e) => { if (pubRef.current && !pubRef.current.contains(e.target)) setPubOpen(false); };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [pubOpen]);

  // Close the mobile/tablet menu automatically if the viewport grows to desktop size.
  useEffect(() => { if (isDesktop) setMenuOpen(false); }, [isDesktop]);

  return (
    <div style={{ minHeight: "100vh", background: THEME.bg }}>
      {/* Identity banner - Government + School branding. Scrolls away with the
          page (not sticky), mirrors the official UDOM OAS header layout:
          government emblem on the left, centered title block, school badge
          on the right, faint photo watermark behind everything. */}
      <div style={{ position: "relative", overflow: "hidden", background: "#eef1f6", borderBottom: `3px solid #F54927` }}>
        <div aria-hidden="true" style={{
          position: "absolute", inset: 0,
          backgroundImage: "url(/assets/picha.png)", backgroundSize: "cover",
          backgroundPosition: isMobile ? "center 18%" : isTablet ? "center 15%" : "center 12%",
          opacity: 0.5,
        }} />
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(255,255,255,0.2), rgba(255,255,255,0.45))" }} />
        <div style={{
          position: "relative", maxWidth: 1200, margin: "0 auto",
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: isMobile ? 12 : isTablet ? 26 : 46,
          padding: isMobile ? "16px 12px" : isTablet ? "24px 22px" : "32px 24px",
          textAlign: "center",
        }}>
          <img src="/assets/govt-logo.svg" alt={t("layout.coatAlt")} style={{ height: isMobile ? 42 : isTablet ? 64 : 92, flexShrink: 0 }} onError={(e) => (e.currentTarget.style.display = "none")} />
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: isMobile ? 8.5 : isTablet ? 10.5 : 13, fontWeight: 700,
              letterSpacing: isMobile ? "0.06em" : "0.18em", color: THEME.text,
              textTransform: "uppercase", marginBottom: isMobile ? 3 : 8,
            }}>{t("banner.country")}</div>
            <div style={{
              fontSize: isMobile ? 15 : isTablet ? 22 : 32, fontWeight: 800, color: THEME.link,
              letterSpacing: "0.01em", lineHeight: 1.18, textTransform: "uppercase",
            }}>{SCHOOL.name}</div>
            <div style={{ fontSize: isMobile ? 10.5 : isTablet ? 12.5 : 15, fontStyle: "italic", color: "#F54927", fontWeight: 600, marginTop: isMobile ? 3 : 6 }}>
              {t("school.motto")}
            </div>
          </div>
          <img src="/assets/shule.svg" alt={t("layout.badgeAlt")} style={{ height: isMobile ? 42 : isTablet ? 64 : 92, flexShrink: 0 }} onError={(e) => (e.currentTarget.style.display = "none")} />
        </div>
      </div>

      {/* Nav (+ mobile/tablet dropdown menu, kept in one sticky wrapper so both move together) */}
      <div style={{ position: "sticky", top: 0, zIndex: 50 }}>
        <nav style={{
          background: "#1a50c7", color: "#fff", padding: isMobile ? "10px 14px" : isTablet ? "11px 18px" : "13px 28px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, opacity: 0.92 }}>
            <LocationPinIcon />
            <span style={{
              fontSize: isMobile ? 10.5 : isTablet ? 11.5 : 12.5,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              maxWidth: isMobile ? "32vw" : isTablet ? "40vw" : "none",
            }}>{SCHOOL.district.replace(" District Council", "")}, {SCHOOL.region}</span>
          </div>

          {isDesktop ? (
            <div style={{ display: "flex", gap: 22, fontSize: 13.5, alignItems: "center" }}>
              <a href="#home" style={{ ...navLink, display: "inline-flex", alignItems: "center", gap: 6 }}><HomeIcon size={14} />{t("land.home")}</a>
              <a href="#features" style={{ ...navLink, display: "inline-flex", alignItems: "center", gap: 6 }}><StarIcon size={14} />{t("land.features")}</a>
              <a href="#about" style={{ ...navLink, display: "inline-flex", alignItems: "center", gap: 6 }}><InfoIcon size={14} />{t("land.about")}</a>
              <Link to="/login" style={{ ...navLink, background: "#fff", color: THEME.navy, padding: "7px 18px", borderRadius: 4, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}><LoginIcon size={13} />{t("login.signIn")}</Link>
              <StaffLangToggle />
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 12, flexShrink: 0 }}>
              <Link to="/login" style={{ ...navLink, background: "#fff", color: THEME.navy, padding: isMobile ? "6px 14px" : "7px 16px", borderRadius: 4, fontWeight: 700, fontSize: isMobile ? 12.5 : 13.5, display: "inline-flex", alignItems: "center", gap: 5 }}><LoginIcon size={12} />{t("login.signIn")}</Link>
              <StaffLangToggle />
              <button
                onClick={() => setMenuOpen((o) => { const next = !o; if (!next) setPubOpen(false); return next; })}
                aria-label={menuOpen ? t("menu.close") : t("menu.open")}
                style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: "4px 2px", display: "flex", alignItems: "center" }}
              >{menuOpen ? <CloseIcon size={20} /> : <MenuIcon size={22} />}</button>
            </div>
          )}
        </nav>

        {/* Mobile / tablet dropdown menu */}
        {isCompact && menuOpen && (
          <div style={{ background: "#1a50c7", borderTop: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 12px 24px rgba(0,0,0,0.2)" }}>
            <a href="#home" onClick={() => setMenuOpen(false)} style={{ ...mobileMenuLink, display: "flex", alignItems: "center", gap: 10 }}><HomeIcon size={15} />{t("land.home")}</a>
            <a href="#features" onClick={() => setMenuOpen(false)} style={{ ...mobileMenuLink, display: "flex", alignItems: "center", gap: 10 }}><StarIcon size={15} />{t("land.features")}</a>
            <a href="#about" onClick={() => setMenuOpen(false)} style={{ ...mobileMenuLink, display: "flex", alignItems: "center", gap: 10 }}><InfoIcon size={15} />{t("land.about")}</a>

          </div>
        )}
      </div>

      {/* Hero - dark tech backdrop with a tiled "S4005" pattern (matches the
          reference design's binary-digit texture, using S4005 in place of
          0/1) and a glowing blue neon title, mirroring the reference layout
          exactly instead of just borrowing its color/text. */}
      <header id="home" style={{
        position: "relative", overflow: "hidden",
        padding: isMobile ? "48px 20px 40px" : isTablet ? "70px 24px 52px" : "92px 24px 64px",
        minHeight: isMobile ? 300 : isTablet ? 330 : 360,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        textAlign: "center",
        background: "#050d20",
        borderBottom: `${isMobile ? 4 : 5}px solid #1E5FBF`,
      }}>
        <div
          className="mk-hero-techbg"
          aria-hidden="true"
          style={{ backgroundImage: `repeating-linear-gradient(90deg, rgba(255,255,255,0.035) 0px, rgba(255,255,255,0.035) 1px, transparent 1px, transparent 7px), url("data:image/svg+xml,${HERO_CODE_TILE}"), linear-gradient(160deg, #0a2a57 0%, #071b3e 55%, #050d20 100%)` }}
        />
        <div className="mk-hero-overlay" aria-hidden="true" />
        <div className="mk-hero-vignette" aria-hidden="true" />

        <h1 className="mk-hero-title" style={{
          fontSize: isMobile ? 26 : isTablet ? 34 : 42,
          marginBottom: isMobile ? 26 : 34, lineHeight: 1.25,
          maxWidth: isMobile ? 320 : 720,
        }}>{t("land.heroTitle")}</h1>

        {/* Eight module icon badges - flat line icon inside a cream circle
            with a navy ring, same treatment as the reference's globe/
            search/gear row, chained with a slight overlap on tablet/desktop
            and wrapping to multiple rows on narrow screens. */}
        <div className="mk-hero-icons" style={{
          gap: isMobile ? 12 : 0,
          rowGap: isMobile ? 20 : isTablet ? 10 : 12,
          marginBottom: isMobile ? 24 : 32,
          maxWidth: isMobile ? 320 : isTablet ? 560 : 780,
        }}>
          {HERO_MODULES.map(({ Icon, label }, i) => (
            <div
              key={label}
              className="mk-hero-icon-circle"
              title={t(label)}
              aria-label={t(label)}
              style={{
                width: isMobile ? 54 : isTablet ? 68 : 82,
                height: isMobile ? 54 : isTablet ? 68 : 82,
                marginLeft: isMobile ? 0 : i === 0 ? 0 : isTablet ? -12 : -18,
              }}
            >
              <Icon size={isMobile ? 21 : isTablet ? 26 : 31} />
            </div>
          ))}
        </div>

        <div className="mk-hero-live" style={{
          fontSize: isMobile ? 26 : isTablet ? 32 : 38,
          marginBottom: 30, flexWrap: "wrap", justifyContent: "center", rowGap: 10,
          maxWidth: isMobile ? 320 : 680,
        }}>
          {t("land.nowIs")} <span className="mk-live-badge"><LiveIcon /> {t("land.live")}</span>
        </div>
        <a href="#features" className="mk-hero-cta" style={{ fontSize: isMobile ? 13 : 14 }}>{t("land.explore")}</a>
      </header>

      {/* Features */}
      <section id="features" style={{ padding: isMobile ? "44px 18px" : isTablet ? "50px 22px" : "60px 24px", background: "#e0e1dd" }}>
       <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h2 style={{ textAlign: "center", color: THEME.link, fontSize: isMobile ? 20 : 24, fontWeight: 800, marginBottom: isMobile ? 26 : 40 }}>{t("land.features")}</h2>
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(230px, 1fr))",
          gap: isMobile ? 16 : 30,
        }}>
          {FEATURES.map(({ Icon, id }) => (
            <div key={id} className="mk-feature-card" style={{
              textAlign: "center", padding: isMobile ? "18px 16px" : "24px 18px",
            }}>
              <Icon size={isMobile ? 72 : 90} />
              <h3 style={{ fontSize: isMobile ? 14.5 : 15.5, color: THEME.text, fontWeight: 700, margin: "14px 0 6px" }}>{t(`feat.${id}.title`)}</h3>
              <p style={{ fontSize: isMobile ? 12 : 12.5, color: THEME.muted, lineHeight: 1.55 }}>{t(`feat.${id}.desc`)}</p>
            </div>
          ))}
        </div>
       </div>
      </section>

      {/* About */}
      <section id="about" style={{ background: "#415d43", padding: isMobile ? "44px 18px" : isTablet ? "50px 22px" : "60px 24px" }}>
        <div style={{ maxWidth: 820, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: isMobile ? 22 : 30 }}>
            <img src="/assets/shule.svg" alt={t("login.logoAlt")} style={{ height: isMobile ? 48 : 64, marginBottom: 14 }} onError={(e) => (e.currentTarget.style.display = "none")} />
            <h2 style={{ color: "#fff", fontSize: isMobile ? 20 : 24, fontWeight: 800, marginBottom: 8 }}>{t("about.title")}</h2>
            <p style={{ color: "rgba(255,255,255,0.92)", fontSize: isMobile ? 13 : 14.5, maxWidth: 560, margin: "0 auto", lineHeight: 1.7 }}>
              {t("about.text")}
            </p>
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(auto-fit, minmax(160px, 1fr))",
            gap: isMobile ? 16 : 16,
            background: "#2f4431", border: "1px solid #243826", borderRadius: 4,
            padding: isMobile ? "20px 14px" : 24,
          }}>
            <AboutFact label={t("fact.postal")} value={SCHOOL.poBox} />
            <AboutFact label={t("fact.regNo")} value={SCHOOL.regNo} />
            <AboutFact label={t("fact.centreNo")} value={SCHOOL.centreNo} />
            <AboutFact label={t("fact.region")} value={SCHOOL.region} />
          </div>
          <InstallAppButton style={{ marginTop: isMobile ? 22 : 28 }} />
        </div>
      </section>

      {/* Footer */}
      <footer style={{ background: "#1a50c7", color: "#f0f7fc", padding: isMobile ? "22px 20px" : "28px 24px", textAlign: "center", fontSize: isMobile ? 11.5 : 12.5 }}>
        <div>© {new Date().getFullYear()} {SCHOOL.name}. {t("footer.rights")}</div>
        <div style={{ marginTop: 8, display: "flex", justifyContent: "center", gap: isMobile ? 12 : 18, flexWrap: "wrap" }}>
          <Link to="/privacy" style={{ color: "#cbd5e1" }}>{t("footer.privacy")}</Link>
          <Link to="/terms" style={{ color: "#cbd5e1" }}>{t("footer.terms")}</Link>
          <Link to="/support" style={{ color: "#cbd5e1" }}>{t("footer.support")}</Link>
        </div>
      </footer>
    </div>
  );
}

const navLink = { color: "#fff", textDecoration: "none" };

function LiveIcon() {
  return (
    <svg className="mk-live-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="2" fill="#fff" stroke="none" />
      <path d="M8.5 8.5a5 5 0 0 0 0 7" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M5.3 5.3a9 9 0 0 0 0 13.4" />
      <path d="M18.7 5.3a9 9 0 0 1 0 13.4" />
    </svg>
  );
}

function LocationPinIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M12 22s7-7.58 7-12.5A7 7 0 0 0 5 9.5C5 14.42 12 22 12 22Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}

const mobileMenuLink = {
  display: "block", padding: "13px 20px", color: "#fff", textDecoration: "none",
  fontSize: 14, fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.08)",
};

function AboutFact({ label, value }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: "rgba(255,255,255,0.75)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: "#fff" }}>{value}</div>
    </div>
  );
}
