import { API_BASE } from "../context/AuthContext";
import { getLang } from "../i18n";

// Shared fetch helper - attaches the Bearer token automatically, throws a
// readable Error on failure so callers can just try/catch and show err.message.
export async function apiFetch(path, options = {}, token) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  // Server messages come back in the language shown on screen (en | sw).
  if (!headers["Accept-Language"]) headers["Accept-Language"] = getLang();

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    // Network-level failure - most commonly a free-tier backend that's
    // asleep/restarting, so the request never completes. Throwing here
    // (instead of letting fetch's rejection go uncaught) means callers'
    // existing .catch()/try-catch handles it like any other error, rather
    // than the UI looking like it silently did nothing.
    throw new Error("Failed to reach the server - it may be restarting (can take up to a minute). Please wait and try again.");
  }
  const isJson = res.headers.get("content-type")?.includes("application/json");
  if (!isJson) {
    // A 200 with no/HTML body (flaky mobile network, proxy, cold-starting
    // backend) used to resolve to `null` here - callers doing
    // `.then(setRows)` would then crash on the very next render because
    // `null.map` isn't a function. Treating it as an error instead means
    // existing .catch()/try-catch handling shows a message rather than
    // the whole page hitting the error boundary.
    throw new Error(res.ok ? "The server sent an unexpected response. Please try again." : "The server is starting back up. Please wait a moment and try again.");
  }
  const data = await res.json();

  if (!res.ok) {
    // The server says this sign-in is no longer valid (expired, password
    // changed, account deactivated): AuthContext signs the person out.
    if (res.status === 401 && token && data && data.session_expired) {
      window.dispatchEvent(new CustomEvent("mikumbi:session-ended", { detail: data.message }));
    }
    const message = (data && (data.message || data.error)) || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

export { API_BASE };
