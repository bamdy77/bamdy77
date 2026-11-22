import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { SCHOOL } from "../../styles/theme";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { siteConfig, toTelHref } from "../../config/siteConfig";
import HoverMenu from "../HoverMenu";
import { useLang, LangToggle } from "../../i18n";
import FontChooser from "../FontChooser";
import { useFont } from "../../context/FontContext";
import { FONT_OPTIONS, FONT_STACKS, DEFAULT_FONT } from "../../styles/fonts";
import {
  HomeIcon, InfoIcon, BookIcon, MegaphoneIcon, MessageIcon, MenuIcon, CloseIcon, ChevronDownIcon,
  CheckCircleIcon, GraduationCapIcon, LocationPinIcon, SchoolIcon, ShieldIcon,
} from "../icons";

const NAVY = "#1a50c7";
const ORANGE = "#F54927";

// Wraps every page of the public website: identity banner + sticky navbar on
// top, footer at the bottom. There is intentionally NO login link anywhere.
export default function PublicLayout({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: "#fff", display: "flex", flexDirection: "column" }}>
      <ScrollManager />
      <style>{`
        .pub-section { scroll-margin-top: 76px; }
        .pub-lift { transition: transform .18s ease, box-shadow .18s ease; }
        .pub-lift:hover { transform: translateY(-3px); box-shadow: 0 8px 18px rgba(15,23,42,.10); }
        @keyframes pubNewGlow {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(245,73,39,0.0); filter: brightness(1); }
          50% { opacity: 0.55; box-shadow: 0 0 14px 5px rgba(255,170,60,0.95); filter: brightness(1.35); }
        }
        .pub-new-tag { animation: pubNewGlow 1.2s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .pub-new-tag { animation: none; } }
        .pub-btn { transition: transform .15s ease, box-shadow .15s ease, background .15s ease; }
        .pub-btn:hover { transform: translateY(-2px); }
        .pub-navlink:hover { opacity: .8; }
        .pub-flink:hover { color: #fff !important; text-decoration: underline; }
        .pub-nav a:focus-visible, .pub-nav button:focus-visible, .pub-btn:focus-visible { outline: 2px solid #D4A017; outline-offset: 2px; }
      `}</style>
      <IdentityBanner />
      <NavBar />
      <main style={{ flex: 1 }}>{children}</main>
      <Footer />
    </div>
  );
}

// react-router doesn't scroll for us: jump to #section on /#about style links,
// otherwise start every new page at the top.
function ScrollManager() {
  const { pathname, hash, key } = useLocation();
  useEffect(() => {
    if (hash) {
      const id = decodeURIComponent(hash.slice(1));
      // wait a tick so the target section has been rendered
      const t = setTimeout(() => { document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 60);
      return () => clearTimeout(t);
    }
    window.scrollTo(0, 0);
  }, [pathname, hash, key]);
  return null;
}

function IdentityBanner() {
  const { isMobile, isTablet } = useBreakpoint();
  const { t } = useLang();
  return (
    // Clean white identity strip - the school photo now appears clearly in
    // the hero below instead of washed out behind this text.
    <header style={{ position: "relative", overflow: "hidden", background: "#fff", borderBottom: "1px solid #e2e8f0" }}>
      <div style={{
        position: "relative", maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center",
        gap: isMobile ? 12 : isTablet ? 26 : 46, padding: isMobile ? "16px 12px" : isTablet ? "24px 22px" : "32px 24px", textAlign: "center",
      }}>
        <img src="/assets/govt-logo.svg" alt={t("layout.coatAlt")} width="92" height="92"
          style={{ height: isMobile ? 42 : isTablet ? 64 : 92, width: "auto", flexShrink: 0 }} onError={(e) => (e.currentTarget.style.display = "none")} />
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: isMobile ? 10 : isTablet ? 12.5 : 15.5, fontWeight: 700, letterSpacing: isMobile ? "0.06em" : "0.18em",
            color: "#0F172A", textTransform: "uppercase", marginBottom: isMobile ? 3 : 8,
          }}>{t("banner.country")}</div>
          <div style={{ fontSize: isMobile ? 17 : isTablet ? 23.5 : 34, fontWeight: 800, color: NAVY, letterSpacing: "0.01em", lineHeight: 1.18, textTransform: "uppercase" }}>
            {t("school.name")}
          </div>
          <div style={{ fontSize: isMobile ? 12.5 : isTablet ? 15 : 17, fontStyle: "italic", color: ORANGE, fontWeight: 600, marginTop: isMobile ? 3 : 6 }}>
            {t("school.motto")}
          </div>
        </div>
        <img src="/assets/shule.svg" alt={t("layout.badgeAlt")} width="92" height="92"
          style={{ height: isMobile ? 42 : isTablet ? 64 : 92, width: "auto", flexShrink: 0 }} onError={(e) => (e.currentTarget.style.display = "none")} />
      </div>
    </header>
  );
}

// Small icons sized like the other menu icons (HoverMenu passes `size`).
function PhoneIcon({ size = 13 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" /></svg>;
}
function MailIcon({ size = 13 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>;
}

// Hovering "Mawasiliano" shows the school's contact details right away:
// tap-to-call numbers, email, postal address and directions on the map.
const contactItems = (t) => [
  ...siteConfig.phones.map((p) => ({ label: `${t("contact.phone")}: ${p}`, href: toTelHref(p), icon: PhoneIcon })),
  { label: siteConfig.email, href: `mailto:${siteConfig.email}`, icon: MailIcon },
  { label: `${t("contact.postal")}: ${SCHOOL.poBox}`, to: "/#contact", icon: MessageIcon },
  { label: t("map.directions"), href: siteConfig.location.directionsUrl, icon: LocationPinIcon },
];

// Hovering "Kuhusu Shule" shows the school's key details and its sections.
const aboutItems = (t) => [
  { label: `${t("fact.motto")}: ${t("school.motto")}`, to: "/#about", icon: InfoIcon },
  { label: `${t("fact.regNo")}: ${SCHOOL.regNo}`, to: "/#about", icon: ShieldIcon },
  { label: `${t("fact.centreNo")}: ${SCHOOL.centreNo}`, to: "/#about", icon: ShieldIcon },
  { label: `${t("fact.location")}: Newala, Mtwara`, to: "/#contact", icon: LocationPinIcon },
  { label: t("boarding.title"), to: "/#boarding", icon: SchoolIcon },
  { label: t("gallery.title"), to: "/#gallery", icon: BookIcon },
];

const publicationItems = (t) => [
  { label: t("nav.results"), to: "/results", icon: CheckCircleIcon },
  { label: t("nav.joining"), to: "/joining-instructions", icon: GraduationCapIcon },
  { label: t("nav.videos"), to: "/#videos", icon: MegaphoneIcon },
];

function NavBar() {
  const { isMobile, isTablet, isDesktop } = useBreakpoint();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pubOpen, setPubOpen] = useState(false);
  const { pathname } = useLocation();
  const { t } = useLang();
  const PUBLICATION_ITEMS = publicationItems(t);
  const { font, setFont } = useFont();
  const [fontOpen, setFontOpen] = useState(false);
  const fontRowRef = useRef(null);

  useEffect(() => { setMenuOpen(false); setPubOpen(false); }, [pathname]);
  useEffect(() => { if (isDesktop) setMenuOpen(false); }, [isDesktop]);

  const link = { color: "#fff", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 };
  const close = () => { setMenuOpen(false); setPubOpen(false); };

  return (
    <div className="pub-nav" style={{ position: "sticky", top: 0, zIndex: 50 }}>
      <nav aria-label={t("layout.navMain")} style={{
        background: NAVY, color: "#fff", padding: isMobile ? "10px 14px" : isTablet ? "11px 18px" : "13px 28px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, opacity: 0.92 }}>
          <LocationPinIcon size={14} />
          <span style={{ fontSize: isMobile ? 13 : 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {t("nav.location")}
          </span>
        </div>

        {isDesktop ? (
          <div style={{ display: "flex", gap: 24, fontSize: 15, alignItems: "center" }}>
            <Link to="/" className="pub-navlink" style={link}><HomeIcon size={14} />{t("nav.home")}</Link>
            <HoverMenu label={t("nav.about")} icon={InfoIcon} items={aboutItems(t)} variant="light" buttonStyle={{ fontSize: 15, fontWeight: 400 }} />
            <Link to="/#news" className="pub-navlink" style={link}><MegaphoneIcon size={14} />{t("nav.news")}</Link>
            <HoverMenu label={t("nav.publications")} icon={BookIcon} items={PUBLICATION_ITEMS} variant="light" align="right" buttonStyle={{ fontSize: 15, fontWeight: 400 }} />
            <HoverMenu label={t("nav.contact")} icon={MessageIcon} items={contactItems(t)} variant="light" align="right" buttonStyle={{ fontSize: 15, fontWeight: 400 }} />
            {/* Hover (like the other menus) shows the fonts, each in its own font. */}
            <HoverMenu label="Aa" ariaLabel={t("font.label")} title={t("font.label")} variant="light" align="right"
              buttonStyle={{ border: "1px solid rgba(255,255,255,0.6)", padding: "3px 8px", fontSize: 12, fontWeight: 800, letterSpacing: "0.04em" }}
              items={FONT_OPTIONS.map((o) => ({
                label: o.value === DEFAULT_FONT ? t("font.default") : o.label,
                onClick: () => setFont(o.value),
                selected: font === o.value,
                style: { fontFamily: FONT_STACKS[o.value], fontSize: 15 },
              }))} />
            <LangToggle />
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <LangToggle />
          <button
            type="button" onClick={() => { setMenuOpen((o) => !o); setPubOpen(false); }}
            aria-label={menuOpen ? t("nav.closeMenu") : t("nav.openMenu")} aria-expanded={menuOpen}
            style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: "4px 2px", display: "flex", alignItems: "center" }}
          >{menuOpen ? <CloseIcon size={22} /> : <MenuIcon size={24} />}</button>
          </div>
        )}
      </nav>

      {!isDesktop && menuOpen && (
        <div style={{ background: NAVY, borderTop: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 12px 24px rgba(0,0,0,0.2)" }}>
          <MobileLink to="/" onClick={close} icon={<HomeIcon size={15} />}>{t("nav.home")}</MobileLink>
          <MobileLink to="/#about" onClick={close} icon={<InfoIcon size={15} />}>{t("nav.about")}</MobileLink>
          <MobileLink to="/#news" onClick={close} icon={<MegaphoneIcon size={15} />}>{t("nav.news")}</MobileLink>
          <button
            type="button" onClick={() => setPubOpen((o) => !o)} aria-expanded={pubOpen}
            style={{ ...mobileLink, width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", justifyContent: "space-between", borderBottom: pubOpen ? "none" : mobileLink.borderBottom }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}><BookIcon size={15} />{t("nav.publications")}</span>
            <span style={{ display: "flex", transform: pubOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }}><ChevronDownIcon size={12} /></span>
          </button>
          {pubOpen && (
            <div style={{ background: "rgba(0,0,0,0.15)" }}>
              {PUBLICATION_ITEMS.map((it) => (
                <Link key={it.to} to={it.to} onClick={close} style={{ ...mobileLink, paddingLeft: 32, fontSize: 15, opacity: 0.92 }}>
                  <it.icon size={13} />{it.label}
                </Link>
              ))}
            </div>
          )}
          <MobileLink to="/#contact" onClick={close} icon={<MessageIcon size={15} />}>{t("nav.contact")}</MobileLink>
          <button ref={fontRowRef} type="button" onClick={() => setFontOpen(true)} aria-haspopup="dialog"
            style={{ ...mobileLink, width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", borderBottom: "none" }}>
            <span aria-hidden="true" style={{ width: 15, fontWeight: 800, fontSize: 13 }}>Aa</span>{t("font.label")}
          </button>
        </div>
      )}
      <FontChooser
        open={fontOpen}
        onClose={() => setFontOpen(false)}
        returnFocusRef={fontRowRef}
        value={font}
        onChange={setFont}
        labels={{ title: t("font.label"), hint: t("font.hint"), defaultName: t("font.default"), reset: t("font.reset"), done: t("font.done"), close: t("common.close"), sample: t("font.sample") }}
      />
    </div>
  );
}

const mobileLink = {
  display: "flex", alignItems: "center", gap: 10, padding: "13px 20px", color: "#fff", textDecoration: "none",
  fontSize: 15.5, fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.08)",
};
function MobileLink({ to, onClick, icon, children, last }) {
  return <Link to={to} onClick={onClick} style={{ ...mobileLink, borderBottom: last ? "none" : mobileLink.borderBottom }}>{icon}{children}</Link>;
}

// ───────────────────────────── Footer ─────────────────────────────
function PhoneSvg() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 3 }}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" /></svg>;
}
function MailSvg() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 3 }}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>;
}

function Footer() {
  const { isMobile, isTablet } = useBreakpoint();
  const { t } = useLang();
  const cols = isMobile ? "1fr" : isTablet ? "repeat(2, 1fr)" : "1.5fr 1fr 1fr 1fr 1.3fr";
  const head = { color: "#fff", fontSize: 18, fontWeight: 800, marginBottom: 14 };
  const fl = { color: "#cfe0ee", textDecoration: "none", fontSize: 15, lineHeight: 1.4 };
  const li = { marginBottom: 10 };

  return (
    <footer style={{ background: NAVY, color: "#cfe0ee" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: isMobile ? "34px 20px 24px" : "46px 28px 30px", display: "grid", gridTemplateColumns: cols, gap: isMobile ? 28 : 34 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <img src="/assets/shule.svg" alt="" width="56" height="56" style={{ height: 56, width: "auto" }} onError={(e) => (e.currentTarget.style.display = "none")} />
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 18, lineHeight: 1.25 }}>{t("school.name")}</div>
          </div>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 15.5 }}>{t("footer.tagline")}</div>
        </div>

        <nav aria-label={t("layout.navPublications")}>
          <div style={head}>{t("nav.publications")}</div>
          <ul style={{ listStyle: "none", padding: 0 }}>
            <li style={li}><Link className="pub-flink" to="/results" style={fl}>{t("nav.results")}</Link></li>
            <li style={li}><Link className="pub-flink" to="/joining-instructions" style={fl}>{t("nav.joining")}</Link></li>
          </ul>
        </nav>

        <nav aria-label={t("layout.navSchool")}>
          <div style={head}>{t("footer.school")}</div>
          <ul style={{ listStyle: "none", padding: 0 }}>
            <li style={li}><Link className="pub-flink" to="/#about" style={fl}>{t("footer.aboutUs")}</Link></li>
            <li style={li}><Link className="pub-flink" to="/#news" style={fl}>{t("nav.news")}</Link></li>
            <li style={li}><Link className="pub-flink" to="/#boarding" style={fl}>{t("footer.boarding")}</Link></li>
            <li style={li}><Link className="pub-flink" to="/#gallery" style={fl}>{t("footer.gallery")}</Link></li>
          </ul>
        </nav>

        <nav aria-label={t("layout.navQuick")}>
          <div style={head}>{t("footer.quickLinks")}</div>
          <ul style={{ listStyle: "none", padding: 0 }}>
            <li style={li}><Link className="pub-flink" to="/privacy" style={fl}>{t("footer.privacy")}</Link></li>
            <li style={li}><Link className="pub-flink" to="/terms" style={fl}>{t("footer.terms")}</Link></li>
            <li style={li}><Link className="pub-flink" to="/support" style={fl}>{t("footer.support")}</Link></li>
          </ul>
        </nav>

        <div>
          <div style={head}>{t("footer.contactUs")}</div>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{t("footer.postal")}</div>
          <div style={{ fontSize: 15, marginBottom: 12 }}>{SCHOOL.poBox}, {SCHOOL.region}</div>
          {siteConfig.phones.map((p) => (
            <div key={p} style={{ display: "flex", gap: 8, marginBottom: 6, fontSize: 15 }}>
              <PhoneSvg /><a className="pub-flink" href={toTelHref(p)} style={fl}>{p}</a>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 6, fontSize: 15 }}>
            <MailSvg /><a className="pub-flink" href={`mailto:${siteConfig.email}`} style={{ ...fl, overflowWrap: "anywhere" }}>{siteConfig.email}</a>
          </div>
          {siteConfig.social.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div style={{ ...head, fontSize: 15.5, marginBottom: 8 }}>{t("footer.follow")}</div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {siteConfig.social.map((s) => (
                  <a key={s.key} className="pub-flink" href={s.url} target="_blank" rel="noopener noreferrer" style={fl}>{s.label}</a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.14)", textAlign: "center", padding: "16px 20px", fontSize: 15, color: "#cfe0ee" }}>
        © {new Date().getFullYear()} {t("school.name")}. {t("footer.rights")}
      </div>
    </footer>
  );
}

export { NAVY, ORANGE };
