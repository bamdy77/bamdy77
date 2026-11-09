import { useState, useEffect } from "react";
import { THEME } from "../styles/theme";

// Every save/submit action across the system should confirm itself the same
// way: a centered card with a green checkmark, a short title, and a message
// describing exactly what happened - e.g. showSuccess("Student", "Student
// Successfully Saved") or showSuccess("Payment", "Payment Successfully
// Recorded"). This is a plain module-level pub/sub (not React Context) so
// ANY file can call showSuccess(...) directly with a single import - no
// provider wrapping or hook plumbing needed at each call site. Mount
// <SuccessModalHost /> exactly once, at the app root (see App.jsx).
let listener = null;

export function showSuccess(title, message) {
  if (listener) listener({ title, message, key: Date.now() });
}

// A handful of small confetti dots that burst outward from behind the
// checkmark and fall/fade away - purely decorative, timed to land just
// after the checkmark circle pops in. Positions/colors/delays are computed
// once per dot (not on every render) so the burst always looks the same
// clean shape instead of jittering.
const CONFETTI_COLORS = [THEME.success, THEME.gold, THEME.navyLight, "#22C55E", "#FACC15"];
const CONFETTI = Array.from({ length: 10 }).map((_, i) => {
  const angle = (i / 10) * Math.PI * 2 + (i % 2 === 0 ? 0.15 : -0.15);
  const dist = 46 + (i % 3) * 14;
  return {
    dx: Math.cos(angle) * dist,
    dy: Math.sin(angle) * dist,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    size: i % 3 === 0 ? 7 : 5,
    // Timed to burst right as the checkmark finishes drawing itself
    // (badge pop ends ~0.6s, the tick draw itself runs 0.6s->1.35s) - a
    // small celebratory payoff exactly when the tick completes, not
    // before it's even appeared.
    delay: 1300 + (i % 4) * 40,
    rotate: (i * 47) % 360,
  };
});

export function SuccessModalHost() {
  const [state, setState] = useState(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    listener = (s) => { setClosing(false); setState(s); };
    return () => { listener = null; };
  }, []);

  const close = () => {
    // Play the reverse/closing transition instead of just unmounting -
    // popping straight out looks like something broke, a quick shrink-and-
    // fade reads as intentional.
    setClosing(true);
    setTimeout(() => { setState(null); setClosing(false); }, 180);
  };

  // Closes itself - no click required. DISMISS_AFTER is 6s, matching the
  // green progress line drawn at the bottom of the card below (same
  // duration, started at the same moment) so the line visibly finishes
  // filling/emptying right as the card disappears - the line IS the
  // countdown, not just a decoration next to a separate timer. Re-armed
  // every time a NEW success comes in (keyed off state.key, not just state
  // existing) so back-to-back saves each get their own full countdown
  // instead of inheriting whatever was left on the previous one. The OK
  // button and Escape/backdrop-click below still work as an early/manual
  // dismiss - this timer is just the default path.
  const DISMISS_AFTER = 6000;
  useEffect(() => {
    if (!state) return;
    const t = setTimeout(close, DISMISS_AFTER);
    return () => clearTimeout(t);
  }, [state?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!state) return;
    const onKey = (e) => { if (e.key === "Escape" || e.key === "Enter") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 10000, padding: 16,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(15,23,42,0.5)",
        backdropFilter: "blur(2px)",
        animation: closing ? "mk-success-backdrop-out 0.18s ease both" : "mk-success-backdrop 0.22s ease both",
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div
        key={state.key}
        style={{
          position: "relative",
          background: `linear-gradient(180deg, ${THEME.surface} 0%, ${THEME.surface} 60%, ${THEME.successLight} 180%)`,
          borderRadius: 4,
          width: "100%", maxWidth: 380,
          padding: "40px 28px 30px",
          textAlign: "center",
          transformStyle: "preserve-3d",
          perspective: 800,
          boxShadow: "0 2px 6px rgba(0,0,0,0.04), 0 12px 24px rgba(15,23,42,0.10), 0 30px 60px rgba(15,23,42,0.22)",
          border: `1px solid ${THEME.border}`,
          animation: closing
            ? "mk-success-card-out 0.18s cubic-bezier(0.4,0,1,1) both"
            : "mk-success-card-in 0.52s cubic-bezier(0.2,1.4,0.4,1) both",
        }}
      >
        {/* Expanding "sonar" ring behind the badge - fires once on entry to
            draw the eye straight to the checkmark. */}
        <div style={{ position: "relative", width: 76, height: 76, margin: "0 auto 20px" }}>
          <div style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            background: THEME.success,
            animation: "mk-success-ring 0.9s ease-out 0.15s both",
          }} />
          {CONFETTI.map((c, i) => (
            <div key={i} style={{
              position: "absolute", left: "50%", top: "50%",
              width: c.size, height: c.size, marginLeft: -c.size / 2, marginTop: -c.size / 2,
              borderRadius: i % 2 === 0 ? "50%" : 3,
              background: c.color,
              opacity: 0,
              transform: `rotate(${c.rotate}deg)`,
              "--dx": `${c.dx}px`, "--dy": `${c.dy}px`,
              animation: `mk-success-confetti 0.7s ease-out ${c.delay}ms both`,
            }} />
          ))}
          {/* The badge itself - layered shading (top highlight + bottom
              shadow) instead of one flat fill, so it reads as a raised 3D
              disc rather than a sticker. The checkmark inside only starts
              drawing itself AFTER this has fully popped in and settled
              (badge-pop ends at ~0.6s) - drawing it while the badge is
              still moving/scaling made the stroke look glitchy instead of
              a clean, deliberate tick being written. */}
          <div style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            background: `radial-gradient(circle at 32% 28%, #4ADE80 0%, ${THEME.success} 55%, #128A3E 100%)`,
            boxShadow: `0 10px 22px -6px rgba(22,163,74,0.55), inset 0 2px 3px rgba(255,255,255,0.55), inset 0 -6px 10px rgba(0,0,0,0.18)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            animation: "mk-success-badge-pop 0.55s cubic-bezier(0.2,1.6,0.4,1) 0.05s both",
          }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.15))" }}>
              <polyline
                points="4 12.5 9.5 18 20.5 5.5"
                pathLength="1"
                style={{ animation: "mk-success-check 0.75s cubic-bezier(0.65,0,0.35,1) 0.6s both" }}
              />
            </svg>
          </div>
        </div>

        <h3 style={{ margin: "0 0 8px", fontSize: 19, fontWeight: 800, color: THEME.text, animation: "mk-success-fade-up 0.4s ease 0.28s both" }}>{state.title}</h3>
        <p style={{ margin: "0 0 26px", fontSize: 13.5, color: THEME.muted, lineHeight: 1.5, animation: "mk-success-fade-up 0.4s ease 0.34s both" }}>{state.message}</p>
        <button
          onClick={close}
          autoFocus
          className="mk-success-btn"
          style={{
            padding: "10px 36px", background: THEME.navy, color: "#fff", border: "none",
            borderRadius: 4, fontWeight: 700, fontSize: 13.5, cursor: "pointer",
            boxShadow: "0 4px 10px -2px rgba(12,66,111,0.4)",
            animation: "mk-success-fade-up 0.4s ease 0.4s both",
          }}
        >OK</button>

        {/* Green countdown line - starts full and drains to nothing over
            exactly DISMISS_AFTER (6s), so it visibly finishes right as the
            card auto-dismisses instead of being a vague decoration. Clipped
            to its own small strip (not the whole card) so it never
            interferes with the card's box-shadow/confetti above. */}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 4, borderRadius: 4, overflow: "hidden", background: "rgba(15,23,42,0.08)" }}>
          <div className="mk-success-timer-bar" style={{ height: "100%", width: "100%", background: THEME.success, transformOrigin: "left" }} />
        </div>
      </div>

      <style>{`
        @keyframes mk-success-backdrop {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes mk-success-backdrop-out {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes mk-success-card-in {
          0% { opacity: 0; transform: translateY(26px) scale(0.85) rotateX(12deg); }
          60% { opacity: 1; }
          100% { opacity: 1; transform: translateY(0) scale(1) rotateX(0deg); }
        }
        @keyframes mk-success-card-out {
          from { opacity: 1; transform: translateY(0) scale(1); }
          to { opacity: 0; transform: translateY(8px) scale(0.94); }
        }
        @keyframes mk-success-badge-pop {
          0% { transform: scale(0.3); opacity: 0; }
          65% { transform: scale(1.12); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes mk-success-ring {
          0% { transform: scale(0.6); opacity: 0.55; }
          100% { transform: scale(2.15); opacity: 0; }
        }
        @keyframes mk-success-check {
          from { stroke-dasharray: 1; stroke-dashoffset: 1; }
          to { stroke-dasharray: 1; stroke-dashoffset: 0; }
        }
        @keyframes mk-success-confetti {
          0% { opacity: 0; transform: translate(0, 0) rotate(0deg) scale(0.4); }
          15% { opacity: 1; }
          100% { opacity: 0; transform: translate(var(--dx), calc(var(--dy) + 18px)) rotate(200deg) scale(1); }
        }
        @keyframes mk-success-fade-up {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes mk-success-timer {
          from { transform: scaleX(1); }
          to { transform: scaleX(0); }
        }
        .mk-success-timer-bar { animation: mk-success-timer 6s linear both; }
        .mk-success-btn { transition: transform 0.15s ease, box-shadow 0.15s ease; }
        .mk-success-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 14px -2px rgba(12,66,111,0.5); }
        .mk-success-btn:active { transform: translateY(0); }
        @media (prefers-reduced-motion: reduce) {
          div[style*="mk-success"], div[style*="mk-success"] * { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
