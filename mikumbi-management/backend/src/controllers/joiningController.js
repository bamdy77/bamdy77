// controllers/joiningController.js - JOINING INSTRUCTIONS (Form I intake)
//
// Two audiences:
//   1. PUBLIC (no login) - a parent/guardian of a prospective Form I
//      student fills a short form (names, location, Std VII exam number +
//      year) and downloads a "Joining Instruction" PDF. Every submission is
//      recorded so Admin/Second Master can see who has taken a form.
//   2. STAFF (Admin/Second Master/Academic Master) - manage the published
//      admission requirements text, publish/unpublish the online form, see
//      the list of applicants, and issue the exact same PDF in person to a
//      walk-in family.
//
// One row per applicant (matched by name + exam number) in
// joining_applications - repeat downloads increment download_count instead
// of creating duplicate rows, capped at 5 (per spec).
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const PDFDocument = require("pdfkit");
const { query } = require("../db/db");
const { formatTZ } = require("../utils/tz");
const { drawLetterheadSw, drawFooter, generateQrPngBuffer, SCHOOL_LOGO_PATH, requestBaseUrl } = require("../utils/pdfHeader");
const { recordAudit } = require("../utils/auditLogger");

const MAX_DOWNLOADS_PER_APPLICANT = 5;
const EXAM_NUMBER_RE = /^PS\d{7}-\d{4}$/;

const ARIMO_REGULAR = path.join(__dirname, "..", "assets", "fonts", "Arimo-Regular.ttf");
const ARIMO_BOLD = path.join(__dirname, "..", "assets", "fonts", "Arimo-Bold.ttf");

const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
const buildDedupeKey = (first, middle, last, examNo) =>
  `${norm(first)}|${norm(middle)}|${norm(last)}|${String(examNo || "").trim().toUpperCase()}`;

const ORDINALS_SW = { 1: "kwanza", 2: "pili", 3: "tatu", 4: "nne", 5: "tano" };
const ordinalSw = (n) => ORDINALS_SW[n] || `${n}`;

// Validates the shared fields for both the public submission and the staff
// manual-issue form - returns an error message string, or null if valid.
function validateApplicationFields({ first_name, last_name, district, ward, village, exam_number, exam_year }) {
  if (!first_name || !String(first_name).trim()) return "Tafadhali jaza Jina la Kwanza.";
  if (!last_name || !String(last_name).trim()) return "Tafadhali jaza Jina la Ukoo.";
  if (!district || !String(district).trim()) return "Tafadhali jaza Wilaya.";
  if (!ward || !String(ward).trim()) return "Tafadhali jaza Kata.";
  if (!village || !String(village).trim()) return "Tafadhali jaza Mtaa/Kijiji.";
  if (!exam_number || !EXAM_NUMBER_RE.test(String(exam_number).trim().toUpperCase())) {
    return "Namba ya Mtihani si sahihi. Tumia mfumo: PS1234567-0001.";
  }
  const yearNum = Number(exam_year);
  const nowYear = new Date().getFullYear();
  if (!Number.isInteger(yearNum) || yearNum < 2000 || yearNum > nowYear + 1) {
    return "Mwaka wa kumaliza Darasa la Saba si sahihi.";
  }
  return null;
}

// ── PDF generation (shared by the public download and the staff manual-
//    issue "give the same form" flow) ──────────────────────────────────────
function registerJoiningFonts(doc) {
  doc.registerFont("JI_REG", ARIMO_REGULAR);
  doc.registerFont("JI_BOLD", ARIMO_BOLD);
}

// A faint, repeated "MIKUMBI SECONDARY SCHOOL" watermark across the page -
// low-opacity so it never interferes with reading the document itself.
// IMPORTANT: doc.save()/doc.restore() only protect PDFKit's *graphics*
// state (fill color, opacity, transform) - NOT the text cursor (doc.x/
// doc.y). Every doc.text() call here moves that cursor to wherever the
// watermark text finished, which - left unguarded - silently shoved
// everything drawn afterwards (the letterhead, the whole document) down
// the page. Saving/restoring x/y ourselves is what keeps this purely
// cosmetic, with zero effect on where real content starts.
function drawWatermark(doc) {
  const savedX = doc.x, savedY = doc.y;
  doc.save();
  doc.fillColor("#153810").opacity(0.06);
  doc.font("JI_BOLD").fontSize(46);
  doc.rotate(-35, { origin: [doc.page.width / 2, doc.page.height / 2] });
  doc.text("MIKUMBI SECONDARY SCHOOL", -120, doc.page.height / 2 - 160, { width: doc.page.width + 240, align: "center" });
  doc.text("MIKUMBI SECONDARY SCHOOL", -120, doc.page.height / 2 - 20, { width: doc.page.width + 240, align: "center" });
  doc.text("MIKUMBI SECONDARY SCHOOL", -120, doc.page.height / 2 + 120, { width: doc.page.width + 240, align: "center" });
  doc.restore();
  doc.x = savedX; doc.y = savedY;
}

// Builds the absolute base URL of THIS server from the incoming request -
// shared with every controller that needs a per-record verification link
// (Identity Cards below). See requestBaseUrl in utils/pdfHeader.js for the
// full explanation.

// Draws a plain, unmodified verification QR - no logo overlaid on the
// pattern itself. The QR now encodes a LINK to /api/public/joining/verify/…
// (see verifyJoiningDocument below) rather than raw text: scanning it opens
// a small branded page - school logo top-center, then the confirmation
// message - instead of dumping raw text into the phone's QR reader.
function drawQr(doc, qrBuf, x, y, size) {
  doc.image(qrBuf, x, y, { width: size, height: size });
}

// Draws the verification QR alone (no caption/instructional text next to
// it - just the code itself) inside a small bordered box pinned near the
// very bottom of the page, above drawFooter's own generation-time/page-
// number band. Sized to the QR itself, not the full page width, so it
// reads as a plain verification mark rather than a wall of text telling
// the person what to do with their phone. Returns nothing; positions
// everything itself using doc.page.height, so call it AFTER all the
// flowing content above it has been written.
function drawVerificationBlock(doc, qrBuf) {
  const left = doc.page.margins.left;
  const qrSize = 60;
  const pad = 10;
  const boxSize = qrSize + pad * 2;
  const footerGap = 16; // clearance above drawFooter's own generation-time/page-number band

  const boxY = doc.page.height - doc.page.margins.bottom - footerGap - boxSize;

  // If the flowing content above would run into this reserved bottom
  // block, push the block (and only the block) onto a fresh page instead
  // of overlapping it.
  let finalBoxY = boxY;
  if (doc.y > boxY - 10) {
    doc.addPage();
    drawWatermark(doc);
    finalBoxY = doc.page.height - doc.page.margins.bottom - footerGap - boxSize;
  }

  doc.save();
  doc.roundedRect(left, finalBoxY, boxSize, boxSize, 8)
    .lineWidth(0.8).fillOpacity(1).fillAndStroke("#F8FAFC", "#CBD5E1");
  doc.restore();

  drawQr(doc, qrBuf, left + pad, finalBoxY + pad, qrSize);
}

async function streamJoiningPdf(req, res, app, requirementsText, admissionYear) {
  const fullName = [app.first_name, app.middle_name, app.last_name].filter(Boolean).join(" ").toUpperCase();
  const verifyUrl = `${requestBaseUrl(req)}/api/public/joining/verify/JI-${app.id}`;
  const qrBuf = await generateQrPngBuffer(verifyUrl, 220);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="Joining-Instruction-${fullName.replace(/\s+/g, "-")}.pdf"`);
  const doc = new PDFDocument({ margin: 40, size: "A4", bufferPages: true });
  doc.pipe(res);
  registerJoiningFonts(doc);
  drawWatermark(doc);

  drawLetterheadSw(doc, `MAELEKEZO YA KUJIUNGA NA KIDATO CHA KWANZA (${admissionYear || new Date().getFullYear()})`, { boldFont: "JI_BOLD" });

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const fullWidth = right - left;

  // Per spec: the downloaded PDF shows ONLY the student's name - district,
  // ward, village, exam number and exam year are still saved to the
  // Applications list (Student Management → Joining Instructions) for
  // Admin/Second Master to review, they just aren't printed here.
  doc.moveDown(0.6);
  doc.font("JI_BOLD").fontSize(15).fillColor("#0A1F5C")
    .text(fullName, left, doc.y, { width: fullWidth, align: "center" });
  doc.moveDown(1);

  doc.font("JI_BOLD").fontSize(11.5).fillColor("#153810").text("MAHITAJI YA KUJIUNGA NA SHULE", left, doc.y, { width: fullWidth });
  doc.moveDown(0.3);
  doc.font("JI_REG").fontSize(10).fillColor("#0F172A")
    .text(
      requirementsText && requirementsText.trim()
        ? requirementsText.trim()
        : "Mahitaji ya kujiunga hayajawekwa bado. Tafadhali wasiliana na Uongozi wa Shule.",
      left, doc.y, { width: fullWidth, align: "left", lineGap: 3 }
    );

  drawVerificationBlock(doc, qrBuf);

  drawFooter(doc, formatTZ);
  doc.end();
}

// A blank, printable version of the Joining Instruction - for Admin/Second
// Master/Academic Master to download and print AHEAD of time, so a
// family who reaches the school with no power/no internet still walks
// away with a real form: the requirements, the letterhead, a generic
// verification QR, and ONE blank line to write the student's name on by
// hand. No applicant data, no per-student QR - this is a template, not a
// record (nothing is written to joining_applications for this).
async function streamBlankJoiningPdf(req, res, requirementsText, admissionYear) {
  const verifyUrl = `${requestBaseUrl(req)}/api/public/joining/verify/blank`;
  const qrBuf = await generateQrPngBuffer(verifyUrl, 220);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="Joining-Instruction-Fomu-Tupu.pdf"`);
  const doc = new PDFDocument({ margin: 40, size: "A4", bufferPages: true });
  doc.pipe(res);
  registerJoiningFonts(doc);
  drawWatermark(doc);

  drawLetterheadSw(doc, `MAELEKEZO YA KUJIUNGA NA KIDATO CHA KWANZA (${admissionYear || new Date().getFullYear()})`, { boldFont: "JI_BOLD" });

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const fullWidth = right - left;

  doc.moveDown(0.6);
  doc.font("JI_BOLD").fontSize(10.5).fillColor("#0F172A").text("Jina la Mwanafunzi: ", left, doc.y, { continued: true, width: fullWidth });
  const labelEndX = doc.x;
  doc.text(" ", { continued: false });
  const lineY = doc.y + 12;
  doc.moveTo(labelEndX + 4, lineY).lineTo(right, lineY).lineWidth(0.8).strokeColor("#334155").stroke();
  doc.y = lineY + 14;

  doc.font("JI_BOLD").fontSize(11.5).fillColor("#153810").text("MAHITAJI YA KUJIUNGA NA SHULE", left, doc.y, { width: fullWidth });
  doc.moveDown(0.3);
  doc.font("JI_REG").fontSize(10).fillColor("#0F172A")
    .text(
      requirementsText && requirementsText.trim()
        ? requirementsText.trim()
        : "Mahitaji ya kujiunga hayajawekwa bado. Tafadhali wasiliana na Uongozi wa Shule.",
      left, doc.y, { width: fullWidth, align: "left", lineGap: 3 }
    );

  drawVerificationBlock(doc, qrBuf);

  drawFooter(doc, formatTZ);
  doc.end();
}

// ══════════════════════ PUBLIC ══════════════════════════════════════════
// GET /api/public/joining/status - only whether the form is open. The
// requirements text itself is NEVER sent to the public status endpoint -
// it belongs on the Joining Instruction PDF only, generated after a real
// submission, never visible to someone who's merely mid-way through
// filling the form (per spec).
const publicJoiningStatus = async (_req, res, next) => {
  try {
    const { rows } = await query(`SELECT is_published FROM joining_settings WHERE id = 1`);
    res.json({ is_published: !!rows[0]?.is_published });
  } catch (err) { next(err); }
};

// POST /api/public/joining/submit - registers/increments the applicant and
// returns a short-lived token used to fetch the actual PDF (kept as two
// steps so the "Wasilisha → NDIYO/GHAIRI → Pakua" flow in the spec maps
// exactly to submit-then-download, without double-counting on a retry).
const submitJoining = async (req, res, next) => {
  try {
    const settingsRes = await query(`SELECT is_published FROM joining_settings WHERE id = 1`);
    if (!settingsRes.rows[0]?.is_published) {
      return res.status(403).json({ message: "Fomu za Joining Instruction bado hazijachapishwa mtandaoni. Tafadhali wasiliana na shule." });
    }
    const body = req.body || {};
    const err = validateApplicationFields(body);
    if (err) return res.status(400).json({ message: err });

    const examNo = String(body.exam_number).trim().toUpperCase();
    const yearNum = Number(body.exam_year);
    const dedupeKey = buildDedupeKey(body.first_name, body.middle_name, body.last_name, examNo);

    const existing = await query(`SELECT * FROM joining_applications WHERE dedupe_key = $1`, [dedupeKey]);
    let row;
    if (existing.rows.length) {
      const cur = existing.rows[0];
      if (cur.download_count >= MAX_DOWNLOADS_PER_APPLICANT) {
        return res.status(429).json({
          message: `Umefikia kikomo cha kupakua Joining Instruction (mara ${MAX_DOWNLOADS_PER_APPLICANT}) kwa mwanafunzi huyu.`,
          limitReached: true,
        });
      }
      const upd = await query(
        `UPDATE joining_applications SET download_count = download_count + 1, last_downloaded_at = NOW() WHERE id = $1 RETURNING *`,
        [cur.id]
      );
      row = upd.rows[0];
    } else {
      const ins = await query(
        `INSERT INTO joining_applications
           (first_name, middle_name, last_name, district, ward, village, exam_number, exam_year, dedupe_key, source, download_count, first_downloaded_at, last_downloaded_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'online',1,NOW(),NOW())
         RETURNING *`,
        [
          String(body.first_name).trim(), (body.middle_name ? String(body.middle_name).trim() : null),
          String(body.last_name).trim(), String(body.district).trim(), String(body.ward).trim(), String(body.village).trim(),
          examNo, yearNum, dedupeKey,
        ]
      );
      row = ins.rows[0];
    }

    const token = jwt.sign({ type: "joining_pdf", application_id: row.id }, process.env.JWT_SECRET, { expiresIn: "15m" });
    res.json({
      ok: true,
      token,
      download_count: row.download_count,
      message: row.download_count > 1
        ? `Umewasilisha taarifa zako. Hii ni mara ya ${ordinalSw(row.download_count)} kupakua Joining Instruction kwa mwanafunzi huyu.`
        : "Umewasilisha taarifa zako kikamilifu. Sasa unaweza kupakua Joining Instruction yako.",
    });
  } catch (err) { next(err); }
};

// GET /api/public/joining/download-pdf?token=...
const downloadJoiningPdf = async (req, res, next) => {
  try {
    const token = req.query.token;
    if (!token) return res.status(400).json({ message: "Kiungo cha kupakua hakikupatikana." });
    let decoded;
    try { decoded = jwt.verify(token, process.env.JWT_SECRET); }
    catch { return res.status(401).json({ message: "Muda wa kupakua umeisha. Tafadhali jaza fomu tena." }); }
    if (decoded.type !== "joining_pdf" || !decoded.application_id) {
      return res.status(401).json({ message: "Kiungo cha kupakua si sahihi." });
    }
    const appRes = await query(`SELECT * FROM joining_applications WHERE id = $1`, [decoded.application_id]);
    if (!appRes.rows.length) return res.status(404).json({ message: "Taarifa za mwombaji hazikupatikana." });
    const settingsRes = await query(`SELECT requirements_text, admission_year FROM joining_settings WHERE id = 1`);
    await streamJoiningPdf(req, res, appRes.rows[0], settingsRes.rows[0]?.requirements_text || "", settingsRes.rows[0]?.admission_year);
  } catch (err) { next(err); }
};

// GET /api/public/joining/verify/:ref - the page a phone opens after
// scanning a Joining Instruction's QR code. No login, no JSON - a small
// branded HTML page: the school badge/logo top-center, then a plain
// confirmation that the document is genuine. `ref` is either "JI-<id>"
// (a specific applicant's issued PDF) or "blank" (the pre-printed blank
// form template, which carries no per-applicant data). The page itself
// (logo top-center, message below) is shared with every other QR in the
// system - see utils/verifyPage.js.
const { renderVerifyPage } = require("../utils/verifyPage");

const verifyJoiningDocument = async (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  try {
    const ref = String(req.params.ref || "");
    if (ref.toLowerCase() === "blank") {
      return res.send(renderVerifyPage({ heading: "Fomu Tupu ya Maelekezo ya Kujiunga", details: [] }));
    }
    const m = ref.match(/^JI-(\d+)$/i);
    if (!m) return res.status(404).send(renderVerifyPage({ heading: "Rejea Batili", notFound: true }));

    const { rows } = await query(
      `SELECT first_name, middle_name, last_name, exam_number FROM joining_applications WHERE id = $1`,
      [m[1]]
    );
    if (!rows.length) return res.status(404).send(renderVerifyPage({ heading: "Rejea Haikupatikana", notFound: true }));

    const app = rows[0];
    const fullName = [app.first_name, app.middle_name, app.last_name].filter(Boolean).join(" ").toUpperCase();
    return res.send(renderVerifyPage({
      heading: "Maelekezo ya Kujiunga na Kidato cha Kwanza",
      details: [
        { label: "Mwanafunzi", value: fullName },
        { label: "Namba ya Mtihani", value: app.exam_number },
      ],
    }));
  } catch {
    return res.status(500).send(renderVerifyPage({ heading: "Hitilafu ya Mfumo", notFound: true }));
  }
};

// ══════════════════════ STAFF ═══════════════════════════════════════════
// GET /api/joining/settings - Admin/Second Master
const getJoiningSettings = async (_req, res, next) => {
  try {
    const { rows } = await query(`SELECT requirements_text, admission_year, is_published, updated_at FROM joining_settings WHERE id = 1`);
    res.json(rows[0] || { requirements_text: "", admission_year: new Date().getFullYear(), is_published: false });
  } catch (err) { next(err); }
};

// PUT /api/joining/settings - { requirements_text, admission_year }
const updateJoiningSettings = async (req, res, next) => {
  try {
    const { requirements_text, admission_year } = req.body || {};
    const yearNum = Number(admission_year);
    const { rows } = await query(
      `UPDATE joining_settings SET requirements_text = $1, admission_year = COALESCE($2, admission_year), updated_by = $3, updated_at = NOW() WHERE id = 1
       RETURNING requirements_text, admission_year, is_published, updated_at`,
      [requirements_text || "", Number.isInteger(yearNum) ? yearNum : null, req.user.id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
};

// POST /api/joining/settings/publish - { published: true|false }
const publishJoiningSettings = async (req, res, next) => {
  try {
    const published = !!(req.body && req.body.published);
    const { rows } = await query(
      `UPDATE joining_settings SET is_published = $1, updated_by = $2, updated_at = NOW() WHERE id = 1
       RETURNING is_published, updated_at`,
      [published, req.user.id]
    );
    recordAudit({
      actor: req.user, req,
      action: published ? "joining.publish" : "joining.unpublish",
      entityType: "joining_settings", entityId: 1,
      description: `Online Joining Instruction form ${published ? "published" : "unpublished"}.`,
    }).catch(() => {});
    res.json(rows[0]);
  } catch (err) { next(err); }
};

// GET /api/joining/applications - Admin/Second Master only (per spec).
const listJoiningApplications = async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, first_name, middle_name, last_name, district, ward, village,
              exam_number, exam_year, source, download_count, created_at,
              first_downloaded_at, last_downloaded_at
       FROM joining_applications ORDER BY created_at DESC LIMIT 1000`
    );
    res.json(rows);
  } catch (err) { next(err); }
};

// GET /api/joining/applications/export - Admin/Second Master. Downloads the
// full applicants list (online + issued at school) as a CSV, for handing
// to the office or opening in Excel - same rows as the on-screen table.
const csvEscape = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const exportJoiningApplicationsCsv = async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT first_name, middle_name, last_name, district, ward, village,
              exam_number, exam_year, source, download_count, created_at
       FROM joining_applications ORDER BY created_at DESC`
    );
    const header = ["Jina la Kwanza", "Jina la Kati", "Jina la Ukoo", "Wilaya", "Kata", "Mtaa/Kijiji", "Namba ya Mtihani", "Mwaka", "Chanzo", "Idadi ya Kupakua", "Tarehe"];
    const lines = [header.join(",")];
    rows.forEach((r) => {
      lines.push([
        r.first_name, r.middle_name || "", r.last_name, r.district, r.ward, r.village,
        r.exam_number, r.exam_year, r.source === "online" ? "Mtandaoni" : "Shuleni", r.download_count,
        new Date(r.created_at).toISOString(),
      ].map(csvEscape).join(","));
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="joining-applications-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send("\uFEFF" + lines.join("\r\n")); // BOM so Excel opens Kiswahili accents correctly
  } catch (err) { next(err); }
};

// DELETE /api/joining/applications/:id - Admin/Second Master.
const deleteJoiningApplication = async (req, res, next) => {
  try {
    const { rowCount } = await query(`DELETE FROM joining_applications WHERE id = $1`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ message: "Application not found." });
    recordAudit({
      actor: req.user, req, action: "joining.delete_application",
      entityType: "joining_application", entityId: Number(req.params.id),
      description: `Deleted joining application #${req.params.id}.`,
    }).catch(() => {});
    res.json({ success: true });
  } catch (err) { next(err); }
};

// DELETE /api/joining/applications - Admin/Second Master. Wipes the WHOLE
// applicants list (e.g. starting a fresh intake year) - the frontend
// confirms this explicitly before calling it, since it can't be undone.
const deleteAllJoiningApplications = async (req, res, next) => {
  try {
    const { rowCount } = await query(`DELETE FROM joining_applications`);
    recordAudit({
      actor: req.user, req, action: "joining.delete_all_applications",
      entityType: "joining_applications", entityId: null,
      description: `Deleted all ${rowCount} joining application(s).`,
    }).catch(() => {});
    res.json({ success: true, deleted: rowCount });
  } catch (err) { next(err); }
};

// GET /api/joining/blank-pdf - Admin/Second Master/Academic Master. A
// printable blank Joining Instruction (one blank line for the student's
// name) to keep on hand for when the office has no power/no internet.
const downloadBlankJoiningPdf = async (req, res, next) => {
  try {
    const settingsRes = await query(`SELECT requirements_text, admission_year FROM joining_settings WHERE id = 1`);
    await streamBlankJoiningPdf(req, res, settingsRes.rows[0]?.requirements_text || "", settingsRes.rows[0]?.admission_year);
  } catch (err) { next(err); }
};

// GET /api/joining/stats - counts for "zilizopakuliwa mtandaoni" vs
// "zilizotolewa shuleni" (one row = one unique applicant, regardless of how
// many times within their own 5-download cap they've re-downloaded).
const getJoiningStats = async (_req, res, next) => {
  try {
    const { rows } = await query(`SELECT source, COUNT(*)::int AS count FROM joining_applications GROUP BY source`);
    const stats = { online: 0, manual: 0 };
    rows.forEach((r) => { stats[r.source] = r.count; });
    res.json({ online: stats.online, manual: stats.manual, total: stats.online + stats.manual });
  } catch (err) { next(err); }
};

// POST /api/joining/manual - Admin/Second Master/Academic Master fill the
// exact same fields for a walk-in family, then get the exact same PDF -
// this is a normal authenticated request (no NDIYO/GHAIRI confirm needed;
// the frontend confirms locally before calling this), streamed directly.
const manualIssueJoining = async (req, res, next) => {
  try {
    const body = req.body || {};
    const err = validateApplicationFields(body);
    if (err) return res.status(400).json({ message: err });

    const examNo = String(body.exam_number).trim().toUpperCase();
    const yearNum = Number(body.exam_year);
    const dedupeKey = buildDedupeKey(body.first_name, body.middle_name, body.last_name, examNo);

    const existing = await query(`SELECT * FROM joining_applications WHERE dedupe_key = $1`, [dedupeKey]);
    let row;
    if (existing.rows.length) {
      const cur = existing.rows[0];
      if (cur.download_count >= MAX_DOWNLOADS_PER_APPLICANT) {
        return res.status(429).json({ message: `Mwanafunzi huyu tayari amefikia kikomo cha nakala ${MAX_DOWNLOADS_PER_APPLICANT}.` });
      }
      const upd = await query(
        `UPDATE joining_applications SET download_count = download_count + 1, last_downloaded_at = NOW() WHERE id = $1 RETURNING *`,
        [cur.id]
      );
      row = upd.rows[0];
    } else {
      const ins = await query(
        `INSERT INTO joining_applications
           (first_name, middle_name, last_name, district, ward, village, exam_number, exam_year, dedupe_key, source, issued_by, download_count, first_downloaded_at, last_downloaded_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'manual',$10,1,NOW(),NOW())
         RETURNING *`,
        [
          String(body.first_name).trim(), (body.middle_name ? String(body.middle_name).trim() : null),
          String(body.last_name).trim(), String(body.district).trim(), String(body.ward).trim(), String(body.village).trim(),
          examNo, yearNum, dedupeKey, req.user.id,
        ]
      );
      row = ins.rows[0];
    }

    const settingsRes = await query(`SELECT requirements_text, admission_year FROM joining_settings WHERE id = 1`);
    await streamJoiningPdf(req, res, row, settingsRes.rows[0]?.requirements_text || "", settingsRes.rows[0]?.admission_year);
  } catch (err) { next(err); }
};

module.exports = {
  publicJoiningStatus, submitJoining, downloadJoiningPdf,
  getJoiningSettings, updateJoiningSettings, publishJoiningSettings,
  listJoiningApplications, getJoiningStats, manualIssueJoining,
  exportJoiningApplicationsCsv, deleteJoiningApplication, deleteAllJoiningApplications,
  downloadBlankJoiningPdf, verifyJoiningDocument,
};
