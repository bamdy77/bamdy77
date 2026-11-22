// Shared design tokens for the whole unified system.
// Navy requested by the school: #1a50c7
//
// Every value below is a CSS custom-property reference with the ORIGINAL
// hard-coded color kept as its fallback. That means:
//  - Nothing changes visually today (System Default) - the fallback IS
//    today's look, so this is a no-op until a theme override is applied.
//  - Switching themes (see ThemeContext.jsx) just sets a `data-theme`
//    attribute on <html> and lets a small CSS block (in index.css)
//    override these custom properties - every component that already
//    uses THEME.xxx repaints automatically, with no per-page changes.
export const THEME = {
  navy: "var(--mk-navy, #1a50c7)",
  navyDark: "var(--mk-navy-dark, #10358f)",
  navyLight: "var(--mk-navy-light, #4674e0)",
  // Heading/accent TEXT color for content sitting on a themed surface
  // (cards, page backgrounds) - starts identical to navy in the System
  // Default theme (no visual change there), but lightens in Dark/Nocturne
  // so headings stay readable against a dark surface instead of going
  // dark-on-dark. Brand navy itself (sidebar, primary buttons, borders)
  // never changes - this is a separate, purely text-readability token.
  heading: "var(--mk-heading, #1a50c7)",
  // Navy used as TEXT colour (links, tab labels, outlined buttons). Same
  // navy in the light theme; a light blue in Dark/Nocturne so it can be read
  // on dark surfaces. Backgrounds keep using THEME.navy (brand colour).
  link: "var(--mk-link, #1a50c7)",
  gold: "var(--mk-gold, #D4A017)",
  bg: "var(--mk-bg, #F8FAFC)",
  surface: "var(--mk-surface, #FFFFFF)",
  border: "var(--mk-border, #E2E8F0)",
  text: "var(--mk-text, #0F172A)",
  muted: "var(--mk-muted, #64748B)",
  danger: "var(--mk-danger, #DC2626)",
  dangerLight: "var(--mk-danger-light, #FEF2F2)",
  success: "var(--mk-success, #15803D)",
  successLight: "var(--mk-success-light, #F0FDF4)",
  warning: "var(--mk-warning, #B45309)",
  warningLight: "var(--mk-warning-light, #FFFBEB)",
  // Solid colours for buttons/badges that carry WHITE text. In dark themes
  // danger/success/warning become light for text; these stay deep enough.
  dangerSolid: "var(--mk-danger-solid, #DC2626)",
  successSolid: "var(--mk-success-solid, #16A34A)",
  warningSolid: "var(--mk-warning-solid, #D97706)",
};

// Competency-level colors for the Results Management → SCHOOL EXAMINATION
// SUBJECT PERFORMANCE table. Bands follow the school's GPA scale:
//   1.0000–1.5999  A (Excellent)     - deep/dark blue
//   1.6000–2.5999  B (Very Good)     - green, with a soft gradient
//   2.6000–3.5999  C (Good)
//   3.6000–4.5999  D (Satisfactory)
//   4.6000–5.0000  F (Fail)
export const COMPETENCY_COLORS = {
  A: { background: "#0A3D1B", color: "#FFFFFF" },
  B: { background: "#2ED92E", color: "#FFFFFF" },
  C: { background: "#e9ff70", color: "#1A2E05" },
  D: { background: "#fb8b24", color: "#3A2100" },
  F: { background: "#c1121f", color: "#FFFFFF" },
};
export const competencyGrade = (label) => (label ? label.replace(/^Grade\s+/i, "").charAt(0).toUpperCase() : null);

export const SCHOOL = {
  name: "Mikumbi Secondary School",
  district: "Newala District Council",
  region: "Mtwara, Tanzania",
  poBox: "P.O. BOX 363 Newala",
  motto: "Education with work",
  regNo: "S. 1858",
  centreNo: "S4005",
};
