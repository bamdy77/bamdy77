import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import MikumbiLoader from "./MikumbiLoader";

// Wrap any authenticated page: <ProtectedRoute roles={["admin","academic"]}>...</ProtectedRoute>
// roles=[] (default) means "any logged-in user, any role" is allowed.
export default function ProtectedRoute({ children, roles = [] }) {
  const { user, token, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ padding: 40, display: "flex", justifyContent: "center" }}>
        <MikumbiLoader size={90} caption="Loading..." />
      </div>
    );
  }
  if (!token || !user) return <Navigate to="/login" replace />;
  const myRoles = user.roles && user.roles.length ? user.roles : [user.role];
  if (roles.length && !roles.some((r) => myRoles.includes(r))) return <Navigate to="/dashboard" replace />;

  return children;
}
