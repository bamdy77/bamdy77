// controllers/idCardController.js - Student Identity Cards.
//
// Reuses the SAME photo already captured at enrollment (Student Management
// → Enroll Student), which already gets its background automatically
// replaced with the school's standard ID-photo blue (#0096FF - see
// frontend/src/utils/photoBackground.js) at the moment it's taken. That is
// a deliberate design choice, not a shortcut: re-photographing every
// student specifically for ID cards would mean two photo sessions, two
// chances for a bad shot, and two images to keep in sync per student. One
// canonical, already-processed photo - captured once, at reasonably high
// resolution and JPEG quality (see PHOTO_JPEG_QUALITY in
// schoolManagementBundle.jsx) - is sharp enough for a CR80 card, which
// prints the photo at under 25×29mm.
//
// Card size: CR80 (standard ID card), 86mm × 54mm - the same size a
// school would actually cut/laminate.
const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const { query } = require("../db/db");
const { formatTZ } = require("../utils/tz");
const { SCHOOL_LOGO_PATH, generateQrPngBuffer, requestBaseUrl } = require("../utils/pdfHeader");
const { cloudinaryResized } = require("../middleware/upload");
const { renderVerifyPage } = require("../utils/verifyPage");

const MM = 2.83465; // points per mm
const CARD_W = 86 * MM;
const CARD_H = 54 * MM;

// Pale, desaturated background - a faint blue-gold-green tint rather than
// flat white, so the printed card reads as deliberately branded without
// competing with the photo or text for attention.
const CARD_BG = "#F2F4EF";
const NAVY = "#0A1F5C";
const GOLD = "#C99A2E";

const FORM_ORDER = ["Form I", "Form II", "Form III", "Form IV"];

// A student's admission_date year is always their Form I year (this
// school only intakes at Form I - see the Joining Instructions module) -
// so Form II/III/IV are simply +1/+2/+3 from it, regardless of which form
// the student is currently in.
function formYearTable(admissionDate) {
  const form1Year = admissionDate ? new Date(admissionDate).getFullYear() : new Date().getFullYear();
  return FORM_ORDER.map((label, i) => ({ label, year: form1Year + i }));
}

const ARIMO_REGULAR = path.join(__dirname, "..", "assets", "fonts", "Arimo-Regular.ttf");
const ARIMO_BOLD = path.join(__dirname, "..", "assets", "fonts", "Arimo-Bold.ttf");
function registerCardFonts(doc) {
  doc.registerFont("IDC_REG", ARIMO_REGULAR);
  doc.registerFont("IDC_BOLD", ARIMO_BOLD);
}

// Fetches a small, Cloudinary-resized JPEG for embedding (never the full
// multi-MB original) - same pattern studentController's Profile PDF uses.
async function fetchPhotoBuffer(photoUrl) {
  if (!photoUrl) return null;
  try {
    const res = await fetch(cloudinaryResized(photoUrl, "w_360,h_420,c_fill,q_auto:best,f_auto"));
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch { return null; }
}

async function loadCardStudents(studentIds) {
  const { rows } = await query(
    `SELECT id, first_name, middle_name, last_name, form, gender, reg_no, admission_no, admission_date, photo_url
     FROM students WHERE id = ANY($1::int[]) ORDER BY form ASC, first_name ASC`,
    [studentIds]
  );
  return rows;
}

async function loadCardBranding() {
  const { rows } = await query(
    `SELECT headmaster_signature_url, head_of_school_name, head_of_school_title FROM school_settings WHERE id = 1`
  );
  const row = rows[0] || {};
  let signatureBuf = null;
  if (row.headmaster_signature_url) {
    try {
      const res = await fetch(cloudinaryResized(row.headmaster_signature_url, "w_300,c_limit,q_auto,f_auto"));
      if (res.ok) signatureBuf = Buffer.from(await res.arrayBuffer());
    } catch { /* signature unreachable - back side just shows the blank line */ }
  }
  return {
    signatureBuf,
    headName: row.head_of_school_name || "Mr. Octavian C Millanzi",
    headTitle: row.head_of_school_title || "Head of School",
  };
}

// A large, very faint school-logo watermark centred on the card - subtle
// enough that it reads as texture, not a competing image, behind the
// header band's opaque navy fill (which naturally masks the part of it
// that would otherwise sit under the header).
function drawWatermarkLogo(doc, x, y) {
  if (!fs.existsSync(SCHOOL_LOGO_PATH)) return;
  const size = CARD_H * 0.85;
  doc.save();
  doc.opacity(0.038);
  try { doc.image(SCHOOL_LOGO_PATH, x + (CARD_W - size) / 2, y + (CARD_H - size) / 2, { fit: [size, size] }); } catch { /* skip */ }
  doc.restore();
}

// ── Front of the card ────────────────────────────────────────────────────
async function drawCardFront(doc, x, y, student, photoBuf) {
  const fullName = [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(" ").toUpperCase();

  doc.save();
  doc.rect(x, y, CARD_W, CARD_H).clip();

  // Background
  doc.rect(x, y, CARD_W, CARD_H).fill(CARD_BG);
  drawWatermarkLogo(doc, x, y);

  // Header band - three lines per spec, English only.
  const headerH = 12.8 * MM;
  doc.rect(x, y, CARD_W, headerH).fill(NAVY);
  doc.rect(x, y + headerH, CARD_W, 1.4).fill(GOLD);

  if (fs.existsSync(SCHOOL_LOGO_PATH)) {
    try { doc.image(SCHOOL_LOGO_PATH, x + 2.2 * MM, y + 1.5 * MM, { fit: [9.6 * MM, 9.6 * MM] }); } catch { /* skip */ }
  }
  const hx = x + 13 * MM, hw = CARD_W - 15.5 * MM;
  doc.font("IDC_BOLD").fontSize(4.5).fillColor("#DCE4F5").text("NEWALA DISTRICT COUNCIL", hx, y + 1.5 * MM, { width: hw, lineGap: 0 });
  doc.font("IDC_BOLD").fontSize(5.8).fillColor("#FFFFFF").text("MIKUMBI SECONDARY SCHOOL", hx, y + 4.7 * MM, { width: hw, lineGap: 0 });
  doc.font("IDC_REG").fontSize(3.3).fillColor("#B9C4E0").text("P.O Box 363 | NEWALA | MTWARA | TANZANIA", hx, y + 9 * MM, { width: hw, lineGap: 0 });

  // Title band
  doc.font("IDC_BOLD").fontSize(5.7).fillColor(NAVY)
    .text("STUDENT IDENTITY CARD", x, y + headerH + 1.9 * MM, { width: CARD_W, align: "center", characterSpacing: 0.3 });

  // Photo + core details
  const photoX = x + 3 * MM, photoY = y + headerH + 6.2 * MM, photoW = 18 * MM, photoH = 17.5 * MM;
  doc.rect(photoX, photoY, photoW, photoH).fill("#EFF6FF");
  let photoDrawn = false;
  if (photoBuf) {
    doc.save();
    try {
      doc.rect(photoX, photoY, photoW, photoH).clip();
      doc.image(photoBuf, photoX, photoY, { width: photoW, height: photoH, cover: [photoW, photoH], align: "center", valign: "center" });
      photoDrawn = true;
    } catch { /* falls through to placeholder below */ }
    doc.restore();
  }
  if (!photoDrawn) {
    doc.font("IDC_BOLD").fontSize(4.6).fillColor("#94A3B8")
      .text("HAKUNA\nPICHA", photoX, photoY + photoH / 2 - 3.2 * MM, { width: photoW, align: "center", lineGap: 0.5 });
  }
  doc.rect(photoX, photoY, photoW, photoH).lineWidth(0.6).strokeColor(NAVY).stroke();

  const infoX = photoX + photoW + 2.6 * MM;
  const infoW = x + CARD_W - 3 * MM - infoX;
  let ty = photoY;
  const infoLine = (label, value, valueFontSize = 5.6) => {
    doc.font("IDC_BOLD").fontSize(4.1).fillColor("#475569").text(label, infoX, ty, { width: infoW, lineGap: 0 });
    ty += 2 * MM;
    doc.font("IDC_BOLD").fontSize(valueFontSize).fillColor(NAVY).text(value || "-", infoX, ty, { width: infoW, lineGap: 0 });
    ty += 3.3 * MM;
  };
  infoLine("Name", fullName, 5.8);
  infoLine("Admission No", student.admission_no || "-", 5.2);
  infoLine("Sex", student.gender === "Male" ? "Male" : student.gender === "Female" ? "Female" : "-", 5.2);

  // Form I–IV year table - the student's current form is highlighted so
  // it's obvious at a glance which row applies right now.
  const fy = photoY + photoH + 1.8 * MM;
  const years = formYearTable(student.admission_date);
  const colW = (CARD_W - 6 * MM) / 2;
  years.forEach((f, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const fx = x + 3 * MM + col * colW;
    const rowY = fy + row * 3.1 * MM;
    const isCurrent = f.label === student.form;
    if (isCurrent) {
      doc.rect(fx - 1, rowY - 0.6, colW - 2 * MM, 3.2 * MM).fill("#EADFB4");
    }
    doc.font(isCurrent ? "IDC_BOLD" : "IDC_REG").fontSize(4.6).fillColor(isCurrent ? NAVY : "#334155")
      .text(`${f.label}: ${f.year}`, fx, rowY, { width: colW - 2 * MM, lineGap: 0 });
  });
  const afterFormsY = fy + 2 * 3.1 * MM + 1.3 * MM;

  // Signature line
  doc.font("IDC_REG").fontSize(4.4).fillColor("#334155").text("Signature:", x + 3 * MM, afterFormsY, { lineGap: 0 });
  doc.moveTo(x + 14 * MM, afterFormsY + 1.1 * MM).lineTo(x + CARD_W - 3 * MM, afterFormsY + 1.1 * MM).lineWidth(0.4).strokeColor("#94A3B8").stroke();

  // Validity note - valid through November of the student's Form IV year.
  const formIV = years[years.length - 1].year;
  doc.font("IDC_REG").fontSize(4.1).fillColor("#475569")
    .text(`This card is valid until November ${formIV}`, x, afterFormsY + 3.9 * MM, { width: CARD_W, align: "center" });

  doc.restore();
  doc.rect(x, y, CARD_W, CARD_H).lineWidth(0.7).strokeColor(NAVY).stroke();
}

// ── Back of the card ─────────────────────────────────────────────────────
async function drawCardBack(doc, x, y, student, branding, qrBuf) {
  doc.save();
  doc.rect(x, y, CARD_W, CARD_H).clip();
  doc.rect(x, y, CARD_W, CARD_H).fill(CARD_BG);
  drawWatermarkLogo(doc, x, y);
  doc.rect(x, y, CARD_W, 3 * MM).fill(NAVY);
  doc.rect(x, y + 3 * MM, CARD_W, 1.4).fill(GOLD);

  const pad = 3.2 * MM;
  let ty = y + 5.6 * MM;
  const w = CARD_W - pad * 2;

  doc.font("IDC_REG").fontSize(5.6).fillColor(NAVY)
    .text("This Identity Card is the property of", x + pad, ty, { width: w, align: "center" });
  ty += 3.1 * MM;
  doc.font("IDC_BOLD").fontSize(7).fillColor(NAVY)
    .text("MIKUMBI SECONDARY SCHOOL", x + pad, ty, { width: w, align: "center" });
  ty += 3.4 * MM;
  doc.font("IDC_REG").fontSize(4.6).fillColor(NAVY)
    .text("P.O Box 363 | NEWALA | MTWARA | TANZANIA", x + pad, ty, { width: w, align: "center" });
  ty += 4.4 * MM;

  doc.font("IDC_REG").fontSize(5.2).fillColor(NAVY);
  doc.text("1. This card Must be carried at all time", x + pad, ty, { width: w });
  ty += 3.0 * MM;
  doc.text("2. If found please return it to the address above", x + pad, ty, { width: w });
  ty += 4.6 * MM;

  doc.font("IDC_REG").fontSize(5.4).fillColor(NAVY).text("Authorised By;", x + pad, ty);
  ty += 3.2 * MM;

  // Head of School's signature - this card is the ONE place it's used;
  // per policy it is deliberately never printed on the Parent Report.
  if (branding.signatureBuf) {
    try {
      doc.image(branding.signatureBuf, x + pad, ty, { fit: [22 * MM, 7 * MM], align: "left" });
    } catch { /* leave the blank line below */ }
  }
  ty += 7.5 * MM;
  doc.moveTo(x + pad, ty).lineTo(x + pad + 26 * MM, ty).lineWidth(0.4).strokeColor("#94A3B8").stroke();
  ty += 2.2 * MM;
  doc.font("IDC_BOLD").fontSize(5.6).fillColor(NAVY).text(branding.headName.toUpperCase(), x + pad, ty, { width: w - 16 * MM });
  ty += 2.9 * MM;
  doc.font("IDC_REG").fontSize(5.2).fillColor("#475569").text(branding.headTitle, x + pad, ty, { width: w - 16 * MM });

  // Small verification QR, bottom-right.
  const qrSize = 13 * MM;
  const qrX = x + CARD_W - pad - qrSize, qrY = y + CARD_H - pad - qrSize;
  if (qrBuf) {
    try { doc.image(qrBuf, qrX, qrY, { width: qrSize, height: qrSize }); } catch { /* skip */ }
  }

  doc.restore();
  doc.rect(x, y, CARD_W, CARD_H).lineWidth(0.7).strokeColor(NAVY).stroke();
}

// GET /api/id-cards/pdf?student_ids=1,2,3&layout=single|grid
// "single": one page per student, front card then back card stacked below
//           it, both at true CR80 size and clearly labelled - easiest to
//           read on screen and to cut out one at a time.
// "grid": as many front cards as fit on an A4 page, tiled; followed by the
//         matching back-card pages in the SAME grid order - lines up for
//         double-sided printing (flip on the long edge).
const generateIdCardsPdf = async (req, res, next) => {
  try {
    const idsParam = String(req.query.student_ids || "").trim();
    if (!idsParam) return res.status(400).json({ message: "student_ids is required." });
    const studentIds = idsParam.split(",").map((s) => parseInt(s, 10)).filter((n) => Number.isInteger(n));
    if (!studentIds.length) return res.status(400).json({ message: "No valid student_ids provided." });
    if (studentIds.length > 200) return res.status(400).json({ message: "Chagua wanafunzi wasiozidi 200 kwa mara moja." });

    const layout = req.query.layout === "grid" ? "grid" : "single";
    const students = await loadCardStudents(studentIds);
    if (!students.length) return res.status(404).json({ message: "No matching students found." });

    const branding = await loadCardBranding();
    const [photoBufs, qrBufs] = await Promise.all([
      Promise.all(students.map((s) => fetchPhotoBuffer(s.photo_url))),
      Promise.all(students.map((s) => {
        // A real LINK, not raw text - scanning raw text with a phone
        // camera just runs a generic Google Lens/text-search flow instead
        // of opening anything, which some phones surface as an "install
        // the Google app to continue" style prompt. A URL opens the actual
        // branded verification page directly (see verifyIdCard below).
        const verifyUrl = `${requestBaseUrl(req)}/api/public/id-card/verify/${s.id}`;
        return generateQrPngBuffer(verifyUrl, 140);
      })),
    ]);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="Identity-Cards.pdf"`);
    const doc = new PDFDocument({ margin: 0, size: "A4", bufferPages: true });
    doc.pipe(res);
    registerCardFonts(doc);

    if (layout === "single") {
      for (let i = 0; i < students.length; i++) {
        if (i > 0) doc.addPage({ margin: 0, size: "A4" });
        const cx = (doc.page.width - CARD_W) / 2;
        const frontY = 60, backY = frontY + CARD_H + 30;
        doc.font("IDC_BOLD").fontSize(11).fillColor("#334155").text("FRONT", cx, frontY - 16, { width: CARD_W, align: "center" });
        await drawCardFront(doc, cx, frontY, students[i], photoBufs[i]);
        doc.font("IDC_BOLD").fontSize(11).fillColor("#334155").text("BACK", cx, backY - 16, { width: CARD_W, align: "center" });
        await drawCardBack(doc, cx, backY, students[i], branding, qrBufs[i]);
      }
    } else {
      const marginX = 20, marginY = 24, gapX = 14, gapY = 14;
      const cols = Math.max(1, Math.floor((doc.page.width - marginX * 2 + gapX) / (CARD_W + gapX)));
      const rows = Math.max(1, Math.floor((doc.page.height - marginY * 2 + gapY) / (CARD_H + gapY)));
      const perPage = cols * rows;

      // Fronts first (own page group), matching back pages follow in the
      // same left-to-right/top-to-bottom order per page.
      for (let p = 0; p < students.length; p += perPage) {
        if (p > 0) doc.addPage({ margin: 0, size: "A4" });
        const pageStudents = students.slice(p, p + perPage);
        for (let i = 0; i < pageStudents.length; i++) {
          const col = i % cols, row = Math.floor(i / cols);
          await drawCardFront(doc, marginX + col * (CARD_W + gapX), marginY + row * (CARD_H + gapY), pageStudents[i], photoBufs[p + i]);
        }
      }
      for (let p = 0; p < students.length; p += perPage) {
        doc.addPage({ margin: 0, size: "A4" });
        const pageStudents = students.slice(p, p + perPage);
        for (let i = 0; i < pageStudents.length; i++) {
          const col = i % cols, row = Math.floor(i / cols);
          await drawCardBack(doc, marginX + col * (CARD_W + gapX), marginY + row * (CARD_H + gapY), pageStudents[i], branding, qrBufs[p + i]);
        }
      }
    }

    doc.end();
  } catch (err) { next(err); }
};

// GET /api/public/id-card/verify/:studentId - the page a phone opens after
// scanning a student ID card's back-side QR. No login, no JSON - the same
// branded page every other QR in the system opens (school logo top-center,
// confirmation message below), plus the student's own name/form/reg. no so
// whoever scans it (a guard, another school, a bus conductor) can actually
// confirm who the card belongs to at a glance.
const verifyIdCard = async (req, res, next) => {
  try {
    const studentId = parseInt(req.params.studentId, 10);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (!Number.isInteger(studentId)) {
      return res.send(renderVerifyPage({ heading: "Kitambulisho Hakikuthibitishwa", notFound: true }));
    }
    const { rows } = await query(
      `SELECT first_name, middle_name, last_name, form, reg_no, admission_no, status FROM students WHERE id = $1`,
      [studentId]
    );
    const s = rows[0];
    if (!s) {
      return res.send(renderVerifyPage({ heading: "Kitambulisho Hakikuthibitishwa", notFound: true }));
    }
    const fullName = [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ").toUpperCase();
    res.send(renderVerifyPage({
      heading: "Kitambulisho Halali cha Mwanafunzi",
      details: [
        { label: "Jina", value: fullName },
        { label: "Darasa", value: s.form },
        { label: "Namba ya Usajili", value: s.reg_no || s.admission_no || "-" },
        { label: "Hali", value: s.status || "Active" },
      ],
    }));
  } catch (err) { next(err); }
};

module.exports = { generateIdCardsPdf, verifyIdCard };
