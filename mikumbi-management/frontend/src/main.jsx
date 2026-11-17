import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import { FontProvider } from "./context/FontContext.jsx";
import "./index.css";
import "./styles/fonts.css";
import { reloadOnceForNewVersion } from "./utils/lazyWithRetry";

// A file the page needs could not be loaded (network changed, or a new
// version replaced it): reload once instead of breaking the page.
window.addEventListener("vite:preloadError", (e) => { if (reloadOnceForNewVersion()) e.preventDefault(); });

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <FontProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </FontProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

// Register the (no-cache) service worker so the staff site can be installed as an app.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => {}); });
}
