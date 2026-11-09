import { Routes, Route, Navigate, useSearchParams } from "react-router-dom";
import { PublicPrivacy, PublicTerms, PublicSupport } from "./pages/public/PublicLegal";
import PublicHome from "./pages/public/PublicHome";
import { PublicResultsPage, PublicJoiningPage } from "./pages/public/PublicPublications";
import { LangProvider } from "./i18n/publicLang";

// The PUBLIC website (parents / students / visitors).
// Deliberately has NO staff login, dashboard or password-reset routes - those
// paths simply redirect to the home page here, and AuthProvider is not even
// mounted. Staff use the separate staff site.
// Old links like /publications?view=results keep working via the redirect below.
function LegacyPublicationsRedirect() {
  const [params] = useSearchParams();
  return <Navigate to={params.get("view") === "joining" ? "/joining-instructions" : "/results"} replace />;
}

export default function PublicApp() {
  return (
    <LangProvider>
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
