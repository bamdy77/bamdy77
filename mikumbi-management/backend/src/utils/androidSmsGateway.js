// utils/androidSmsGateway.js — "Android SMS Gateway" integration: a phone
// running the well-known open-source "SMS Gateway for Android" app
// (https://sms-gate.app) exposes a small REST API that this backend calls;
// the PHONE'S OWN SIM sends the actual SMS. Useful as a free/no-credit-cost
// alternative to NextSMS for schools without an SMS budget.
//
// Unlike nextsms.js (which reads its credentials from process.env, fixed at
// deploy time), the Gateway's address/username/password are configured by
// Admin/Second Master/Academic from Settings → SMS Gateway, since they
// describe one specific physical phone the school owns — so every function
// here takes that config as an explicit argument rather than reading env
// vars, and callers must load it (school_settings) themselves first.
//
// API contract (standard for this app, "local" mode — the phone and this
// server reachable on the same network/internet, no cloud relay):
//   POST {url}/message
//   Authorization: Basic base64(username:password)
//   Body: { "message": "...", "phoneNumbers": ["+255700000000"] }
// If a school's specific gateway build uses a different path (some forks
// use "/3rdparty/v1/messages"), only GATEWAY_MESSAGE_PATH below needs to
// change — nothing else in this file assumes the exact path.
const axios = require("axios");

function getAuthHeader(config) {
  const encoded = Buffer.from(`${config.username}:${config.password}`).toString("base64");
  return `Basic ${encoded}`;
}

// Same normalization nextsms.js uses, but keeping a leading "+" — most
// Android SMS Gateway builds expect E.164 ("+255...") rather than NextSMS's
// bare "255..." format.
function formatPhone(phone) {
  let p = String(phone).replace(/\s+/g, "").replace(/-/g, "");
  if (p.startsWith("0")) p = "255" + p.slice(1);
  else if (p.startsWith("+255")) p = p.slice(1);
  else if (!p.startsWith("255")) p = "255" + p;
  return "+" + p;
}

// Work out the exact "send a message" endpoint from whatever the school
// typed as the URL, supporting both ways the app can run:
//   • Cloud server  — the app's hosted relay. URL is api.sms-gate.app; the
//     send endpoint is /3rdparty/v1/message. (A cloud-hosted backend like
//     ours can ONLY reach the phone this way; a phone on home Wi-Fi is not
//     reachable from the internet.)
//   • Local server  — the phone exposes its own address (http://192.168..:8080);
//     the send endpoint is /message.
// If the school already pasted a full endpoint (ending in /message or
// /messages), it's used as-is.
function buildUrl(config) {
  const base = String(config.url || "").trim().replace(/\/+$/, "");
  if (/\/messages?$/i.test(base)) return base;                       // full endpoint pasted
  if (/(^|\/\/)([a-z0-9-]+\.)?sms-gate\.app/i.test(base))            // cloud server
    return base.replace(/\/3rdparty.*$/i, "") + "/3rdparty/v1/message";
  return base + "/message";                                         // local server base
}

function assertConfigured(config) {
  if (!config || !config.url || !config.username || !config.password) {
    throw new Error(
      "Android SMS Gateway is not configured yet. Go to Settings → SMS Gateway and enter the phone's URL, username, and password first."
    );
  }
}

async function sendOne(phone, message, config) {
  try {
    assertConfigured(config);
    const response = await axios.post(
      buildUrl(config),
      { message, phoneNumbers: [formatPhone(phone)] },
      { headers: { Authorization: getAuthHeader(config), "Content-Type": "application/json", Accept: "application/json" }, timeout: 15000 }
    );
    return { success: true, data: response.data };
  } catch (err) {
    console.error("Android SMS Gateway Error:", err.response?.data || err.message);
    return { success: false, error: err.response?.data?.message || err.response?.data || err.message };
  }
}

// The Gateway's /message endpoint sends the SAME text to every number in
// one call — there is no bulk-personalized endpoint like NextSMS's "multi",
// so a personalized batch (every parent gets their own child's marks) has
// to be one request per message. Kept sequential (not Promise.all) so one
// slow/failing request can't flood the phone with a burst of simultaneous
// requests.
async function sendBulkPersonalized(items, config) {
  if (!items || items.length === 0) return { success: false, error: "No recipients" };
  assertConfigured(config);
  if (items.length === 1) return sendOne(items[0].phone, items[0].text, config);

  let sent = 0;
  const failures = [];
  for (const it of items) {
    const r = await sendOne(it.phone, it.text, config);
    if (r.success) sent += 1;
    else failures.push({ phone: it.phone, error: r.error });
  }
  if (sent === 0) return { success: false, error: failures[0]?.error || "All sends failed", failures };
  return { success: true, count: sent, failures };
}

module.exports = { sendOne, sendBulkPersonalized, formatPhone };
