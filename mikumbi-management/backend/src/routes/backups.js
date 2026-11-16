// routes/backups.js - database backups, Head Master (admin) ONLY.
const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const { createBackup, listBackups, readBackup, KEEP } = require("../utils/backup");
const { recordAudit } = require("../utils/auditLogger");

router.use(auth(["admin"]));

// GET /api/backups - newest first
router.get("/", async (_req, res, next) => {
  try { res.json({ keep: KEEP, backups: await listBackups() }); } catch (err) { next(err); }
});

// POST /api/backups - make one now
router.post("/", async (req, res, next) => {
  try {
    const b = await createBackup({ trigger: "manual", userId: req.user.id });
    res.status(201).json({ backup: { id: b.id, file_size: b.file_size, table_count: b.table_count, row_count: b.row_count, trigger: b.trigger, created_at: b.created_at }, message: "Backup created." });
    recordAudit({ actor: req.user, action: "backup.create", entityType: "db_backups", entityId: b.id, description: `${req.user.full_name || req.user.username} created a database backup.`, req });
  } catch (err) {
    if (/not configured/i.test(err.message)) return res.status(503).json({ message: err.message });
    next(err);
  }
});

// GET /api/backups/:id/download - decrypted, gzip-compressed JSON
router.get("/:id/download", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Invalid backup." });
    const out = await readBackup(id);
    if (!out) return res.status(404).json({ message: "Backup not found." });
    const gz = require("zlib").gzipSync(out.json);
    const day = new Date(out.row.created_at).toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
    res.setHeader("Content-Type", "application/gzip");
    res.setHeader("Content-Disposition", `attachment; filename="mikumbi-backup-${day}.json.gz"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(gz);
    recordAudit({ actor: req.user, action: "backup.download", entityType: "db_backups", entityId: id, description: `${req.user.full_name || req.user.username} downloaded database backup #${id}.`, req });
  } catch (err) { next(err); }
});

module.exports = router;
