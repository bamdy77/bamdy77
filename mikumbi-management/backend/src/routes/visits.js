// routes/visits.js - how many people visit the PARENTS' website.
//
// Privacy first (see the parents' Privacy Policy):
//   - No name, phone, cookie, IP address or user agent is stored.
//   - Each visitor is counted with a short code made from a one-way hash of
//     (secret + date + IP + browser). The date is part of the hash, so the
//     same person gets a different code every day: we can count "different
//     people per day" but can never follow anyone from one day to the next.
//   - Only the page name (from a fixed list) and phone/tablet/computer are kept.
//   - Rows older than 400 days are deleted automatically.
//
// POST /api/public/visit { page }   - called by the parents' site (no login)
// GET  /api/visits/stats?from&to   - Head Master / Second Master only
const express = require("express");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const auth = require("../middleware/auth");
const { query } = require("../db/db");
const { todayTZ: schoolDate } = require("../utils/tz");

const PAGES = ["home", "results", "joining", "privacy", "terms", "support"];
const BOTS = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|curl|wget|python|headless|lighthouse/i;
const secret = () => process.env.VISIT_SALT || process.env.JWT_SECRET || "mikumbi";

function deviceOf(ua) {
  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) return "tablet";
  if (/mobi|iphone|android/i.test(ua)) return "phone";
  return "computer";
}

const pub = express.Router();
// One person opening pages quickly is fine; floods from one address are not.
const visitLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { ok: false } });

pub.post("/", visitLimiter, async (req, res) => {
  try {
    const ua = String(req.headers["user-agent"] || "").slice(0, 300);
    const page = typeof req.body?.page === "string" && PAGES.includes(req.body.page) ? req.body.page : null;
    if (!page || !ua || BOTS.test(ua)) return res.status(204).end();
    const day = schoolDate();
    const visitor = crypto.createHash("sha256").update(`${secret()}|${day}|${req.ip || ""}|${ua}`).digest("hex").slice(0, 16);
    await query(
      `INSERT INTO site_visits (day, visitor, page, device) VALUES ($1, $2, $3, $4)
       ON CONFLICT (day, visitor, page) DO UPDATE SET views = site_visits.views + 1`,
      [day, visitor, page, deviceOf(ua)]);
    res.status(204).end();
  } catch {
    res.status(204).end(); // counting must never disturb a parent's visit
  }
});

const staff = express.Router();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (v) => typeof v === "string" && DATE_RE.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime())
  && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const addDays = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const MAX_SPAN = 400; // days that are kept

// GET /api/visits/stats?from=YYYY-MM-DD&to=YYYY-MM-DD
// The fixed tiles (today, yesterday, last 7/30 days, all time) are always
// returned. The chart, pages and devices follow the chosen period (default:
// the last 30 days).
staff.get("/stats", auth(["admin", "second_master"]), async (req, res, next) => {
  try {
    const today = schoolDate();
    let from = req.query.from; let to = req.query.to;
    if ((from !== undefined && !validDate(from)) || (to !== undefined && !validDate(to)))
      return res.status(400).json({ message: "Invalid date. Use the format YYYY-MM-DD." });
    to = to || today;
    if (to > today) to = today;
    from = from || addDays(to, -29);
    if (from > to) return res.status(400).json({ message: "The start date must be on or before the end date." });
    if (from < addDays(to, -(MAX_SPAN - 1))) return res.status(400).json({ message: "Choose a period of at most 400 days." });

    const [summary, daily, pages, devices, period] = await Promise.all([
      query(`
        SELECT
          COUNT(DISTINCT visitor) FILTER (WHERE day = $1::date)                         AS today,
          COUNT(DISTINCT visitor) FILTER (WHERE day = $1::date - 1)                     AS yesterday,
          COUNT(DISTINCT (day, visitor)) FILTER (WHERE day > $1::date - 7)              AS last7,
          COUNT(DISTINCT (day, visitor)) FILTER (WHERE day > $1::date - 30)             AS last30,
          COALESCE(SUM(views) FILTER (WHERE day > $1::date - 30), 0)                    AS views30,
          COUNT(DISTINCT (day, visitor))                                                AS total,
          MIN(day)                                                                       AS since
        FROM site_visits`, [today]),
      query(`
        SELECT to_char(d::date, 'YYYY-MM-DD') AS day, COALESCE(v.visitors, 0) AS visitors
        FROM generate_series($1::date, $2::date, INTERVAL '1 day') d
        LEFT JOIN (SELECT day, COUNT(DISTINCT visitor) AS visitors FROM site_visits WHERE day BETWEEN $1 AND $2 GROUP BY day) v ON v.day = d::date
        ORDER BY d`, [from, to]),
      query(`SELECT page, COUNT(DISTINCT (day, visitor)) AS visitors, SUM(views) AS views
             FROM site_visits WHERE day BETWEEN $1 AND $2 GROUP BY page ORDER BY visitors DESC`, [from, to]),
      query(`SELECT device, COUNT(DISTINCT (day, visitor)) AS visitors
             FROM site_visits WHERE day BETWEEN $1 AND $2 GROUP BY device ORDER BY visitors DESC`, [from, to]),
      query(`SELECT COUNT(DISTINCT (day, visitor)) AS visitors, COALESCE(SUM(views), 0) AS views
             FROM site_visits WHERE day BETWEEN $1 AND $2`, [from, to]),
    ]);
    const n = (v) => Number(v || 0);
    const s = summary.rows[0];
    const days = daily.rows.length;
    const busiest = daily.rows.reduce((best, r) => (n(r.visitors) > n(best?.visitors) ? r : best), null);
    res.json({
      today: n(s.today), yesterday: n(s.yesterday), last7: n(s.last7), last30: n(s.last30),
      views30: n(s.views30), total: n(s.total), since: s.since ? new Date(s.since).toISOString().slice(0, 10) : null,
      range: {
        from, to, days, visitors: n(period.rows[0].visitors), views: n(period.rows[0].views),
        average: days ? Math.round((n(period.rows[0].visitors) / days) * 10) / 10 : 0,
        busiest: busiest && n(busiest.visitors) ? { day: busiest.day, visitors: n(busiest.visitors) } : null,
      },
      daily: daily.rows.map((r) => ({ day: r.day, visitors: n(r.visitors) })),
      pages: pages.rows.map((r) => ({ page: r.page, visitors: n(r.visitors), views: n(r.views) })),
      devices: devices.rows.map((r) => ({ device: r.device, visitors: n(r.visitors) })),
    });
    // Housekeeping: keep about 13 months only.
    query(`DELETE FROM site_visits WHERE day < $1::date - 400`, [today]).catch(() => {});
  } catch (err) { next(err); }
});

module.exports = { pub, staff };
