import { lazy, Suspense } from "react";
import { getSiteMode } from "./utils/siteMode";
import MikumbiLoader from "./components/MikumbiLoader";

// One codebase, two sites. Each site is its own lazy chunk, so parents on the
// PUBLIC site never download the staff dashboard code (and vice versa).
//   PublicApp -> parents / students / visitors (yourdomain.com)
//   StaffApp  -> teachers / management        (staff.yourdomain.com)
const PublicApp = lazy(() => import("./PublicApp"));
const StaffApp = lazy(() => import("./StaffApp"));

const mode = getSiteMode();

export default function App() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <MikumbiLoader size={90} caption="Loading..." />
      </div>
    }>
      {mode === "public" ? <PublicApp /> : <StaffApp />}
    </Suspense>
  );
}
