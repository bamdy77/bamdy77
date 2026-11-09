// controllers/docToolsController.js — Doc Tools module, open to every staff role.
const path = require("path");
const {
  convertWithSoffice, imagesToPdfBuffer, imagesToDocxBuffer,
  stampQrOnPdf, stampQrOnDocx,
} = require("../utils/docConvert");
const { generateQrPngBuffer, requestBaseUrl } = require("../utils/pdfHeader");

const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp"];
const OFFICE_EXTS = ["pdf", "doc", "docx"];
const MIME_BY_TARGET = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const extOf = (filename) => (path.extname(filename || "").slice(1) || "").toLowerCase();
const baseNameOf = (filename) => path.basename(filename || "file", path.extname(filename || ""));

// POST /api/doctools/convert — multipart: files[] (1 doc, OR 1+ images),
// target ("pdf" | "docx"), addQrCode ("true" | "false").
const convert = async (req, res, next) => {
  try {
    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ success: false, message: "Please choose a file to convert (PDF, Word, or a scanned document image)." });
    }

    const target = String(req.body.target || "").toLowerCase();
    if (!["pdf", "docx"].includes(target)) {
      return res.status(400).json({ success: false, message: "Choose a valid output format: PDF or Word." });
    }
    const addQrCode = String(req.body.addQrCode || "").toLowerCase() === "true";

    const exts = files.map((f) => extOf(f.originalname));
    const allImages = exts.every((e) => IMAGE_EXTS.includes(e));
    const allOffice = exts.every((e) => OFFICE_EXTS.includes(e));

    if (!allImages && !allOffice) {
      return res.status(400).json({
        success: false,
        message: "Mix one type only: scanned page images (JPG/PNG/WEBP), or a single PDF/Word file.",
      });
    }
    if (allOffice && files.length > 1) {
      return res.status(400).json({ success: false, message: "Choose ONE PDF or Word file at a time." });
    }

    let outputBuffer;
    let outputBaseName;

    if (allImages) {
      // Multiple images = multiple pages of one scanned document.
      const images = files.map((f) => ({ buffer: f.buffer }));
      outputBuffer = target === "pdf"
        ? await imagesToPdfBuffer(images)
        : await imagesToDocxBuffer(images);
      outputBaseName = baseNameOf(files[0].originalname) + (files.length > 1 ? "-scan" : "");
    } else {
      const file = files[0];
      const inputExt = extOf(file.originalname);
      if (inputExt === target || (inputExt === "doc" && target === "docx")) {
        return res.status(400).json({ success: false, message: `This file is already ${target.toUpperCase()}. Choose a different output format.` });
      }
      const infilter = inputExt === "pdf" && (target === "docx") ? "writer_pdf_import" : undefined;
      outputBuffer = await convertWithSoffice(file.buffer, inputExt, target, { infilter });
      outputBaseName = baseNameOf(file.originalname);
    }

    if (addQrCode) {
      try {
        const verifyUrl = `${requestBaseUrl(req)}/api/public/verify`;
        const qrBuf = await generateQrPngBuffer(verifyUrl, 240);
        outputBuffer = target === "pdf"
          ? await stampQrOnPdf(outputBuffer, qrBuf)
          : await stampQrOnDocx(outputBuffer, qrBuf);
      } catch (qrErr) {
        // Never sink the conversion over a stamping failure — log, send file as-is.
        console.error("Doc Tools: QR stamp failed, sending file without it:", qrErr.message);
      }
    }

    const filename = `${outputBaseName}.${target}`;
    res.setHeader("Content-Type", MIME_BY_TARGET[target]);
    res.setHeader("Content-Disposition", `attachment; filename="${filename.replace(/"/g, "")}"`);
    res.send(outputBuffer);
  } catch (err) {
    if (err && err.message && /conversion|export|filter|output/i.test(err.message)) {
      return res.status(422).json({ success: false, message: err.message });
    }
    next(err);
  }
};

module.exports = { convert };
