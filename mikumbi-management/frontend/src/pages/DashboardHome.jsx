import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Checked in this order - the first module any of the person's roles
// unlocks is where they land. Order matters: e.g. an Academic Master who is
// ALSO a Matron still lands on Results (her main daily task), not Hostel.
const FIRST_MODULE_BY_ROLE = [
  { role: "admin", path: "/dashboard/students" },
  { role: "second_master", path: "/dashboard/students" },
  { role: "academic", path: "/dashboard/results" },
  { role: "teacher", path: "/dashboard/results" },
  { role: "class_teacher", path: "/dashboard/results" },
  { role: "food_teacher", path: "/dashboard/food" },
  { role: "patron", path: "/dashboard/hostel" },
  { role: "matron", path: "/dashboard/hostel" },
];

export default function DashboardHome() {
  const { user } = useAuth();
  const myRoles = user.roles && user.roles.length ? user.roles : [user.role];
  const match = FIRST_MODULE_BY_ROLE.find((m) => myRoles.includes(m.role));
  return <Navigate to={match ? match.path : "/dashboard/results"} replace />;
}
