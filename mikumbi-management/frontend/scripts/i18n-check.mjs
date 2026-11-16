// Checks the language catalogs (run: node scripts/i18n-check.mjs).
//   1. every key has a non-empty English AND Kiswahili text
//   2. the {placeholders} are the same in both languages
//   3. every t("key") / tn("key", n) used in src/ exists (tn needs key.one + key.other)
//   4. no key is defined in two catalog files
//   5. the backend message catalog passes 1 and 2
//   6. the word "arifa" appears nowhere in visible text (use "ujumbe")
// Exit code 1 on any problem.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const require = createRequire(import.meta.url);
const problems = [];
const ph = (s) => [...String(s).matchAll(/\{([a-zA-Z]+)\}/g)].map((m) => m[1]).sort().join(",");

const files = ["common", "public", "staff"];
const all = {};
for (const f of files) {
  const mod = (await import(path.join(ROOT, "src/i18n/strings", `${f}.js`))).default;
  for (const [k, v] of Object.entries(mod)) {
    if (all[k]) problems.push(`duplicate key "${k}" in ${f}.js and ${all[k].file}.js`);
    all[k] = { ...v, file: f };
  }
}
for (const [k, v] of Object.entries(all)) {
  if (!v.en || !String(v.en).trim()) problems.push(`"${k}" has no English`);
  if (!v.sw || !String(v.sw).trim()) problems.push(`"${k}" has no Kiswahili`);
  if (ph(v.en) !== ph(v.sw)) problems.push(`"${k}" placeholders differ: en {${ph(v.en)}} / sw {${ph(v.sw)}}`);
}

// Keys used in code.
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]); }
const used = new Set(); const usedPlural = new Set();
for (const f of walk(path.join(ROOT, "src")).filter((f) => /\.(jsx?|mjs)$/.test(f) && !f.endsWith(path.join("i18n", "index.jsx")))) {
  const code = fs.readFileSync(f, "utf8");
  for (const m of code.matchAll(/\bt\(\s*["'`]([a-zA-Z0-9_.\- ]+)["'`]/g)) used.add(m[1]);
  for (const m of code.matchAll(/\btn\(\s*["'`]([a-zA-Z0-9_.\- ]+)["'`]/g)) usedPlural.add(m[1]);
}
for (const k of used) if (!all[k]) problems.push(`key used in code but missing: "${k}"`);
for (const k of usedPlural) for (const s of ["one", "other"]) if (!all[`${k}.${s}`]) problems.push(`plural key missing: "${k}.${s}"`);

// Backend catalog.
const backend = require(path.join(ROOT, "../backend/src/i18n/messages.js")).MESSAGES;
const seen = new Set();
for (const e of backend) {
  if (!e.en || !e.sw) problems.push(`backend message missing a language: ${JSON.stringify(e)}`);
  if (ph(e.en) !== ph(e.sw)) problems.push(`backend placeholders differ: "${e.en}"`);
  if (seen.has(e.en)) problems.push(`backend duplicate: "${e.en}"`);
  seen.add(e.en);
}

// "arifa" must not be shown anywhere (the school uses "ujumbe").
const scanDirs = ["src", "../backend/src"].map((d) => path.join(ROOT, d));
for (const f of scanDirs.flatMap(walk).filter((f) => /\.(jsx?|mjs|json|html)$/.test(f))) {
  const lines = fs.readFileSync(f, "utf8").split("\n");
  lines.forEach((l, i) => { if (/\barifa/i.test(l)) problems.push(`"arifa" in ${path.relative(ROOT, f)}:${i + 1}`); });
}

console.log(`Frontend keys: ${Object.keys(all).length} (${files.map((f) => `${f}: ${Object.values(all).filter((v) => v.file === f).length}`).join(", ")})`);
console.log(`Keys used in code: ${used.size} + plural ${usedPlural.size}`);
console.log(`Backend messages: ${backend.length}`);
if (problems.length) { console.log(`\nPROBLEMS (${problems.length}):`); problems.forEach((p) => console.log(" - " + p)); process.exit(1); }
console.log("\nAll checks passed.");
