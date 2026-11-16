// i18n/messages.js - English / Kiswahili versions of user-visible API messages.
//
// Every entry is { en, sw }. Placeholders such as {n} or {email} stand for
// values that change (numbers, masked email ...); they must appear in both
// versions. The lang middleware (middleware/lang.js) looks at the "message"
// of every JSON response and, when it matches one side of an entry, sends the
// other side to a person using the other language. So a controller keeps its
// message exactly as written and only this file grows. Messages that already
// existed in Kiswahili (parents' Results and Joining portals) keep their exact
// wording as the "sw" version.
//
// Terms follow the glossary (i18n/glossary.js): Head Master = Mkuu wa Shule,
// Second Master = Makamu Mkuu wa Shule, Login Number = Namba ya Kuingia ...

const MESSAGES = [
  // ── Sign in / session (middleware/auth.js, authController.js) ──────────
  { en: "Username and password required.", sw: "Andika jina la mtumiaji na nenosiri." },
  { en: "Invalid credentials.", sw: "Jina la mtumiaji au nenosiri si sahihi." },
  { en: "This account is temporarily locked after too many wrong passwords. Try again in {n} minute(s), or ask the Head Master to reset the password.",
    sw: "Akaunti hii imefungwa kwa muda baada ya kukosea nenosiri mara nyingi. Jaribu tena baada ya dakika {n}, au mwombe Mkuu wa Shule abadilishe nenosiri." },
  { en: "A login code was sent to {email}.", sw: "Namba ya kuthibitisha imetumwa kwenda {email}." },
  { en: "Enter the 6-digit code from your email.", sw: "Andika namba yenye tarakimu 6 iliyotumwa kwenye barua pepe yako." },
  { en: "This code has expired. Please sign in again to get a new code.", sw: "Namba hii imepitwa na muda. Tafadhali ingia upya upate namba mpya." },
  { en: "Wrong code. {n} attempt(s) left.", sw: "Namba si sahihi. Umebakiza majaribio {n}." },
  { en: "Too many wrong codes. Please sign in again.", sw: "Umekosea namba mara nyingi. Tafadhali ingia upya." },
  { en: "Account not available.", sw: "Akaunti hii haipatikani." },
  { en: "Access denied. No token provided.", sw: "Huruhusiwi. Tafadhali ingia kwanza." },
  { en: "This account has been deactivated. Contact the Head Master.", sw: "Akaunti hii imezimwa. Wasiliana na Mkuu wa Shule." },
  { en: "Your password was changed. Please sign in again.", sw: "Nenosiri lako limebadilishwa. Tafadhali ingia upya." },
  { en: "Forbidden. Insufficient permissions.", sw: "Huna ruhusa ya kufanya hili." },
  { en: "Your session has ended. Please sign in again.", sw: "Muda wako wa kuingia umeisha. Tafadhali ingia upya." },
  { en: "Too many requests. Please slow down.", sw: "Maombi mengi kwa muda mfupi. Tafadhali punguza kasi." },
  { en: "Too many login attempts. Try again in 15 minutes.", sw: "Majaribio mengi ya kuingia. Jaribu tena baada ya dakika 15." },
  { en: "Invalid language. Choose en or sw.", sw: "Lugha si sahihi. Chagua en au sw." },

  // ── Passwords ─────────────────────────────────────────────────────────
  { en: "Both old and new passwords required.", sw: "Andika nenosiri la zamani na jipya." },
  { en: "Old password is incorrect.", sw: "Nenosiri la zamani si sahihi." },
  { en: "Password changed successfully.", sw: "Nenosiri limebadilishwa." },
  { en: "Email is required.", sw: "Andika barua pepe." },
  { en: "If that email is registered, a reset link has been sent.", sw: "Kama barua pepe hiyo imesajiliwa, kiungo cha kubadilisha nenosiri kimetumwa." },
  { en: "Missing required fields.", sw: "Baadhi ya taarifa muhimu hazijajazwa." },
  { en: "Invalid or expired reset link.", sw: "Kiungo cha kubadilisha nenosiri si sahihi au kimepitwa na muda." },
  { en: "This reset link has expired. Please request a new one.", sw: "Kiungo hiki kimepitwa na muda. Tafadhali omba kingine." },
  { en: "Password has been reset successfully. You can now log in.", sw: "Nenosiri limebadilishwa. Sasa unaweza kuingia." },
  { en: "Password must be at least 8 characters.", sw: "Nenosiri liwe na angalau herufi 8." },
  { en: "Password is too long (maximum 128 characters).", sw: "Nenosiri ni refu mno (mwisho herufi 128)." },
  { en: "Password must contain both letters and numbers.", sw: "Nenosiri liwe na herufi na namba." },
  { en: "This password is too common. Please choose another one.", sw: "Nenosiri hili linatumiwa na watu wengi. Tafadhali chagua jingine." },
  { en: "Password must not contain the username.", sw: "Nenosiri lisiwe na jina la mtumiaji." },
  { en: "No photo uploaded.", sw: "Hakuna picha iliyopakiwa." },

  // ── General errors (middleware/errorHandler.js) ───────────────────────
  { en: "Record already exists (duplicate).", sw: "Taarifa hii tayari ipo." },
  { en: "Referenced record does not exist.", sw: "Taarifa inayohusika haipo." },
  { en: "One of the values entered is not valid. Please check the form and try again.", sw: "Moja ya taarifa ulizoandika si sahihi. Tafadhali kagua fomu na ujaribu tena." },
  { en: "One of the values entered is not allowed. Please check the form and try again.", sw: "Moja ya taarifa ulizoandika hairuhusiwi. Tafadhali kagua fomu na ujaribu tena." },
  { en: "Internal server error.", sw: "Hitilafu imetokea kwenye seva. Tafadhali jaribu tena." },
  { en: "Route {method} {path} not found.", sw: "Njia {method} {path} haipo." },

  // ── Parents' Results portal (resultsController.js) - Kiswahili original ─
  { en: "Invalid Login Number. Type the Login Number shown on the Parent's Report, for example: 2026-48319.",
    sw: "Namba ya Kuingia si sahihi. Andika Namba ya Kuingia iliyopo kwenye Ripoti ya Mzazi, mfano: 2026-48319." },
  { en: "This Login Number is not registered. Make sure you typed it exactly as it appears on the Parent's Report.",
    sw: "Namba hii ya Kuingia haijasajiliwa. Hakikisha umeiandika sawasawa na ilivyo kwenye Ripoti ya Mzazi." },
  { en: "This Login Number is not registered.", sw: "Namba hii ya Kuingia haijasajiliwa." },
  { en: "Too many wrong attempts. Please wait {n} minutes and try again, or contact the school.",
    sw: "Majaribio mengi yasiyo sahihi. Tafadhali subiri dakika {n} kisha ujaribu tena, au wasiliana na shule." },
  { en: "The phone number and the Login Number do not match.", sw: "Namba ya simu na Namba ya Kuingia hazilingani." },
  { en: "You have been signed out. Please sign in again.", sw: "Umeondoka kwenye mfumo. Tafadhali ingia tena." },
  { en: "Your session has expired. Please sign in again.", sw: "Muda wa kuingia umeisha. Tafadhali ingia tena." },
  { en: "Student not found.", sw: "Mwanafunzi hakupatikana." },
  { en: "Too many sign-in attempts. Please wait 15 minutes.", sw: "Majaribio mengi ya kuingia. Tafadhali subiri dakika 15." },
  { en: "Too many attempts from this device or network. Please wait 15 minutes.", sw: "Majaribio mengi kutoka kifaa/mtandao huu. Tafadhali subiri dakika 15." },
  { en: "Too many requests in a short time. Please wait a little.", sw: "Maombi mengi kwa muda mfupi. Tafadhali subiri kidogo." },

  // ── Joining Instructions (joiningController.js) - Kiswahili original ───
  { en: "Joining Instruction forms are not published online yet. Please contact the school.",
    sw: "Fomu za Joining Instruction bado hazijachapishwa mtandaoni. Tafadhali wasiliana na shule." },
  { en: "You have reached the download limit for the Joining Instruction ({n} times) for this student.",
    sw: "Umefikia kikomo cha kupakua Joining Instruction (mara {n}) kwa mwanafunzi huyu." },
  { en: "Your details have been submitted. This is download number {n} of the Joining Instruction for this student.",
    sw: "Umewasilisha taarifa zako. Hii ni mara ya {n} kupakua Joining Instruction kwa mwanafunzi huyu." },
  { en: "Your details have been submitted. You can now download your Joining Instruction.",
    sw: "Umewasilisha taarifa zako kikamilifu. Sasa unaweza kupakua Joining Instruction yako." },
  { en: "The download link was not found.", sw: "Kiungo cha kupakua hakikupatikana." },
  { en: "The download time has expired. Please fill in the form again.", sw: "Muda wa kupakua umeisha. Tafadhali jaza fomu tena." },
  { en: "The download link is not valid.", sw: "Kiungo cha kupakua si sahihi." },
  { en: "The applicant's details were not found.", sw: "Taarifa za mwombaji hazikupatikana." },
  { en: "Please fill in the First Name.", sw: "Tafadhali jaza Jina la Kwanza." },
  { en: "Please fill in the Surname.", sw: "Tafadhali jaza Jina la Ukoo." },
  { en: "Please fill in the District.", sw: "Tafadhali jaza Wilaya." },
  { en: "Please fill in the Ward.", sw: "Tafadhali jaza Kata." },
  { en: "Please fill in the Street/Village.", sw: "Tafadhali jaza Mtaa/Kijiji." },
  { en: "The name is too long (60 letters are enough).", sw: "Jina ni refu kupita kiasi (herufi 60 zinatosha)." },
  { en: "The District, Ward or Street/Village is too long.", sw: "Wilaya, Kata au Mtaa/Kijiji ni ndefu kupita kiasi." },
  { en: "The Examination Number is not valid. Use the format: PS1234567-0001.", sw: "Namba ya Mtihani si sahihi. Tumia mfumo: PS1234567-0001." },
  { en: "The year of finishing Standard Seven is not valid.", sw: "Mwaka wa kumaliza Darasa la Saba si sahihi." },
  { en: "This student has already reached the limit of {n} copies.", sw: "Mwanafunzi huyu tayari amefikia kikomo cha nakala {n}." },

  // ── Website visitors (routes/visits.js) ──────────────────────────────
  { en: "Invalid date. Use the format YYYY-MM-DD.", sw: "Tarehe si sahihi. Tumia mfumo YYYY-MM-DD." },
  { en: "The start date must be on or before the end date.", sw: "Tarehe ya kuanzia isiwe baada ya tarehe ya mwisho." },
  { en: "Choose a period of at most 400 days.", sw: "Chagua kipindi kisichozidi siku 400." },

  // ── Parent videos ─────────────────────────────────────────────────────
  { en: "Video not found.", sw: "Video haikupatikana." },
];

// Kiswahili ordinal words used by the Joining message ("mara ya pili").
const ORD_SW = { kwanza: 1, pili: 2, tatu: 3, nne: 4, tano: 5 };

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// "Wrong code. {n} attempt(s) left." -> /^Wrong code\. (.+?) attempt\(s\) left\.$/ and the names ["n"]
function compile(template) {
  const names = [];
  const src = template.split(/(\{[a-z]+\})/).map((part) => {
    const m = /^\{([a-z]+)\}$/.exec(part);
    if (m) { names.push(m[1]); return "(.+?)"; }
    return esc(part);
  }).join("");
  return { re: new RegExp(`^${src}$`), names };
}
const fill = (template, vars) => template.replace(/\{([a-z]+)\}/g, (_, k) => (vars[k] != null ? vars[k] : `{${k}}`));

const EXACT = { en: new Map(), sw: new Map() }; // text in one language -> entry
const PATTERNS = [];
for (const e of MESSAGES) {
  if (/\{[a-z]+\}/.test(e.en)) PATTERNS.push({ e, en: compile(e.en), sw: compile(e.sw) });
  else { EXACT.en.set(e.en, e); EXACT.sw.set(e.sw, e); }
}

// Returns the message in `lang`, or the original text when it is unknown.
function translateMessage(text, lang) {
  if (typeof text !== "string" || (lang !== "en" && lang !== "sw")) return text;
  const from = lang === "sw" ? "en" : "sw";
  const hit = EXACT[from].get(text);
  if (hit) return hit[lang];
  for (const p of PATTERNS) {
    const m = p[from].re.exec(text);
    if (!m) continue;
    const vars = {};
    p[from].names.forEach((k, i) => { vars[k] = m[i + 1]; });
    // "mara ya pili" <-> "download number 2"
    if (p.e.sw.includes("mara ya {n}")) {
      if (from === "sw" && ORD_SW[vars.n]) vars.n = String(ORD_SW[vars.n]);
      if (lang === "sw") vars.n = Object.keys(ORD_SW).find((w) => String(ORD_SW[w]) === String(vars.n)) || vars.n;
    }
    return fill(p.e[lang], vars);
  }
  return text;
}

// t(req, "English text", { n: 3 }) - for code that builds a message itself.
const t = (req, en, vars = {}) => translateMessage(fill(en, vars), req && req.lang === "sw" ? "sw" : "en");

module.exports = { MESSAGES, translateMessage, t };
