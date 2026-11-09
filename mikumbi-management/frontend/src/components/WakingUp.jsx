import { useState, useEffect } from "react";
import { THEME } from "../styles/theme";
import { API_BASE } from "../context/AuthContext";
import MikumbiLoader from "./MikumbiLoader";

// On a free-tier host (e.g. Render's free plan) the backend goes to sleep
// after inactivity and can take up to ~60 seconds to wake on the very next
// request. Without this, the very first visitor of the day just sees a
// blank/frozen page. This pings /api/health on mount and shows a friendly
// "starting up" screen (with a slow-connection reassurance after a while)
// until the backend responds, then renders the real app underneath.
export default function WakingUp({ children }) {
  const [awake, setAwake] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const tryPing = async (attemptsLeft) => {
      try {
        const res = await fetch(`${API_BASE}/health`);
        if (res.ok) { if (!cancelled) setAwake(true); return; }
        throw new Error("not ok");
      } catch {
        if (cancelled) return;
        if (attemptsLeft <= 0) { setFailed(true); return; }
        setTimeout(() => tryPing(attemptsLeft - 1), 3000);
      }
    };
    tryPing(20); // up to ~60s of retrying, well past a typical cold start

    return () => { cancelled = true; };
  }, []);

  if (awake) return children;

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: `linear-gradient(160deg, ${THEME.navy} 0%, ${THEME.navyDark} 100%)`, color: "#fff",
      textAlign: "center", padding: 24,
    }}>
      <div style={{ maxWidth: 360 }}>
        <div style={{ marginBottom: 18, display: "flex", justifyContent: "center" }}>
          <MikumbiLoader size={130} />
        </div>
        <div style={{ fontSize: 13.5, opacity: 0.85 }}>
          {failed
            ? "This is taking longer than usual to start up. Please check your internet connection, then try refreshing the page."
            : "Starting up, please wait..."}
        </div>
        {failed && (
          <button onClick={() => window.location.reload()} style={{
            marginTop: 18, padding: "10px 24px", background: "#fff", color: THEME.navy,
            border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13.5, cursor: "pointer",
          }}>Refresh</button>
        )}
      </div>
    </div>
  );
}
