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
const jwt = require("jsonwebtoken");
const { query } = require("../db/db");
const { generateQrPngBuffer, requestBaseUrl } = require("../utils/pdfHeader");
const { recordAudit } = require("../utils/auditLogger");
const { cloudinaryResized } = require("../middleware/upload");
const { DEFAULT_CONTENT, sanitizeContent, resolveContent } = require("../utils/joiningContent");
const { renderJoiningPdf } = require("../utils/joiningPdf");

const MAX_DOWNLOADS_PER_APPLICANT = 5;
const EXAM_NUMBER_RE = /^PS\d{7}-\d{4}$/;

const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
const buildDedupeKey = (first, middle, last, examNo) =>
  `${norm(first)}|${norm(middle)}|${norm(last)}|${String(examNo || "").trim().toUpperCase()}`;

const ORDINALS_SW = { 1: "kwanza", 2: "pili", 3: "tatu", 4: "nne", 5: "tano" };
const ordinalSw = (n) => ORDINALS_SW[n] || `${n}`;

// Validates the shared fields for both the public submission and the staff
// manual-issue form - returns an error message string, or null if valid.
function validateApplicationFields({ first_name, middle_name, last_name, district, ward, village, exam_number, exam_year }) {
  if (!first_name || !String(first_name).trim()) return "Tafadhali jaza Jina la Kwanza.";
  if (!last_name || !String(last_name).trim()) return "Tafadhali jaza Jina la Ukoo.";
  if (!district || !String(district).trim()) return "Tafadhali jaza Wilaya.";
  if (!ward || !String(ward).trim()) return "Tafadhali jaza Kata.";
  if (!village || !String(village).trim()) return "Tafadhali jaza Mtaa/Kijiji.";
  const tooLong = (v, n) => v != null && String(v).trim().length > n;
  if ([first_name, middle_name, last_name].some((v) => tooLong(v, 60))) return "Jina ni refu kupita kiasi (herufi 60 zinatosha).";
  if ([district, ward, village].some((v) => tooLong(v, 100))) return "Wilaya, Kata au Mtaa/Kijiji ni ndefu kupita kiasi.";
  if (!exam_number || !EXAM_NUMBER_RE.test(String(exam_number).trim().toUpperCase())) {
    return "Namba ya Mtihani si sahihi. Tumia mfumo: PS1234567-0001.";
  }
  const yearNum = Number(exam_year);
  const nowYear = new Date().getFullYear();
  // Standard VII is finished before Form One starts, so it can never be in the future.
  if (!Number.isInteger(yearNum) || yearNum < 2000 || yearNum > nowYear) {
    return "Mwaka wa kumaliza Darasa la Saba si sahihi.";
  }
  return null;
}

// ── PDF generation (shared by the public download, the staff manual-issue
//    flow, the blank printable form and the staff preview) ───────────────
// Downloads the Head Master's signature uploaded in Settings -> Signature &
// Stamp, so every Joining Instruction is signed automatically. Never throws:
// no signature (or a slow/broken link) just leaves the dotted line instead.
async function fetchHeadmasterSignature() {
  try {
    const { rows } = await query(`SELECT headmaster_signature_url FROM school_settings WHERE id = 1`);
    const url = rows[0]?.headmaster_signature_url;
    if (!url) return null;
    const resp = await fetch(cloudinaryResized(url, "w_500,h_500,c_limit,q_100,f_png"));
    if (!resp.ok) return null;
    return Buffer.from(await resp.arrayBuffer());
  } catch { return null; }
}

async function loadJoiningSettings() {
  const { rows } = await query(`SELECT requirements_text, admission_year, is_published, content, updated_at FROM joining_settings WHERE id = 1`);
  const row = rows[0] || {};
  return {
    admission_year: row.admission_year || new Date().getFullYear(),
    is_published: !!row.is_published,
    content: resolveContent(row.content),
    has_custom_content: !!row.content,
    updated_at: row.updated_at || null,
  };
}

const safeFileName = (s) => String(s || "").replace(/[^A-Za-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "Mwanafunzi";

async function streamJoiningPdf(req, res, { fullName, verifyRef, filename, content, admissionYear, download = false }) {
  const settings = content ? null : await loadJoiningSettings();
  const [qrBuf, signatureBuf] = await Promise.all([
    generateQrPngBuffer(`${requestBaseUrl(req)}/api/public/joining/verify/${verifyRef}`, 220),
    fetchHeadmasterSignature(),
  ]);
  res.setHeader("Content-Type", "application/pdf");
  // `download` = save the file (phones open "inline" PDFs in a viewer and
  // many never offer a save option); otherwise open it for reading.
  res.setHeader("Content-Disposition", `${download ? "attachment" : "inline"}; filename="${filename}"`);
  renderJoiningPdf(res, {
    content: content || settings.content,
    year: admissionYear || settings?.admission_year,
    fullName,
    signatureBuf,
    qrBuf,
  });
}

const applicantName = (app) => [app.first_name, app.middle_name, app.last_name].filter(Boolean).join(" ").toUpperCase();
// The applicant's Form One year is the year AFTER they finished Standard VII
// (e.g. Std VII 2026 -> Form One 2027). Previously the PDF could show the
// Std VII year as the Form One year. Falls back to the admission year set by
// the school when the record has no valid exam year.
const formOneYearFor = (app) => {
  const y = Number(app.exam_year);
  return Number.isInteger(y) && y >= 2000 ? y + 1 : undefined;
};
const streamApplicantPdf = (req, res, app) => {
  const fullName = applicantName(app);
  return streamJoiningPdf(req, res, {
    download: req.query.dl === "1",
    fullName, verifyRef: `JI-${app.id}-${signRef("JI", app.id)}`, filename: `Joining-Instruction-${safeFileName(fullName)}.pdf`,
    admissionYear: formOneYearFor(app),
  });
};

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
    await streamApplicantPdf(req, res, appRes.rows[0]);
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
const { signRef, verifyRef, maskName } = require("../utils/qrSign");

const verifyJoiningDocument = async (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Cache-Control", "no-store");
  try {
    const ref = String(req.params.ref || "");
    if (ref.toLowerCase() === "blank") {
      return res.send(renderVerifyPage({ heading: "Fomu Tupu ya Maelekezo ya Kujiunga", details: [] }));
    }
    const m = ref.match(/^JI-(\d+)(?:-([a-f0-9]{20}))?$/i);
    if (!m) return res.status(404).send(renderVerifyPage({ heading: "Rejea Batili", notFound: true }));
    const signed = verifyRef("JI", m[1], (m[2] || "").toLowerCase());
    if (m[2] && !signed) return res.status(404).send(renderVerifyPage({ heading: "Rejea Batili", notFound: true }));

    const { rows } = await query(
      `SELECT first_name, middle_name, last_name, exam_number FROM joining_applications WHERE id = $1`,
      [m[1]]
    );
    if (!rows.length) return res.status(404).send(renderVerifyPage({ heading: "Rejea Haikupatikana", notFound: true }));

    const app = rows[0];
    const fullName = [app.first_name, app.middle_name, app.last_name].filter(Boolean).join(" ").toUpperCase();
    return res.send(renderVerifyPage({
      heading: "Maelekezo ya Kujiunga na Kidato cha Kwanza",
      // Full details only for a genuinely signed QR (see utils/qrSign.js).
      details: signed
        ? [{ label: "Mwanafunzi", value: fullName }, { label: "Namba ya Mtihani", value: app.exam_number }]
        : [{ label: "Mwanafunzi", value: maskName(fullName) }],
    }));
  } catch {
    return res.status(500).send(renderVerifyPage({ heading: "Hitilafu ya Mfumo", notFound: true }));
  }
};

// ══════════════════════ STAFF ═══════════════════════════════════════════
// GET /api/joining/settings - Admin/Second Master. Returns the editable
// content (saved, or the built-in default) plus the default itself so the
// editor can offer "Rudisha maudhui ya awali".
const getJoiningSettings = async (_req, res, next) => {
  try {
    const s = await loadJoiningSettings();
    res.json({ ...s, default_content: DEFAULT_CONTENT });
  } catch (err) { next(err); }
};

// PUT /api/joining/settings - { content, admission_year }. Editing is only
// allowed while the form is NOT published - the school reviews/edits first,
// previews the PDF, then publishes. To change a published form, turn it off
// first (Edit & Publish -> "Turn Off to Edit").
const updateJoiningSettings = async (req, res, next) => {
  try {
    const current = await loadJoiningSettings();
    if (current.is_published) {
      return res.status(409).json({ message: "Joining Instruction imechapishwa tayari. Zima uchapishaji kwanza ili kuhariri." });
    }
    const { content, admission_year } = req.body || {};
    const cleaned = sanitizeContent(content);
    if (cleaned.error) return res.status(400).json({ message: cleaned.error });
    const yearNum = Number(admission_year);
    const nowYear = new Date().getFullYear();
    if (!Number.isInteger(yearNum) || yearNum < 2000 || yearNum > nowYear + 2) {
      return res.status(400).json({ message: "Mwaka wa kujiunga si sahihi." });
    }
    await query(
      `UPDATE joining_settings SET content = $1::jsonb, admission_year = $2, updated_by = $3, updated_at = NOW() WHERE id = 1`,
      [JSON.stringify(cleaned.content), yearNum, req.user.id]
    );
    recordAudit({
      actor: req.user, req, action: "joining.update_content",
      entityType: "joining_settings", entityId: 1,
      description: "Joining Instruction content updated.",
    }).catch(() => {});
    const s = await loadJoiningSettings();
    res.json({ ...s, default_content: DEFAULT_CONTENT });
  } catch (err) { next(err); }
};

// POST /api/joining/preview-pdf - { content, admission_year } (unsaved
// edits) - renders exactly what parents will download, with a sample name,
// so the school can check it BEFORE saving/publishing. Nothing is stored.
const previewJoiningPdf = async (req, res, next) => {
  try {
    const { content, admission_year } = req.body || {};
    let resolved = null;
    if (content) {
      const cleaned = sanitizeContent(content);
      if (cleaned.error) return res.status(400).json({ message: cleaned.error });
      resolved = cleaned.content;
    } else {
      resolved = (await loadJoiningSettings()).content;
    }
    const yearNum = Number(admission_year) || (await loadJoiningSettings()).admission_year;
    await streamJoiningPdf(req, res, {
      fullName: "JINA LA MWANAFUNZI (MFANO)", verifyRef: "blank",
      filename: "Joining-Instruction-Preview.pdf", content: resolved, admissionYear: yearNum,
    });
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
    await streamJoiningPdf(req, res, { fullName: null, verifyRef: "blank", filename: "Joining-Instruction-Fomu-Tupu.pdf" });
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

    await streamApplicantPdf(req, res, row);
  } catch (err) { next(err); }
};

module.exports = {
  publicJoiningStatus, submitJoining, downloadJoiningPdf,
  getJoiningSettings, updateJoiningSettings, publishJoiningSettings,
  listJoiningApplications, getJoiningStats, manualIssueJoining,
  exportJoiningApplicationsCsv, deleteJoiningApplication, deleteAllJoiningApplications,
  downloadBlankJoiningPdf, verifyJoiningDocument, previewJoiningPdf,
};
