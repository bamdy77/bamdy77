import { lazy } from "react";

// Loading a part of the app can fail for a moment: the phone switches between
// WiFi and mobile data (net::ERR_NETWORK_CHANGED), the signal drops, or a new
// version was just deployed and the old file name no longer exists. Instead
// of showing "Something went wrong", reload the page ONCE (a fresh page also
// knows the new file names after a deploy).
const RELOAD_KEY = "mikumbi_chunk_reload_at";

export function reloadOnceForNewVersion() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < 60000) return false; // already tried in the last minute: show the error instead of looping
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch { /* storage blocked: still reload once */ }
  window.location.reload();
  return true;
}

// Note: a browser remembers a failed module download for the life of the
// page, so retrying inside the same page does not help - a fresh page does.
// We wait a moment (the network may still be switching) and reload once.
export function lazyWithRetry(load) {
  return lazy(async () => {
    try { return await load(); } catch (err) {
      await new Promise((r) => setTimeout(r, 1500));
      if (reloadOnceForNewVersion()) return new Promise(() => {}); // page is reloading
      throw err;
    }
  });
}
