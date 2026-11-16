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

// GET /api/backups/:id/excel - the same backup as a readable Excel workbook:
// one sheet per kind of record, with friendly names. Passwords, login codes,
// tokens and other secrets are left out, and internal system tables skipped.
const SKIP_TABLES = new Set(["db_backups", "login_challenges", "trusted_devices", "unlock_requests", "tams_device_registrations", "timetable_generations"]);
const SECRET_COLS = /^(password|reset_token_hash|reset_token_expires|token_hash|code_hash|android_sms_gateway_password)$/;
const SHEET_NAMES = {
  students: "Wanafunzi (Students)", users: "Watumishi (Staff accounts)", teachers: "Walimu (Teachers)",
  scores: "Alama (Scores)", score_sheets: "Mitihani (Score sheets)", academic_periods: "Vipindi vya Mitihani",
  student_charges: "Michango ya Wanafunzi", contribution_parttime: "Michango Part-Time",
  contribution_parttime_payments: "Malipo Part-Time", food_contribution_entries: "Michango ya Chakula",
  hostel_rooms: "Vyumba vya Hosteli", hostel_occupants: "Wakazi wa Hosteli", hostel_contributions: "Ada za Hosteli",
  hostel_discipline: "Nidhamu Hosteli", hostel_history: "Historia Hosteli", tams_attendance: "Mahudhurio ya Walimu",
  joining_applications: "Maombi ya Kujiunga", student_history: "Historia ya Wanafunzi", subjects: "Masomo (Subjects)",
  school_classes: "Madarasa (Classes)", timetable: "Ratiba (Timetable)", timetable_periods: "Vipindi vya Ratiba",
  announcements: "Matangazo", sms_parent_contacts: "Namba za Wazazi", audit_log: "Kumbukumbu (Audit log)",
};
// Sheets in the order of SHEET_NAMES (students first); the rest after, A-Z.
const rank = (t) => { const i = Object.keys(SHEET_NAMES).indexOf(t); return i < 0 ? 999 : i; };
const nice = (col) => col.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

router.get("/:id/excel", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Invalid backup." });
    const out = await readBackup(id);
    if (!out) return res.status(404).json({ message: "Backup not found." });
    const dump = JSON.parse(out.json.toString("utf8"));
    const ExcelJS = require("exceljs");
    const wb = new ExcelJS.Workbook();
    wb.creator = "Mikumbi Secondary School";
    const used = new Set();
    const order = Object.keys(dump.tables).filter((t) => !SKIP_TABLES.has(t))
      .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
    for (const t of order) {
      const rows = dump.tables[t];
      if (!rows.length && !SHEET_NAMES[t]) continue; // skip empty technical tables
      let name = (SHEET_NAMES[t] || nice(t)).replace(/[\\/?*[\]:]/g, "").slice(0, 31);
      while (used.has(name)) name = name.slice(0, 28) + "_" + used.size;
      used.add(name);
      const ws = wb.addWorksheet(name);
      const cols = Array.from(rows.reduce((s, r) => { Object.keys(r).forEach((k) => s.add(k)); return s; }, new Set()))
        .filter((c) => !SECRET_COLS.test(c));
      if (!cols.length) { ws.addRow(["Hakuna taarifa (No records)"]); continue; }
      ws.columns = cols.map((c) => ({ header: nice(c), key: c, width: Math.min(40, Math.max(12, nice(c).length + 2)) }));
      ws.getRow(1).font = { bold: true };
      ws.views = [{ state: "frozen", ySplit: 1 }];
      for (const r of rows) {
        ws.addRow(Object.fromEntries(cols.map((c) => {
          const v = r[c];
          return [c, v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : v];
        })));
      }
    }
    const day = new Date(out.row.created_at).toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="Mikumbi-Data-${day}.xlsx"`);
    res.setHeader("Cache-Control", "private, no-store");
    await wb.xlsx.write(res);
    res.end();
    recordAudit({ actor: req.user, action: "backup.download_excel", entityType: "db_backups", entityId: id, description: `${req.user.full_name || req.user.username} downloaded backup #${id} as Excel.`, req });
  } catch (err) { next(err); }
});

module.exports = router;
