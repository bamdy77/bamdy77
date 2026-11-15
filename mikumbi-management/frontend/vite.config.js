import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { FONT_STACKS, FONT_STORAGE_KEYS, DEFAULT_FONT, FONT_CRITICAL_CSS } from "./src/styles/fonts.js";

// Puts a tiny inline script at the top of <head> that applies the saved
// interface font BEFORE React renders, so there is no flash of the old font
// on reload. It decides public vs staff exactly like src/utils/siteMode.js.
function earlyFontScript(env) {
  const hosts = String(env.VITE_PUBLIC_HOSTS || "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  const forced = String(env.VITE_FORCE_SITE || "").toLowerCase();
  const stacks = { ...FONT_STACKS }; delete stacks[DEFAULT_FONT];
  const code = `(function(){try{var H=${JSON.stringify(hosts)},F=${JSON.stringify(forced)},S=${JSON.stringify(stacks)},K=${JSON.stringify(FONT_STORAGE_KEYS)};
var h=location.hostname.toLowerCase(),site="staff";
if(F==="public"||F==="staff"){site=F}else if(H.indexOf(h)>-1){site="public"}else if(h==="localhost"||h==="127.0.0.1"||/\\.vercel\\.app$/.test(h)){var q=new URLSearchParams(location.search).get("site");var s=(q==="public"||q==="staff")?q:sessionStorage.getItem("mikumbi_site_override");if(s==="public")site="public"}
var f=localStorage.getItem(K[site]);if(f&&Object.prototype.hasOwnProperty.call(S,f)){var r=document.documentElement;r.setAttribute("data-mk-font",f);r.style.setProperty("--mk-font",S[f])}}catch(e){}})();`;
  return {
    name: "mikumbi-early-font",
    transformIndexHtml() {
      return [
        { tag: "script", children: code, injectTo: "head-prepend" },
        { tag: "style", attrs: { id: "mk-font-critical" }, children: FONT_CRITICAL_CSS, injectTo: "head" },
      ];
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    plugins: [react(), earlyFontScript(env)],
    server: {
      proxy: {
        "/api": { target: "http://localhost:5000", changeOrigin: true },
      },
    },
  };
});
