// Lists user-visible text that is still hard-coded (not going through t()).
//
//   node scripts/i18n-scan.mjs [file-or-folder ...]   (default: src)
//   node scripts/i18n-scan.mjs --summary              (counts per file only)
//
// It reports JSX text, visible attributes (placeholder, title, aria-label,
// alt, label) and string literals passed to the message helpers
// (showError, showSuccess, confirm, alert, setError ...). Files listed in
// IGNORE are documented exceptions. Exit code 1 when anything is found in a
// file listed in DONE (files already fully translated), so it can run in CI.
import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import traverseMod from "@babel/traverse";

const traverse = traverseMod.default || traverseMod;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const args = process.argv.slice(2);
const summary = args.includes("--summary");
const targets = args.filter((a) => !a.startsWith("--"));

// Files that are fully translated: any finding here is a failure.
export const DONE = [
  "src/i18n", "src/components/public", "src/pages/public", "src/components/Publications.jsx",
  "src/pages/LegalPages.jsx", "src/components/LegalDoc.jsx", "src/pages/Landing.jsx",
  "src/pages/Login.jsx", "src/pages/ForgotPassword.jsx", "src/pages/ResetPassword.jsx", "src/pages/ChangePassword.jsx",
  "src/components/Layout.jsx", "src/components/NotificationBell.jsx", "src/components/AnnouncementsBanner.jsx",
  "src/components/ConfirmDialog.jsx", "src/components/ErrorModal.jsx", "src/components/SuccessModal.jsx",
  "src/components/ErrorBoundary.jsx", "src/components/WakingUp.jsx", "src/components/ImageCropModal.jsx",
  "src/components/FontChooser.jsx", "src/components/PasswordInput.jsx", "src/components/InstallAppButton.jsx",
  "src/components/ActionMenu.jsx", "src/pages/DashboardHome.jsx", "src/components/VisitorStats.jsx", "src/components/ChatBot.jsx",
  "src/components/ExamTypesManager.jsx", "src/pages/AuditLog.jsx", "src/pages/TAMS.jsx", "src/pages/LoginSecurity.jsx", "src/pages/BackupSettings.jsx", "src/pages/SmsGatewaySettings.jsx",
  "src/pages/SignatureSettings.jsx", "src/pages/IdentityCards.jsx", "src/pages/ParentVideosTab.jsx", "src/pages/Communications.jsx", "src/pages/AnalyticsDashboard.jsx", "src/components/TrendChart.jsx",
];
// Never visible text (icons, data, generated files).
const IGNORE = ["src/components/icons.jsx", "src/data/locations.js", "src/components/FeatureIcons.jsx"];

const VISIBLE_ATTRS = new Set(["placeholder", "title", "aria-label", "alt", "label", "aria-description", "emptyText", "sub", "subtitle", "caption", "hint", "message", "confirmLabel", "cancelLabel", "text", "heading", "description"]);
const MSG_FUNCS = new Set(["showError", "showSuccess", "confirm", "alert", "setError", "setMsg", "setNotice", "setResult", "setFontNote", "setLoadError"]);
const KEY_LIKE = /^[a-z][a-zA-Z0-9_-]*(\.[a-zA-Z0-9_ -]+)+\.?$/; // i18n keys such as "menu.students"
const hasWords = (s) => !KEY_LIKE.test(s) && /[A-Za-zÀ-ɏ]{2,}/.test(s) && !/^[\s\d.,:;%/()+\-–—|·•*#&@!?'"]*$/.test(s);
// Strings that are not language (units, codes, proper names that never change).
const ALLOW = /^(-[a-z]+|NEXTSMS|Android SMS Gateway|https?:\/\/\S+|[A-Z]{1,3}\d+[-\d]*|TZS|NECTA|GPA|PDF|SMS|CSV|Excel|OK|ID|EN|SW|Aa|Aa Bb 123 -|Mikumbi Secondary School|MIKUMBI SECONDARY SCHOOL|Poppins|Arial|Open Sans|Times New Roman|Form I{1,3}V?|Form IV|[A-Z]\/[A-Z]+|\d+.*)$/;

const rel = (f) => path.relative(ROOT, f).split(path.sep).join("/");
const under = (f, list) => list.some((p) => rel(f) === p || rel(f).startsWith(p + "/"));

function files(dir) {
  const st = fs.statSync(dir);
  if (st.isFile()) return [dir];
  return fs.readdirSync(dir).flatMap((n) => files(path.join(dir, n)));
}

function scan(file) {
  const code = fs.readFileSync(file, "utf8");
  // Long documents written in BOTH languages side by side (chosen with
  // lang === "en" ? ... : ...) are marked with this comment.
  if (code.includes("i18n-scan: bilingual-document")) return [];
  let ast;
  try { ast = parse(code, { sourceType: "module", plugins: ["jsx"] }); } catch (e) { return [{ line: 0, text: `PARSE ERROR ${e.message}` }]; }
  const out = [];
  const add = (node, text, kind) => {
    const s = String(text).replace(/\s+/g, " ").trim();
    if (s && hasWords(s) && !ALLOW.test(s)) out.push({ line: node.loc.start.line, kind, text: s.slice(0, 90) });
  };
  traverse(ast, {
    JSXText(p) { add(p.node, p.node.value, "text"); },
    JSXAttribute(p) {
      const name = typeof p.node.name.name === "string" ? p.node.name.name : "";
      if (!VISIBLE_ATTRS.has(name) || !p.node.value) return;
      if (p.node.value.type === "StringLiteral") add(p.node, p.node.value.value, name);
    },
    JSXExpressionContainer(p) {
      if (p.parent.type === "JSXAttribute") {
        const name = p.parent.name.name;
        if (!VISIBLE_ATTRS.has(name)) return;
      } else if (p.parent.type !== "JSXElement" && p.parent.type !== "JSXFragment") return;
      // CSS inside <style>{`...`}</style> is not language.
      if (p.parent.type === "JSXElement" && p.parent.openingElement.name.name === "style") return;
      // direct strings / template literals / ternaries of strings inside JSX
      p.traverse({
        StringLiteral(q) {
          if (q.parent.type === "CallExpression" && q.parent.callee.name === "t") return;
          if (q.parent.type === "BinaryExpression" && ["===", "!==", "==", "!="].includes(q.parent.operator)) return;
          if (q.parent.type === "ObjectProperty" && q.parent.key === q.node) return;
          if (q.parentPath.parent && q.parentPath.parent.type === "JSXAttribute" && q.parentPath.parent.name.name === "style") return;
          if (q.findParent((x) => x.isJSXAttribute() && !VISIBLE_ATTRS.has(x.node.name.name))) return;
          if (q.findParent((x) => x.isCallExpression() && ["t", "tn", "translate"].includes(x.node.callee.name))) return;
          // method arguments such as s.startsWith("session.") are code, not text
          if (q.parent.type === "CallExpression" && q.parent.callee.type === "MemberExpression") return;
          if (q.parent.type === "ObjectProperty" && /^aria-(haspopup|expanded|controls)$/.test(q.parent.key.value || q.parent.key.name || "")) return;
          if (/^[a-z][a-zA-Z0-9_-]*$/.test(q.node.value)) return; // lowercase identifiers ("nw", "month", "custom")
          add(q.node, q.node.value, "expr");
        },
        TemplateElement(q) {
          if (q.findParent((x) => x.isCallExpression() && x.node.callee.name === "t")) return;
          if (q.findParent((x) => x.isJSXAttribute() && !VISIBLE_ATTRS.has(x.node.name.name))) return;
          add(q.node, q.node.value.cooked, "expr");
        },
        JSXElement(q) { q.skip(); },
      });
    },
    // Visible text kept in data objects: { label: "...", hint: "..." }
    ObjectProperty(p) {
      const k = p.node.key.name || p.node.key.value;
      if (!["label", "hint", "text", "title", "group", "desc", "description", "placeholder", "caption", "subtitle"].includes(k)) return;
      if (p.node.value.type === "StringLiteral") add(p.node.value, p.node.value.value, `prop:${k}`);
    },
    CallExpression(p) {
      const callee = p.node.callee;
      const name = callee.name || callee.property?.name;
      if (!MSG_FUNCS.has(name)) return;
      for (const a of p.node.arguments) {
        if (a.type === "StringLiteral") add(a, a.value, name);
        if (a.type === "TemplateLiteral") add(a, a.quasis.map((q) => q.value.cooked).join("{}"), name);
        if (a.type === "ObjectExpression") for (const pr of a.properties) if (pr.value?.type === "StringLiteral" && pr.key?.name === "text") add(pr.value, pr.value.value, name);
      }
    },
  });
  return out;
}

const list = (targets.length ? targets : ["src"]).flatMap((t) => files(path.resolve(ROOT, t)))
  .filter((f) => /\.(jsx?|mjs)$/.test(f) && !under(f, IGNORE) && !rel(f).startsWith("src/i18n/"));
let total = 0; let failing = 0;
const rows = [];
for (const f of list) {
  const found = scan(f);
  if (!found.length) continue;
  total += found.length;
  const done = under(f, DONE);
  if (done) failing += found.length;
  rows.push([rel(f), found, done]);
}
rows.sort((a, b) => b[1].length - a[1].length);
for (const [f, found, done] of rows) {
  console.log(`${done ? "FAIL " : ""}${f}: ${found.length}`);
  if (!summary) for (const x of found) console.log(`   ${x.line}\t[${x.kind}] ${x.text}`);
}
console.log(`\nTotal hard-coded strings: ${total}${failing ? `  (in translated files: ${failing})` : "  (translated files: clean)"}`);
process.exit(failing ? 1 : 0);
