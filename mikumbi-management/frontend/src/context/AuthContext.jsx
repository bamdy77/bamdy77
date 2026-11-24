import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { getLang, useLang } from "../i18n";

// In development (and when frontend+backend are deployed together behind
// one proxy/domain) the relative "/api" path just works. When deployed as
// TWO separate services (e.g. Render: a Web Service for the backend + a
// Static Site for the frontend), they live on different domains, so the
// frontend build needs to know the backend's full URL. Set VITE_API_URL
// (e.g. https://mikumbi-backend.onrender.com/api) as an environment
// variable on the frontend's Render service - no code change needed.
const API_BASE = import.meta.env.VITE_API_URL || "/api";
const AuthContext = createContext(null);

// Inactivity sign-out: after 30 minutes with no mouse, keyboard, touch or
// scroll the person is signed out (a warning shows 2 minutes before). The
// last-activity time is shared by every open tab of the staff site, so using
// one tab keeps the others signed in too. The server's token also ends after
// 12 hours at most.
const IDLE_LIMIT = 30 * 60 * 1000;
const IDLE_WARN = 2 * 60 * 1000;
const ACTIVE_KEY = "mikumbi_last_active";
const REASON_KEY = "mikumbi_logout_reason";
const readActive = () => { try { return Number(localStorage.getItem(ACTIVE_KEY)) || 0; } catch { return 0; } };
const markActive = () => { try { localStorage.setItem(ACTIVE_KEY, String(Date.now())); } catch { /* ignore */ } };
const tokenExp = (tok) => { try { return JSON.parse(atob(tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).exp * 1000 || 0; } catch { return 0; } };
// Shown on the Login page; these are i18n keys (see strings/staff.js).
const MSG_IDLE = "session.idle";
const MSG_EXPIRED = "session.expired";

export function AuthProvider({ children }) {
  const { t } = useLang();
  const [token, setToken] = useState(() => {
    const tok = localStorage.getItem("mikumbi_token") || null;
    if (!tok) return null;
    // Browser closed and reopened after the idle limit or the token's end.
    const exp = tokenExp(tok);
    const last = readActive();
    if ((last && Date.now() - last > IDLE_LIMIT) || (exp && Date.now() >= exp)) {
      try { sessionStorage.setItem(REASON_KEY, exp && Date.now() >= exp ? MSG_EXPIRED : MSG_IDLE); } catch { /* ignore */ }
      localStorage.removeItem("mikumbi_token"); localStorage.removeItem("mikumbi_user");
      return null;
    }
    return tok;
  });
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("mikumbi_user");
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Validate the stored token once on load - if it's expired/invalid,
    // log the person out instead of showing a broken dashboard.
    if (!token) { setLoading(false); return; }
    fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}`, "Accept-Language": getLang() } })
      .then(async (r) => {
        if (r.ok) { const data = await r.json(); setUser(data.user); return; }
        // Only "this sign-in is not valid" signs out; a sleeping/restarting
        // server keeps the stored session (the next request will retry).
        if (r.status === 401) { const d = await r.json().catch(() => ({})); logout(d.message || MSG_EXPIRED); }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Trusted-device tokens for 2-step verification, one per username, kept
  // in this browser only (the server stores just a hash; 60 days).
  const DEVICE_KEY = "mikumbi_trusted_devices";
  const readDevices = () => { try { return JSON.parse(localStorage.getItem(DEVICE_KEY) || "{}") || {}; } catch { return {}; } };
  const deviceKeyFor = (u) => String(u || "").trim().toLowerCase();

  const finishLogin = (data) => {
    localStorage.setItem("mikumbi_token", data.token);
    localStorage.setItem("mikumbi_user", JSON.stringify(data.user));
    markActive();
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  // Returns the user, or { twofa: { challenge_id, email_hint, message } }
  // when the account must confirm a code sent to its email.
  const login = useCallback(async (username, password) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept-Language": getLang() },
      body: JSON.stringify({ username, password, device_token: readDevices()[deviceKeyFor(username)] }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || "Login failed.");
    if (data.twofa_required) return { twofa: data };
    return finishLogin(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verifyLoginCode = useCallback(async (username, challengeId, code) => {
    const res = await fetch(`${API_BASE}/auth/login/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept-Language": getLang() },
      body: JSON.stringify({ challenge_id: challengeId, code }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) { const e = new Error(data.message || "Wrong code."); e.expired = !!data.expired; throw e; }
    if (data.device_token) {
      try { localStorage.setItem(DEVICE_KEY, JSON.stringify({ ...readDevices(), [deviceKeyFor(username)]: data.device_token })); } catch { /* ignore */ }
    }
    return finishLogin(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = useCallback((reason) => {
    if (typeof reason === "string" && reason) { try { sessionStorage.setItem(REASON_KEY, reason); } catch { /* ignore */ } }
    localStorage.removeItem("mikumbi_token");
    localStorage.removeItem("mikumbi_user");
    // The assistant's saved conversation goes with the session.
    try { Object.keys(sessionStorage).filter((k) => k.startsWith("mikumbi_chat_")).forEach((k) => sessionStorage.removeItem(k)); } catch { /* ignore */ }
    setToken(null);
    setUser(null);
  }, []);

  // After a password change the server issues a fresh token (every older
  // token is rejected from then on) - swap it in so this browser stays
  // signed in.
  const replaceToken = useCallback((newToken) => {
    if (!newToken) return;
    setToken(newToken);
    localStorage.setItem("mikumbi_token", newToken);
  }, []);

  // Re-fetches this account's OWN profile from the server and replaces the
  // cached copy in both state and localStorage. Without this, a teacher's
  // `assigned_forms`/`subject_ids`/`class_teacher_of`/roles stay frozen at
  // whatever they were at their last login for the rest of that browser
  // session - so when the Head Master reassigns them to a different class/
  // subject from User Accounts, that teacher's own already-open session
  // keeps acting on the OLD assignment (their previous class's marks
  // "disappear" from Enter Marks, and the newly assigned class doesn't work
  // correctly) until they happen to log out and back in. Layout calls this
  // on every navigation (see Layout.jsx) so the account object is always
  // fresh without requiring a manual re-login. Silently does nothing on
  // failure (e.g. brief network hiccup) - the stale copy just stays in use
  // until the next successful call, same as before this existed.
  const refreshUser = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}`, "Accept-Language": getLang() } });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.user) {
        setUser(data.user);
        localStorage.setItem("mikumbi_user", JSON.stringify(data.user));
      }
    } catch { /* keep the cached copy - see comment above */ }
  }, [token]);

  // Merges a partial update (e.g. { photo_url }) into the logged-in user's
  // record, in both React state and localStorage - used after an avatar
  // upload/removal so the account header updates immediately, with no
  // re-login required.
  const updateUser = useCallback((partial) => {
    setUser((prev) => {
      const next = { ...prev, ...partial };
      localStorage.setItem("mikumbi_user", JSON.stringify(next));
      return next;
    });
  }, []);

  // ── Session guard: inactivity, token end, server says "sign in again" ──
  const [warnLeft, setWarnLeft] = useState(null); // seconds left, while the warning shows
  const lastMark = useRef(0);
  useEffect(() => {
    if (!token) { setWarnLeft(null); return; }
    if (!readActive()) markActive();
    const onActivity = () => {
      const now = Date.now();
      if (now - lastMark.current < 10000) return; // write at most every 10 s
      lastMark.current = now; markActive();
    };
    const events = ["mousedown", "keydown", "touchstart", "wheel", "scroll", "mousemove"];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true, capture: true }));
    const check = () => {
      const exp = tokenExp(token);
      if (exp && Date.now() >= exp) return logout(MSG_EXPIRED);
      const idle = Date.now() - readActive();
      if (idle >= IDLE_LIMIT) return logout(MSG_IDLE);
      setWarnLeft(idle >= IDLE_LIMIT - IDLE_WARN ? Math.ceil((IDLE_LIMIT - idle) / 1000) : null);
    };
    const timer = setInterval(check, 1000);
    const onVisible = () => { if (document.visibilityState === "visible") check(); }; // phone woke up
    document.addEventListener("visibilitychange", onVisible);
    const onEnded = (e) => logout(e.detail || MSG_EXPIRED);
    window.addEventListener("mikumbi:session-ended", onEnded);
    // Signed out (or in as someone else) in another tab -> follow it here.
    const onStorage = (e) => {
      if (e.key !== "mikumbi_token") return;
      if (!e.newValue) { setToken(null); setUser(null); }
      else if (e.newValue !== token) { setToken(e.newValue); try { setUser(JSON.parse(localStorage.getItem("mikumbi_user"))); } catch { /* ignore */ } }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity, { capture: true }));
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("mikumbi:session-ended", onEnded);
      window.removeEventListener("storage", onStorage);
    };
  }, [token, logout]);

  const stayIn = () => { lastMark.current = Date.now(); markActive(); setWarnLeft(null); };

  return (
    <AuthContext.Provider value={{ token, user, loading, login, verifyLoginCode, logout, updateUser, refreshUser, replaceToken }}>
      {children}
      {token && warnLeft !== null && createPortal(
        <div role="alertdialog" aria-modal="true" aria-labelledby="idle-title"
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 6, padding: "22px 22px 18px", maxWidth: 380, width: "100%", boxShadow: "0 12px 40px rgba(0,0,0,0.25)", textAlign: "center" }}>
            <div id="idle-title" style={{ fontSize: 17, fontWeight: 800, color: "#007aff", marginBottom: 8 }}>{t("idle.title")}</div>
            <p style={{ fontSize: 14, color: "#475569", lineHeight: 1.6, margin: "0 0 16px" }}>
              {t("idle.text1")} <b>{Math.floor(warnLeft / 60)}:{String(warnLeft % 60).padStart(2, "0")}</b> {t("idle.text2")}
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button type="button" onClick={() => logout("session.signedOut")} style={{ padding: "9px 16px", borderRadius: 4, border: "1px solid #cbd5e1", background: "#fff", color: "#334155", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>{t("idle.signOut")}</button>
              <button type="button" autoFocus onClick={stayIn} style={{ padding: "9px 18px", borderRadius: 4, border: "none", background: "#007aff", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>{t("idle.stay")}</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
export { API_BASE };
