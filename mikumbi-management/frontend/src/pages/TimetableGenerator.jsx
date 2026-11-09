import { useAuth } from "../context/AuthContext";
import { TimetableModule } from "../legacy/schoolManagementBundle";
import { THEME } from "../styles/theme";

const GENERATE_ROLES = ["admin", "second_master", "academic"];

export default function TimetableGenerator() {
  const { token, user } = useAuth();
  const canGenerate = !!(user && GENERATE_ROLES.includes(user.role));
  // Ordinary Teachers/Patron/Matron/Class Teacher/Food Teacher only ever see
  // "View Timetable" - restricted to the classes registered against their
  // own User Account ("assigned_forms") and their own name in "Per Teacher".
  const restrictedForms = !canGenerate ? (user?.assigned_forms || []) : null;
  const myTeacherLabel = !canGenerate ? (user?.username || null) : null;
  // This legacy module's own Card/table/text pieces already read the same
  // --mk-xxx CSS variables as the rest of the app, so they repaint
  // correctly on theme switch. This wrapper must track the theme too
  // (THEME.bg/text, not a fixed light color) or it ends up mismatched: the
  // page canvas stays permanently light while the module's cards go dark,
  // and any bare text inheriting this wrapper's color stays dark-on-dark.
  return (
    <div style={{ background: THEME.bg, color: THEME.text, minHeight: "100%" }}>
      <TimetableModule token={token} canGenerate={canGenerate} restrictedForms={restrictedForms} myTeacherLabel={myTeacherLabel} />
    </div>
  );
}
