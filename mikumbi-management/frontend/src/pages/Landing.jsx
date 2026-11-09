import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { THEME, SCHOOL } from "../styles/theme";
import { IconStudent3D as IconStudents, IconContribution3D as IconContributions, IconTimetable3D as IconTimetable, IconHostel3D as IconHostel, IconResults3D as IconResults, IconTams3D as IconTams, IconCommunication3D as IconCommunications, IconChatbot3D as IconChatbot, IconFood3D as IconFood, IconAnalytics3D as IconAnalytics } from "../components/FeatureIcons";
import HoverMenu from "../components/HoverMenu";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { ChevronDownIcon, MenuIcon, CloseIcon, CheckCircleIcon, TableIcon, LoginIcon, HomeIcon, StarIcon, InfoIcon, BookIcon, GraduationCapIcon, BarChartIcon, ClockIcon, TrendingUpIcon, MessageIcon, CoinsIcon, UtensilsIcon } from "../components/icons";

const FEATURES = [
  { Icon: IconStudents,       title: "Student Management",  desc: "Enroll and manage every student's record - personal details, class, stream and status - plus per-student charges, promotion between forms, and photo, PDF report and full history for every student, always in sync with Results, Hostel and Contributions." },
  { Icon: IconResults,        title: "Results Management",  desc: "Teachers enter subject marks online; the system computes grades and Division automatically. The Academic Master reviews, unlocks or excludes a teacher's submission where needed, then compiles and publishes results as PDF or Excel. A dedicated Parents Reports section generates a Kiswahili Parent Report for every student with the Head Master's signature and school stamp applied automatically, and sends results to each parent by SMS." },
  { Icon: IconAnalytics,      title: "Analytics Dashboard", desc: "Turns years of results and attendance data into clear trend charts: school and per-subject pass-rate and GPA trends across exam periods, a school-wide teacher attendance trend over time, and an individual student's Division and GPA progress - each with an at-a-glance improving/declining/stable indicator." },
  { Icon: IconTams,           title: "TAMS (Teacher Attendance)", desc: "Teachers check in each morning with GPS - the system verifies they're on the school compound and on time, flags late arrivals with a reason, and gives management a live daily and monthly attendance dashboard." },
  { Icon: IconTimetable,      title: "Timetable Generator", desc: "Assign teachers to subjects and classes, then auto-generate a clash-free timetable. View it per class, per teacher, or as one general school timetable, publish it to the public Publications page, and export any view as PDF." },
  { Icon: IconHostel,         title: "Hostel Management",   desc: "Admit boarding students into Boys or Girls hostel, manage rooms, record hostel contributions and discipline cases, and view each occupant's full history - with PDF exports throughout." },
  { Icon: IconContributions,  title: "Contributions Management", desc: "Track part-time student fees, Ream contributions and other school charges per term, with clear paid/outstanding status, printable receipts, and a history that both the office and each class teacher can review." },
  { Icon: IconFood,           title: "Manage Foods",        desc: "The food teacher records each student's food contribution by type, with a running history and summary so the office can see who has contributed and who is still outstanding." },
  { Icon: IconCommunications, title: "Communications",      desc: "Post school-wide announcements and send SMS updates to parents, staff, or any saved contact group via NextSMS - with delivery history kept for every message sent." },
  { Icon: IconChatbot,        title: "Help Chatbot",        desc: "Stuck on a page or not sure how something works? Open the chat assistant in the corner of any screen and ask - it explains features and walks you through common tasks." },
];

// Five modules shown as icon "badges" across the hero, mirroring the
// reference design's row of circular icon badges (globe / search / gear) -
// same flat-line-icon-in-a-circle treatment, just five of our own modules
// instead of three generic ones.
const HERO_MODULES = [
  { Icon: GraduationCapIcon, label: "Student Management" },
  { Icon: BarChartIcon,      label: "Results Management" },
  { Icon: ClockIcon,         label: "TAMS" },
  { Icon: TrendingUpIcon,    label: "Analytics" },
  { Icon: MessageIcon,       label: "Communications" },
  { Icon: TableIcon,         label: "Timetable Generator" },
  { Icon: UtensilsIcon,      label: "Manage Foods" },
  { Icon: CoinsIcon,         label: "Contributions Management" },
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

  const goToPublications = (view) => {
    setMenuOpen(false);
    setPubOpen(false);
    navigate(`/publications?view=${view}`);
  };

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
          <img src="/assets/govt-logo.svg" alt="Government of Tanzania emblem" style={{ height: isMobile ? 42 : isTablet ? 64 : 92, flexShrink: 0 }} onError={(e) => (e.currentTarget.style.display = "none")} />
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: isMobile ? 8.5 : isTablet ? 10.5 : 13, fontWeight: 700,
              letterSpacing: isMobile ? "0.06em" : "0.18em", color: THEME.text,
              textTransform: "uppercase", marginBottom: isMobile ? 3 : 8,
            }}>The United Republic of Tanzania</div>
            <div style={{
              fontSize: isMobile ? 15 : isTablet ? 22 : 32, fontWeight: 800, color: THEME.navy,
              letterSpacing: "0.01em", lineHeight: 1.18, textTransform: "uppercase",
            }}>{SCHOOL.name}</div>
            <div style={{ fontSize: isMobile ? 10.5 : isTablet ? 12.5 : 15, fontStyle: "italic", color: "#F54927", fontWeight: 600, marginTop: isMobile ? 3 : 6 }}>
              {SCHOOL.motto}
            </div>
          </div>
          <img src="/assets/shule.svg" alt="School badge" style={{ height: isMobile ? 42 : isTablet ? 64 : 92, flexShrink: 0 }} onError={(e) => (e.currentTarget.style.display = "none")} />
        </div>
      </div>

      {/* Nav (+ mobile/tablet dropdown menu, kept in one sticky wrapper so both move together) */}
      <div style={{ position: "sticky", top: 0, zIndex: 50 }}>
        <nav style={{
          background: "#0c426f", color: "#fff", padding: isMobile ? "10px 14px" : isTablet ? "11px 18px" : "13px 28px",
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
              <a href="#home" style={{ ...navLink, display: "inline-flex", alignItems: "center", gap: 6 }}><HomeIcon size={14} />Home</a>
              <a href="#features" style={{ ...navLink, display: "inline-flex", alignItems: "center", gap: 6 }}><StarIcon size={14} />Features</a>
              <a href="#about" style={{ ...navLink, display: "inline-flex", alignItems: "center", gap: 6 }}><InfoIcon size={14} />About</a>
              <HoverMenu
                variant="navy"
                label="Publications"
                icon={BookIcon}
                buttonStyle={{ fontSize: 13.5 }}
                items={[
                  { label: "Results", icon: CheckCircleIcon, onClick: () => goToPublications("results") },
                  { label: "Joining Instructions", icon: GraduationCapIcon, onClick: () => goToPublications("joining") },
                ]}
              />
              <Link to="/login" style={{ ...navLink, background: "#fff", color: THEME.navy, padding: "7px 18px", borderRadius: 4, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}><LoginIcon size={13} />Login</Link>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 12, flexShrink: 0 }}>
              <Link to="/login" style={{ ...navLink, background: "#fff", color: THEME.navy, padding: isMobile ? "6px 14px" : "7px 16px", borderRadius: 4, fontWeight: 700, fontSize: isMobile ? 12.5 : 13.5, display: "inline-flex", alignItems: "center", gap: 5 }}><LoginIcon size={12} />Login</Link>
              <button
                onClick={() => setMenuOpen((o) => { const next = !o; if (!next) setPubOpen(false); return next; })}
                aria-label={menuOpen ? "Close menu" : "Open menu"}
                style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: "4px 2px", display: "flex", alignItems: "center" }}
              >{menuOpen ? <CloseIcon size={20} /> : <MenuIcon size={22} />}</button>
            </div>
          )}
        </nav>

        {/* Mobile / tablet dropdown menu */}
        {isCompact && menuOpen && (
          <div style={{ background: "#0c426f", borderTop: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 12px 24px rgba(0,0,0,0.2)" }}>
            <a href="#home" onClick={() => setMenuOpen(false)} style={{ ...mobileMenuLink, display: "flex", alignItems: "center", gap: 10 }}><HomeIcon size={15} />Home</a>
            <a href="#features" onClick={() => setMenuOpen(false)} style={{ ...mobileMenuLink, display: "flex", alignItems: "center", gap: 10 }}><StarIcon size={15} />Features</a>
            <a href="#about" onClick={() => setMenuOpen(false)} style={{ ...mobileMenuLink, display: "flex", alignItems: "center", gap: 10 }}><InfoIcon size={15} />About</a>

            <button
              onClick={() => setPubOpen((o) => !o)}
              style={{
                ...mobileMenuLink, width: "100%", textAlign: "left", background: "none", border: "none",
                borderBottom: pubOpen ? "none" : mobileMenuLink.borderBottom, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}><BookIcon size={15} />Publications</span>
              <span style={{ display: "flex", transform: pubOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }}><ChevronDownIcon size={12} /></span>
            </button>

            {pubOpen && (
              <div style={{ background: "rgba(0,0,0,0.15)" }}>
                <button
                  onClick={() => goToPublications("results")}
                  style={{ ...mobileMenuLink, width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: mobileMenuLink.borderBottom, cursor: "pointer", paddingLeft: 32, fontSize: 13.5, opacity: 0.9, display: "flex", alignItems: "center", gap: 8 }}
                ><CheckCircleIcon size={13} />Results</button>
                <button
                  onClick={() => goToPublications("joining")}
                  style={{ ...mobileMenuLink, width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: "none", cursor: "pointer", paddingLeft: 32, fontSize: 13.5, opacity: 0.9, display: "flex", alignItems: "center", gap: 8 }}
                ><GraduationCapIcon size={13} />Joining Instructions</button>
              </div>
            )}
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
        }}>SCHOOL MANAGEMENT SYSTEM</h1>

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
              title={label}
              aria-label={label}
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
          NOW IS <span className="mk-live-badge"><LiveIcon /> LIVE</span>
        </div>
        <a href="#features" className="mk-hero-cta" style={{ fontSize: isMobile ? 13 : 14 }}>Explore Features</a>
      </header>

      {/* Features */}
      <section id="features" style={{ padding: isMobile ? "44px 18px" : isTablet ? "50px 22px" : "60px 24px", background: "#e0e1dd" }}>
       <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h2 style={{ textAlign: "center", color: THEME.navy, fontSize: isMobile ? 20 : 24, fontWeight: 800, marginBottom: isMobile ? 26 : 40 }}>Features</h2>
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(230px, 1fr))",
          gap: isMobile ? 16 : 30,
        }}>
          {FEATURES.map(({ Icon, title, desc }) => (
            <div key={title} className="mk-feature-card" style={{
              textAlign: "center", padding: isMobile ? "18px 16px" : "24px 18px",
            }}>
              <Icon size={isMobile ? 72 : 90} />
              <h3 style={{ fontSize: isMobile ? 14.5 : 15.5, color: THEME.text, fontWeight: 700, margin: "14px 0 6px" }}>{title}</h3>
              <p style={{ fontSize: isMobile ? 12 : 12.5, color: THEME.muted, lineHeight: 1.55 }}>{desc}</p>
            </div>
          ))}
        </div>
       </div>
      </section>

      {/* About */}
      <section id="about" style={{ background: "#415d43", padding: isMobile ? "44px 18px" : isTablet ? "50px 22px" : "60px 24px" }}>
        <div style={{ maxWidth: 820, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: isMobile ? 22 : 30 }}>
            <img src="/assets/shule.svg" alt="School logo" style={{ height: isMobile ? 48 : 64, marginBottom: 14 }} onError={(e) => (e.currentTarget.style.display = "none")} />
            <h2 style={{ color: "#fff", fontSize: isMobile ? 20 : 24, fontWeight: 800, marginBottom: 8 }}>About the School</h2>
            <p style={{ color: "rgba(255,255,255,0.92)", fontSize: isMobile ? 13 : 14.5, maxWidth: 560, margin: "0 auto", lineHeight: 1.7 }}>
              Mikumbi Secondary School is located in {SCHOOL.district}, {SCHOOL.region}. Our motto, "{SCHOOL.motto}", guides
              everything we do, from the classroom to the community.
            </p>
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(auto-fit, minmax(160px, 1fr))",
            gap: isMobile ? 16 : 16,
            background: "#2f4431", border: "1px solid #243826", borderRadius: 4,
            padding: isMobile ? "20px 14px" : 24,
          }}>
            <AboutFact label="Postal Address" value={SCHOOL.poBox} />
            <AboutFact label="Registration No." value={SCHOOL.regNo} />
            <AboutFact label="Centre No." value={SCHOOL.centreNo} />
            <AboutFact label="Region" value={SCHOOL.region} />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ background: "#0c426f", color: "#f0f7fc", padding: isMobile ? "22px 20px" : "28px 24px", textAlign: "center", fontSize: isMobile ? 11.5 : 12.5 }}>
        <div>© {new Date().getFullYear()} {SCHOOL.name}. All Rights Reserved.</div>
        <div style={{ marginTop: 8, display: "flex", justifyContent: "center", gap: isMobile ? 12 : 18, flexWrap: "wrap" }}>
          <Link to="/privacy" style={{ color: "#cbd5e1" }}>Privacy Policy</Link>
          <Link to="/terms" style={{ color: "#cbd5e1" }}>Terms of Service</Link>
          <Link to="/support" style={{ color: "#cbd5e1" }}>Support</Link>
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
