import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../utils/api";
import { THEME } from "../styles/theme";
import { BellIcon } from "./icons";
import { useLang } from "../i18n";
import { formatDate } from "../i18n/display";

// Bell icon in the header (desktop sidebar top + mobile top bar). Polls the
// unread count in the background so the badge stays current without the
// user having to open the dropdown, and refreshes the full list whenever
// the dropdown is opened or a notification is marked read.
function timeAgo(iso, t, tn, lang) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return t("time.justNow");
  if (mins < 60) return tn("time.minutesAgo", mins);
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return tn("time.hoursAgo", hrs);
  const days = Math.floor(hrs / 24);
  if (days < 7) return tn("time.daysAgo", days);
  return formatDate(lang, iso);
}

export default function NotificationBell({ dark }) {
  const { token } = useAuth();
  const { t, tn, lang } = useLang();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [panelStyle, setPanelStyle] = useState({ left: 0, width: 320 });
  const wrapRef = useRef(null);

  const loadCount = useCallback(() => {
    if (!token) return;
    apiFetch("/notifications/unread-count", {}, token)
      .then((d) => setCount(d.count || 0))
      .catch(() => {});
  }, [token]);

  const loadList = useCallback(() => {
    if (!token) return;
    setLoading(true);
    apiFetch("/notifications?limit=30", {}, token)
      .then((d) => setItems(d.notifications || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    loadCount();
    const iv = setInterval(loadCount, 45000); // poll every 45s
    return () => clearInterval(iv);
  }, [loadCount]);

  useEffect(() => {
    if (open) loadList();
  }, [open, loadList]);

  // Measures actual available space on open instead of assuming a fixed
  // pixel offset from a viewport edge — the bell sits in very different
  // spots (near the LEFT edge, inside the narrow 230px desktop sidebar, vs
  // near the RIGHT edge on the mobile/tablet top bar), so a hardcoded
  // right:0/left:0 breaks one of those two layouts. Picks whichever side
  // has more room, then caps width to what's actually available there
  // (with an 8px breathing margin) so the panel can never spill past
  // either edge of the viewport, on any screen size.
  useLayoutEffect(() => {
    if (!open || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const spaceRight = vw - rect.left;
    const spaceLeft = rect.right;
    const preferred = 320;
    if (spaceRight >= preferred || spaceRight >= spaceLeft) {
      setPanelStyle({ left: 0, width: Math.min(preferred, spaceRight - 8) });
    } else {
      setPanelStyle({ right: 0, width: Math.min(preferred, spaceLeft - 8) });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("touchstart", onOutside);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("touchstart", onOutside);
    };
  }, [open]);

  const markRead = async (id) => {
    try {
      await apiFetch(`/notifications/${id}/read`, { method: "PATCH" }, token);
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
      setCount((c) => Math.max(0, c - 1));
    } catch { /* ignore */ }
  };

  const markAllRead = async () => {
    try {
      await apiFetch("/notifications/read-all", { method: "PATCH" }, token);
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setCount(0);
    } catch { /* ignore */ }
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t("bell.title")}
        title={t("bell.title")}
        style={{
          position: "relative", display: "flex", alignItems: "center", justifyContent: "center",
          width: 34, height: 34, borderRadius: 4, border: "1px solid rgba(255,255,255,0.28)",
          background: open ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)",
          color: "#fff", cursor: "pointer",
        }}
      >
        <BellIcon size={18} />
        {count > 0 && (
          <span style={{
            position: "absolute", top: -4, right: -4, minWidth: 16, height: 16, padding: "0 3px",
            borderRadius: 4, background: THEME.dangerSolid, color: "#fff", fontSize: 10, fontWeight: 800,
            display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
            border: "2px solid " + THEME.navy,
          }}>{count > 9 ? "9+" : count}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: 42, ...panelStyle, maxWidth: "calc(100vw - 16px)",
          background: THEME.surface, color: THEME.text, border: `1px solid ${THEME.border}`,
          borderRadius: 4, boxShadow: "0 12px 32px rgba(0,0,0,0.22)", zIndex: 200, overflow: "hidden",
        }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px", borderBottom: `1px solid ${THEME.border}`,
          }}>
            <span style={{ fontWeight: 800, fontSize: 13, color: THEME.heading }}>{t("bell.title")}</span>
            {count > 0 && (
              <button onClick={markAllRead} style={{
                background: "none", border: "none", color: THEME.link, fontSize: 11.5, fontWeight: 700, cursor: "pointer",
              }}>{t("bell.markAll")}</button>
            )}
          </div>

          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            {loading && <div style={{ padding: 16, fontSize: 12.5, color: THEME.muted, textAlign: "center" }}>{t("common.loading")}</div>}
            {!loading && items.length === 0 && (
              <div style={{ padding: 20, fontSize: 12.5, color: THEME.muted, textAlign: "center" }}>{t("bell.empty")}</div>
            )}
            {!loading && items.map((n, i) => (
              <button
                key={n.id}
                onClick={() => !n.is_read && markRead(n.id)}
                style={{
                  display: "block", width: "100%", textAlign: "left", cursor: n.is_read ? "default" : "pointer",
                  padding: "10px 14px", background: n.is_read ? "none" : THEME.bg,
                  border: "none", borderTop: i > 0 ? `1px solid ${THEME.border}` : "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  {!n.is_read && <span style={{ width: 7, height: 7, borderRadius: "50%", background: THEME.gold, marginTop: 5, flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: THEME.heading }}>{n.title}</div>
                    <div style={{ fontSize: 12, color: THEME.text, marginTop: 2, lineHeight: 1.4 }}>{n.message}</div>
                    <div style={{ fontSize: 10.5, color: THEME.muted, marginTop: 4 }}>{timeAgo(n.created_at, t, tn, lang)}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
