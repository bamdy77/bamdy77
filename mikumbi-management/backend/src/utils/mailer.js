// utils/mailer.js — sends password-reset emails via Gmail SMTP
//
// Setup:
//   1. Use a Gmail account (can be a dedicated one for the school, e.g.
//      mikumbisecondary.system@gmail.com).
//   2. Turn on 2-Step Verification on that Gmail account.
//   3. Create an "App Password": Google Account → Security → App Passwords.
//   4. Put these in backend/.env:
//        GMAIL_USER=youraddress@gmail.com
//        GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx   (16-char app password, no spaces)
//        FRONTEND_URL=https://your-frontend-url.com
//
// If these are not set, forgot-password requests fail with a clear error
// instead of silently doing nothing.
const nodemailer = require("nodemailer");

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  const { GMAIL_USER, GMAIL_APP_PASSWORD } = process.env;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) return null;
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });
  return transporter;
}

async function sendPasswordResetEmail(toEmail, fullName, resetUrl) {
  const t = getTransporter();
  if (!t) {
    throw new Error(
      "Email is not configured on the server yet. Ask the Head Master to set " +
      "GMAIL_USER and GMAIL_APP_PASSWORD in the backend environment."
    );
  }
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;
      border:1px solid #e0e0e0;border-radius:8px;">
      <h2 style="color:#2A3C7F;margin:0 0 4px;">Mikumbi Secondary School</h2>
      <p style="color:#666;margin:0 0 20px;font-size:13px;">School Management System</p>
      <p>Hello ${fullName || ""},</p>
      <p>We received a request to reset your password. Click the button below to
      set a new password. This link expires in <b>1 hour</b>.</p>
      <p style="text-align:center;margin:28px 0;">
        <a href="${resetUrl}" style="background:#2A3C7F;
          color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;
          font-weight:600;display:inline-block;">Reset My Password</a>
      </p>
      <p style="font-size:12.5px;color:#888;">
        If you did not request this, ignore this email — your password will not change.
      </p>
      <p style="font-size:11.5px;color:#aaa;word-break:break-all;">
        Or copy this link: ${resetUrl}
      </p>
    </div>`;
  await t.sendMail({
    from: `"Mikumbi Secondary School" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: "Password Reset — Mikumbi Secondary School System",
    html,
  });
}

module.exports = { sendPasswordResetEmail };
