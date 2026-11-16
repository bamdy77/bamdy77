// Sentry MUST be the very first require in this file — see instrument.js
// for why. It calls dotenv.config() itself, so env vars below are already
// loaded by the time this returns.
const Sentry = require("./instrument");

process.env.TZ = "Africa/Dar_es_Salaam";

// JWT_SECRET must be set as a persistent Environment Variable on whichever
// host runs this (e.g. Render's dashboard) — a value only in a local .env
// file never reaches the deployed server. If this is missing (or changes
// between deploys), EVERY previously-issued login token instantly becomes
// invalid, which shows up later as a confusing "Invalid or expired token"
// error on some unrelated action, not at login. Fail clearly here instead.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error(
    "FATAL: JWT_SECRET is missing or too short. Set it as a persistent " +
    "Environment Variable on your host (e.g. Render → your service → " +
    "Environment tab) — not just in a local .env file — and keep the SAME " +
    "value across every redeploy, or all existing logins will break."
  );
  process.exit(1);
}

const express     = require("express");
const cors        = require("cors");
const rateLimit   = require("express-rate-limit");
const path = require("path");
const fs = require("fs");
const errorHandler = require("./middleware/errorHandler");

// ── Route imports ─────────────────────────────────────────────────────────────
const authRoutes      = require("./routes/auth");
const studentRoutes   = require("./routes/students");
const teacherRoutes   = require("./routes/teachers");
const timetableRoutes = require("./routes/timetable");
const hostelRoutes    = require("./routes/hostel");
const subjectRoutes   = require("./routes/subjects");
const classRoutes     = require("./routes/classes");
const contributionRoutes = require("./routes/contributions");
const foodRoutes = require("./routes/food");
const tamsRoutes          = require("./routes/tams");
const communicationsRoutes = require("./routes/communications");
const resultsRoutes       = require("./routes/results");
const usersRoutes         = require("./routes/users");
const auditRoutes         = require("./routes/audit");
const notificationsRoutes = require("./routes/notifications");
const settingsRoutes      = require("./routes/settings");
const joiningRoutes       = require("./routes/joining");
const idCardsRoutes       = require("./routes/idCards");
const chatbotRoutes       = require("./routes/chatbot");
const publicRoutes        = require("./routes/public");

const app  = express();
const PORT = process.env.PORT || 5000;

// Render (like most PaaS hosts) puts one reverse proxy in front of this app.
// Without this, Express/express-rate-limit see every request as coming from
// that proxy's own address — not the real visitor's — which would lump
// EVERY user of the whole app into a single shared rate-limit bucket instead
// of counting each visitor separately. "1" = trust exactly one hop of
// X-Forwarded-For (the proxy Render itself adds), which is the correct,
// safe setting for this deployment shape (never use `true`, which would
// trust an unlimited chain and let a request forge its own IP).
app.set("trust proxy", 1);

// ── Middleware ────────────────────────────────────────────────────────────────
// Browsers allowed to call this API in production. The school now runs TWO
// frontends (public website + staff site), so more than one origin is needed:
//   FRONTEND_URL     the staff site (also used for password-reset links)
//   ALLOWED_ORIGINS  comma-separated extra origins, e.g.
//                    https://mikumbi.com,https://www.mikumbi.com,https://staff.mikumbi.com
// If neither is set the old behaviour is kept ("*").
const normalizeOrigin = (o) => String(o || "").trim().replace(/\/+$/, "");
const allowedOrigins = Array.from(new Set(
  [process.env.FRONTEND_URL, ...String(process.env.ALLOWED_ORIGINS || "").split(",")]
    .map(normalizeOrigin).filter(Boolean)
));
const corsOrigin = process.env.NODE_ENV === "production" && allowedOrigins.length
  ? (origin, cb) => {
      // No Origin header = not a browser cross-site request (curl, server-to-server, same-origin) -> allow.
      if (!origin || allowedOrigins.includes(normalizeOrigin(origin))) return cb(null, true);
      return cb(null, false); // not on the list: send no CORS headers, the browser blocks it
    }
  : "*";
app.use(cors({
  origin: corsOrigin,
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization"],
  exposedHeaders: ["Content-Disposition"], // lets the browser read download file names
}));

// Security headers on every response (what the 'helmet' package would set,
// written out so there's no extra dependency): no MIME sniffing, no
// framing (clickjacking), HTTPS-only once visited, no referrer leaks, no
// camera/mic access, and - since this is a JSON/PDF API, not a website - a
// locked-down Content-Security-Policy. The few HTML pages it serves (QR
// verification) only use inline styles and the school logo.
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self' data: https:; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

// 1MB: room for the full Joining Instruction text (up to 30 sections),
// while still refusing oversized junk bodies.
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Rate limiting
// General API limit. Keyed per signed-in STAFF ACCOUNT when a valid token is
// sent, and per IP otherwise: the whole school WiFi shares one public IP
// (NAT), so an IP-only bucket of 300 requests made every teacher share one
// small allowance and the dashboard started failing with "Too many
// requests" on a busy morning.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: (req) => (req.rateLimitUser ? 1500 : 600),
  message: { success: false, message: "Too many requests. Please slow down." },
  keyGenerator: (req) => (req.rateLimitUser ? `u:${req.rateLimitUser}` : `ip:${req.ip || req.socket?.remoteAddress || "unknown"}`),
});
app.use("/api/", (req, _res, next) => {
  const h = req.headers.authorization || "";
  if (h.startsWith("Bearer ")) {
    try {
      const decoded = require("jsonwebtoken").verify(h.slice(7), process.env.JWT_SECRET);
      if (decoded && decoded.id) req.rateLimitUser = decoded.id;
    } catch { /* invalid/expired token - fall back to the IP bucket */ }
  }
  next();
});
app.use("/api/", limiter);

// Stricter limit on auth.
// IMPORTANT: keyed by IP + the username being attempted, not IP alone.
// Everyone on the school WiFi shares one public IP (NAT), so the default
// IP-only key would lump every teacher's login attempts into a single
// shared bucket — a handful of people logging in the same morning could
// lock out everyone else on that WiFi. Keying by IP+username still limits
// repeated guesses against any one account, while giving each teacher
// their own bucket.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: "Too many login attempts. Try again in 15 minutes." },
  keyGenerator: (req) => {
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    const username = req.body && typeof req.body.username === "string"
      ? req.body.username.trim().toLowerCase()
      : "";
    return `${ip}:${username}`;
  },
});
app.use("/api/auth/login", authLimiter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/api", (req, res) => {
  res.json({
    success: true,
    message: "Mikumbi Secondary School API",
    version: "1.0.0",
    timezone: "Africa/Dar_es_Salaam",
    timestamp: new Date().toLocaleString("en-TZ", { timeZone: "Africa/Dar_es_Salaam" }),
  });
});

app.get("/api/health", async (req, res) => {
  try {
    const { query } = require("./db/db");
    await query("SELECT 1");
    res.json({ success: true, status: "healthy", db: "connected" });
  } catch {
    res.status(500).json({ success: false, status: "unhealthy", db: "disconnected" });
  }
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/auth",      authRoutes);
app.use("/api/students",  studentRoutes);
app.use("/api/teachers",  teacherRoutes);
app.use("/api/timetable", timetableRoutes);
app.use("/api/hostel",    hostelRoutes);
app.use("/api/subjects",  subjectRoutes);
app.use("/api/classes",   classRoutes);
app.use("/api/contributions", contributionRoutes);
app.use("/api/food", foodRoutes);
app.use("/api/tams",          tamsRoutes);
app.use("/api/communications", communicationsRoutes);
app.use("/api/results-mgmt",  resultsRoutes);
app.use("/api/users",         usersRoutes);
app.use("/api/audit",         auditRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/settings",      settingsRoutes);
app.use("/api/joining",       joiningRoutes);
app.use("/api/id-cards",      idCardsRoutes);
app.use("/api/chatbot",       chatbotRoutes);
// Public (no login) — parent/student Results portal + Joining Instructions
// public submit/download. Mounted last among API routes so nothing above
// is ever shadowed by it.
app.use("/api/backups",       require("./routes/backups"));
app.use("/api/public",        publicRoutes);

// ── Serve the built frontend (single-service deployment) ───────────────────
// If you build the frontend (cd frontend && npm run build) and its "dist"
// folder is copied to ../frontend-dist relative to this backend, this
// server will serve it directly — meaning ONE Render service can host both
// the API and the website, which is the simplest and cheapest setup for a
// school on the free tier. If that folder doesn't exist, this is skipped
// and only the JSON API responds (useful for local development, where the
// frontend runs separately via `npm run dev` on its own port).
const FRONTEND_DIST = path.join(__dirname, "..", "frontend-dist");
if (fs.existsSync(FRONTEND_DIST)) {
  // Vite gives every JS/CSS file a content hash in its filename (e.g.
  // index-a1b2c3.js) — a NEW deploy means a NEW filename, so these can be
  // cached "forever" with zero risk of ever serving stale code. index.html
  // itself, however, must NEVER be cached — it's the only thing that tells
  // the browser which new hashed filenames to fetch. Without this,
  // index.html could sit in a browser's or Render's cache for hours,
  // pointing at yesterday's JS bundle even after a fresh push+deploy.
  app.use(express.static(FRONTEND_DIST, {
    index: false, // never auto-serve a cached index.html from here — the catch-all below always sends it explicitly with no-cache
    setHeaders: (res, filePath) => {
      if (/[\\/]fonts[\\/].+\.woff2$/.test(filePath)) {
        // Self-hosted interface fonts (font chooser). File names never change
        // for the same font version, so they can be cached for a year.
        res.setHeader("Content-Type", "font/woff2");
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else if (/[.-][a-f0-9]{8,}\.(js|css)$/.test(filePath)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  }));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    // The API's locked-down CSP (default-src 'none') would block the web
    // app's own scripts, styles and self-hosted fonts, so the app shell gets
    // a policy that allows only this origin (plus the existing map embed).
    res.setHeader("Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
      "font-src 'self'; img-src 'self' data: blob: https:; connect-src 'self' https:; " +
      "frame-src https://maps.google.com https://www.google.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    res.sendFile(path.join(FRONTEND_DIST, "index.html"));
  });
}

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found.` });
});

// Sentry must see every error BEFORE our own error handler runs, so it can
// report it upstream — this only forwards the error to errorHandler below
// afterwards (via next()), it never swallows or replaces our own response.
Sentry.setupExpressErrorHandler(app);

// Error handler
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
// Graduated students are automatically removed 2 years after graduation (per
// the Promote Students feature). Runs shortly after startup and then once a
// day — deliberately simple (no external cron needed) since this only needs
// to catch up once daily, not run continuously.
const cleanupGraduatedStudents = async () => {
  try {
    const { query } = require("./db/db");
    const toRemove = await query(
      `SELECT id, photo_url FROM students WHERE status = 'Graduated' AND graduated_at IS NOT NULL AND graduated_at < NOW() - INTERVAL '2 years'`
    );
    const ids = toRemove.rows.map((r) => r.id);
    const resultPdfsRes = ids.length
      ? await query("SELECT public_id FROM student_result_pdfs WHERE student_id = ANY($1::int[])", [ids])
      : { rows: [] };
    const result = await query(
      `DELETE FROM students WHERE status = 'Graduated' AND graduated_at IS NOT NULL AND graduated_at < NOW() - INTERVAL '2 years'`
    );
    if (result.rowCount) {
      console.log(`Removed ${result.rowCount} student(s) graduated 5+ years ago.`);
      const { deleteCloudinaryImage, deleteCloudinaryAsset, publicIdFromUrl } = require("./middleware/upload");
      toRemove.rows.forEach((r) => { const pid = publicIdFromUrl(r.photo_url); if (pid) deleteCloudinaryImage(pid); });
      resultPdfsRes.rows.forEach((r) => { if (r.public_id) deleteCloudinaryAsset(r.public_id, "raw"); });
    }
  } catch (err) {
    console.error("Graduated-student cleanup failed:", err.message);
  }
};
setTimeout(cleanupGraduatedStudents, 30 * 1000);
setInterval(cleanupGraduatedStudents, 24 * 60 * 60 * 1000);

app.listen(PORT, () => {
  console.log("─────────────────────────────────────────────────");
  console.log(`  Mikumbi Secondary School API`);
  console.log(`  Running on port ${PORT}`);
  console.log(`  Environment : ${process.env.NODE_ENV || "development"}`);
  console.log(`  Timezone    : Africa/Dar_es_Salaam`);
  console.log(`  Health check: http://localhost:${PORT}/api/health`);
  console.log(`  Email       : ${require("./utils/mailer").mailStatus()}`);
  require("./utils/backup").startAutoBackups();
  // Make result PDFs stored before the privacy change private (background, best-effort).
  setTimeout(() => {
    require("./middleware/upload").securePublicResultPdfs(require("./db/db").query)
      .catch((e) => console.error("[PDF] privacy job failed:", e.message));
  }, 15000);
  if (!process.env.FRONTEND_URL) console.log("  WARNING     : FRONTEND_URL is not set - password reset links fall back to the requesting site.");
  console.log("─────────────────────────────────────────────────");
});

module.exports = app;
