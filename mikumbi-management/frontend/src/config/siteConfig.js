// Central place for school contact details used on the PUBLIC website.
// Everything can be overridden with environment variables (set them in
// Vercel -> Project -> Settings -> Environment Variables), so nothing about
// the domain, email or phone numbers is hard-coded in components.
//
//   VITE_CONTACT_EMAIL   e.g. info@yourdomain.com
//   VITE_CONTACT_PHONES  comma-separated, e.g. 0685905334,0718197560
//   VITE_SOCIAL_FACEBOOK / VITE_SOCIAL_INSTAGRAM / VITE_SOCIAL_YOUTUBE (optional)
const env = import.meta.env;

const phones = (env.VITE_CONTACT_PHONES || "0685905334,0718197560")
  .split(",").map((p) => p.trim()).filter(Boolean);

// "0685905334" -> "+255685905334" for tel: links
export const toTelHref = (p) => `tel:${String(p).replace(/\s+/g, "").replace(/^0/, "+255")}`;

const social = [
  { key: "facebook", label: "Facebook", url: env.VITE_SOCIAL_FACEBOOK },
  { key: "instagram", label: "Instagram", url: env.VITE_SOCIAL_INSTAGRAM },
  { key: "youtube", label: "YouTube", url: env.VITE_SOCIAL_YOUTUBE },
].filter((s) => s.url);

// School location for the map on the parents' site (same point TAMS uses).
// Override with VITE_SCHOOL_LAT / VITE_SCHOOL_LNG if it ever needs adjusting.
const lat = Number(env.VITE_SCHOOL_LAT) || -10.561915;
const lng = Number(env.VITE_SCHOOL_LNG) || 39.17856;

export const siteConfig = {
  location: {
    lat, lng,
    // t=m: normal street map, not satellite. z=14 shows Mikumbi plus the
    // neighbouring villages and landmarks by name (closer zooms drop the labels).
    embedUrl: `https://maps.google.com/maps?q=${lat},${lng}&t=m&z=14&hl=sw&output=embed`,
    directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
  },
  email: env.VITE_CONTACT_EMAIL || "support@mikumbisecondary.com",
  phones,
  social, // empty => the "Follow Us" block is not rendered
};
