import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { getSiteMode } from "../utils/siteMode";
import { applyFont, isValidFont, DEFAULT_FONT, FONT_STORAGE_KEYS } from "../styles/fonts";

// Interface font for the current site (public or staff, each with its own
// browser memory). index.html already applied the saved value before React
// started (no flash); this keeps it in React state and applies changes live.
const FontContext = createContext({ font: DEFAULT_FONT, setFont: () => {} });

function readSaved(key) {
  try {
    const v = localStorage.getItem(key);
    return isValidFont(v) ? v : DEFAULT_FONT;
  } catch {
    return DEFAULT_FONT; // storage blocked (private mode) - just use the default
  }
}

export function FontProvider({ children }) {
  const key = FONT_STORAGE_KEYS[getSiteMode() === "public" ? "public" : "staff"];
  const [font, setFontState] = useState(() => readSaved(key));

  useEffect(() => { applyFont(font); }, [font]);

  // Unknown values are ignored, so a bad server/storage value can never break the page.
  const setFont = useCallback((next) => {
    if (!isValidFont(next)) return false;
    setFontState(next);
    try {
      if (next === DEFAULT_FONT) localStorage.removeItem(key);
      else localStorage.setItem(key, next);
    } catch { /* storage blocked - choice lasts for this visit only */ }
    return true;
  }, [key]);

  return <FontContext.Provider value={{ font, setFont }}>{children}</FontContext.Provider>;
}

export const useFont = () => useContext(FontContext);
