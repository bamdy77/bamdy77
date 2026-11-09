// controllers/verifyController.js — GET /api/public/verify
// The page a phone opens after scanning the GENERIC verification QR printed
// on every exported PDF's footer across the system (Contributions, Food
// Contribution, TAMS, Hostel, Student Management, Results, Timetable...).
// Previously that QR encoded plain text, so scanning it just ran a Google
// search on the raw sentence instead of showing anything branded. It now
// encodes a link to THIS endpoint, which renders the same branded page
// used by Joining Instructions' own per-applicant QR — school badge/logo
// top-center, confirmation message below it.
const { renderVerifyPage } = require("../utils/verifyPage");

const verifyGenericDocument = (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(renderVerifyPage({
    heading: "Nyaraka Halali ya Shule",
    message: "Nyaraka hii ni halali, imetengenezwa kwa Mfumo wa Usimamizi wa Shule ya Sekondari Mikumbi (Mikumbi Secondary School Management System).",
  }));
};

module.exports = { verifyGenericDocument };
