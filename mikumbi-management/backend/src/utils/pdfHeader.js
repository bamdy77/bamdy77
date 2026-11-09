const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");

// Government/PMO-RALG emblem (left) and school logo (right) shown on every
// exported PDF's letterhead. These PNGs are pre-rendered from the source
// SVGs (frontend/public/assets/govt-logo.svg and shule.svg) since PDFKit
// cannot embed SVG directly - regenerate them if the source SVGs change.
const SCHOOL_LOGO_PATH = path.join(__dirname, "..", "assets", "shule-logo.png");
const GOVT_LOGO_PATH   = path.join(__dirname, "..", "assets", "govt-logo.png");
// Back-compat: a manually-dropped-in generic logo (old behaviour), used only
// as a right-side (school) fallback if shule-logo.png isn't present for some reason.
const LEGACY_LOGO_PATH = path.join(__dirname, "..", "assets", "logo.png");

// Draws the official letterhead used on every exported PDF in the system.
// `documentTitle` is the specific report name, e.g. "Girls Hostel - Resident List".
// `titleColor` is optional - defaults to #153810 (used by every report in the
// system); pass a color to override it for just one report's title without
// touching this shared default.
function drawLetterhead(doc, documentTitle, titleColor = "#153810") {
  const leftLogo  = fs.existsSync(GOVT_LOGO_PATH) ? GOVT_LOGO_PATH : null;
  const rightLogo = fs.existsSync(SCHOOL_LOGO_PATH) ? SCHOOL_LOGO_PATH : (fs.existsSync(LEGACY_LOGO_PATH) ? LEGACY_LOGO_PATH : null);
  const startY = doc.y;
  const MAX_LOGO_SIZE = 64;
  const LOGO_LINE_GAP = 5;

  // Lay out the header text block first so we know exactly where the
  // divider line lands, THEN size and position the logos against it.
  doc.fontSize(14).font("Helvetica-Bold").fillColor("#0F172A")
    .text("PRIME MINISTER'S OFFICE,", { align: "center" });
  doc.fontSize(13).font("Helvetica-Bold").fillColor("#0F172A")
    .text("REGIONAL ADMINISTRATION AND LOCAL GOVERNMENT", { align: "center" });
  doc.moveDown(0.15);
  doc.fontSize(13).font("Helvetica-Bold").fillColor("#0F172A")
    .text("NEWALA DISTRICT COUNCIL", { align: "center" });
  doc.fontSize(15).font("Helvetica-Bold").fillColor("#0F172A")
    .text("MIKUMBI SECONDARY SCHOOL", { align: "center" });

  doc.moveDown(0.5);
  const lineY = doc.y;
  doc.moveTo(doc.page.margins.left, lineY)
    .lineTo(doc.page.width - doc.page.margins.right, lineY)
    .lineWidth(1.3).strokeColor("#334155").stroke();
  doc.moveDown(0.5);

  // The header text block (startY..lineY) isn't always tall enough to fit a
  // full-size 64pt logo AND leave a gap before the line - a fixed logo size
  // with a "never start above startY" clamp used to silently let the logo
  // spill past the line instead of leaving a gap. Sizing the logo to the
  // space actually available fixes that for good, on any title/page.
  const availableHeight = lineY - startY - LOGO_LINE_GAP;

  // BUG FIX: the two logos are anchored to the page margins (x = margin,
  // and x = pageWidth - margin - logoSize) while the header text above is
  // CENTERED - on a wide page (A4) that leaves plenty of clear space on
  // both sides of the text for a 40–64pt logo. On a narrow page (the A5
  // payment receipts) the centered text is nearly as wide as the page
  // itself, so a margin-anchored logo of the same fixed size lands ON TOP
  // of "REGIONAL ADMINISTRATION AND LOCAL GOVERNMENT" / the school name
  // instead of beside it. Measure the widest header line actually drawn
  // and never size the logo larger than the real clear space next to it,
  // however narrow the page is - this is on top of (not instead of) the
  // existing vertical-space clamp above.
  const LOGO_TEXT_GAP = 8; // minimum breathing room between a logo and the text
  const headerLines = [
    { text: "PRIME MINISTER'S OFFICE,", font: "Helvetica-Bold", size: 10 },
    { text: "REGIONAL ADMINISTRATION AND LOCAL GOVERNMENT", font: "Helvetica-Bold", size: 10 },
    { text: "MIKUMBI SECONDARY SCHOOL", font: "Helvetica-Bold", size: 15 },
    { text: "Newala, Tanzania", font: "Helvetica", size: 9 },
  ];
  const maxHeaderTextWidth = Math.max(
    ...headerLines.map((l) => doc.font(l.font).fontSize(l.size).widthOfString(l.text))
  );
  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const horizontalClearance = (usableWidth - maxHeaderTextWidth) / 2 - LOGO_TEXT_GAP;
  const logoSize = Math.max(18, Math.min(MAX_LOGO_SIZE, availableHeight, horizontalClearance));
  const logoY = lineY - LOGO_LINE_GAP - logoSize;
  if (leftLogo) {
    try { doc.image(leftLogo, doc.page.margins.left, logoY, { fit: [logoSize, logoSize], align: "center", valign: "center" }); }
    catch { /* corrupt/unsupported image - silently skip, header still renders below */ }
  }
  if (rightLogo) {
    try { doc.image(rightLogo, doc.page.width - doc.page.margins.right - logoSize, logoY, { fit: [logoSize, logoSize], align: "center", valign: "center" }); }
    catch { /* corrupt/unsupported image - silently skip, header still renders below */ }
  }

  if (documentTitle) {
    // Every document's title is ALL CAPS, and never uses an em-dash (—) —
    // only a plain hyphen, even if a caller still builds the title with one.
    doc.fontSize(12).font("Helvetica-Bold").fillColor(titleColor)
      .text(String(documentTitle).replace(/\u2014/g, "-").toUpperCase(), { align: "center" });
    doc.moveDown(0.6);
  }
}

// ── Verification QR code ─────────────────────────────────────────────────
// Every PDF the system generates carries a small QR code confirming it is
// a genuine Mikumbi Secondary School document. The QR encodes a LINK to a
// branded verification page (school logo top-center, confirmation message
// below it - see utils/verifyPage.js) - NOT raw text. Scanning raw text
// with a phone camera just runs a Google search on the sentence, which is
// what the old version did; a real link opens the actual branded page
// instead, exactly like Joining Instructions' own per-applicant QR already
// does (see verifyJoiningDocument in joiningController.js).
//
// The GENERIC footer QR (used by drawFooter, i.e. every existing report
// across Contributions, Food Contribution, TAMS, Hostel, Student
// Management, Results, Timetable...) is generated ONCE at server start-up
// and cached - drawFooter itself must stay perfectly synchronous (it's
// called right before doc.end() with no await anywhere in any of its
// callers), so there is no way to generate a QR per-request here without
// risking a half-written PDF stream. Because it's a link (not per-record
// data), one generation at start-up is all it ever needs - the target URL
// never changes between requests, only the deployed backend's own address
// does, which BACKEND_PUBLIC_URL supplies.
// Documents that need a UNIQUE, per-record QR (e.g. Joining Instructions -
// one QR per applicant) generate their own with generateQrPngBuffer()
// directly, in their own already-async handler, instead of relying on this
// cached generic one.
//
// BACKEND_PUBLIC_URL - set this in the backend's Render environment to its
// own public URL (e.g. https://mikumbi-backend.onrender.com). Falls back to
// Render's own auto-provided RENDER_EXTERNAL_URL, then localhost for local
// dev - see backend/.env.example.
const BACKEND_PUBLIC_URL =
  (process.env.BACKEND_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 5000}`)
    .replace(/\/+$/, "");
const GENERIC_QR_URL = `${BACKEND_PUBLIC_URL}/api/public/verify`;
let genericFooterQrBuffer = null;
QRCode.toBuffer(GENERIC_QR_URL, { margin: 0, errorCorrectionLevel: "M" })
  .then((buf) => { genericFooterQrBuffer = buf; })
  .catch(() => { genericFooterQrBuffer = null; /* footer just omits the QR if this ever fails */ });

// Generates a PNG buffer for arbitrary text/verification content - used by
// callers that need a QR unique to one document (Joining Instructions,
// etc). Always call this from an async handler BEFORE doc.pipe/doc.end.
async function generateQrPngBuffer(text, size = 220) {
  // "H" (High, ~30% tolerance) rather than "M" - callers that overlay a
  // logo in the centre (e.g. Joining Instructions' branded QR) need that
  // headroom to still scan reliably with a chunk of the code covered.
  return QRCode.toBuffer(text, { margin: 0, width: size, errorCorrectionLevel: "H" });
}

// Footer with generation timestamp (Tanzania local time, no label needed),
// page number, and (space permitting) the generic verification QR code
// centered between them.
function drawFooter(doc, formatTZ) {
  const range = doc.bufferedPageRange();
  const total = range.count;
  for (let i = range.start; i < range.start + total; i++) {
    doc.switchToPage(i);
    // Writing text this close to the physical bottom edge trips PDFKit's
    // auto-pagination (it adds a fresh page believing the text overflows),
    // which silently appended extra blank pages to every export. Zeroing
    // the bottom margin for the duration of this call stops that - we're
    // placing absolute-positioned text, not flowing content, so there's
    // nothing to actually overflow.
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const bottom = doc.page.height - savedBottom + 10;
    // Page number only - the generation date/time is deliberately NOT
    // printed on any document (school request).
    doc.fontSize(8).font("Helvetica").fillColor("#94A3B8")
      .text(`Page ${i - range.start + 1} of ${total}`, doc.page.width - doc.page.margins.right - 150, bottom, { width: 150, align: "right", lineBreak: false });

    // Only draws the QR if there's genuinely enough of the (already-
    // reserved) bottom margin band to fit it without touching page content
    // above - narrower documents (e.g. A5 receipts) simply don't get one
    // rather than risk overlapping anything.
    if (genericFooterQrBuffer) {
      const qrSize = Math.min(26, savedBottom - 12);
      if (qrSize >= 14) {
        try {
          doc.image(genericFooterQrBuffer, (doc.page.width - qrSize) / 2, bottom - (qrSize - 8) / 2, { width: qrSize, height: qrSize });
        } catch { /* never let a QR failure break the PDF itself */ }
      }
    }
    doc.page.margins.bottom = savedBottom;
  }
}

// A general-purpose Kiswahili government/school letterhead - the same
// wording/layout the Parent Report uses (OFISI YA WAZIRI MKUU / TAWALA ZA
// MIKOA... / HALMASHAURI YA WILAYA YA NEWALA / SHULE YA SEKONDARI MIKUMBI),
// generalized here so any other Kiswahili-facing PDF (e.g. Joining
// Instructions) can reuse it instead of duplicating it. `boldFont`/
// `regularFont` let the caller pass its own registered font names (e.g.
// Arimo via registerFont) - defaults to the built-in Helvetica-Bold so this
// still works with zero setup for a caller that hasn't registered anything.
function drawLetterheadSw(doc, titleText, { boldFont = "Helvetica-Bold", titleColor = "#7A1710" } = {}) {
  const startY = doc.y;
  const lines = [
    { text: "OFISI YA WAZIRI MKUU,", size: 10.5 },
    { text: "TAWALA ZA MIKOA NA SERIKALI ZA MITAA", size: 9.5 },
    { text: "HALMASHAURI YA WILAYA YA NEWALA", size: 9.5 },
    { text: "SHULE YA SEKONDARI MIKUMBI", size: 12 },
  ];
  doc.font(boldFont).fillColor("#0F172A");
  lines.forEach((l) => { doc.fontSize(l.size).text(l.text, { align: "center", lineGap: 0 }); });
  doc.moveDown(0.2);
  const lineY = doc.y;
  doc.moveTo(doc.page.margins.left, lineY).lineTo(doc.page.width - doc.page.margins.right, lineY)
    .lineWidth(1.1).strokeColor("#334155").stroke();

  const availableHeight = lineY - startY - 3;
  doc.font(boldFont);
  const maxTextWidth = Math.max(...lines.map((l) => doc.fontSize(l.size).widthOfString(l.text)));
  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const clearance = (usableWidth - maxTextWidth) / 2 - 8;
  const logoSize = Math.max(0, Math.min(38, availableHeight, clearance));
  if (logoSize >= 14) {
    const logoY = lineY - 3 - logoSize;
    if (fs.existsSync(GOVT_LOGO_PATH)) { try { doc.image(GOVT_LOGO_PATH, doc.page.margins.left, logoY, { fit: [logoSize, logoSize] }); } catch { /* skip */ } }
    if (fs.existsSync(SCHOOL_LOGO_PATH)) { try { doc.image(SCHOOL_LOGO_PATH, doc.page.width - doc.page.margins.right - logoSize, logoY, { fit: [logoSize, logoSize] }); } catch { /* skip */ } }
  }

  doc.moveDown(0.3);
  if (titleText) {
    // Same rule as drawLetterhead above: ALL CAPS, hyphen never em-dash.
    doc.fontSize(10).font(boldFont).fillColor(titleColor)
      .text(String(titleText).replace(/\u2014/g, "-").toUpperCase(), { align: "center", lineGap: 0 });
    doc.moveDown(0.25);
  }
}

// Draws a full NECTA-style bordered grid over a table region: an outer box,
// a horizontal line under every row (including the header), and a vertical
// line at every column boundary (including the left/right edges). This is
// the shared "mistari" (grid lines) treatment requested for every exported
// table across Contributions, Food Contribution, TAMS, Student Management
// and Hostel Management PDFs - matching the look already used for the
// Results Management tables (see drawVLines in resultsController.js).
//
// `colX` - array of each column's left x position, e.g. [left, left+100, left+200].
// `tableRight` - the x position of the table's right edge.
// `rowYs` - array of every row boundary's y position, from the very top of
//           the header down to the bottom of the last row (so N rows need
//           N+1 entries).
function drawTableGrid(doc, colX, tableRight, rowYs, color = "#94A3B8", lineWidth = 0.6) {
  const top = rowYs[0];
  const bottom = rowYs[rowYs.length - 1];
  doc.strokeColor(color).lineWidth(lineWidth);
  // Vertical lines - one at each column edge, plus the table's right border.
  [...colX, tableRight].forEach((x) => {
    doc.moveTo(x, top).lineTo(x, bottom).stroke();
  });
  // Horizontal lines - one under every row, including the header and the
  // very top of the table.
  rowYs.forEach((y) => {
    doc.moveTo(colX[0], y).lineTo(tableRight, y).stroke();
  });
  // Restore the standard line width so any other stroke() calls drawn
  // right after this (row shading borders, section dividers, etc.) aren't
  // silently left thin - PDFKit's lineWidth is shared graphics state.
  doc.lineWidth(1);
}

// Student Management's own table colour scheme - pale yellow header, cream
// data rows, navy grid/text - matching the reference screenshot supplied
// for this module (the page itself stays plain white; only the table uses
// this scheme). Every Student Management PDF with a table (class list,
// Download Report bundle) uses this, while every other module keeps its
// existing slate/white table colours.
const STUDENT_THEME = {
  headerBg: "#FCEEA6",
  rowBg: "#FFFDEB",
  rowAltBg: "#FFF6C6",
  border: "#2A4B7C",
  text: "#12294D",
};

// Builds the absolute base URL of THIS server from the incoming request
// (works on Render and locally alike - `trust proxy` is enabled in
// index.js so req.protocol correctly reports "https" behind Render's
// proxy instead of always "http"). Shared by every controller that needs
// to build a per-record verification link (Joining Instructions, Identity
// Cards) - the one exception is the GENERIC footer QR above, which has no
// `req` available (generated once at server start-up) and uses
// BACKEND_PUBLIC_URL/RENDER_EXTERNAL_URL instead.
function requestBaseUrl(req) {
  return `${req.protocol}://${req.get("host")}`;
}

module.exports = {
  drawLetterhead, drawFooter, drawTableGrid, STUDENT_THEME,
  LOGO_PATH: LEGACY_LOGO_PATH, SCHOOL_LOGO_PATH, GOVT_LOGO_PATH,
  drawLetterheadSw, generateQrPngBuffer, requestBaseUrl,
};
