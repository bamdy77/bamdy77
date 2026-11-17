import { useState, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { THEME } from "../styles/theme";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../utils/api";
import { CloseIcon as SharedCloseIcon } from "./icons";
import { useLang } from "../i18n";

// The welcome line and the error messages come from the language catalog
// (i18n/strings/staff.js, keys "chat.*"), so they follow EN | SW.
// When Gemini cannot answer, the server says WHY (reason) and the widget
// shows a matching message instead of a vague "network problem":
const REASON_KEYS = {
  not_configured: "chat.err.notConfigured", invalid_key: "chat.err.invalidKey", quota: "chat.err.quota",
  timeout: "chat.err.timeout", model_unavailable: "chat.err.model", blocked: "chat.err.blocked",
  rate_limited: "chat.err.rateLimited", network: "chat.err.network", error: "chat.err.generic",
};
// The Head Master / Second Master also see who to tell (the technical
// administrator who manages the server); other staff see the message only.
const ADMIN_FIX = { not_configured: "chat.fix.key", invalid_key: "chat.fix.key", quota: "chat.fix.quota", model_unavailable: "chat.fix.model" };

// Maps a /dashboard/<segment> route to the exact module label the backend
// (chatbotController.js MODULES_INFO) knows about, so Gemini can be told
// "the user is currently looking at X" and answer short/generic questions
// ("how do I do this?", "saidia hapa") about the right screen without the
// person having to name it. Kept in sync with App.jsx's route list.
const PAGE_LABELS = {
  students: "Student Management",
  contributions: "Contributions Management",
  food: "Manage Foods",
  timetable: "Timetable",
  "joining-instructions": "Joining Instructions (ndani ya Student Management)",
  "identity-cards": "Identity Cards (ndani ya Student Management)",
  hostel: "Hostel Management",
  results: "Results Management",
  tams: "TAMS (Mahudhurio)",
  communications: "Communications",
  users: "User Accounts",
  analytics: "Analytics Dashboard",
  "audit-log": "Audit Log",
  "signature-stamp": "Signature & Stamp / SMS Gateway Settings",
  "sms-gateway": "Signature & Stamp / SMS Gateway Settings",
};

// Gemini sometimes runs numbered steps together on one line ("...kwanza.
// 2. Kisha bonyeza...") instead of a real line break - this guarantees
// every "1. " / "2. " / etc. starts its own line before we render it, so
// step-by-step answers are actually readable as steps.
const formatBotText = (text) => text.replace(/(\S)\s+(\d{1,2}\.\s)/g, "$1\n$2");

export default function ChatBot() {
  const [open, setOpen] = useState(false);
  const { t } = useLang();
  // The first message is the welcome key, shown in the current language.
  const [messages, setMessages] = useState([{ from: "bot", key: "chat.welcome" }]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [slow, setSlow] = useState(false); // a long answer is still being written
  const bottomRef = useRef(null);
  const { isMobile, isTablet } = useBreakpoint();
  // Tablet was never handled here before - only isMobile (<640px) got the
  // "stack to full width / shrink panel height" treatment. On a tablet the
  // panel's fixed 330/440 size plus a fragile (non-flex) button position
  // meant the toggle button could end up pushed off-screen entirely after
  // opening. Treating tablet the same as mobile for this widget's own
  // layout (it's a small floating widget, not the main page grid) fixes it.
  const compact = isMobile || isTablet;
  const { token, user } = useAuth();
  const isManager = [user?.role, ...(user?.roles || [])].some((r) => r === "admin" || r === "second_master");
  const location = useLocation();

  // e.g. "/dashboard/tams" -> "tams" -> "TAMS (Mahudhurio)". Anything
  // outside /dashboard/<segment> (landing page, login, etc.) just has no
  // context - Gemini falls back to asking which module, as before.
  const currentPage = PAGE_LABELS[location.pathname.split("/")[2] || ""] || null;

  // ── Draggable position - the bubble defaults to bottom-right, but a
  // press-and-hold + move lets the user relocate it anywhere on screen, in
  // case it's sitting on top of something they need to click underneath.
  const [pos, setPos] = useState(null); // null = default bottom-right; once dragged, {x, y} (top-left, px)
  const dragRef = useRef({ dragging: false, moved: false, startX: 0, startY: 0, baseX: 0, baseY: 0 });
  const wrapRef = useRef(null);

  const clampPos = (x, y) => {
    const el = wrapRef.current;
    const w = el ? el.offsetWidth : 58;
    const h = el ? el.offsetHeight : 58;
    return {
      x: Math.min(Math.max(0, x), window.innerWidth - w),
      y: Math.min(Math.max(0, y), window.innerHeight - h),
    };
  };

  // clampPos() above only clamps against the CLOSED bubble's own size
  // (58x58, or whatever wrapRef measured at drag time) - it has no idea
  // the panel is about to open much bigger. So a bubble dragged anywhere
  // on screen (top-left corner, halfway up an edge, wherever a finger
  // happened to leave it) could - once the panel's width is actually
  // correct instead of collapsing (see the width fix below) - open
  // partially or entirely off the edge of a small phone screen. This
  // re-clamps specifically for the OPEN panel's real footprint, so
  // wherever the bubble was left, opening the chat always lands fully
  // on-screen.
  const openPanelPos = () => {
    if (!pos) return null;
    const panelW = compact ? Math.min(400, window.innerWidth - 24) : 330;
    const panelH = compact ? Math.min(window.innerHeight * 0.7, 480) : 440;
    const totalH = panelH + 12 + 58; // panel + gap + toggle button, stacked
    return {
      x: Math.min(Math.max(0, pos.x), Math.max(0, window.innerWidth - panelW)),
      y: Math.min(Math.max(0, pos.y), Math.max(0, window.innerHeight - totalH)),
    };
  };

  const onDragStart = (e) => {
    const point = e.touches ? e.touches[0] : e;
    const el = wrapRef.current;
    const rect = el.getBoundingClientRect();
    dragRef.current = { dragging: true, moved: false, startX: point.clientX, startY: point.clientY, baseX: rect.left, baseY: rect.top };
    window.addEventListener("mousemove", onDragMove);
    window.addEventListener("mouseup", onDragEnd);
    window.addEventListener("touchmove", onDragMove, { passive: false });
    window.addEventListener("touchend", onDragEnd);
  };
  const onDragMove = (e) => {
    if (!dragRef.current.dragging) return;
    const point = e.touches ? e.touches[0] : e;
    const dx = point.clientX - dragRef.current.startX;
    const dy = point.clientY - dragRef.current.startY;
    // 4px used to be the threshold for "this was actually a drag, not a
    // tap" - fine with a mouse, but a real finger on a touchscreen almost
    // never lifts with EXACTLY zero movement, so ordinary taps kept
    // tripping this and quietly switching the widget into its "manually
    // positioned" layout (see the width fix above for what that broke on
    // phones). 10px comfortably absorbs normal finger jitter while still
    // recognising a real, deliberate drag.
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) dragRef.current.moved = true;
    if (dragRef.current.moved) {
      e.preventDefault?.();
      setPos(clampPos(dragRef.current.baseX + dx, dragRef.current.baseY + dy));
    }
  };
  const onDragEnd = () => {
    dragRef.current.dragging = false;
    window.removeEventListener("mousemove", onDragMove);
    window.removeEventListener("mouseup", onDragEnd);
    window.removeEventListener("touchmove", onDragMove);
    window.removeEventListener("touchend", onDragEnd);
  };
  // If the toggle button registered a real drag, swallow the resulting click
  // so it doesn't also open/close the chat window.
  const onToggleClick = () => {
    if (dragRef.current.moved) { dragRef.current.moved = false; return; }
    setOpen((o) => !o);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const send = (textOverride) => {
    if (typing) return; // already waiting on a response - don't let overlapping
                         // requests scramble the conversation order/history
    const text = (textOverride ?? input).trim();
    if (!text) return;
    setMessages((m) => [...m, { from: "user", text }]);
    setInput("");
    setTyping(true);
    setSlow(false);
    const slowTimer = setTimeout(() => setSlow(true), 8000);

    const minDelay = new Promise((resolve) => setTimeout(resolve, 450 + Math.random() * 250));

    // Gemini is the ONLY thing that answers questions now - there is no
    // local FAQ engine anymore. `failed` distinguishes a genuine
    // network/technical failure (request never completed, or the backend
    // itself failed) from Gemini simply not being available for some other
    // reason, so the UI never shows a made-up "not part of the system"
    // answer when the real problem was connectivity.
    const askGemini = token
      ? apiFetch("/chatbot/ask", { method: "POST", body: JSON.stringify({ message: text, history: messages.filter((m) => !m.key && !m.error).slice(-10).map((m) => ({ from: m.from, text: m.text, sig: m.sig })), page: currentPage }) }, token)
          .then((result) => (result && result.ok && result.answer ? { failed: false, answer: result.answer, sig: result.sig } : { failed: true, reason: result?.reason || "error" }))
          .catch(() => ({ failed: true, reason: "network" }))
      : Promise.resolve({ failed: true, reason: "network" });

    Promise.all([askGemini, minDelay]).then(([result]) => {
      setTyping(false);
      clearTimeout(slowTimer); setSlow(false);
      if (!result.failed) { setMessages((m) => [...m, { from: "bot", text: result.answer, sig: result.sig }]); return; }
      const reason = REASON_KEYS[result.reason] ? result.reason : "error";
      const fix = isManager && ADMIN_FIX[reason] ? `\n\n${t(ADMIN_FIX[reason])}` : "";
      setMessages((m) => [...m, { from: "bot", error: true, text: t(REASON_KEYS[reason]) + fix }]);
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const activePos = pos ? (open ? openPanelPos() : pos) : null;

  return (
    <div ref={wrapRef} style={activePos ? {
      position: "fixed", zIndex: 9999, fontFamily: "inherit",
      display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12,
      left: activePos.x, top: activePos.y,
    } : {
      position: "fixed", zIndex: 9999, fontFamily: "inherit",
      display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12,
      bottom: compact ? 12 : 20, right: compact ? 12 : 20,
      left: compact && open ? 12 : "auto",
    }}>
      {open && (
        <div style={{
          // On phones this used to be width:"100%" (matched with the
          // wrapper's own left:12/right:12 anchors above so the two ends
          // met and 100% could resolve). But the SAME panel also renders
          // inside the pos-based wrapper right above - which only ever
          // sets left/top, never right - and a position:fixed box with no
          // right anchor sizes itself to shrink-to-fit its content. A
          // percentage width has nothing definite to resolve against
          // there, so it collapsed to almost nothing: only a sliver of the
          // panel showed (top-left), with the rest of the chat area gone.
          // And on a touchscreen this pos-based wrapper is what a person
          // almost always gets, even on a plain tap that never felt like a
          // drag - touchstart fires before the tap registers, and real
          // fingers virtually never lift with EXACTLY zero movement, so
          // `pos` ends up set (to essentially the same spot) on the very
          // first tap that opens the chat. Sizing directly off the
          // viewport instead (independent of the parent's own width, no
          // matter which positioning branch is active) removes the
          // ambiguity entirely and fixes this on phones for good.
          width: compact ? "calc(100vw - 24px)" : 330,
          maxWidth: compact ? "calc(100vw - 24px)" : 330,
          height: compact ? "min(70vh, 480px)" : 440,
          background: THEME.surface, borderRadius: 4,
          boxShadow: "0 12px 32px rgba(15,23,42,0.25)", display: "flex", flexDirection: "column",
          overflow: "hidden", border: `1px solid ${THEME.border}`,
        }}>
          {/* Header */}
          <div style={{ background: THEME.navy, color: "#fff", padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <BotIcon />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{t("chat.title")}</div>
            </div>
            <button onClick={() => setOpen(false)} aria-label={t("common.close")} style={{
              background: "none", border: "none", color: "#fff", cursor: "pointer", lineHeight: 1, display: "flex", alignItems: "center",
            }}><SharedCloseIcon size={18} /></button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "14px 12px", display: "flex", flexDirection: "column", gap: 10, background: THEME.bg }}>
            {messages.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.from === "user" ? "flex-end" : "flex-start",
                maxWidth: "82%",
                background: m.from === "user" ? THEME.navy : THEME.surface,
                color: m.from === "user" ? "#fff" : THEME.text,
                padding: "9px 12px", borderRadius: 4,
                borderBottomRightRadius: m.from === "user" ? 4 : 14,
                borderBottomLeftRadius: m.from === "bot" ? 4 : 14,
                fontSize: 13.5, lineHeight: 1.45, whiteSpace: "pre-wrap",
                boxShadow: m.from === "bot" ? "0 1px 2px rgba(15,23,42,0.08)" : "none",
              }}>
                {m.key ? t(m.key) : m.from === "bot" && !m.error ? formatBotText(m.text) : m.text}
              </div>
            ))}
            {typing && (
              <div style={{ alignSelf: "flex-start", background: THEME.surface, borderRadius: 4, borderBottomLeftRadius: 4, padding: "10px 14px", boxShadow: "0 1px 2px rgba(15,23,42,0.08)" }}>
                <TypingDots />
                {slow && <div style={{ fontSize: 12, color: THEME.muted, marginTop: 6 }}>{t("chat.slow")}</div>}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ display: "flex", gap: 8, padding: 10, borderTop: `1px solid ${THEME.border}`, background: THEME.surface }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("chat.placeholder")}
              style={{
                flex: 1, border: `1px solid ${THEME.border}`, borderRadius: 4,
                padding: "9px 14px", fontSize: 13.5, outline: "none",
              }}
            />
            <button onClick={() => send()} disabled={!input.trim() || typing} style={{
              background: THEME.navy, color: "#fff", border: "none", borderRadius: "50%",
              width: 36, height: 36, cursor: input.trim() && !typing ? "pointer" : "default",
              opacity: input.trim() && !typing ? 1 : 0.5, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }} aria-label={t("chat.send")}>
              <SendIcon />
            </button>
          </div>
        </div>
      )}

      <button
        onClick={onToggleClick}
        onMouseDown={onDragStart}
        onTouchStart={onDragStart}
        aria-label={t("chat.open")}
        style={{
          width: 58, height: 58, borderRadius: "50%", background: THEME.navy, border: "none",
          boxShadow: "0 8px 20px rgba(42,60,127,0.4)", cursor: "grab",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          touchAction: "none",
        }}
      >
        {open ? <CloseIcon /> : <ChatIcon />}
      </button>
    </div>
  );
}

function TypingDots() {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{
          width: 6, height: 6, borderRadius: "50%", background: THEME.muted,
          animation: `mikumbi-typing-bounce 1.1s ${i * 0.15}s infinite ease-in-out`,
        }} />
      ))}
      <style>{`
        @keyframes mikumbi-typing-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ── Minimal single-stroke SVG icons (no external icon library needed) ────
const BotIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="8" width="16" height="11" rx="2" /><path d="M12 8V4" /><circle cx="12" cy="3" r="1" />
    <circle cx="9" cy="13" r="1.2" fill="#fff" /><circle cx="15" cy="13" r="1.2" fill="#fff" />
  </svg>
);
const ChatIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-4-1L3 20l1-5.5A8.38 8.38 0 0 1 3 11.5 8.5 8.5 0 0 1 11.5 3 8.38 8.38 0 0 1 21 11.5Z" />
  </svg>
);
const CloseIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round">
    <path d="M18 6 6 18" /><path d="M6 6l12 12" />
  </svg>
);
const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7Z" />
  </svg>
);
