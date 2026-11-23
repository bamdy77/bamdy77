import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { StudentModule } from "../legacy/schoolManagementBundle";
import { THEME } from "../styles/theme";
import { useLang } from "../i18n";

function JoiningIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" />
    </svg>
  );
}
function IdCardIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" /><circle cx="8" cy="11" r="2" /><path d="M14 10h4M14 14h4M6 15.5c.7-1.2 2-2 3-2s2.3.8 3 2" />
    </svg>
  );
}

// These two links are handed to StudentModule as extraMoreItems, which
// renders them inline alongside its own toolbar buttons on desktop, and
// merged into its single "More" menu on mobile/tablet — one source of
// truth, so a page-header link can never be added to one and forgotten
// in the other.
function useStudentMgmtLinks(navigate, t) {
  return [
    { label: t("ji.title"), icon: JoiningIcon, onClick: () => navigate("/dashboard/joining-instructions") },
    { label: t("idc.title"), icon: IdCardIcon, onClick: () => navigate("/dashboard/identity-cards") },
  ];
}

export default function StudentManagement() {
  const { token, user } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const links = useStudentMgmtLinks(navigate, t);

  // This legacy module's own Card/table/text pieces already read the same
  // --mk-xxx CSS variables as the rest of the app (see the `C` palette at
  // the top of schoolManagementBundle.jsx), so they repaint correctly on
  // theme switch. This wrapper must track the theme too (THEME.bg/text,
  // not a fixed light color) or it ends up mismatched: the page canvas
  // stays permanently light while the module's cards go dark, and any
  // bare text inheriting this wrapper's color stays dark-on-dark.
  return (
    <div style={{ background: THEME.bg, color: THEME.text, minHeight: "100%" }}>
      <StudentModule token={token} role={user.role} extraMoreItems={links} />
    </div>
  );
}
