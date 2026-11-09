import { useState, useEffect } from "react";
import { apiFetch } from "../utils/api";
import { THEME } from "../styles/theme";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { CloseIcon } from "./icons";

// `endpoint` decides WHICH announcements are shown. The staff dashboard uses
// "/communications/announcements/staff" (needs the login `token`; returns only
// notices addressed to Staff or to Both). The public website has its own
// NewsSection and never uses this banner.
export default function AnnouncementsBanner({ endpoint = "/communications/announcements/public", token = null }) {
  const [announcements, setAnnouncements] = useState([]);
  const [open, setOpen] = useState(false);
  const { isMobile, isTablet } = useBreakpoint();

  useEffect(() => {
    let cancelled = false;
    apiFetch(endpoint, {}, token)
      .then((d) => { if (!cancelled) setAnnouncements(Array.isArray(d.announcements) ? d.announcements : []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [endpoint, token]);

  if (announcements.length === 0) return null;

  const marqueeText = announcements.map((a) => `${a.title} - ${a.message}`).join("     •     ");
  // The track's total pixel width is fixed (same text, same font-size) no
  // matter the screen - only the visible window shrinks on mobile/tablet.
  // So the same duration means a much bigger fraction of the text
  // whips past that narrow window every second, reading as "faster" even
  // though the underlying scroll speed (px/sec) never changed. A slightly
  // longer duration on smaller screens keeps the perceived speed even.
  const marqueeDuration = isMobile ? "30s" : isTablet ? "25s" : "20s";

  return (
    <div style={{ background: "#F54927", borderBottom: "1px solid #C43A1F" }}>
      <style>{`
        @keyframes mikumbi-notice-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
        @keyframes mikumbi-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .mikumbi-marquee-track { animation-name: mikumbi-marquee; animation-timing-function: linear; animation-iteration-count: infinite; }
        .mikumbi-marquee-wrap:hover .mikumbi-marquee-track { animation-play-state: paused; }
      `}</style>
      <div style={{
        maxWidth: 1100, margin: "0 auto",
        padding: isMobile ? "5px 14px" : isTablet ? "5px 18px" : "6px 24px",
        display: "flex", alignItems: "center", gap: isMobile ? 8 : 12,
      }}>
        <span style={{
          flexShrink: 0, display: "flex", alignItems: "center", gap: 5, background: THEME.danger, color: "#fff",
          fontSize: isMobile ? 9.5 : 10, fontWeight: 700, letterSpacing: "0.05em", padding: isMobile ? "2.5px 7px" : "3px 8px", borderRadius: 4,
          animation: "mikumbi-notice-pulse 1.6s ease-in-out infinite",
        }}>
          <MegaphoneIcon color="#fff" /> {isMobile ? "" : "NOTICE"}
        </span>

        <div className="mikumbi-marquee-wrap" style={{ flex: 1, overflow: "hidden", whiteSpace: "nowrap", minWidth: 0 }}>
          <div className="mikumbi-marquee-track" style={{ display: "inline-block", animationDuration: marqueeDuration }}>
            <span style={{ fontSize: isMobile ? 11.5 : 12, color: "#fff", paddingRight: 40 }}>{marqueeText}</span>
            <span style={{ fontSize: isMobile ? 11.5 : 12, color: "#fff", paddingRight: 40 }}>{marqueeText}</span>
          </div>
        </div>

        <button onClick={() => setOpen(true)} style={{
          flexShrink: 0, background: "rgba(255,255,255,0.92)", color: "#F54927", border: "none", borderRadius: 5,
          padding: isMobile ? "4px 10px" : "5px 12px", fontSize: isMobile ? 10.5 : 11.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
        }}>Read More</button>
      </div>

      {open && <AnnouncementsModal announcements={announcements} onClose={() => setOpen(false)} />}
    </div>
  );
}

function AnnouncementsModal({ announcements, onClose }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9000, padding: 16 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: THEME.surface, borderRadius: 12, width: "100%", maxWidth: 560, maxHeight: "80vh", overflowY: "auto", padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, color: THEME.heading }}>Announcements</h3>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: THEME.muted, lineHeight: 1, display: "flex", alignItems: "center" }}><CloseIcon size={18} /></button>
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          {announcements.map((a) => (
            <div key={a.id} style={{ border: `1px solid ${THEME.border}`, borderRadius: 8, padding: 14 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
                <MegaphoneIcon color={THEME.warning} />
                <b style={{ fontSize: 14, color: THEME.text }}>{a.title}</b>
              </div>
              <p style={{ margin: "0 0 8px", fontSize: 13.5, color: THEME.text, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{a.message}</p>
              <div style={{ fontSize: 11.5, color: THEME.muted }}>
                Sent {new Date(a.created_at).toLocaleString("en-GB", { timeZone: "Africa/Dar_es_Salaam", dateStyle: "medium", timeStyle: "short" })} · by {a.created_by_name}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MegaphoneIcon({ color }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
      <path d="m3 11 18-5v12L3 14v-3Z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  );
}
