import { Routes, Route, Navigate, useSearchParams, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { API_BASE } from "./utils/api";
import { PublicPrivacy, PublicTerms, PublicSupport } from "./pages/public/PublicLegal";
import PublicHome from "./pages/public/PublicHome";
import { PublicResultsPage, PublicJoiningPage } from "./pages/public/PublicPublications";
import { LangProvider } from "./i18n";

// The PUBLIC website (parents / students / visitors).
// Deliberately has NO staff login, dashboard or password-reset routes - those
// paths simply redirect to the home page here, and AuthProvider is not even
// mounted. Staff use the separate staff site.
// Old links like /publications?view=results keep working via the redirect below.
function LegacyPublicationsRedirect() {
  const [params] = useSearchParams();
  return <Navigate to={params.get("view") === "joining" ? "/joining-instructions" : "/results"} replace />;
}

// Counts visits to the parents' site (anonymous; see backend/src/routes/visits.js).
// Each page is reported once per browser tab session, so refreshing a page
// does not inflate the numbers.
const VISIT_PAGES = { "/": "home", "/results": "results", "/joining-instructions": "joining", "/privacy": "privacy", "/terms": "terms", "/support": "support" };
function VisitCounter() {
  const { pathname } = useLocation();
  useEffect(() => {
    const page = VISIT_PAGES[pathname];
    if (!page) return;
    try {
      const key = `mikumbi_visit_${page}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch { /* storage blocked - still count */ }
    fetch(`${API_BASE}/public/visit`, {
      method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page }),
    }).catch(() => {});
  }, [pathname]);
  return null;
}

export default function PublicApp() {
  return (
    <LangProvider site="public">
    <VisitCounter />
    <Routes>
      <Route path="/" element={<PublicHome />} />
      <Route path="/results" element={<PublicResultsPage />} />
      <Route path="/joining-instructions" element={<PublicJoiningPage />} />
      <Route path="/publications" element={<LegacyPublicationsRedirect />} />
      <Route path="/privacy" element={<PublicPrivacy />} />
      <Route path="/terms" element={<PublicTerms />} />
      <Route path="/support" element={<PublicSupport />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </LangProvider>
  );
}
