import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { getSiteMode } from "../utils/siteMode";
import PUBLIC_STRINGS from "./strings/public";
import STAFF_STRINGS from "./strings/staff";
import COMMON_STRINGS from "./strings/common";

// One language system (English / Kiswahili) for BOTH sites.
//   Parents' site: Kiswahili by default (many parents do not read English).
//   Staff site:    English by default.
// Each site remembers its own choice in this browser. On the staff site the
// choice is also saved on the person's account (users.preferred_language),
// see StaffLangSync / StaffLangToggle, so it follows them to other devices.
//
// t("key", { n: 3 }) -> text in the current language, {placeholders} filled.
// tn("key", n, vars)  -> plural: uses "key.one" when n === 1, else "key.other".
// A key missing in the chosen language falls back to English (and warns in
// development); scripts/i18n-check.mjs proves no key is missing.
export const LANGS = ["en", "sw"];
const SITES = {
  public: { key: "mikumbi_public_lang", fallback: "sw" },
  staff: { key: "mikumbi_staff_lang", fallback: "en" },
};
export const STRINGS = { ...COMMON_STRINGS, ...PUBLIC_STRINGS, ...STAFF_STRINGS };

// The language currently shown, for code outside React (utils/api.js sends
// it to the server as Accept-Language so API messages match the screen).
let current = SITES[getSiteMode() === "public" ? "public" : "staff"].fallback;
export const getLang = () => current;

const isLang = (v) => v === "en" || v === "sw";
function readSaved(site) {
  try {
    const v = localStorage.getItem(SITES[site].key);
    return isLang(v) ? v : SITES[site].fallback;
  } catch { return SITES[site].fallback; }
}

const warned = new Set();
export function translate(lang, key, vars) {
  const entry = STRINGS[key];
  let s = entry ? (entry[lang] ?? entry.en) : undefined;
  if (s === undefined) {
    if (import.meta.env.DEV && !warned.has(key)) { warned.add(key); console.warn(`[i18n] missing key "${key}" (${lang})`); }
    s = key;
  }
  if (vars) Object.entries(vars).forEach(([k, v]) => { s = s.split(`{${k}}`).join(String(v)); });
  return s;
}

const LangContext = createContext({
  lang: "en", site: "staff", setLang: () => {},
  t: (k, v) => translate("en", k, v), tn: (k, n, v) => translate("en", `${k}.${n === 1 ? "one" : "other"}`, { n, ...v }),
});

export function LangProvider({ children, site: siteProp }) {
  const site = siteProp || (getSiteMode() === "public" ? "public" : "staff");
  const [lang, setLangState] = useState(() => readSaved(site));
  current = lang;

  const setLang = useCallback((l) => {
    if (!isLang(l)) return false;
    setLangState(l);
    current = l;
    try { localStorage.setItem(SITES[site].key, l); } catch { /* private mode - just not remembered */ }
    return true;
  }, [site]);

  useEffect(() => { current = lang; document.documentElement.lang = lang; }, [lang]);

  const t = useCallback((key, vars) => translate(lang, key, vars), [lang]);
  const tn = useCallback((key, n, vars) => translate(lang, `${key}.${n === 1 ? "one" : "other"}`, { n, ...vars }), [lang]);

  return <LangContext.Provider value={{ lang, site, setLang, t, tn }}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);

// Small "SW | EN" (parents) / "EN | SW" (staff) switch.
// onChange lets the staff site also save the choice on the account.
export function LangToggle({ dark = true, onChange, order }) {
  const { lang, setLang, site } = useLang();
  const codes = order || (site === "public" ? ["sw", "en"] : ["en", "sw"]);
  const pick = (code) => { if (code !== lang && setLang(code) && onChange) onChange(code); };
  const btn = (code) => (
    <button
      key={code} type="button" onClick={() => pick(code)} aria-pressed={lang === code}
      lang={code} title={code === "en" ? "English" : "Kiswahili"}
      style={{
        border: "none", cursor: "pointer", padding: "4px 9px", fontSize: 12, fontWeight: 800, letterSpacing: "0.04em",
        // On light/surface backgrounds the colours follow the theme (readable in Dark/Nocturne too).
        background: lang === code ? (dark ? "#fff" : "var(--mk-navy, #16356f)") : "transparent",
        color: lang === code ? (dark ? "#16356f" : "#fff") : (dark ? "#fff" : "var(--mk-link, #16356f)"),
      }}
    >{code.toUpperCase()}</button>
  );
  return (
    <div role="group" aria-label={lang === "sw" ? "Lugha" : "Language"} style={{ display: "inline-flex", border: `1px solid ${dark ? "rgba(255,255,255,0.6)" : "var(--mk-link, #16356f)"}`, flexShrink: 0 }}>
      {codes.map(btn)}
    </div>
  );
}
