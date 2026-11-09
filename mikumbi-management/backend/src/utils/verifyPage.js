// utils/verifyPage.js - the small branded HTML page a phone opens after
// scanning ANY verification QR code in the system (Joining Instructions'
// per-applicant QR, and the generic QR printed on every other exported
// PDF's footer - Contributions, Food Contribution, TAMS, Hostel, Student
// Management, Results, Timetable...). Kept in one shared place so every QR
// in the system opens to the exact same look: the school badge/logo
// top-center, then the confirmation message below it - never raw text.
const fs = require("fs");
const { SCHOOL_LOGO_PATH } = require("./pdfHeader");

const escapeHtml = (s) => String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", '"': "&quot;", "'": "&#39;", ">": "&gt;" }[c]));

let SCHOOL_LOGO_DATA_URI = null;
try {
  if (fs.existsSync(SCHOOL_LOGO_PATH)) {
    SCHOOL_LOGO_DATA_URI = `data:image/png;base64,${fs.readFileSync(SCHOOL_LOGO_PATH).toString("base64")}`;
  }
} catch { /* verify page just renders without the logo if this fails */ }

// `heading` - short title, e.g. "Nyaraka Halali" or "Maelekezo ya Kujiunga
// na Kidato cha Kwanza". `details` - optional array of {label, value} rows
// for a per-record page (e.g. applicant name/exam number); omit/empty for
// the generic page. `notFound` - true renders the red "HAIKUTHIBITISHWA"
// state instead of the green "NYARAKA HALALI" one.
function renderVerifyPage({ heading, details, notFound, message }) {
  const badge = notFound
    ? `<div class="badge badge-bad">✕ HAIKUTHIBITISHWA</div>`
    : `<div class="badge">✓ NYARAKA HALALI</div>`;
  const detailsHtml = details && details.length
    ? `<div class="details">${details.map((d) => `<div><b>${escapeHtml(d.label)}:</b> ${escapeHtml(d.value)}</div>`).join("")}</div>`
    : "";
  const msg = message || (notFound
    ? "Rejea hii haikupatikana kwenye kumbukumbu za shule. Kama unadhani hii ni hitilafu, wasiliana na Uongozi wa Shule."
    : "Hii ni nyaraka halali iliyotolewa rasmi na Shule ya Sekondari Mikumbi kupitia Mfumo wa Usimamizi wa Shule.");
  return `<!DOCTYPE html>
<html lang="sw">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Uthibitisho wa Nyaraka - Shule ya Sekondari Mikumbi</title>
<style>
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#0F172A; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
  .card { background:#FFFFFF; max-width:420px; width:90%; margin:24px auto; border-radius:14px;
          padding:32px 26px; text-align:center; box-shadow:0 10px 30px rgba(0,0,0,0.35); }
  .logo { width:72px; height:72px; object-fit:contain; margin:0 auto 14px; display:block; }
  .badge { display:inline-block; background:#DCFCE7; color:#15803D; font-size:12px; font-weight:700;
           padding:4px 12px; border-radius:999px; letter-spacing:0.03em; margin-bottom:14px; }
  .badge-bad { background:#FEE2E2; color:#B91C1C; }
  h1 { font-size:16px; color:#0F172A; margin:0 0 6px; }
  p.msg { font-size:13.5px; color:#334155; line-height:1.55; margin:0 0 16px; }
  .details { text-align:left; background:#F8FAFC; border:1px solid #E2E8F0; border-radius:10px; padding:12px 16px; margin-top:6px; }
  .details div { font-size:12.5px; color:#334155; padding:3px 0; }
  .details b { color:#0F172A; }
  .school { font-size:11px; color:#94A3B8; margin-top:18px; }
</style>
</head>
<body>
  <div class="card">
    ${SCHOOL_LOGO_DATA_URI ? `<img class="logo" src="${SCHOOL_LOGO_DATA_URI}" alt="Shule ya Sekondari Mikumbi" />` : ""}
    ${badge}
    <h1>${escapeHtml(heading)}</h1>
    <p class="msg">${msg}</p>
    ${detailsHtml}
    <div class="school">Shule ya Sekondari Mikumbi - Newala</div>
  </div>
</body>
</html>`;
}

module.exports = { escapeHtml, renderVerifyPage };
