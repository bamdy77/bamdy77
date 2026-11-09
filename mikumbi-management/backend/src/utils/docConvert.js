// utils/docConvert.js — PDF <-> Word conversion, scanned image -> PDF/Word, QR stamp.
const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const PDFDocument = require("pdfkit");
const { PDFDocument: PDFLibDocument, rgb } = require("pdf-lib");
const { Document, Packer, Paragraph, ImageRun } = require("docx");
const AdmZip = require("adm-zip");
const { imageSize } = require("image-size");

const SOFFICE_BIN = process.env.SOFFICE_BIN || "soffice";
const SOFFICE_TIMEOUT_MS = 110 * 1000;

// Startup check — logs at boot whether LibreOffice is actually reachable,
// so this is visible in Render's Logs immediately instead of only showing
// up when a teacher tries to convert a file.
function checkSofficeAvailable() {
  execFile(SOFFICE_BIN, ["--version"], { timeout: 15000 }, (err, stdout) => {
    if (err) {
      console.error(`Doc Tools: LibreOffice ("${SOFFICE_BIN}") not reachable at startup — PDF/Word conversion will fail. code=${err.code} signal=${err.signal}`);
    } else {
      console.log(`Doc Tools: LibreOffice OK — ${stdout.toString().trim()}`);
    }
  });
}

// LibreOffice headless convert (docx <-> pdf). Unique profile dir per call —
// shared profiles cause lock conflicts under concurrent requests.
function convertWithSoffice(inputBuffer, inputExt, targetExt, { infilter } = {}) {
  return new Promise((resolve, reject) => {
    const workId = crypto.randomBytes(8).toString("hex");
    const workDir = path.join(os.tmpdir(), `doctools-${workId}`);
    const profileDir = path.join(os.tmpdir(), `doctools-profile-${workId}`);
    const inputPath = path.join(workDir, `input.${inputExt}`);

    const cleanup = () => {
      fs.rm(workDir, { recursive: true, force: true }, () => {});
      fs.rm(profileDir, { recursive: true, force: true }, () => {});
    };

    try {
      fs.mkdirSync(workDir, { recursive: true });
      fs.mkdirSync(profileDir, { recursive: true });
      fs.writeFileSync(inputPath, inputBuffer);
    } catch (e) {
      cleanup();
      return reject(new Error("Could not prepare the file for conversion."));
    }

    const args = [
      "--headless", "--norestore", "--invisible", "--nodefault",
      "--nofirststartwizard", "--nolockcheck", "--nologo",
      `-env:UserInstallation=file://${profileDir}`,
    ];
    // Needed for pdf -> docx, else LibreOffice has "no export filter".
    if (infilter) args.push(`--infilter=${infilter}`);
    args.push("--convert-to", targetExt, "--outdir", workDir, inputPath);

    execFile(SOFFICE_BIN, args, { timeout: SOFFICE_TIMEOUT_MS }, (err, stdout, stderr) => {
      if (err) {
        cleanup();
        // ENOENT = the soffice binary itself isn't installed on this host —
        // most commonly because the backend is still on Render's plain
        // Node runtime instead of the Docker image (see backend/Dockerfile).
        // Logged in full so this is diagnosable from Render's logs alone.
        console.error("Doc Tools: soffice conversion failed.", {
          code: err.code, killed: err.killed, signal: err.signal,
          stderr: (stderr || "").toString().slice(0, 2000),
        });
        if (err.code === "ENOENT") {
          return reject(new Error("Document conversion engine (LibreOffice) is not installed on this server. Ask the administrator to redeploy the backend using its Docker configuration."));
        }
        if (err.signal === "SIGKILL") {
          // Most often the OS killed the process for using too much memory —
          // common on Render's free tier (512MB), since LibreOffice itself
          // needs a meaningful chunk of RAM just to start.
          return reject(new Error("The conversion server ran out of memory while processing this file. This can happen on a low-memory hosting plan — try a smaller/simpler file, or upgrade the server's memory."));
        }
        if (err.killed || err.signal === "SIGTERM") {
          return reject(new Error("Conversion took too long and was stopped. Try a smaller or simpler file."));
        }
        return reject(new Error("Document conversion failed. The file may be corrupted, password-protected, or in an unsupported format."));
      }
      const outputPath = path.join(workDir, `input.${targetExt}`);
      fs.readFile(outputPath, (readErr, data) => {
        cleanup();
        if (readErr || !data || !data.length) {
          return reject(new Error("Conversion did not produce an output file."));
        }
        resolve(data);
      });
    });
  });
}

// Scanned images -> PDF: one full-bleed page per image, own aspect ratio.
const A4_LONG_EDGE_PT = 841.89;

function imagesToPdfBuffer(images) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ autoFirstPage: false, margin: 0 });
      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      images.forEach((img) => {
        let w, h;
        try {
          const dim = imageSize(img.buffer);
          w = dim.width; h = dim.height;
        } catch { w = 1; h = 1.4142; } // fallback: A4 ratio
        let pageW, pageH;
        if (w >= h) { pageW = A4_LONG_EDGE_PT; pageH = A4_LONG_EDGE_PT * (h / w); }
        else { pageH = A4_LONG_EDGE_PT; pageW = A4_LONG_EDGE_PT * (w / h); }
        doc.addPage({ size: [pageW, pageH], margin: 0 });
        doc.image(img.buffer, 0, 0, { width: pageW, height: pageH });
      });

      doc.end();
    } catch (e) { reject(e); }
  });
}

// Scanned images -> Word: own section per image, own aspect ratio/orientation.
const A4_LONG_EDGE_TWIPS = 16838; // 11.69in
const TWIPS_TO_PX = 96 / 1440;
const PAGE_MARGIN_TWIPS = 140;

async function imagesToDocxBuffer(images) {
  const sections = images.map((img) => {
    let w, h;
    try {
      const dim = imageSize(img.buffer);
      w = dim.width; h = dim.height;
    } catch { w = 1; h = 1.4142; }

    let pageWTwips, pageHTwips, orientation;
    // docx lib swaps w/h itself for landscape — give it the portrait pair,
    // don't pre-swap, or the page ends up double-swapped and cropped.
    if (w >= h) {
      pageHTwips = A4_LONG_EDGE_TWIPS;
      pageWTwips = Math.round(A4_LONG_EDGE_TWIPS * (h / w));
      orientation = "landscape";
    } else {
      pageHTwips = A4_LONG_EDGE_TWIPS;
      pageWTwips = Math.round(A4_LONG_EDGE_TWIPS * (w / h));
      orientation = "portrait";
    }
    const finalPageW = orientation === "landscape" ? pageHTwips : pageWTwips;
    const finalPageH = orientation === "landscape" ? pageWTwips : pageHTwips;

    const contentWTwips = finalPageW - PAGE_MARGIN_TWIPS * 2;
    const contentHTwips = finalPageH - PAGE_MARGIN_TWIPS * 2;
    const dispW = Math.max(1, Math.round(contentWTwips * TWIPS_TO_PX));
    const dispH = Math.max(1, Math.round(contentHTwips * TWIPS_TO_PX));

    return {
      properties: {
        page: {
          size: { width: pageWTwips, height: pageHTwips, orientation },
          margin: { top: PAGE_MARGIN_TWIPS, bottom: PAGE_MARGIN_TWIPS, left: PAGE_MARGIN_TWIPS, right: PAGE_MARGIN_TWIPS },
        },
      },
      children: [
        new Paragraph({
          spacing: { before: 0, after: 0 },
          children: [new ImageRun({ data: img.buffer, transformation: { width: dispW, height: dispH } })],
        }),
      ],
    };
  });

  const doc = new Document({ sections });
  return Packer.toBuffer(doc);
}

// QR stamp: PDF — small corner stamp on every page, white plate behind it.
async function stampQrOnPdf(pdfBuffer, qrPngBuffer) {
  const pdfDoc = await PDFLibDocument.load(pdfBuffer, { ignoreEncryption: true, updateMetadata: false });
  const qrImage = await pdfDoc.embedPng(qrPngBuffer);
  const qrSize = 40;
  const margin = 16;
  const pages = pdfDoc.getPages();
  pages.forEach((page) => {
    const { width } = page.getSize();
    page.drawRectangle({
      x: width - qrSize - margin - 4, y: margin - 4,
      width: qrSize + 8, height: qrSize + 8,
      color: rgb(1, 1, 1),
      opacity: 0.85,
    });
    page.drawImage(qrImage, { x: width - qrSize - margin, y: margin, width: qrSize, height: qrSize });
  });
  return Buffer.from(await pdfDoc.save());
}

// QR stamp: DOCX — appended as a new final paragraph, never overlaps content.
async function stampQrOnDocx(docxBuffer, qrPngBuffer) {
  const zip = new AdmZip(docxBuffer);
  const docEntry = zip.getEntry("word/document.xml");
  const relsEntry = zip.getEntry("word/_rels/document.xml.rels");
  const ctEntry = zip.getEntry("[Content_Types].xml");
  if (!docEntry || !relsEntry) throw new Error("Not a well-formed .docx");

  let relsXml = relsEntry.getData().toString("utf8");
  const existingIds = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map((m) => parseInt(m[1], 10));
  const nextId = (existingIds.length ? Math.max(...existingIds) : 0) + 1;
  const rId = `rId${nextId}`;
  relsXml = relsXml.replace(
    "</Relationships>",
    `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/mikumbi-qr-stamp.png"/></Relationships>`
  );

  if (ctEntry) {
    let ctXml = ctEntry.getData().toString("utf8");
    if (!/Extension="png"/i.test(ctXml)) {
      ctXml = ctXml.replace("</Types>", `<Default Extension="png" ContentType="image/png"/></Types>`);
      zip.updateFile("[Content_Types].xml", Buffer.from(ctXml, "utf8"));
    }
  }

  const EMU = 320000; // ~0.35in
  const drawingXml = `<w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:i/><w:sz w:val="14"/><w:color w:val="94A3B8"/></w:rPr><w:t xml:space="preserve">Generated by Mikumbi Secondary School System</w:t></w:r></w:p>` +
    `<w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr/><w:drawing>` +
    `<wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${EMU}" cy="${EMU}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="990011" name="MikumbiQRStamp"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="990011" name="MikumbiQRStamp"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${EMU}" cy="${EMU}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;

  let docXml = docEntry.getData().toString("utf8");
  if (docXml.includes("</w:body>")) {
    const lastSectPrIdx = docXml.lastIndexOf("<w:sectPr");
    if (lastSectPrIdx !== -1 && lastSectPrIdx > docXml.lastIndexOf("</w:p>")) {
      docXml = docXml.slice(0, lastSectPrIdx) + drawingXml + docXml.slice(lastSectPrIdx);
    } else {
      docXml = docXml.replace("</w:body>", `${drawingXml}</w:body>`);
    }
  } else {
    throw new Error("Not a well-formed .docx");
  }

  zip.updateFile("word/document.xml", Buffer.from(docXml, "utf8"));
  zip.updateFile("word/_rels/document.xml.rels", Buffer.from(relsXml, "utf8"));
  zip.addFile("word/media/mikumbi-qr-stamp.png", qrPngBuffer);

  return zip.toBuffer();
}

module.exports = {
  convertWithSoffice,
  imagesToPdfBuffer,
  imagesToDocxBuffer,
  stampQrOnPdf,
  stampQrOnDocx,
  checkSofficeAvailable,
};
