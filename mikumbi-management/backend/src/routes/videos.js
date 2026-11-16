// routes/videos.js - training videos for parents.
//
// Upload flow (large files never pass through this server, which is small
// on Render's free plan):
//   1. staff asks GET /api/videos/upload-signature  -> signed Cloudinary params
//   2. the browser uploads the file straight to Cloudinary (with progress)
//   3. staff sends POST /api/videos { public_id, title, description }; the
//      server checks with Cloudinary that the file really exists in our
//      folder before saving it.
// Parents use /api/public/videos (list) and /api/public/videos/:id/download.
const express = require("express");
const crypto = require("crypto");
const auth = require("../middleware/auth");
const { query } = require("../db/db");
const { recordAudit } = require("../utils/auditLogger");

const FOLDER = "mikumbi/parent-videos";
const MAX_BYTES = 100 * 1024 * 1024; // Cloudinary free plan limit per video
const MANAGERS = ["admin", "second_master"];

const cfg = () => {
  const { CLOUDINARY_CLOUD_NAME: cloud, CLOUDINARY_API_KEY: key, CLOUDINARY_API_SECRET: secret } = process.env;
  return cloud && key && secret ? { cloud, key, secret } : null;
};
const apiBase = () => process.env.CLOUDINARY_API_BASE || "https://api.cloudinary.com";
const NOT_SET = "Video storage is not configured (Cloudinary settings are missing).";

// Cloudinary signature: sha1 of the sorted params + secret.
function sign(params, secret) {
  const str = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
  return crypto.createHash("sha1").update(str + secret).digest("hex");
}
const withFlag = (url, flag) => String(url).replace("/upload/", `/upload/${flag}/`);
const posterOf = (url) => withFlag(url, "so_auto,w_640,c_limit").replace(/\.[a-z0-9]+$/i, ".jpg");
// Light version for slow rural networks and low-cost phones: at most 640px
// wide (~360p), H.264/AAC (plays everywhere), economical quality and a
// capped bitrate. It is prepared right after upload (eager) so the first
// parent does not wait for it to be made. Parents stream AND download this
// version; the original stays in storage.
const LIGHT = "c_limit,w_640,q_auto:eco,vc_h264,ac_aac,br_450k";
const lightOf = (url) => withFlag(url, LIGHT).replace(/\.[a-z0-9]+$/i, ".mp4");
const publicShape = (v) => ({
  id: v.id, title: v.title, description: v.description || "", url: lightOf(v.video_url),
  poster: posterOf(v.video_url), duration: v.duration != null ? Number(v.duration) : null,
  bytes: v.bytes != null ? Number(v.bytes) : null, created_at: v.created_at,
});
const cleanText = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// ── Staff ───────────────────────────────────────────────────────────────
const staff = express.Router();

staff.get("/upload-signature", auth(MANAGERS), (_req, res) => {
  const c = cfg();
  if (!c) return res.status(503).json({ message: NOT_SET });
  const timestamp = Math.floor(Date.now() / 1000);
  // eager: Cloudinary prepares the light (and poster) versions in the background right after upload.
  const eager = `${LIGHT}/mp4|so_auto,w_640,c_limit/jpg`;
  const params = { eager, eager_async: "true", folder: FOLDER, timestamp };
  res.json({
    upload_url: `${apiBase()}/v1_1/${c.cloud}/video/upload`,
    api_key: c.key, timestamp, folder: FOLDER, eager, eager_async: "true", signature: sign(params, c.secret), max_bytes: MAX_BYTES,
  });
});

staff.get("/", auth(MANAGERS), async (_req, res, next) => {
  try {
    const { rows } = await query(`SELECT * FROM parent_videos ORDER BY created_at DESC`);
    res.json({ videos: rows.map((v) => ({ ...publicShape(v), is_active: v.is_active })) });
  } catch (err) { next(err); }
});

staff.post("/", auth(MANAGERS), async (req, res, next) => {
  try {
    const c = cfg();
    if (!c) return res.status(503).json({ message: NOT_SET });
    const title = cleanText(req.body?.title, 150);
    const description = cleanText(req.body?.description, 1000);
    const publicId = typeof req.body?.public_id === "string" ? req.body.public_id : "";
    if (!title) return res.status(400).json({ message: "Please enter a title for the video." });
    if (!publicId.startsWith(`${FOLDER}/`) || !/^[A-Za-z0-9_\-/]+$/.test(publicId) || publicId.includes(".."))
      return res.status(400).json({ message: "Invalid video reference." });
    // Confirm with Cloudinary that this file exists and really is a video in our folder.
    const r = await fetch(`${apiBase()}/v1_1/${c.cloud}/resources/video/upload/${publicId}`, {
      headers: { Authorization: "Basic " + Buffer.from(`${c.key}:${c.secret}`).toString("base64") },
    });
    if (!r.ok) return res.status(400).json({ message: "The uploaded video could not be found. Please upload it again." });
    const info = await r.json();
    if (info.bytes > MAX_BYTES) return res.status(400).json({ message: "This video is larger than 100 MB." });
    const { rows } = await query(
      `INSERT INTO parent_videos (title, description, public_id, video_url, bytes, duration, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (public_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
       RETURNING *`,
      [title, description || null, publicId, info.secure_url, info.bytes || null, info.duration || null, req.user.id]);
    res.status(201).json({ video: { ...publicShape(rows[0]), is_active: rows[0].is_active }, message: "Video published for parents." });
    recordAudit({ actor: req.user, action: "video.create", entityType: "parent_videos", entityId: rows[0].id, description: `${req.user.full_name || req.user.username} added the parent video "${title}".`, req });
  } catch (err) { next(err); }
});

staff.patch("/:id", auth(MANAGERS), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Invalid video." });
    const sets = []; const vals = [];
    if (req.body?.title !== undefined) {
      const t = cleanText(req.body.title, 150);
      if (!t) return res.status(400).json({ message: "Title cannot be empty." });
      vals.push(t); sets.push(`title = $${vals.length}`);
    }
    if (req.body?.description !== undefined) { vals.push(cleanText(req.body.description, 1000) || null); sets.push(`description = $${vals.length}`); }
    if (typeof req.body?.is_active === "boolean") { vals.push(req.body.is_active); sets.push(`is_active = $${vals.length}`); }
    if (!sets.length) return res.status(400).json({ message: "Nothing to change." });
    vals.push(id);
    const { rows } = await query(`UPDATE parent_videos SET ${sets.join(", ")} WHERE id = $${vals.length} RETURNING *`, vals);
    if (!rows.length) return res.status(404).json({ message: "Video not found." });
    res.json({ video: { ...publicShape(rows[0]), is_active: rows[0].is_active } });
  } catch (err) { next(err); }
});

staff.delete("/:id", auth(MANAGERS), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Invalid video." });
    const { rows } = await query(`DELETE FROM parent_videos WHERE id = $1 RETURNING public_id, title`, [id]);
    if (!rows.length) return res.status(404).json({ message: "Video not found." });
    require("../middleware/upload").deleteCloudinaryAsset(rows[0].public_id, "video");
    res.json({ message: "Video deleted." });
    recordAudit({ actor: req.user, action: "video.delete", entityType: "parent_videos", entityId: id, description: `${req.user.full_name || req.user.username} deleted the parent video "${rows[0].title}".`, req });
  } catch (err) { next(err); }
});

// ── Public (parents) ────────────────────────────────────────────────────
const pub = express.Router();

pub.get("/", async (_req, res, next) => {
  try {
    const { rows } = await query(`SELECT * FROM parent_videos WHERE is_active = true ORDER BY created_at DESC LIMIT 50`);
    res.json({ videos: rows.map(publicShape) });
  } catch (err) { next(err); }
});

// Sends the browser to Cloudinary with "download as file" (fl_attachment).
pub.get("/:id/download", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Video haikupatikana." });
    const { rows } = await query(`SELECT title, video_url FROM parent_videos WHERE id = $1 AND is_active = true`, [id]);
    if (!rows.length) return res.status(404).json({ message: "Video haikupatikana." });
    const name = rows[0].title.replace(/[^A-Za-z0-9 _-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "video";
    res.redirect(302, withFlag(lightOf(rows[0].video_url), `fl_attachment:${name}`));
  } catch (err) { next(err); }
});

module.exports = { staff, pub };
