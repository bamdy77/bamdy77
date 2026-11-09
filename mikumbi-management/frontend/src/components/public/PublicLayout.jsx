import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { THEME, SCHOOL } from "../../styles/theme";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { siteConfig, toTelHref } from "../../config/siteConfig";
import HoverMenu from "../HoverMenu";
import {
  HomeIcon, InfoIcon, BookIcon, MegaphoneIcon, MessageIcon, MenuIcon, CloseIcon, ChevronDownIcon,
  CheckCircleIcon, GraduationCapIcon, LocationPinIcon,
} from "../icons";

const NAVY = "#0c426f";
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
        .pub-lift:hover { transform: translateY(-4px); box-shadow: 0 14px 30px rgba(12,66,111,.16); }
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
  return (
    <header style={{ position: "relative", overflow: "hidden", background: "#eef1f6", borderBottom: `3px solid ${ORANGE}` }}>
      <div aria-hidden="true" style={{
        position: "absolute", inset: 0, backgroundImage: "url(/assets/picha.png)", backgroundSize: "cover",
        backgroundPosition: isMobile ? "center 18%" : isTablet ? "center 15%" : "center 12%", opacity: 0.5,
      }} />
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(255,255,255,0.2), rgba(255,255,255,0.45))" }} />
      <div style={{
        position: "relative", maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center",
        gap: isMobile ? 12 : isTablet ? 26 : 46, padding: isMobile ? "16px 12px" : isTablet ? "24px 22px" : "32px 24px", textAlign: "center",
      }}>
        <img src="/assets/govt-logo.svg" alt="Coat of arms of the United Republic of Tanzania" width="92" height="92"
          style={{ height: isMobile ? 42 : isTablet ? 64 : 92, width: "auto", flexShrink: 0 }} onError={(e) => (e.currentTarget.style.display = "none")} />
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: isMobile ? 8.5 : isTablet ? 10.5 : 13, fontWeight: 700, letterSpacing: isMobile ? "0.06em" : "0.18em",
            color: "#0F172A", textTransform: "uppercase", marginBottom: isMobile ? 3 : 8,
          }}>The United Republic of Tanzania</div>
          <div style={{ fontSize: isMobile ? 15 : isTablet ? 22 : 32, fontWeight: 800, color: NAVY, letterSpacing: "0.01em", lineHeight: 1.18, textTransform: "uppercase" }}>
            {SCHOOL.name}
          </div>
          <div style={{ fontSize: isMobile ? 10.5 : isTablet ? 12.5 : 15, fontStyle: "italic", color: ORANGE, fontWeight: 600, marginTop: isMobile ? 3 : 6 }}>
            {SCHOOL.motto}
          </div>
        </div>
        <img src="/assets/shule.svg" alt="Mikumbi Secondary School badge" width="92" height="92"
          style={{ height: isMobile ? 42 : isTablet ? 64 : 92, width: "auto", flexShrink: 0 }} onError={(e) => (e.currentTarget.style.display = "none")} />
      </div>
    </header>
  );
}

const PUBLICATION_ITEMS = [
  { label: "Results", to: "/results", icon: CheckCircleIcon },
  { label: "Joining Instructions", to: "/joining-instructions", icon: GraduationCapIcon },
];

function NavBar() {
  const { isMobile, isTablet, isDesktop } = useBreakpoint();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pubOpen, setPubOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => { setMenuOpen(false); setPubOpen(false); }, [pathname]);
  useEffect(() => { if (isDesktop) setMenuOpen(false); }, [isDesktop]);

  const link = { color: "#fff", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 };
  const close = () => { setMenuOpen(false); setPubOpen(false); };

  return (
    <div className="pub-nav" style={{ position: "sticky", top: 0, zIndex: 50 }}>
      <nav aria-label="Main" style={{
        background: NAVY, color: "#fff", padding: isMobile ? "10px 14px" : isTablet ? "11px 18px" : "13px 28px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, opacity: 0.92 }}>
          <LocationPinIcon size={14} />
          <span style={{ fontSize: isMobile ? 11 : 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            Newala, Mtwara, Tanzania
          </span>
        </div>

        {isDesktop ? (
          <div style={{ display: "flex", gap: 24, fontSize: 13.5, alignItems: "center" }}>
            <Link to="/" className="pub-navlink" style={link}><HomeIcon size={14} />Home</Link>
            <Link to="/#about" className="pub-navlink" style={link}><InfoIcon size={14} />About</Link>
            <Link to="/#news" className="pub-navlink" style={link}><MegaphoneIcon size={14} />News</Link>
            <HoverMenu label="Publications" icon={BookIcon} items={PUBLICATION_ITEMS} variant="light" align="right" buttonStyle={{ fontSize: 13.5, fontWeight: 400 }} />
            <Link to="/#contact" className="pub-navlink" style={link}><MessageIcon size={14} />Contact</Link>
          </div>
        ) : (
          <button
            type="button" onClick={() => { setMenuOpen((o) => !o); setPubOpen(false); }}
            aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen}
            style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: "4px 2px", display: "flex", alignItems: "center" }}
          >{menuOpen ? <CloseIcon size={22} /> : <MenuIcon size={24} />}</button>
        )}
      </nav>

      {!isDesktop && menuOpen && (
        <div style={{ background: NAVY, borderTop: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 12px 24px rgba(0,0,0,0.2)" }}>
          <MobileLink to="/" onClick={close} icon={<HomeIcon size={15} />}>Home</MobileLink>
          <MobileLink to="/#about" onClick={close} icon={<InfoIcon size={15} />}>About</MobileLink>
          <MobileLink to="/#news" onClick={close} icon={<MegaphoneIcon size={15} />}>News</MobileLink>
          <button
            type="button" onClick={() => setPubOpen((o) => !o)} aria-expanded={pubOpen}
            style={{ ...mobileLink, width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", justifyContent: "space-between", borderBottom: pubOpen ? "none" : mobileLink.borderBottom }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}><BookIcon size={15} />Publications</span>
            <span style={{ display: "flex", transform: pubOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }}><ChevronDownIcon size={12} /></span>
          </button>
          {pubOpen && (
            <div style={{ background: "rgba(0,0,0,0.15)" }}>
              {PUBLICATION_ITEMS.map((it) => (
                <Link key={it.to} to={it.to} onClick={close} style={{ ...mobileLink, paddingLeft: 32, fontSize: 13.5, opacity: 0.92 }}>
                  <it.icon size={13} />{it.label}
                </Link>
              ))}
            </div>
          )}
          <MobileLink to="/#contact" onClick={close} icon={<MessageIcon size={15} />} last>Contact</MobileLink>
        </div>
      )}
    </div>
  );
}

const mobileLink = {
  display: "flex", alignItems: "center", gap: 10, padding: "13px 20px", color: "#fff", textDecoration: "none",
  fontSize: 14, fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.08)",
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
  const cols = isMobile ? "1fr" : isTablet ? "repeat(2, 1fr)" : "1.5fr 1fr 1fr 1fr 1.3fr";
  const head = { color: "#fff", fontSize: 16, fontWeight: 800, marginBottom: 14 };
  const fl = { color: "#cfe0ee", textDecoration: "none", fontSize: 13.5, lineHeight: 1.4 };
  const li = { marginBottom: 10 };

  return (
    <footer style={{ background: NAVY, color: "#cfe0ee" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: isMobile ? "34px 20px 24px" : "46px 28px 30px", display: "grid", gridTemplateColumns: cols, gap: isMobile ? 28 : 34 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <img src="/assets/shule.svg" alt="" width="56" height="56" style={{ height: 56, width: "auto" }} onError={(e) => (e.currentTarget.style.display = "none")} />
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 16, lineHeight: 1.25 }}>{SCHOOL.name}</div>
          </div>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Everything your child needs, in one place.</div>
          <div style={{ color: "#F5B041", fontSize: 13.5, fontStyle: "italic", marginBottom: 16 }}>{SCHOOL.motto}</div>
          <div style={{ background: "#0a3556", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "14px 16px", maxWidth: 260 }}>
            <div style={{ fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9fc0d9", marginBottom: 6 }}>School identity</div>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>Reg. No. {SCHOOL.regNo}</div>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 14, marginTop: 2 }}>Centre No. {SCHOOL.centreNo}</div>
          </div>
        </div>

        <nav aria-label="Publications">
          <div style={head}>Publications</div>
          <ul style={{ listStyle: "none", padding: 0 }}>
            <li style={li}><Link className="pub-flink" to="/results" style={fl}>Results</Link></li>
            <li style={li}><Link className="pub-flink" to="/joining-instructions" style={fl}>Joining Instructions</Link></li>
          </ul>
        </nav>

        <nav aria-label="School">
          <div style={head}>School</div>
          <ul style={{ listStyle: "none", padding: 0 }}>
            <li style={li}><Link className="pub-flink" to="/#about" style={fl}>About Us</Link></li>
            <li style={li}><Link className="pub-flink" to="/#news" style={fl}>News</Link></li>
            <li style={li}><Link className="pub-flink" to="/#boarding" style={fl}>Boarding &amp; Hostels</Link></li>
            <li style={li}><Link className="pub-flink" to="/#gallery" style={fl}>Gallery</Link></li>
          </ul>
        </nav>

        <nav aria-label="Quick links">
          <div style={head}>Quick Links</div>
          <ul style={{ listStyle: "none", padding: 0 }}>
            <li style={li}><Link className="pub-flink" to="/privacy" style={fl}>Privacy Policy</Link></li>
            <li style={li}><Link className="pub-flink" to="/terms" style={fl}>Terms of Service</Link></li>
            <li style={li}><Link className="pub-flink" to="/support" style={fl}>Support</Link></li>
          </ul>
        </nav>

        <div>
          <div style={head}>Contact Us</div>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 13.5, marginBottom: 2 }}>Postal Address</div>
          <div style={{ fontSize: 13.5, marginBottom: 12 }}>{SCHOOL.poBox}, {SCHOOL.region}</div>
          {siteConfig.phones.map((p) => (
            <div key={p} style={{ display: "flex", gap: 8, marginBottom: 6, fontSize: 13.5 }}>
              <PhoneSvg /><a className="pub-flink" href={toTelHref(p)} style={fl}>{p}</a>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 6, fontSize: 13.5 }}>
            <MailSvg /><a className="pub-flink" href={`mailto:${siteConfig.email}`} style={{ ...fl, overflowWrap: "anywhere" }}>{siteConfig.email}</a>
          </div>
          {siteConfig.social.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div style={{ ...head, fontSize: 14, marginBottom: 8 }}>Follow Us On</div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {siteConfig.social.map((s) => (
                  <a key={s.key} className="pub-flink" href={s.url} target="_blank" rel="noopener noreferrer" style={fl}>{s.label}</a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.14)", textAlign: "center", padding: "16px 20px", fontSize: 12.5, color: "#cfe0ee" }}>
        © {new Date().getFullYear()} {SCHOOL.name}. All Rights Reserved.
      </div>
    </footer>
  );
}

export { NAVY, ORANGE };
