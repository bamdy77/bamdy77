import { Link } from "react-router-dom";
import PublicLayout from "../../components/public/PublicLayout";
import Publications from "../../components/Publications";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { ChevronLeftIcon } from "../../components/icons";

// /results and /joining-instructions on the public site. They reuse the
// existing public portals (Kiswahili instructions for parents, rate limiting
// and tokens stay exactly as they are) inside the new public layout.
function Shell({ view }) {
  const { isMobile } = useBreakpoint();
  return (
    <PublicLayout>
      <div style={{ background: "#f4f7fa", minHeight: 400, paddingBottom: 30 }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: isMobile ? "18px 18px 0" : "24px 24px 0" }}>
          <Link to="/" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#0c426f", fontWeight: 700, fontSize: 13.5, textDecoration: "none" }}>
            <ChevronLeftIcon size={15} />Back to Home
          </Link>
        </div>
        <Publications forcedView={view} />
      </div>
    </PublicLayout>
  );
}

export const PublicResultsPage = () => <Shell view="results" />;
export const PublicJoiningPage = () => <Shell view="joining" />;
