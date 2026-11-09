const errorHandler = (err, req, res, next) => {
  console.error(`[ERROR] ${err.message}`);

  if (err.code === "23505") {
    return res.status(409).json({ success: false, message: "Record already exists (duplicate)." });
  }
  if (err.code === "23503") {
    return res.status(400).json({ success: false, message: "Referenced record does not exist." });
  }

  // Multer (file upload) errors — most commonly a photo/PDF/roster file
  // that's still too large, or the wrong file type. Without this, these
  // surfaced as a raw "File too large" / generic 500. `err.field` tells us
  // WHICH upload it was (photo/pdf/file), so the message stays accurate
  // instead of always saying "photo" even for a CSV/Excel roster.
  if (err.name === "MulterError") {
    const isRoster = err.field === "file";
    const isResultsPdf = err.field === "pdf";
    const message = err.code === "LIMIT_FILE_SIZE"
      ? (isRoster
          ? "That file is too large. The CSV/Excel roster limit is 5MB — try splitting it into smaller files."
          : isResultsPdf
            ? "That PDF is too large. The Publish limit is 10MB — try re-saving/exporting it at a lower scan resolution, or use \"Publish from Sheet\" to generate a compact PDF automatically."
            : "That photo is too large. Please try a smaller photo (under 5MB) or let the app compress it again.")
      : `Upload failed: ${err.message}`;
    return res.status(400).json({ success: false, message });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error.",
  });
};

module.exports = errorHandler;
