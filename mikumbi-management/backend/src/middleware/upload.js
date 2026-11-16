const multer = require("multer");
const path = require("path");
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Keeps the uploaded file in memory only — never written to local disk —
// since it's forwarded straight to Cloudinary.
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (!file.mimetype.startsWith("image/")) return cb(new Error("Only image files are allowed."));
  cb(null, true);
};

const uploadStudentPhoto = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// Head Master's signature and the school stamp — Settings → "Saini na
// Mhuri wa Shule". The background-removal (turning the white paper behind
// the ink into a transparent PNG) happens entirely in the BROWSER before
// this ever runs (see frontend/src/utils/signatureBackground.js) — by the
// time a file reaches this middleware it's already a transparent PNG, this
// just needs to accept an image and forward it to Cloudinary unchanged.
const uploadBrandingImage = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

const pdfFileFilter = (req, file, cb) => {
  if (file.mimetype !== "application/pdf") return cb(new Error("Only PDF files are allowed."));
  cb(null, true);
};
// Used by Results Management "Publish" — the Head Master/Academic Master
// just picks a PDF file directly; it uploads straight to Cloudinary here,
// with no manual Cloudinary-dashboard-and-paste-the-URL step required.
// Capped at 10MB (below Render/Cloudinary's own limits) so a manually
// chosen file — e.g. a phone-scanned score sheet — can't slip through as an
// unbounded upload; server-generated reports (PDFKit, vector text) never
// get anywhere near this size, so this only ever affects the manual-upload
// path, not "Export PDF" or "Publish from Sheet".
const uploadResultsPdf = multer({
  storage,
  fileFilter: pdfFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Bulk Student Registration — Head Master/Second Master upload a CSV or
// Excel (.xlsx/.xls) roster instead of typing each student in one at a
// time. Kept in memory only (never written to disk), same as every other
// upload here — the file is parsed straight from the buffer and discarded.
// CSV mimetype detection is notoriously inconsistent across browsers/OS
// (some send "text/csv", others "application/vnd.ms-excel", or even
// "text/plain" for a plain-saved CSV), so the file EXTENSION is checked
// first and is what actually decides whether it's accepted — the mimetype
// list below only widens what's allowed, it never narrows it.
const rosterFileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || "").toLowerCase();
  const allowedExt = [".csv", ".xlsx", ".xls"];
  const allowedMime = [
    "text/csv", "application/csv", "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
  ];
  if (!allowedExt.includes(ext) && !allowedMime.includes(file.mimetype)) {
    return cb(new Error("Only CSV or Excel (.xlsx/.xls) files are allowed."));
  }
  cb(null, true);
};
const uploadStudentRoster = multer({
  storage,
  fileFilter: rosterFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB — a roster file is plain text/tabular, never this large legitimately.
});

// Uploads a buffer (from multer's memoryStorage) to Cloudinary and resolves
// with the result object (we only need result.secure_url and result.public_id).
function uploadBufferToCloudinary(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "mikumbi/students", resource_type: "image", ...options },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });
}

// Deletes a previously-uploaded Cloudinary image by its public_id (best-effort).
function deleteCloudinaryImage(publicId) {
  if (!publicId) return Promise.resolve();
  return cloudinary.uploader.destroy(publicId).catch(() => {});
}

// Same idea, but for any resource_type (e.g. "raw" — used by PDFs like the
// per-student exported/published result PDFs). Best-effort: a failure here
// never blocks whatever DB delete triggered it.
function deleteCloudinaryAsset(publicId, resourceType = "image") {
  if (!publicId) return Promise.resolve();
  // Result PDFs may be stored either public ("upload") or private
  // ("authenticated") - try both so nothing is left behind.
  return Promise.all(["upload", "authenticated"].map((type) =>
    cloudinary.uploader.destroy(publicId, { resource_type: resourceType, type }).catch(() => {})));
}

// ── Private result PDFs ───────────────────────────────────────────────
// Result PDFs are uploaded as type "authenticated": their stored URL does
// NOT open on its own (Cloudinary answers 401), so a leaked link is useless.
// The server fetches them with a short-lived signed URL and streams them to
// a logged-in staff member.
const PRIVATE_RAW = { resource_type: "raw", type: "authenticated" };

function signedPrivateUrl(storedUrl, publicId) {
  if (!storedUrl || !/\/authenticated\//.test(storedUrl) || !publicId) return storedUrl; // older public file
  return cloudinary.utils.private_download_url(publicId, "", {
    resource_type: "raw", type: "authenticated", expires_at: Math.floor(Date.now() / 1000) + 300,
  });
}

// One-time background job: moves result PDFs uploaded before this change
// from public to private. Safe to run on every start (does nothing once done).
async function securePublicResultPdfs(query) {
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) return;
  for (const table of ["published_results", "student_result_pdfs"]) {
    let rows = [];
    try {
      ({ rows } = await query(`SELECT id, public_id FROM ${table} WHERE public_id IS NOT NULL AND pdf_url NOT LIKE '%/authenticated/%' LIMIT 500`));
    } catch { continue; }
    for (const r of rows) {
      try {
        const moved = await cloudinary.uploader.rename(r.public_id, r.public_id, { resource_type: "raw", type: "upload", to_type: "authenticated", overwrite: true });
        await query(`UPDATE ${table} SET pdf_url = $1 WHERE id = $2`, [moved.secure_url, r.id]);
      } catch (e) {
        console.error(`[PDF] could not make ${table} #${r.id} private:`, e.message || e);
      }
    }
    if (rows.length) console.log(`[PDF] ${table}: ${rows.length} older result PDF(s) checked for privacy.`);
  }
}

// Derives the Cloudinary public_id back out of a stored secure_url, so we can
// delete the old photo when a student uploads a replacement.
function publicIdFromUrl(url) {
  if (!url) return null;
  const match = url.match(/\/mikumbi\/students\/([^./]+)\.[a-zA-Z0-9]+$/);
  return match ? `mikumbi/students/${match[1]}` : null;
}

// Rewrites a Cloudinary secure_url to request a resized, auto-compressed
// derivative instead of the full original upload — used when embedding a
// student's photo into an exported PDF, since students can upload photos
// straight from a phone camera (several MB, thousands of pixels) but the
// PDF only ever displays it at postage-stamp size. Cloudinary generates and
// caches the small version on first request, so this costs nothing extra
// to serve after the first PDF export. Falls back to the original URL
// untouched if it isn't a Cloudinary URL (e.g. a stale/manual URL).
function cloudinaryResized(url, transform) {
  if (!url || typeof url !== "string") return url;
  const marker = "/upload/";
  const i = url.indexOf(marker);
  if (i === -1) return url;
  return url.slice(0, i + marker.length) + transform + "/" + url.slice(i + marker.length);
}

// Same idea as publicIdFromUrl above, but for account-header profile photos,
// which live under the "mikumbi/users/" Cloudinary folder instead of
// "mikumbi/students/". Kept as its own function (rather than generalizing
// publicIdFromUrl) so the existing, already-tested student photo flow is
// never touched by this change.
function publicIdFromUserPhotoUrl(url) {
  if (!url) return null;
  const match = url.match(/\/mikumbi\/users\/([^./]+)\.[a-zA-Z0-9]+$/);
  return match ? `mikumbi/users/${match[1]}` : null;
}

// Same idea as publicIdFromUrl above, but for Head Master signature / school
// stamp images (Settings → "Saini na Mhuri wa Shule"), which live under the
// "mikumbi/branding/" Cloudinary folder instead of "mikumbi/students/".
function publicIdFromBrandingUrl(url) {
  if (!url) return null;
  const match = url.match(/\/mikumbi\/branding\/([^./]+)\.[a-zA-Z0-9]+$/);
  return match ? `mikumbi/branding/${match[1]}` : null;
}

module.exports = { PRIVATE_RAW, signedPrivateUrl, securePublicResultPdfs, uploadStudentPhoto, uploadResultsPdf, uploadStudentRoster, uploadBrandingImage, uploadBufferToCloudinary, deleteCloudinaryImage, deleteCloudinaryAsset, publicIdFromUrl, publicIdFromUserPhotoUrl, publicIdFromBrandingUrl, cloudinaryResized };
