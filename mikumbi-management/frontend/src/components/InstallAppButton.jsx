import { useEffect, useState } from "react";
import { useLang } from "../i18n";

// "Download the App" button. Chrome/Edge/Android: opens the browser's own
// install dialog (the site is a PWA, see public/manifest.webmanifest).
// iPhone/iPad and other browsers have no install API, so the button shows
// short instructions instead. Hidden once the app is already installed.
let deferredPrompt = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredPrompt = e; });
}

const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true);
const isIOS = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

export default function InstallAppButton({ style = {} }) {
  const { t } = useLang();
  const [installed, setInstalled] = useState(isStandalone());
  const [help, setHelp] = useState("");

  useEffect(() => {
    const done = () => { setInstalled(true); deferredPrompt = null; };
    window.addEventListener("appinstalled", done);
    return () => window.removeEventListener("appinstalled", done);
  }, []);

  if (installed) return null;

  const onClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice.catch(() => ({ outcome: "dismissed" }));
      if (outcome === "accepted") setInstalled(true);
      deferredPrompt = null;
      return;
    }
    setHelp(isIOS()
      ? "On iPhone/iPad: tap the Share button in Safari, then \"Add to Home Screen\"."
      : "Open this site in Chrome or Edge, then choose \"Install app\" (or \"Add to Home screen\") from the browser menu.");
  };

  return (
    <div style={{ textAlign: "center", ...style }}>
      <button type="button" onClick={onClick} style={{
        display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 22px", borderRadius: 4,
        border: "none", background: "#fff", color: "#007aff", fontWeight: 800, fontSize: 15, cursor: "pointer",
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" />
        </svg>
        {t("app.download")}
      </button>
      {help && <p role="status" style={{ marginTop: 10, color: "rgba(255,255,255,0.92)", fontSize: 13.5, lineHeight: 1.5 }}>{help}</p>}
    </div>
  );
}
