// utils/deviceFingerprint.js - a lightweight, dependency-free identifier
// used only to enforce "one device, one teacher" on TAMS check-in.
//
// This is a RANDOM id generated once and stored in localStorage - it is
// no longer derived from browser/device characteristics (user agent,
// screen size, language, timezone, CPU core count). That older approach
// caused two different physical phones of the same model/OS/browser
// version to produce the IDENTICAL fingerprint, because many teachers on
// the same school WiFi share the same phone model, OS version, browser
// version, language, and timezone. That made the second teacher's own
// phone look "already registered to someone else" even though they had
// never touched the first teacher's device. A random id stored per
// browser install avoids that collision entirely, since no two installs
// will ever generate the same value.
export function getDeviceFingerprint() {
  const STORAGE_KEY = "tams_device_id";
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const fresh = "dev_" + generateRandomId();
    localStorage.setItem(STORAGE_KEY, fresh);
    return fresh;
  } catch (e) {
    // localStorage can throw in some private/incognito modes - fall back
    // to a fresh id for this session rather than breaking check-in.
    return "dev_" + generateRandomId();
  }
}

function generateRandomId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  // Fallback for older browsers without crypto.randomUUID.
  let id = "";
  for (let i = 0; i < 32; i++) {
    id += Math.floor(Math.random() * 16).toString(16);
  }
  return id;
}
