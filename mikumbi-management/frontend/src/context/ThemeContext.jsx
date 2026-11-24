import { createContext, useContext, useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "mikumbi_theme";
const VALID = ["default", "dark", "nocturne"];
// Anyone who already has an old theme name saved (from before either
// rename) keeps their choice - it just resolves to "nocturne" under the hood.
const LEGACY_ALIASES = { slate: "nocturne", onyx: "nocturne" };

export const THEME_OPTIONS = [
  { value: "default", label: "System Default", swatch: "#007aff" },
  { value: "dark", label: "Dark", swatch: "#141B2D" },
  { value: "nocturne", label: "Nocturne", swatch: "#0A1A2E" },
];

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const resolved = LEGACY_ALIASES[saved] || saved;
      return VALID.includes(resolved) ? resolved : "default";
    } catch {
      return "default";
    }
  });

  useEffect(() => {
    if (theme === "default") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", theme);
    }
  }, [theme]);

  const setTheme = useCallback((next) => {
    if (!VALID.includes(next)) return;
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore - theme just won't persist across reloads */
    }
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
