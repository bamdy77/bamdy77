import { useAuth } from "../context/AuthContext";
import { HostelModule } from "../legacy/schoolManagementBundle";
import { THEME } from "../styles/theme";

export default function Hostel() {
  const { token, user } = useAuth();
  const myRoles = user?.roles && user.roles.length ? user.roles : [user?.role];
  // This legacy module's own Card/table/text pieces already read the same
  // --mk-xxx CSS variables as the rest of the app, so they repaint
  // correctly on theme switch. This wrapper must track the theme too
  // (THEME.bg/text, not a fixed light color) or it ends up mismatched: the
  // page canvas stays permanently light while the module's cards go dark,
  // and any bare text inheriting this wrapper's color stays dark-on-dark.
  return (
    <div style={{ background: THEME.bg, color: THEME.text, minHeight: "100%" }}>
      <HostelModule token={token} isHistoryOnly={myRoles.every((r) => ["admin", "second_master"].includes(r))} canDeletePermanent />
    </div>
  );
}
