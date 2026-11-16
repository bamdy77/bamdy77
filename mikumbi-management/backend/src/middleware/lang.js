// middleware/lang.js - which language the person reading the response uses.
//
// The frontend sends its selected language on every request as
// "Accept-Language: en" or "Accept-Language: sw" (utils/api.js). Direct
// download links that cannot send headers (window.open, <a href>) add
// "?lang=en" or "?lang=sw". Anything else is ignored: only the two exact
// values are accepted, so the header can never inject anything. When nothing
// usable is sent the language is English, the API's original language.
//
// The language is only used to choose message text: res.json() is wrapped so
// a known "message" is sent in req.lang (see i18n/messages.js). Status codes
// and the rest of the response stay exactly as the controller wrote them.
const { translateMessage } = require("../i18n/messages");

function pickLang(req) {
  const q = typeof req.query?.lang === "string" ? req.query.lang.toLowerCase() : "";
  if (q === "en" || q === "sw") return q;
  const h = String(req.headers["accept-language"] || "").trim().toLowerCase();
  const first = h.split(",")[0].split(";")[0].trim();
  if (first === "sw" || first.startsWith("sw-")) return "sw";
  return "en";
}

module.exports = function lang(req, res, next) {
  req.lang = pickLang(req);
  const json = res.json.bind(res);
  res.json = (body) => {
    if (body && typeof body === "object" && !Array.isArray(body) && typeof body.message === "string") {
      const message = translateMessage(body.message, req.lang);
      if (message !== body.message) body = { ...body, message };
    }
    return json(body);
  };
  next();
};
module.exports.pickLang = pickLang;
