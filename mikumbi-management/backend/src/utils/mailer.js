// utils/mailer.js — sends password-reset emails.
//
// Two ways to send, tried in this order:
//
// 1) Brevo email API over HTTPS (RECOMMENDED on Render).
//    Render's free plan blocks outgoing SMTP ports (25/465/587), so Gmail
//    SMTP silently cannot connect there. An HTTPS email API is not blocked.
//      BREVO_API_KEY=xkeysib-...            (Brevo → SMTP & API → API keys)
//      MAIL_FROM=school-account@gmail.com   (must be a verified sender in Brevo)
//      MAIL_FROM_NAME=Mikumbi Secondary School   (optional)
//
// 2) Gmail SMTP (works on a paid Render plan or any host that allows SMTP).
//      GMAIL_USER=school-account@gmail.com
//      GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx  (16-char App Password, no spaces;
//                                            needs 2-Step Verification on)
//
// Always also set FRONTEND_URL=https://<staff site> so the link opens the
// right website. If nothing is configured, the request fails with a clear
// message instead of pretending an email was sent.
const nodemailer = require("nodemailer");

const BREVO_URL = process.env.BREVO_API_URL || "https://api.brevo.com/v3/smtp/email";

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  const { GMAIL_USER, GMAIL_APP_PASSWORD } = process.env;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) return null;
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: GMAIL_USER, pass: String(GMAIL_APP_PASSWORD).replace(/\s+/g, "") },
    // Fail fast (instead of hanging ~2 minutes) where SMTP is blocked.
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
  });
  return transporter;
}

async function sendViaBrevo({ to, toName, subject, html }) {
  const from = process.env.MAIL_FROM || process.env.GMAIL_USER;
  if (!from) throw new Error("MAIL_FROM is not set (the verified sender address in Brevo).");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(BREVO_URL, {
      method: "POST",
      headers: { "api-key": process.env.BREVO_API_KEY, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { email: from, name: process.env.MAIL_FROM_NAME || "Mikumbi Secondary School" },
        to: [{ email: to, name: toName || to }],
        subject, htmlContent: html,
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      throw new Error(`Brevo refused the email (HTTP ${r.status}): ${body.slice(0, 200)}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

const NOT_CONFIGURED =
  "Email is not configured on the server yet. Ask the Head Master to set BREVO_API_KEY and MAIL_FROM " +
  "(or GMAIL_USER and GMAIL_APP_PASSWORD) in the backend environment.";
const SEND_FAILED = "The reset email could not be sent right now. Please try again later or ask the Head Master to reset your password.";

const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function sendPasswordResetEmail(toEmail, fullName, resetUrl) {
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;
      border:1px solid #e0e0e0;border-radius:4px;">
      <h2 style="color:#0c426f;margin:0 0 4px;">Mikumbi Secondary School</h2>
      <p style="color:#666;margin:0 0 20px;font-size:13px;">School Management System</p>
      <p>Hello ${esc(fullName)},</p>
      <p>We received a request to reset your password. Click the button below to
      set a new password. This link expires in <b>1 hour</b>.</p>
      <p style="text-align:center;margin:28px 0;">
        <a href="${esc(resetUrl)}" style="background:#0c426f;
          color:#fff;text-decoration:none;padding:12px 28px;border-radius:4px;
          font-weight:600;display:inline-block;">Reset My Password</a>
      </p>
      <p style="font-size:12.5px;color:#888;">
        If you did not request this, ignore this email — your password will not change.
      </p>
      <p style="font-size:11.5px;color:#aaa;word-break:break-all;">
        Or copy this link: ${esc(resetUrl)}
      </p>
    </div>`;
  const mail = { to: toEmail, toName: fullName, subject: "Password Reset — Mikumbi Secondary School System", html };

  if (process.env.BREVO_API_KEY) {
    try { await sendViaBrevo(mail); return; }
    catch (e) {
      console.error("[MAIL] Brevo send failed:", e.message);
      if (!getTransporter()) throw new Error(SEND_FAILED);
    }
  }
  const t = getTransporter();
  if (!t) throw new Error(NOT_CONFIGURED);
  try {
    await t.sendMail({ from: `"Mikumbi Secondary School" <${process.env.GMAIL_USER}>`, to: toEmail, subject: mail.subject, html });
  } catch (e) {
    // Most common causes: SMTP blocked by the host (Render free plan),
    // wrong App Password, or 2-Step Verification not enabled on Gmail.
    console.error("[MAIL] Gmail SMTP send failed:", e.code || "", e.message);
    throw new Error(SEND_FAILED);
  }
}

// Which method would be used - for the startup log (no secrets printed).
function mailStatus() {
  if (process.env.BREVO_API_KEY) return `Brevo API (from ${process.env.MAIL_FROM || process.env.GMAIL_USER || "MISSING MAIL_FROM"})`;
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) return "Gmail SMTP (blocked on Render's free plan)";
  return "NOT CONFIGURED - password reset emails cannot be sent";
}

module.exports = { sendPasswordResetEmail, mailStatus };
