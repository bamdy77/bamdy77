// utils/nextsms.js — NextSMS Tanzania integration (unchanged logic from
// the original mikumbi-sms project, just relocated).
const axios = require("axios");

const BASE_URL = "https://messaging-service.co.tz/api/sms/v1/text/single";
const BASE_URL_M = "https://messaging-service.co.tz/api/sms/v1/text/multi";

function getAuthHeader() {
  const username = process.env.NEXTSMS_USERNAME;
  const password = process.env.NEXTSMS_PASSWORD;
  const encoded = Buffer.from(`${username}:${password}`).toString("base64");
  return `Basic ${encoded}`;
}

function formatPhone(phone) {
  phone = String(phone).replace(/\s+/g, "").replace(/-/g, "");
  if (phone.startsWith("0")) return "255" + phone.slice(1);
  if (phone.startsWith("+255")) return phone.slice(1);
  if (phone.startsWith("255")) return phone;
  return "255" + phone;
}

async function sendOne(phone, message) {
  try {
    const senderId = process.env.NEXTSMS_SENDER_ID || "Millanzi";
    const response = await axios.post(
      BASE_URL,
      { from: senderId, to: formatPhone(phone), text: message },
      { headers: { Authorization: getAuthHeader(), "Content-Type": "application/json", Accept: "application/json" } }
    );
    return { success: true, data: response.data };
  } catch (err) {
    console.error("NextSMS Error:", err.response?.data || err.message);
    return { success: false, error: err.response?.data || err.message };
  }
}

async function sendBulk(phoneList, message) {
  if (!phoneList || phoneList.length === 0) return { success: false, error: "No recipients" };
  if (phoneList.length === 1) return await sendOne(phoneList[0], message);

  try {
    const senderId = process.env.NEXTSMS_SENDER_ID || "Millanzi";
    const messages = phoneList.map((phone) => ({ from: senderId, to: formatPhone(phone), text: message }));
    const response = await axios.post(
      BASE_URL_M,
      { messages },
      { headers: { Authorization: getAuthHeader(), "Content-Type": "application/json", Accept: "application/json" } }
    );
    return { success: true, data: response.data, count: phoneList.length };
  } catch (err) {
    console.error("NextSMS Bulk Error:", err.response?.data || err.message);
    return { success: false, error: err.response?.data || err.message };
  }
}

// Same "multi" NextSMS endpoint as sendBulk, but each recipient gets THEIR
// OWN message text instead of one shared message for everyone — needed for
// personalized sends (e.g. exam results, where every parent's SMS names
// their own child and that child's own marks/division/position).
// items: [{ phone, text }, ...]
async function sendBulkPersonalized(items) {
  if (!items || items.length === 0) return { success: false, error: "No recipients" };
  if (items.length === 1) return await sendOne(items[0].phone, items[0].text);

  try {
    const senderId = process.env.NEXTSMS_SENDER_ID || "Millanzi";
    const messages = items.map((it) => ({ from: senderId, to: formatPhone(it.phone), text: it.text }));
    const response = await axios.post(
      BASE_URL_M,
      { messages },
      { headers: { Authorization: getAuthHeader(), "Content-Type": "application/json", Accept: "application/json" } }
    );
    return { success: true, data: response.data, count: items.length };
  } catch (err) {
    console.error("NextSMS Personalized Bulk Error:", err.response?.data || err.message);
    return { success: false, error: err.response?.data || err.message };
  }
}

module.exports = { sendOne, sendBulk, sendBulkPersonalized, formatPhone };
