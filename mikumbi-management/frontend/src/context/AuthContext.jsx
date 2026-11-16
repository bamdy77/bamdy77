import { createContext, useContext, useState, useEffect, useCallback } from "react";

// In development (and when frontend+backend are deployed together behind
// one proxy/domain) the relative "/api" path just works. When deployed as
// TWO separate services (e.g. Render: a Web Service for the backend + a
// Static Site for the frontend), they live on different domains, so the
// frontend build needs to know the backend's full URL. Set VITE_API_URL
// (e.g. https://mikumbi-backend.onrender.com/api) as an environment
// variable on the frontend's Render service - no code change needed.
const API_BASE = import.meta.env.VITE_API_URL || "/api";
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("mikumbi_token") || null);
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("mikumbi_user");
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Validate the stored token once on load - if it's expired/invalid,
    // log the person out instead of showing a broken dashboard.
    if (!token) { setLoading(false); return; }
    fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => { setUser(data.user); setLoading(false); })
      .catch(() => { logout(); setLoading(false); });
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
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  // Returns the user, or { twofa: { challenge_id, email_hint, message } }
  // when the account must confirm a code sent to its email.
  const login = useCallback(async (username, password) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      headers: { "Content-Type": "application/json" },
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

  const logout = useCallback(() => {
    localStorage.removeItem("mikumbi_token");
    localStorage.removeItem("mikumbi_user");
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
      const res = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
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

  return (
    <AuthContext.Provider value={{ token, user, loading, login, verifyLoginCode, logout, updateUser, refreshUser, replaceToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
export { API_BASE };
