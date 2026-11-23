// Interface font chooser - the ONE place the font choices live.
//
// "default" is exactly the stack the system used before the chooser existed
// (index.css body). When it is selected the <html> element carries NO
// data-mk-font attribute and no --mk-font variable, so nothing changes and no
// font file is downloaded. Any other choice sets both; fonts.css then makes
// body, form controls, tables and chart text use var(--mk-font).
//
// Web fonts are self-hosted in /public/fonts (SIL OFL 1.1, see OFL.txt in each
// folder). Browsers only download an @font-face file when text actually uses
// that family, so only the chosen font is fetched.
//
// This file is plain JS (no JSX, no browser APIs at import time) because
// vite.config.js also imports it to build the no-flash script in index.html.

export const DEFAULT_FONT = "default";

export const FONT_STACKS = {
  default: "Arial, Arimo, Helvetica, sans-serif",
  arial: "Arial, Arimo, Helvetica, sans-serif",
  poppins: 'Poppins, "Segoe UI", Roboto, Arial, sans-serif',
  times: '"Times New Roman", Tinos, Times, serif',
  opensans: '"Open Sans", "Segoe UI", Roboto, Arial, sans-serif',
};

// Elements that must follow the chosen font. Form controls are listed
// because browsers do not let them inherit the page font by default.
// Only active while <html data-mk-font> exists (i.e. not for "default").
// vite.config.js injects this rule into <head> (next to the no-flash script)
// so it applies before any stylesheet or JS has loaded.
export const FONT_TARGETS = ["body", "button", "input", "select", "textarea", "option", "optgroup", "table", "th", "td", "svg text"];
export const FONT_CRITICAL_CSS = `${FONT_TARGETS.map((t) => `:root[data-mk-font] ${t}`).join(",")}{font-family:var(--mk-font)}`;

// Display names are proper names, so they are the same in every language.
export const FONT_OPTIONS = [
  { value: "default", label: "Default (Arial)" },
  { value: "arial", label: "Arial" },
  { value: "poppins", label: "Poppins" },
  { value: "times", label: "Times New Roman" },
  { value: "opensans", label: "Open Sans" },
];

export const FONT_VALUES = FONT_OPTIONS.map((o) => o.value);
export const isValidFont = (v) => typeof v === "string" && FONT_VALUES.includes(v);

// Separate memories for the two sites.
export const FONT_STORAGE_KEYS = { public: "mikumbi_public_font", staff: "mikumbi_staff_font" };

// Apply a choice to the page immediately (no reload).
export function applyFont(value) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!isValidFont(value) || value === DEFAULT_FONT) {
    root.removeAttribute("data-mk-font");
    root.style.removeProperty("--mk-font");
    return;
  }
  root.setAttribute("data-mk-font", value);
  root.style.setProperty("--mk-font", FONT_STACKS[value]);
}
