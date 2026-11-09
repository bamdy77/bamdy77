// One codebase, two sites, chosen by the hostname the page is opened on:
//
//   PUBLIC site  (parents / students / visitors)  e.g. https://yourdomain.com
//   STAFF  site  (teachers / management)          e.g. https://staff.yourdomain.com
//
// VITE_PUBLIC_HOSTS = comma-separated hostnames that are the PUBLIC site,
//   e.g. "yourdomain.com,www.yourdomain.com". Any other host is the STAFF site,
//   so localhost and *.vercel.app keep behaving exactly like the old single site.
//
// Preview before the domain exists:
//   open  https://<your>.vercel.app/?site=public   -> public site (this tab only)
//   open  https://<your>.vercel.app/?site=staff    -> back to the staff site
// or set VITE_FORCE_SITE=public / staff at build time (dev/testing only).
const KEY = "mikumbi_site_override";

function parseHosts() {
  return String(import.meta.env.VITE_PUBLIC_HOSTS || "")
    .split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
}

export function getSiteMode() {
  if (typeof window === "undefined") return "staff";

  const forced = String(import.meta.env.VITE_FORCE_SITE || "").toLowerCase();
  if (forced === "public" || forced === "staff") return forced;

  const host = window.location.hostname.toLowerCase();
  // A real public host can never be overridden into the staff site (and vice versa
  // is only possible on non-production hosts) so the override can't be abused.
  if (parseHosts().includes(host)) return "public";

  const isPreviewHost = host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app");
  if (isPreviewHost) {
    try {
      const q = new URLSearchParams(window.location.search).get("site");
      if (q === "public" || q === "staff") sessionStorage.setItem(KEY, q);
      const saved = sessionStorage.getItem(KEY);
      if (saved === "public") return "public";
    } catch { /* storage blocked - fall through to staff */ }
  }
  return "staff";
}
