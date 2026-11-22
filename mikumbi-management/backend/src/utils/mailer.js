// utils/mailer.js — sends system emails (password reset, login codes)
// through Brevo's HTTPS email API. Gmail/SMTP was removed on purpose:
// Render's free plan blocks SMTP ports, so it could never send from there.
//
// Required in the backend environment:
//   BREVO_API_KEY=xkeysib-...          (Brevo -> SMTP & API -> API keys)
//   MAIL_FROM=school-account@gmail.com (a sender verified in Brevo -> Senders)
//   MAIL_FROM_NAME=Mikumbi Secondary School   (optional)
// If they are missing, requests fail with a clear message instead of
// pretending an email was sent.

const BREVO_URL = process.env.BREVO_API_URL || "https://api.brevo.com/v3/smtp/email";

async function sendViaBrevo({ to, toName, subject, html }) {
  const from = process.env.MAIL_FROM;
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
  "Email is not configured on the server yet. Ask the Head Master to set BREVO_API_KEY and MAIL_FROM in the backend environment.";
const SEND_FAILED = "The reset email could not be sent right now. Please try again later or ask the Head Master to reset your password.";

const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function sendPasswordResetEmail(toEmail, fullName, resetUrl) {
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;
      border:1px solid #e0e0e0;border-radius:4px;">
      <h2 style="color:#1a50c7;margin:0 0 4px;">Mikumbi Secondary School</h2>
      <p style="color:#666;margin:0 0 20px;font-size:13px;">School Management System</p>
      <p>Hello ${esc(fullName)},</p>
      <p>We received a request to reset your password. Click the button below to
      set a new password. This link expires in <b>1 hour</b>.</p>
      <p style="text-align:center;margin:28px 0;">
        <a href="${esc(resetUrl)}" style="background:#1a50c7;
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

  await sendMail(mail);
}

// Generic sender used by every system email.
async function sendMail(mail) {
  if (!process.env.BREVO_API_KEY || !process.env.MAIL_FROM) throw new Error(NOT_CONFIGURED);
  try { await sendViaBrevo(mail); }
  catch (e) {
    console.error("[MAIL] Brevo send failed:", e.message);
    throw new Error(SEND_FAILED);
  }
}

// Which method would be used - for the startup log (no secrets printed).
function mailStatus() {
  if (process.env.BREVO_API_KEY && process.env.MAIL_FROM) return `Brevo API (from ${process.env.MAIL_FROM})`;
  if (process.env.BREVO_API_KEY) return "INCOMPLETE - MAIL_FROM is missing";
  return "NOT CONFIGURED - set BREVO_API_KEY and MAIL_FROM";
}

module.exports = { sendPasswordResetEmail, sendMail, mailStatus, esc };
