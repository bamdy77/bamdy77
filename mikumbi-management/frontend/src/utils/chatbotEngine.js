// utils/chatbotEngine.js - pure client-side matching. No API call, so the
// answer is always ready instantly (the ChatBot component adds a small
// artificial "typing" delay purely for a natural feel, not because it needs to).
import { FAQ, SPECIAL_CASES, GREETING, FALLBACK } from "../data/chatbotKnowledge";

// A short list of common Swahili words - if any appear in the message,
// we treat it as Swahili; otherwise English. Per spec: mirror whichever
// language the question was asked in.
const SWAHILI_HINTS = [
  "je", "vipi", "namna", "gani", "nini", "wapi", "lini", "kwa", "na", "ya",
  "ni", "au", "sina", "sijui", "naomba", "tafadhali", "habari", "mambo",
  "siwezi", "sikuweza", "nataka", "naweza", "password", "sisajiliwi",
];

export function detectLanguage(text) {
  const lower = text.toLowerCase();
  const hits = SWAHILI_HINTS.filter((w) => lower.includes(w)).length;
  return hits >= 1 ? "sw" : "en";
}

function scoreEntry(lower, keywords) {
  let score = 0;
  for (const kw of keywords) if (lower.includes(kw)) score += kw.split(" ").length; // longer phrase matches count more
  return score;
}

// `confident` marks answers solid enough that ChatBot.jsx can skip the
// Gemini call entirely (saves an API request/cost): greetings and the
// fixed SPECIAL_CASES are always confident (short, fixed wording - Gemini
// has nothing to add, and for `secrets` in particular it's safer to never
// forward that question to Gemini at all). A general FAQ hit is only
// confident when it's a clear, unambiguous winner - a strong score (a
// multi-word phrase, or several single-word hits) with real separation
// from the next-best entry - so a vague one-word overlap still goes to
// Gemini for a fuller, more specific answer instead of a generic FAQ line.
export function getAnswer(rawMessage) {
  const lower = rawMessage.toLowerCase().trim();
  const lang = detectLanguage(rawMessage);

  if (!lower) return { text: lang === "sw" ? "Andika swali lako." : "Please type your question.", lang, confident: true };

  // Greeting
  const greetScore = scoreEntry(lower, GREETING.keywords);
  if (greetScore > 0 && lower.length < 30) return { text: GREETING[lang], lang, confident: true };

  // Special fixed-answer cases take priority over the general FAQ list.
  for (const key of Object.keys(SPECIAL_CASES)) {
    const entry = SPECIAL_CASES[key];
    if (scoreEntry(lower, entry.keywords) > 0) return { text: entry[lang], lang, confident: true };
  }

  // General FAQ - pick the highest-scoring entry above a small threshold.
  let best = null, bestScore = 0, secondScore = 0;
  for (const entry of FAQ) {
    const s = scoreEntry(lower, entry.keywords);
    if (s > bestScore) { secondScore = bestScore; bestScore = s; best = entry; }
    else if (s > secondScore) { secondScore = s; }
  }
  if (best && bestScore > 0) {
    const confident = bestScore >= 2 && (bestScore - secondScore) >= 1;
    return { text: best[lang], lang, confident };
  }

  return { text: FALLBACK[lang], lang, confident: false };
}
