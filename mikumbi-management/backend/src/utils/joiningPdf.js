// utils/joiningPdf.js - draws the Form I Joining Instruction PDF.
//
// Layout follows the school's own "MIKUMBI JOINING INSTRUCTION" document:
//   letterhead (Jamhuri ... / Halmashauri ya Wilaya ya Newala), school logo +
//   "WASILIANA NASI" phones on the left, school postal address + council
//   logo on the right, "Ndugu: <name>", the YAH line, the intro, numbered
//   sections, the closing and the Head of School's sign-off - with the
//   uploaded Head Master's signature (Settings -> Signature & Stamp) placed
//   automatically above the name. Then the attached forms (Fomu Na. 1-4).
//
// Used for the per-applicant PDF (online + issued at school), the blank
// printable form, and the staff "Preview" before publishing.
const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const { applyYear } = require("./joiningContent");

const FONT_DIR = path.join(__dirname, "..", "assets", "fonts");
const ARIMO_REGULAR = path.join(FONT_DIR, "Arimo-Regular.ttf");
const ARIMO_BOLD = path.join(FONT_DIR, "Arimo-Bold.ttf");
const SCHOOL_LOGO = path.join(__dirname, "..", "assets", "shule-logo.png");
const COUNCIL_LOGO = path.join(__dirname, "..", "assets", "newala-council-logo.png");

const INK = "#0F172A";
const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii", "xiv", "xv", "xvi", "xvii", "xviii", "xix", "xx",
  "xxi", "xxii", "xxiii", "xxiv", "xxv", "xxvi", "xxvii", "xxviii", "xxix", "xxx"];
const roman = (n) => ROMAN[n - 1] || String(n);

function safeImage(doc, img, x, y, opts) {
  if (!img) return false;
  if (typeof img === "string" && !fs.existsSync(img)) return false;
  try { doc.image(img, x, y, opts); return true; } catch { return false; }
}

// Faint repeated school name across every page - keeps doc.x/doc.y intact
// (doc.save/restore only protect graphics state, not the text cursor).
const WATERMARK_LOGO = path.join(__dirname, "..", "assets", "shule-logo-watermark.png");

// Fonts the school can pick in Edit & Publish. Times/Helvetica/Courier are
// PDF built-ins (no file needed); Arimo is bundled (Arial-like).
const FONT_CHOICES = {
  arimo: { reg: ARIMO_REGULAR, bold: ARIMO_BOLD },
  times: { reg: "Times-Roman", bold: "Times-Bold" },
  helvetica: { reg: "Helvetica", bold: "Helvetica-Bold" },
  courier: { reg: "Courier", bold: "Courier-Bold" },
};

// Faint background mark on every page: "text" (MIKUMBI SECONDARY SCHOOL),
// "logo" (the school badge, like the ID card) or "none".
// Deliberately uses NO transparency: some phone PDF viewers ignore PDF
// opacity and showed the old 5%-opacity text as solid dark green. The text
// is drawn in a very pale solid colour and the logo is a pre-faded image
// (assets/shule-logo-watermark.png, already blended into white), so it looks
// equally faint in every viewer. Drawn first on each page, under the text.
// Also restores font/size/colour and the cursor: it runs from the
// "pageAdded" event, possibly in the MIDDLE of a paragraph flowing onto a
// new page.
function drawWatermark(doc, mode = "text") {
  if (mode === "none") return;
  const savedX = doc.x, savedY = doc.y;
  const savedFont = doc._font, savedSize = doc._fontSize, savedFill = doc._fillColor;
  const savedBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc.save();
  if (mode === "logo") {
    const size = 360;
    safeImage(doc, WATERMARK_LOGO, (doc.page.width - size) / 2, (doc.page.height - size) / 2, { width: size, height: size });
  } else {
    doc.fillColor("#EEF2EE");
    doc.font("JI_BOLD").fontSize(46);
    doc.rotate(-35, { origin: [doc.page.width / 2, doc.page.height / 2] });
    [-160, -20, 120].forEach((dy) => {
      doc.text("MIKUMBI SECONDARY SCHOOL", -120, doc.page.height / 2 + dy, { width: doc.page.width + 240, align: "center", lineBreak: false });
    });
  }
  doc.restore();
  doc.page.margins.bottom = savedBottom;
  if (savedFont) doc._font = savedFont; // pdfkit internals: re-select the exact font object
  if (savedSize) doc.fontSize(savedSize);
  if (savedFill) doc.fillColor(...savedFill); else doc.fillColor(INK);
  doc.x = savedX; doc.y = savedY;
}

function drawLetterhead(doc, content) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;

  doc.font("JI_BOLD").fontSize(11.5).fillColor(INK);
  ["JAMHURI YA MUUNGANO WA TANZANIA", "OFISI YA WAZIRI MKUU TAWALA ZA MIKOA NA SERIKALI ZA MITAA", "HALMASHAURI YA WILAYA YA NEWALA"]
    .forEach((l) => doc.text(l, left, doc.y, { width, align: "center" }));

  const rowY = doc.y + 8;
  const logo = 70;
  // District council (Halmashauri) logo on the LEFT, school badge on the RIGHT.
  safeImage(doc, COUNCIL_LOGO, left, rowY, { fit: [logo, logo] });
  safeImage(doc, SCHOOL_LOGO, right - logo, rowY, { fit: [logo, logo] });

  const phones = String(content.phones || "").split(/[,\n]/).map((p) => p.trim()).filter(Boolean);
  const colW = width / 2 - logo - 12;
  doc.font("JI_REG").fontSize(10.5);
  doc.text("WASILIANA NASI:", left + logo + 12, rowY + 4, { width: colW });
  phones.forEach((p, i) => doc.text(i === 0 ? `SIMU: ${p}` : `           ${p}`, left + logo + 12, doc.y + 2, { width: colW }));
  const leftEnd = doc.y;

  const addrX = left + width / 2 - 10;
  doc.text(content.address || "", addrX, rowY + 4, { width: right - logo - 8 - addrX });
  const rightEnd = doc.y;

  doc.y = Math.max(rowY + logo, leftEnd, rightEnd) + 10;
  doc.moveTo(left, doc.y).lineTo(right, doc.y).lineWidth(1).strokeColor("#334155").stroke();
  doc.y += 12;
  doc.x = left;
}

// Renders one section body using the mini-markup documented in
// joiningContent.js.
function drawBody(doc, body, year, { indent = 18 } = {}) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  let n = 0;
  const lines = applyYear(body, year).split("\n").map((l) => l.trimEnd()).filter((l) => l.trim());
  lines.forEach((raw) => {
    const line = raw.trim();
    ensureSpace(doc, 16);
    if (line.startsWith("- ") || line === "-") {
      n += 1;
      // Width of the widest numeral in THIS font (Courier is much wider than
      // Arimo/Times) so "viii." never wraps inside its column.
      doc.font("JI_REG").fontSize(10.5);
      const numW = Math.ceil(doc.widthOfString("xviii.")) + 6;
      const y = doc.y;
      doc.font("JI_REG").fontSize(10.5).fillColor(INK)
        .text(`${roman(n)}.`, left + indent, y, { width: numW - 6, align: "right" });
      doc.text(line.slice(2), left + indent + numW, y, { width: right - left - indent - numW, lineGap: 1.5 });
    } else if (line.startsWith("* ")) {
      const y = doc.y;
      doc.font("JI_REG").fontSize(10.5).fillColor(INK).text("•", left + indent + 6, y, { width: 12 });
      doc.text(line.slice(2), left + indent + 22, y, { width: right - left - indent - 22, lineGap: 1.5 });
    } else if (line.startsWith("## ")) {
      n = 0;
      doc.moveDown(0.2);
      doc.font("JI_BOLD").fontSize(10.5).fillColor(INK).text(line.slice(3), left + indent, doc.y, { width: right - left - indent });
    } else if (line.startsWith("**")) {
      n = 0;
      doc.font("JI_BOLD").fontSize(10.5).fillColor(INK).text(line.replace(/^\*\*\s*/, ""), left + indent, doc.y, { width: right - left - indent, lineGap: 1.5 });
    } else if (/^NB\s*:/i.test(line)) {
      n = 0;
      doc.moveDown(0.2);
      doc.font("JI_BOLD").fontSize(10.5).fillColor(INK).text("NB: ", left + indent, doc.y, { continued: true, width: right - left - indent });
      doc.font("JI_REG").text(line.replace(/^NB\s*:\s*/i, ""), { lineGap: 1.5 });
    } else {
      n = 0;
      doc.font("JI_REG").fontSize(10.5).fillColor(INK).text(line, left + indent, doc.y, { width: right - left - indent, lineGap: 1.5 });
    }
  });
  doc.x = left;
}

function ensureSpace(doc, needed) {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) doc.addPage();
}

function drawLetter(doc, { content, fullName, year, signatureBuf, qrBuf }) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;

  drawLetterhead(doc, content);

  // "Ndugu: <name>" - or a dotted line to write on for the blank form.
  doc.font("JI_REG").fontSize(11).fillColor(INK).text("Ndugu: ", left, doc.y, { continued: true });
  if (fullName) doc.font("JI_BOLD").text(fullName);
  else doc.text("..............................................................................................");
  doc.moveDown(0.9);

  doc.font("JI_BOLD").fontSize(11.5).text(applyYear(content.subject, year), left, doc.y, { width, align: "center", underline: true });
  doc.moveDown(0.5);

  String(applyYear(content.intro, year)).split("\n").filter((p) => p.trim()).forEach((p) => {
    doc.font("JI_REG").fontSize(10.5).text(p.trim(), left, doc.y, { width, align: "justify", lineGap: 1.5 });
    doc.moveDown(0.25);
  });
  doc.moveDown(0.3);

  (content.sections || []).forEach((s, i) => {
    ensureSpace(doc, 50);
    const y = doc.y;
    doc.font("JI_BOLD").fontSize(10.8).fillColor(INK);
    const secW = Math.ceil(doc.widthOfString("10.")) + 6;
    doc.text(`${i + 1}.`, left, y, { width: secW });
    doc.text(applyYear(s.title, year), left + secW, y, { width: width - secW });
    doc.moveDown(0.15);
    if (s.body) drawBody(doc, s.body, year, { indent: secW });
    doc.moveDown(0.6);
  });

  // Closing + Head of School sign-off (signature image from Settings).
  ensureSpace(doc, 150);
  if (content.closing) {
    doc.font("JI_BOLD").fontSize(11).text(applyYear(content.closing, year), left, doc.y, { width, align: "center", oblique: true });
    doc.moveDown(0.6);
  }
  const sigW = 130, sigH = 48;
  const sigTop = doc.y;
  const sigX = left + (width - sigW) / 2;
  const placed = signatureBuf && safeImage(doc, signatureBuf, sigX, sigTop, { fit: [sigW, sigH], align: "center", valign: "bottom" });
  doc.y = sigTop + sigH;
  if (!placed) {
    doc.font("JI_REG").fontSize(10.5).text("...............................", left, doc.y - 12, { width, align: "center" });
  }
  doc.font("JI_REG").fontSize(10.5).text(content.head_name || "", left, doc.y + 2, { width, align: "center" });
  doc.font("JI_BOLD").text(content.head_title || "MKUU WA SHULE", left, doc.y, { width, align: "center" });

  // Small verification QR on the right of the sign-off block.
  if (qrBuf) {
    const qr = 58;
    const qrY = sigTop;
    doc.rect(right - qr - 8, qrY - 4, qr + 8, qr + 8).lineWidth(0.6).strokeColor("#CBD5E1").stroke();
    safeImage(doc, qrBuf, right - qr - 4, qrY, { width: qr, height: qr });
  }
  doc.x = left;
}

// ── Attached forms ───────────────────────────────────────────────────────
function formTitle(doc, title) {
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.font("JI_BOLD").fontSize(15).fillColor(INK).text(title, left, doc.page.margins.top, { width, align: "center" });
  doc.moveDown(0.8);
}
function photoBox(doc, x, y, w = 80, h = 80) {
  doc.rect(x, y, w, h).lineWidth(0.8).strokeColor("#334155").stroke();
}
const DOTS = (n) => ".".repeat(n);

function drawParentForm(doc, { year }) {
  doc.addPage();
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  formTitle(doc, "FOMU NA. 1: AHADI YA MZAZI / MLEZI");
  photoBox(doc, left + (width - 80) / 2, doc.y); doc.y += 96;
  const p = { width, align: "justify", lineGap: 5 };
  doc.font("JI_REG").fontSize(10.5).fillColor(INK)
    .text(`Mimi ${DOTS(60)} wa S.L.P ${DOTS(18)} Mji ${DOTS(25)} Simu Na. ${DOTS(25)} Ambaye kazi yangu ni ${DOTS(35)} natamka hapa kama mzazi / mlezi wa ${DOTS(55)}. Ninakubali kwa hiari yangu mwanangu asome katika Shule ya Sekondari Mikumbi kuanzia tarehe ${DOTS(25)}. Ninaahidi kama ifuatavyo:-`, left, doc.y, p);
  doc.moveDown(0.4);
  [
    "Kwamba nimekubali chaguo alilopewa mwanangu na sitamruhusu kubadilisha hadi apate kibali cha maandishi kutoka kwa mamlaka husika.",
    "Ninaahidi kumpatia mwanangu vifaa vyote kama vilivyoainishwa katika fomu ya kujiunga ikiwemo SARE KAMILI ya shule bila kuharibu chochote.",
    "Ninatambua ya kuwa walimu wanahitaji ushirikiano wangu katika kumpatia mwanangu elimu na nitashirikiana nao bega kwa bega kwa maswala yanayomuhusu mwanangu kitaaluma na nidhamu ili aweze kufikia malengo yake na ya Taifa.",
    "Naahidi kuwa endapo mwanangu ataenda kinyume na taratibu zilizoainishwa katika fomu hii achukuliwe hatua stahili za kinidhamu kama zilivyoorodheshwa.",
  ].forEach((t, i) => {
    const y = doc.y;
    doc.text(`${i + 1}.`, left, y, { width: 24 });
    doc.text(t, left + 26, y, { width: width - 26, align: "justify", lineGap: 2 });
    doc.moveDown(0.3);
  });
  doc.moveDown(1.2);
  doc.text(`Jina ${DOTS(45)} Saini ${DOTS(20)} Tarehe ${DOTS(18)} Uhusiano na mwanafunzi ${DOTS(15)}`, left, doc.y, { width });
  void year;
}

function drawStudentPledge(doc, { year, fullName }) {
  doc.addPage();
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  formTitle(doc, "FOMU NA. 2: AHADI YA MWANAFUNZI");
  photoBox(doc, left + (width - 80) / 2, doc.y); doc.y += 96;
  doc.font("JI_REG").fontSize(10.5).fillColor(INK)
    .text(`Mimi mwanafunzi ${fullName || DOTS(60)} wa Kidato cha Kwanza mwaka ${year}. Ninakiri kusoma, kuelewa na kuahidi kutii taratibu zote zilizoainishwa katika fomu iliyotumwa kwangu na Mkuu wa Shule ya Sekondari Mikumbi. Nitatoa ushirikiano wa kutosha kwa walimu wangu na shule kwa ujumla katika muda wangu wote nitakaokuwa shuleni ili niweze kupata elimu na kuendeleza jamii na taifa langu.`,
      left, doc.y, { width, align: "justify", lineGap: 5 });
  doc.moveDown(1);
  doc.text(`Jina ${DOTS(50)} Saini ${DOTS(22)} Tarehe ${DOTS(18)}`, left, doc.y, { width });
  doc.moveDown(2);
  doc.font("JI_BOLD").text("Maoni ya Mkuu wa Shule", left, doc.y, { width });
  doc.moveDown(0.6);
  doc.font("JI_REG");
  for (let i = 0; i < 3; i++) { doc.text(DOTS(150), left, doc.y, { width, lineBreak: false }); doc.moveDown(1.1); }
}

function drawPersonalDetails(doc, { year, fullName }) {
  doc.addPage();
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  formTitle(doc, "FOMU NA. 3: MAELEZO BINAFSI YA MWANAFUNZI");
  doc.font("JI_REG").fontSize(10.5).fillColor(INK);
  const rows = [
    ["Jina kamili la mwanafunzi", fullName || ""],
    ["Jinsi (Me/Ke)", ""], ["Tarehe ya kuzaliwa", ""], ["Dini", ""],
    ["Shule ya Msingi aliyosoma", ""], ["Namba ya mtihani wa Darasa la Saba", ""],
    ["Mkoa / Wilaya", ""], ["Kata / Kijiji / Mtaa", ""],
    ["Jina la Baba", ""], ["Kazi na Simu ya Baba", ""],
    ["Jina la Mama", ""], ["Kazi na Simu ya Mama", ""],
    ["Jina la Mlezi (kama si mzazi)", ""], ["Simu ya Mlezi", ""],
    ["Magonjwa / ulemavu wowote alionao", ""],
  ];
  rows.forEach(([label, value]) => {
    const y = doc.y;
    doc.font("JI_REG").text(`${label}:`, left, y, { width: 210 });
    if (value) doc.font("JI_BOLD").text(value, left + 214, y, { width: width - 214 });
    else doc.text(DOTS(80), left + 214, y, { width: width - 214, lineBreak: false });
    doc.y = Math.max(doc.y, y + 14) + 6;
  });
  doc.moveDown(0.8);
  doc.font("JI_BOLD").text("MKATABA WA KUTOSHIRIKI KATIKA MIGOMO, FUJO NA MAKOSA YA JINAI", left, doc.y, { width });
  doc.moveDown(0.3);
  doc.font("JI_REG").text(
    `Mimi ${fullName || DOTS(50)} mwanafunzi wa Kidato cha Kwanza mwaka ${year} katika Shule ya Sekondari Mikumbi, ninaahidi kutoshiriki wala kuhamasisha mgomo, fujo au kosa lolote la jinai nikiwa mwanafunzi wa shule hii. Endapo nitakwenda kinyume na ahadi hii, nipo tayari kuchukuliwa hatua za kinidhamu kwa mujibu wa sheria na kanuni za shule.`,
    left, doc.y, { width, align: "justify", lineGap: 4 });
  doc.moveDown(1);
  doc.text(`Saini ya Mwanafunzi ${DOTS(25)}   Saini ya Mzazi/Mlezi ${DOTS(25)}   Tarehe ${DOTS(16)}`, left, doc.y, { width });
}

function drawMedicalForm(doc, { year, fullName }) {
  doc.addPage();
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;
  formTitle(doc, "FOMU NA. 4: UTHIBITISHO WA AFYA");
  const top = doc.y;
  photoBox(doc, right - 90, top, 90, 90);
  doc.font("JI_REG").fontSize(10.5).fillColor(INK).text("Mikumbi Secondary School\nP.O. BOX 363\nNEWALA.", left, top, { width: width - 100 });
  doc.y = top + 100;
  doc.font("JI_BOLD").fontSize(11.5).text("MEDICAL EXAMINATION FORM", left, doc.y, { width, align: "center" });
  doc.moveDown(0.3);
  doc.font("JI_REG").fontSize(10.5)
    .text("To be completed by Medical Officer from a known Public Hospital or Health Centre in respect to all entrants", left, doc.y, { width });
  doc.moveDown(0.3);
  doc.text(`Full name ${fullName ? fullName + " " : DOTS(55)} Age ${DOTS(10)} Sex ${DOTS(12)} Year ${year}`, left, doc.y, { width });
  doc.moveDown(0.4);
  ["Blood count (Red and White)", "Urine analysis Test", "Syphilis test", "T.B.", "Eye Test", "Ears", "Spleen", "Abdomen"].forEach((t, i) => {
    doc.text(`${i + 1}. ${t} ${DOTS(Math.max(20, 110 - t.length * 1.6 | 0))}`, left + 30, doc.y + 3, { width: width - 30, lineBreak: false });
    doc.moveDown(0.25);
  });
  doc.moveDown(0.4);
  doc.text("ADDITIONAL INFORMATION: e.g. Physical impairment, family disease, chronic infections etc.", left, doc.y, { width });
  for (let i = 0; i < 3; i++) { doc.moveDown(0.5); doc.text(DOTS(150), left, doc.y, { width, lineBreak: false }); }
  doc.moveDown(1.4);
  doc.text("I certify that the above named individual is fit to pursue studies as stated above", left, doc.y, { width });
  doc.moveDown(2);
  const half = width / 2;
  let y = doc.y;
  doc.text(DOTS(45), left, y, { width: half - 10 }); doc.text(DOTS(45), left + half, y, { width: half });
  y = doc.y;
  doc.text("Name and Designation", left, y, { width: half - 10 }); doc.text("Signature and Official stamp", left + half, y, { width: half });
  doc.moveDown(1.6);
  y = doc.y;
  doc.text(DOTS(45), left, y, { width: half - 10 }); doc.text(DOTS(45), left + half, y, { width: half });
  y = doc.y;
  doc.text("STATION", left, y, { width: half - 10 }); doc.text("DATE", left + half, y, { width: half });
  doc.moveDown(1.6);
  doc.font("JI_BOLD").text("NOTE:", left, doc.y, { width });
  doc.font("JI_REG").fontSize(9.5);
  doc.text("1. Medical officer during the course of this Examination please attend the individual according to any diagnosed case.", left, doc.y, { width });
  doc.text("2. The duly filled form must be handed to the Head of the School during registration week, under No circumstances should a student be registered without certification of his/her physical fitness.", left, doc.y, { width });
}

function drawFooter(doc, generatedAt) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - 28;
    doc.font("JI_REG").fontSize(8).fillColor("#94A3B8")
      .text(generatedAt, doc.page.margins.left, y, { width: 250, lineBreak: false })
      .text(`Ukurasa ${i - range.start + 1} kati ya ${range.count}`, doc.page.width - doc.page.margins.right - 150, y, { width: 150, align: "right", lineBreak: false });
    doc.page.margins.bottom = savedBottom;
  }
}

// ── Uniform guide page ("MUONEKANO WA SARE ZA SHULE") ─────────────────────
// Photos showing the correct and the NOT-allowed uniform for boys and girls.
// The students' faces are blurred in the image files themselves
// (assets/uniforms/*.jpg) so no child can be identified from the document.
const UNIFORM_DIR = path.join(__dirname, "..", "assets", "uniforms");
const UNIFORM_BOYS = [
  { file: "boy-allowed.jpg", ok: true, note: "Shati jeupe la mikono mifupi, suruali ya kaki isiyobana, mkanda mweusi na viatu vyeusi vya kamba." },
  { file: "boy-not-allowed.jpg", ok: false, note: "Suruali ya kubana (modo) hairuhusiwi." },
  { file: "boy-sagging-not-allowed.jpg", ok: false, note: "Suruali iliyoshushwa chini ya kiuno, mkanda unaoning'inia na shati nje hairuhusiwi." },
];
const UNIFORM_GIRLS = [
  { file: "girl-allowed.jpg", ok: true, note: "Shati jeupe la mikono mifupi, sketi ndefu, soksi nyeupe na viatu vyeusi." },
  { file: "girl-hijab-allowed.jpg", ok: true, note: "Kwa wanaovaa hijabu: hijabu ndefu nyeupe na sketi ndefu hadi kifundo cha mguu." },
  { file: "girl-hijab-not-allowed.jpg", ok: false, note: "Hijabu fupi na sketi fupi hairuhusiwi." },
  { file: "girl-not-allowed.jpg", ok: false, note: "Sketi fupi (juu ya magoti) hairuhusiwi." },
];
const OK_GREEN = "#15803D";
const NO_RED = "#B91C1C";

// Small vector tick / cross so the badge never depends on a font glyph.
function drawMark(doc, x, y, size, ok) {
  doc.save().lineWidth(1.8).strokeColor("#FFFFFF").lineCap("round");
  if (ok) {
    doc.moveTo(x, y + size * 0.55).lineTo(x + size * 0.38, y + size * 0.9).lineTo(x + size, y + size * 0.1).stroke();
  } else {
    doc.moveTo(x, y).lineTo(x + size, y + size).stroke();
    doc.moveTo(x + size, y).lineTo(x, y + size).stroke();
  }
  doc.restore();
}

function drawUniformCard(doc, item, x, y, w, imgH) {
  const color = item.ok ? OK_GREEN : NO_RED;
  doc.rect(x, y, w, imgH).lineWidth(0.6).strokeColor("#CBD5E1").stroke();
  safeImage(doc, path.join(UNIFORM_DIR, item.file), x + 2, y + 2, { fit: [w - 4, imgH - 4], align: "center", valign: "center" });
  const barY = y + imgH;
  const barH = 18;
  doc.rect(x, barY, w, barH).fillColor(color).fill();
  drawMark(doc, x + 7, barY + 4.5, 9, item.ok);
  doc.font("JI_BOLD").fontSize(9).fillColor("#FFFFFF")
    .text(item.ok ? "INARUHUSIWA" : "HAIRUHUSIWI", x + 20, barY + 4.5, { width: w - 24, align: "center", lineBreak: false });
  doc.font("JI_REG").fontSize(8).fillColor(INK)
    .text(item.note, x, barY + barH + 4, { width: w, align: "center", lineGap: 1 });
}

function drawUniformRow(doc, title, items, top, cardW, imgH) {
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  doc.font("JI_BOLD").fontSize(12).fillColor(INK).text(title, left, top, { width });
  const rowTop = top + 20;
  const gap = 14;
  const totalW = items.length * cardW + (items.length - 1) * gap;
  let x = left + (width - totalW) / 2;
  // Measure the tallest note so the next row never overlaps it.
  doc.font("JI_REG").fontSize(8);
  const noteH = Math.max(...items.map((it) => doc.heightOfString(it.note, { width: cardW, lineGap: 1 })));
  items.forEach((it) => { drawUniformCard(doc, it, x, rowTop, cardW, imgH); x += cardW + gap; });
  return rowTop + imgH + 18 + 4 + noteH + 14; // image + badge + note + spacing
}

function drawUniformPage(doc) {
  doc.addPage();
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  doc.font("JI_BOLD").fontSize(15).fillColor(INK).text("MUONEKANO WA SARE ZA SHULE", left, doc.page.margins.top, { width, align: "center" });
  doc.font("JI_REG").fontSize(9.5).fillColor("#334155")
    .text("Picha zifuatazo zinaonyesha sare inayoruhusiwa na isiyoruhusiwa. Mwanafunzi atakayekuja na sare isiyoruhusiwa hatapokelewa hadi arekebishe sare yake.",
      left, doc.y + 4, { width, align: "center", lineGap: 1 });
  let y = doc.y + 12;
  y = drawUniformRow(doc, "WAVULANA", UNIFORM_BOYS, y, 128, 205);
  drawUniformRow(doc, "WASICHANA", UNIFORM_GIRLS, y, 112, 195);
  doc.x = left;
}

// Writes the whole Joining Instruction into `stream` (an Express res).
// fullName: string for a real applicant, or null for the blank form.
function renderJoiningPdf(stream, { content, fullName, year, signatureBuf, qrBuf, generatedAt }) {
  const doc = new PDFDocument({ size: "A4", margins: { top: 40, bottom: 44, left: 50, right: 50 }, bufferPages: true });
  doc.pipe(stream);
  const font = FONT_CHOICES[content.font] || FONT_CHOICES.arimo;
  doc.registerFont("JI_REG", font.reg);
  doc.registerFont("JI_BOLD", font.bold);
  const wm = ["text", "logo", "none"].includes(content.watermark) ? content.watermark : "text";
  doc.on("pageAdded", () => drawWatermark(doc, wm));
  drawWatermark(doc, wm);

  const y = Number(year) || new Date().getFullYear();
  drawLetter(doc, { content, fullName, year: y, signatureBuf, qrBuf });
  if (content.include_uniform_page !== false) drawUniformPage(doc);
  if (content.include_forms !== false) {
    drawParentForm(doc, { year: y });
    drawStudentPledge(doc, { year: y, fullName });
    drawPersonalDetails(doc, { year: y, fullName });
    drawMedicalForm(doc, { year: y, fullName });
  }
  drawFooter(doc, generatedAt || "");
  doc.end();
}

module.exports = { renderJoiningPdf, FONT_CHOICES };
