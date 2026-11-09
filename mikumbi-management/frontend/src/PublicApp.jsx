import { Routes, Route, Navigate, useSearchParams } from "react-router-dom";
import { PrivacyPolicy, TermsOfService, SupportPage } from "./pages/LegalPages";
import PublicHome from "./pages/public/PublicHome";
import { PublicResultsPage, PublicJoiningPage } from "./pages/public/PublicPublications";

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
    <Routes>
      <Route path="/" element={<PublicHome />} />
      <Route path="/results" element={<PublicResultsPage />} />
      <Route path="/joining-instructions" element={<PublicJoiningPage />} />
      <Route path="/publications" element={<LegacyPublicationsRedirect />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<TermsOfService />} />
      <Route path="/support" element={<SupportPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
