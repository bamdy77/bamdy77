import { useState, useEffect, useRef } from "react";
import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import AnnouncementsBanner from "./AnnouncementsBanner";
import { useAuth, API_BASE } from "../context/AuthContext";
import { useTheme, THEME_OPTIONS } from "../context/ThemeContext";
import { THEME } from "../styles/theme";
import { useBreakpoint } from "../hooks/useBreakpoint";
import ChatBot from "./ChatBot";
import ErrorBoundary from "./ErrorBoundary";
import { useConfirm } from "./ConfirmDialog";
import { showSuccess } from "./SuccessModal";
import { showError } from "./ErrorModal";
import NotificationBell from "./NotificationBell";
import FontChooser from "./FontChooser";
import { useFont } from "../context/FontContext";
import { apiFetch } from "../utils/api";
import { useLang } from "../i18n";
import { StaffLangToggle } from "../i18n/StaffLang";
import { roleLabel as roleName, formLabel as formName } from "../i18n/display";
import { ShieldIcon, SettingsIcon, LockIcon, PaletteIcon, ChevronDownIcon, CheckIcon, MenuIcon, CloseIcon, GraduationCapIcon, CoinsIcon, UtensilsIcon, TableIcon, BedIcon, BarChartIcon, ClockIcon, MessageIcon, UsersIcon, LogoutIcon, CameraIcon, TrashIcon, UserCircleIcon, EyeIcon, SpinnerIcon, FileClockIcon, EditIcon } from "./icons";

// Module visibility, exactly per spec:
//  - admin (Head Master) + second_master: everything
//  - academic (Academic Master): TAMS, Results, Timetable, Contributions
//    (History/oversight view) - NOT Communications/Students/Hostel
//  - teacher: Results, TAMS
//  - patron / matron (School Patron / School Matron): Hostel, TAMS, Results
//  - class_teacher: TAMS, Results, Contributions (their own class's view) -
//    NEVER Food Contributions
//  - food_teacher: TAMS, Results, Food Contributions (record entries;
//    History there is oversight-only - admin/second_master, not food_teacher)
// A user can hold MULTIPLE roles at once (e.g. Academic Master + Matron) -
// they see the UNION of every module any of their roles unlocks.
const MODULES = [
  { key: "students",       path: "/dashboard/students",       roles: ["admin", "second_master"], Icon: GraduationCapIcon },
  { key: "contributions",  path: "/dashboard/contributions",  roles: ["admin", "second_master", "academic", "class_teacher"], Icon: CoinsIcon },
  { key: "food",           path: "/dashboard/food",           roles: ["admin", "second_master", "food_teacher"], Icon: UtensilsIcon },
  { key: "timetable",      path: "/dashboard/timetable",      roles: ["admin", "second_master", "academic", "teacher", "patron", "matron", "class_teacher", "food_teacher"], Icon: TableIcon },
  { key: "hostel",         path: "/dashboard/hostel",         roles: ["admin", "second_master", "patron", "matron"], Icon: BedIcon },
  { key: "results",        path: "/dashboard/results",        roles: ["admin", "second_master", "academic", "teacher", "patron", "matron", "class_teacher", "food_teacher"], Icon: BarChartIcon },
  { key: "tams",           path: "/dashboard/tams",           roles: ["admin", "second_master", "academic", "teacher", "patron", "matron", "class_teacher", "food_teacher"], Icon: ClockIcon },
  // Head Master / Second Master oversight tools - multi-period results &
  // attendance trends, and the security audit trail. The Academic Master
  // now ALSO gets this entry, but only the one-student trend panel inside
  // renders for them - AnalyticsDashboard.jsx itself hides the school-wide
  // Form/TAMS sections for that role.
  { key: "analytics",      path: "/dashboard/analytics",      roles: ["admin", "second_master", "academic", "teacher"], Icon: BarChartIcon },
  { key: "audit-log",      path: "/dashboard/audit-log",      roles: ["admin", "second_master", "developer"], Icon: FileClockIcon },
  { key: "communications", path: "/dashboard/communications", roles: ["admin", "second_master"], Icon: MessageIcon },
  { key: "users",          path: "/dashboard/users",          roles: ["admin", "second_master"], Icon: UsersIcon },
];

// Account-header avatar for the logged-in account (e.g. Teacher, Head
// Master) - shows their uploaded profile photo if they have one, otherwise
// a circular badge with their initials (gold-on-navy, matching the school's
// brand colors). Clicking it opens one account menu with Profile, Upload/
// Change/Remove Photo, and Logout - see Avatar below. Change Password and
// Theme stay under the separate Settings gear. Scales cleanly across
// Desktop, Tablet and Mobile via the `size` prop.
function getInitials(name) {
  // Strip a leading title (Mr./Mrs./Ms./Dr./Prof./Mwl.), with or without a
  // dot or space after it, so e.g. "Mr.Enock" or "Mr. Enock" both read as
  // "Enock" before we pick initials - matching what the school actually
  // calls the person, not the title.
  const cleaned = (name || "").replace(/^(mrs|miss|prof|mwl|mr|ms|dr)\.?\s*/i, "").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}


// Replaces what used to be the static "Mikumbi Secondary School" text at the
// top of the account header with a greeting that reflects the real time of
// day - Good Morning / Good Afternoon / Good Evening, the usual boundaries
// (noon and 5pm). Re-checked once a minute via the interval below so it
// still flips correctly for a teacher who leaves the dashboard open across
// one of those boundaries, without needing to log out and back in.
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "greet.morning";
  if (hour < 17) return "greet.afternoon";
  return "greet.evening";
}

// One reusable row inside the account menu below - icon + label, with an
// optional "danger" (red) treatment for destructive actions like Remove
// Photo, and a top divider for visually separating Logout from the rest.
function MenuRow({ icon, label, onClick, danger, divider, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
        padding: "10px 14px", fontSize: 13, fontWeight: 600,
        color: danger ? "#dc2626" : THEME.navyDark,
        background: "none", border: "none", borderTop: divider ? "1px solid #eee" : "none",
        cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.55 : 1,
      }}
    >
      <span style={{ display: "flex", flexShrink: 0, opacity: 0.85 }}>{icon}</span>
      {label}
    </button>
  );
}

function Avatar({ name, size = 40, photoUrl, onLogout, onPickPhoto, onRemovePhoto, onViewProfile, onViewPhoto, uploading }) {
  const { t } = useLang();
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef(null);

  // Close the account menu on an outside click - same pattern as SettingsMenu below.
  useEffect(() => {
    if (!menuOpen) return;
    const onOutside = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("touchstart", onOutside);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("touchstart", onOutside);
    };
  }, [menuOpen]);

  return (
    <div ref={wrapRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => !uploading && setMenuOpen((v) => !v)}
        aria-label={t("acct.menu")} title={t("acct.menu")}
        disabled={uploading}
        style={{
          width: size, height: size, borderRadius: "50%", overflow: "hidden", flexShrink: 0, position: "relative",
          background: THEME.gold, color: THEME.navyDark,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 800, fontSize: size * 0.4, letterSpacing: "0.02em",
          border: "2px solid rgba(255,255,255,0.35)", padding: 0, cursor: uploading ? "default" : "pointer",
        }}
      >
        {photoUrl
          ? <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: uploading ? 0.4 : 1 }} />
          : <span style={{ opacity: uploading ? 0.4 : 1 }}>{getInitials(name)}</span>}
        {/* Uploading/removing overlay - a dark scrim + spinning ring right
            on top of the avatar itself, so the account it's changing is
            obvious at a glance (same idea as WhatsApp/Instagram's upload
            spinner over the profile photo), on top of the "Uploading..."
            toast rendered once for the whole page below. */}
        {uploading && (
          <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15,23,42,0.35)" }}>
            <SpinnerIcon size={Math.round(size * 0.42)} />
          </span>
        )}
      </button>

      {menuOpen && (
        <div style={{
          position: "absolute", top: "100%", left: 0, marginTop: 8,
          background: "#fff", borderRadius: 4, boxShadow: "0 10px 30px rgba(0,0,0,0.22)",
          minWidth: 200, overflow: "hidden", zIndex: 95,
        }}>
          <MenuRow icon={<UserCircleIcon size={15} />} label={t("acct.profile")}
            onClick={() => { setMenuOpen(false); onViewProfile(); }} />
          <MenuRow icon={<EyeIcon size={15} />} label={t("acct.viewPhoto")}
            onClick={() => { setMenuOpen(false); onViewPhoto(); }} />
          <MenuRow icon={<CameraIcon size={15} />} label={photoUrl ? t("acct.changePhoto") : t("acct.uploadPhoto")}
            disabled={uploading} onClick={() => { setMenuOpen(false); onPickPhoto(); }} />
          {photoUrl && (
            <MenuRow icon={<TrashIcon size={15} />} label={t("acct.removePhoto")} danger
              disabled={uploading} onClick={() => { setMenuOpen(false); onRemovePhoto(); }} />
          )}
          <MenuRow icon={<LogoutIcon size={15} />} label={t("acct.logout")} divider
            onClick={() => { setMenuOpen(false); onLogout(); }} />
        </div>
      )}
    </div>
  );
}

// A quick read-only account summary - opened from the Avatar menu's
// "Profile" row. Shows only fields the app already has on hand from login
// (name, role(s), username, and class-teacher assignment if any) - no new
// backend endpoint needed. Same modal-overlay pattern as SuccessModal/
// ErrorModal for a consistent feel.
function ProfileModal({ user, displayName, roleText, onClose, onViewPhoto }) {
  const { t, lang } = useLang();
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const row = (label, value) => (
    <div style={{ padding: "10px 0", borderTop: "1px solid rgba(255,255,255,0.14)" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      {value
        ? <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginTop: 2 }}>{value}</div>
        : <div style={{ fontSize: 13.5, fontStyle: "italic", color: "rgba(255,255,255,0.55)", marginTop: 2 }}>{t("acct.notRegistered")}</div>}
    </div>
  );

  // Per spec, the Head Master's account shows BOTH "Admin" and "Head
  // Master" on the Role line - every other account just shows whatever
  // role(s) it actually holds (e.g. "Academic Master + Matron").
  const rolesDisplay = user.role === "admin" ? t("acct.adminRole") : roleText;
  const employmentDisplay = user.employment_type === "Temporary" ? t("acct.partTime") : t("acct.permanent");

  // A rich, saturated navy - deliberately a different, more vivid shade
  // than the darker striped backdrop behind it, so the card reads as a
  // clearly distinct surface instead of blending into the background.
  const CARD_BG = "#0E355C";

  return (
    <div
      className="mk-profile-backdrop"
      style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000, padding: 16 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: CARD_BG, borderRadius: 4, width: "100%", maxWidth: 360, maxHeight: "88vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.45)", border: "1px solid rgba(255,255,255,0.12)", padding: "28px 24px 20px", textAlign: "center" }}>
        <div style={{
          width: 72, height: 72, borderRadius: "50%", margin: "0 auto 14px", overflow: "hidden",
          background: THEME.gold, color: THEME.navyDark, display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 800, fontSize: 26, border: "2px solid rgba(255,255,255,0.2)",
        }}>
          {user.photo_url
            ? <img src={user.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : getInitials(displayName)}
        </div>
        <div style={{ fontSize: 17, fontWeight: 800, color: "#fff" }}>{displayName}</div>
        <button
          type="button"
          onClick={onViewPhoto}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8,
            padding: "6px 14px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.28)",
            background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}
        >
          <EyeIcon size={13} />{t("acct.viewPhoto")}
        </button>
        <div style={{ textAlign: "left" }}>
          {row(t("acct.fullName"), user.full_name)}
          {row(t("acct.username"), user.username)}
          {row(t("acct.roles"), rolesDisplay)}
          {row(t("acct.subjects"), user.subject_names?.length ? user.subject_names.join(", ") : null)}
          {row(t("acct.classes"), user.assigned_forms?.length ? user.assigned_forms.map((f) => formName(lang, f)).join(", ") : null)}
          {row(t("acct.classTeacherOf"), user.class_teacher_of ? formName(lang, user.class_teacher_of) : null)}
          {row(t("acct.phone"), user.phone)}
          {row(t("acct.employment"), employmentDisplay)}
          {row(t("acct.email"), user.email)}
        </div>
        <button
          type="button" onClick={onClose}
          style={{ marginTop: 18, width: "100%", padding: "10px 0", borderRadius: 4, border: "none", background: THEME.gold, color: THEME.navyDark, fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}
        >
          {t("common.close")}
        </button>
      </div>
    </div>
  );
}

export default function Layout() {
  const { user, logout, token, updateUser, refreshUser } = useAuth();
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const location = useLocation();

  // Keep the logged-in account's own profile (role/extra_roles,
  // subject_ids, assigned_forms, class_teacher_of, is_active) fresh from
  // the server on every navigation - not just once at login. Without this,
  // a teacher reassigned to a different class/subject by the Head Master
  // (User Accounts) keeps acting on their OLD assignment for the rest of
  // that browser session: their previous class's results stop being
  // reachable in Enter Marks, and the newly assigned class doesn't work
  // correctly either, until they happen to log out and back in. See
  // refreshUser in AuthContext.jsx.
  useEffect(() => { refreshUser(); }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  const { isDesktop } = useBreakpoint();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { confirm, ConfirmDialogPortal } = useConfirm();

  const myRoles = user.roles && user.roles.length ? user.roles : [user.role];
  const visible = MODULES.filter((m) => m.roles.some((r) => myRoles.includes(r)));
  const displayName = user.username;
  const roleText = myRoles.map((r) => roleName(lang, r)).join(" + ");

  // Time-of-day greeting shown at the top of the account header, in the
  // spot that used to show the static school name. Recomputed every minute
  // so it's still correct if a teacher leaves a page open across the
  // morning/afternoon/evening boundary.
  const [greeting, setGreeting] = useState(getGreeting());
  useEffect(() => {
    const id = setInterval(() => setGreeting(getGreeting()), 60000);
    return () => clearInterval(id);
  }, []);
  const greetLine = displayName ? `${t(greeting)}, ${displayName}` : t(greeting);

  // Close the drawer automatically on navigation (tablet/mobile), and any
  // time the viewport grows back to desktop size.
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);
  useEffect(() => { if (isDesktop) setDrawerOpen(false); }, [isDesktop]);
  // Slightly larger text across the whole staff area (easier to read for
  // first-time users). Applied to the document only while a staff page is
  // open, so the public parents' site and the login page keep their size.
  useEffect(() => {
    document.documentElement.classList.add("mk-staff-zoom");
    return () => document.documentElement.classList.remove("mk-staff-zoom");
  }, []);

  const doLogout = () => {
    confirm(t("acct.logoutConfirm"), () => { logout(); navigate("/"); }, {
      confirmLabel: t("acct.logout"), cancelLabel: t("common.cancel"), danger: false,
    });
  };

  // Profile photo upload/remove - shared across every <Avatar> instance
  // rendered below (on tablet/mobile there are two: the fixed top bar AND
  // the slide-in drawer, both showing the same account), so the file input
  // and in-flight `uploading` state live once here rather than per-Avatar.
  const fileInputRef = useRef(null);
  // "uploading" | "removing" | null - drives both the spinner overlay on
  // the avatar itself and the floating toast text below.
  const [photoAction, setPhotoAction] = useState(null);
  const uploading = photoAction !== null;
  const pickPhoto = () => fileInputRef.current?.click();
  const [profileOpen, setProfileOpen] = useState(false);
  const [photoViewOpen, setPhotoViewOpen] = useState(false);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be re-picked later if needed
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showError(t("acct.badFileTitle"), t("acct.badFile"));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showError(t("acct.tooLargeTitle"), t("acct.tooLarge"));
      return;
    }
    setPhotoAction("uploading");
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch(`${API_BASE}/auth/photo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Accept-Language": lang },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.message || t("acct.uploadFailed"));
      updateUser({ photo_url: data.photo_url });
      showSuccess(t("acct.photoTitle"), t("acct.photoUploaded"));
    } catch (err) {
      showError(t("acct.uploadErrTitle"), err.message);
    } finally {
      setPhotoAction(null);
    }
  };

  const handleRemovePhoto = () => {
    // Removing a photo is destructive (the old upload is deleted from
    // Cloudinary too, not just unlinked) - confirm Yes/No before acting,
    // same in-app dialog used for Logout, rather than removing it the
    // instant "Remove Photo" is tapped.
    confirm(t("acct.removeConfirm"), async () => {
      setPhotoAction("removing");
      try {
        const res = await fetch(`${API_BASE}/auth/photo`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}`, "Accept-Language": lang },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) throw new Error(data.message || t("acct.removeFailed"));
        updateUser({ photo_url: null });
        showSuccess(t("acct.photoTitle"), t("acct.photoRemoved"));
      } catch (err) {
        showError(t("acct.removeErrTitle"), err.message);
      } finally {
        setPhotoAction(null);
      }
    }, { confirmLabel: t("common.yes"), cancelLabel: t("common.no"), danger: true });
  };

  const navLinks = (
    <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {visible.map((m) => (
        <Link key={m.key} to={m.path} style={{
          padding: "12px 20px", color: "#fff", textDecoration: "none", fontSize: 14,
          background: location.pathname.startsWith(m.path) ? "rgba(255,255,255,0.12)" : "transparent",
          borderLeft: location.pathname.startsWith(m.path) ? `3px solid ${THEME.gold}` : "3px solid transparent",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <span style={{ display: "flex", flexShrink: 0, opacity: 0.9 }}><m.Icon size={16} /></span>
          {t(`menu.${m.key}`)}
        </Link>
      ))}
    </nav>
  );

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: THEME.bg }}>
      {isDesktop ? (
        // ── DESKTOP: sidebar always visible, fixed width ──
        <aside style={{ width: 230, background: THEME.navy, color: "#fff", padding: "20px 0", flexShrink: 0 }}>
          <div style={{
            padding: "0 16px 16px 20px", borderBottom: "1px solid rgba(255,255,255,0.15)", marginBottom: 12,
            display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
              <Avatar name={displayName} size={42} photoUrl={user.photo_url} onLogout={doLogout} onPickPhoto={pickPhoto} onRemovePhoto={handleRemovePhoto} onViewProfile={() => setProfileOpen(true)} onViewPhoto={() => setPhotoViewOpen(true)} uploading={uploading} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div title={greetLine} style={{ fontWeight: 800, fontSize: 12, lineHeight: 1.35, wordBreak: "break-word" }}>{greetLine}</div>
              </div>
            </div>
            {/* Bell stacked directly under Settings (not side-by-side) so the
                greeting text above has the full header width to itself and
                never gets squeezed into an awkward 3-line wrap on desktop. */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <SettingsMenu navigate={navigate} user={user} />
              <NotificationBell />
            </div>
          </div>
          <div style={{ padding: "0 20px 12px", display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, opacity: 0.9 }}>
            {t("common.language")}: <StaffLangToggle />
          </div>
          {navLinks}
        </aside>
      ) : (
        // ── TABLET / MOBILE: sidebar becomes a slide-in drawer, triggered by a top bar ──
        <>
          <div style={{
            position: "fixed", top: 0, left: 0, right: 0, height: 60, background: THEME.navy, color: "#fff",
            display: "flex", alignItems: "center", gap: 8, padding: "0 10px 0 4px", zIndex: 60,
          }}>
            <button onClick={() => setDrawerOpen(true)} aria-label={t("menu.open")} style={{
              background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 9,
              display: "flex", alignItems: "center", flexShrink: 0,
            }}><MenuIcon /></button>

            <Avatar name={displayName} size={32} photoUrl={user.photo_url} onLogout={doLogout} onPickPhoto={pickPhoto} onRemovePhoto={handleRemovePhoto} onViewProfile={() => setProfileOpen(true)} onViewPhoto={() => setPhotoViewOpen(true)} uploading={uploading} />

            <div style={{ flex: 1, minWidth: 0 }}>
              <div title={greetLine} style={{ fontWeight: 800, fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{greetLine}</div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <NotificationBell />
              <SettingsMenu navigate={navigate} user={user} />
            </div>
          </div>

          {drawerOpen && (
            <div onClick={() => setDrawerOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 70 }} />
          )}
          <aside style={{
            position: "fixed", top: 0, left: 0, bottom: 0, width: "min(78vw, 280px)", background: THEME.navy, color: "#fff",
            padding: "20px 0", zIndex: 80, overflowY: "auto",
            transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
            transition: "transform 0.22s ease",
            boxShadow: drawerOpen ? "4px 0 24px rgba(0,0,0,0.25)" : "none",
          }}>
            <button onClick={() => setDrawerOpen(false)} aria-label={t("menu.close")} style={{
              position: "absolute", top: 14, right: 14, background: "none", border: "none", color: "#fff",
              cursor: "pointer", padding: 6, display: "flex", alignItems: "center",
            }}><CloseIcon /></button>
            <div style={{ padding: "0 20px 16px", borderBottom: "1px solid rgba(255,255,255,0.15)", marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
              <Avatar name={displayName} size={40} photoUrl={user.photo_url} onLogout={doLogout} onPickPhoto={pickPhoto} onRemovePhoto={handleRemovePhoto} onViewProfile={() => setProfileOpen(true)} onViewPhoto={() => setPhotoViewOpen(true)} uploading={uploading} />
              <div style={{ minWidth: 0 }}>
                <div title={greetLine} style={{ fontWeight: 800, fontSize: 12, lineHeight: 1.3, wordBreak: "break-word" }}>{greetLine}</div>
              </div>
            </div>
            <div style={{ padding: "0 20px 12px", display: "flex", alignItems: "center", gap: 8, fontSize: 12, opacity: 0.9 }}>
              {t("common.language")}: <StaffLangToggle />
            </div>
            {navLinks}
          </aside>
        </>
      )}

      {/* On mobile/tablet the top bar above is position:fixed and the outer
          container here is display:flex with the (row) default direction -
          a plain sibling "spacer" div can never push <main> down in a row
          layout, it only sits beside it. So the 60px offset for the fixed
          header has to be applied directly on <main> itself. */}
      {/* color: THEME.text here is the fix for invisible text in Dark/
          Nocturne mode: <body> never set a text color at all, so every
          element across every dashboard page that didn't explicitly set
          its own `color` was falling back to the browser default (black).
          That's invisible on the dark THEME.surface/THEME.bg backgrounds
          Dark/Nocturne switch to. Setting it once here means every one of
          those un-colored elements now inherits the theme-correct color
          automatically - no per-page changes needed - while anything that
          already sets its own explicit color (buttons on navy, status
          pills, etc.) is unaffected. */}
      <main style={{ flex: 1, minWidth: 0, width: "100%", marginTop: isDesktop ? 0 : 60, color: THEME.text }}>
        {/* Notices the Head Master addressed to STAFF (or to both staff and
            parents). Parent-only notices never appear here. */}
        <AnnouncementsBanner endpoint="/communications/announcements/staff" token={token} />
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>

      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: "none" }} />

      {profileOpen && (
        <ProfileModal user={user} displayName={displayName} roleText={roleText} onClose={() => setProfileOpen(false)} onViewPhoto={() => setPhotoViewOpen(true)} />
      )}

      {/* Visible progress feedback for a photo upload/removal - a small
          floating pill (centered on screen, not pinned to the top) with a
          spinner that keeps turning for as long as the request is in
          flight, on top of the spinner shown directly on the avatar
          itself. Says "Uploading..." or "Removing..." depending on which
          action is running. Disappears the instant the request finishes
          (success or failure) - the success/failure message then shows
          via SuccessModal/ErrorModal as usual. */}
      {uploading && (
        <div style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 10050,
          background: THEME.navyDark, color: "#fff", padding: "14px 26px", borderRadius: 4,
          display: "flex", alignItems: "center", gap: 10, boxShadow: "0 10px 28px rgba(0,0,0,0.28)",
          fontSize: 13.5, fontWeight: 600,
        }}>
          <SpinnerIcon size={16} />
          {photoAction === "removing" ? t("acct.removing") : t("acct.uploading")}
        </div>
      )}

      {photoViewOpen && (
        <div
          className="mk-profile-backdrop"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setPhotoViewOpen(false); }}
          style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10100, padding: 16 }}
        >
          <div style={{ background: "#0E355C", borderRadius: 4, padding: 22, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.45)", border: "1px solid rgba(255,255,255,0.12)", maxWidth: "90vw" }}>
            <div style={{
              width: 220, height: 220, maxWidth: "72vw", maxHeight: "72vw", borderRadius: "50%", overflow: "hidden", margin: "0 auto 14px",
              background: THEME.gold, color: THEME.navyDark, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 48,
              border: "2px solid rgba(255,255,255,0.2)",
            }}>
              {user.photo_url
                ? <img src={user.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : getInitials(displayName)}
            </div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#fff" }}>{displayName}</div>
            {!user.photo_url && <div style={{ fontSize: 12.5, fontStyle: "italic", color: "rgba(255,255,255,0.55)", marginTop: 4 }}>{t("acct.noPhoto")}</div>}
            <button onClick={() => setPhotoViewOpen(false)} style={{ marginTop: 14, padding: "9px 22px", background: THEME.gold, color: THEME.navyDark, border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              {t("common.close")}
            </button>
          </div>
        </div>
      )}

      <ChatBot />
      {ConfirmDialogPortal}
    </div>
  );
}

// Settings dropdown - reachable from every dashboard page, top-left area,
// next to the school name / teacher name / role. Houses Change Password
// and Theme only - Logout now lives on the Avatar itself (tap/click the
// avatar to log out), so this menu never needs to carry it.
function SettingsMenu({ navigate, user }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const wrapRef = useRef(null);
  const { theme, setTheme } = useTheme();
  const { font, setFont } = useFont();
  const { token, updateUser } = useAuth();
  const [fontNote, setFontNote] = useState("");
  const [fontOpen, setFontOpen] = useState(false);
  const gearRef = useRef(null);
  // Apply at once, then save on the account so it follows the user to other devices.
  const chooseFont = async (value) => {
    if (!setFont(value)) return;
    setFontNote("");
    try {
      const res = await apiFetch("/auth/preferences/font", { method: "PUT", body: JSON.stringify({ font: value }) }, token);
      updateUser({ preferred_font: res.preferred_font ?? null });
    } catch {
      setFontNote(t("font.notSaved"));
    }
  };
  const myRoles = user?.roles?.length ? user.roles : [user?.role];
  const canManageSignature = myRoles.some((r) => ["admin", "second_master", "academic", "class_teacher"].includes(r));
  const canManageSms = myRoles.some((r) => ["admin", "second_master", "academic"].includes(r));
  const isHeadMaster = myRoles.includes("admin");

  useEffect(() => {
    if (!open) return;
    const onOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) { setOpen(false); setThemeOpen(false); }
    };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("touchstart", onOutside);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("touchstart", onOutside);
    };
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        ref={gearRef}
        onClick={() => setOpen((o) => !o)}
        aria-label={t("set.title")}
        title={t("set.title")}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 34, height: 34, borderRadius: 4, border: "1px solid rgba(255,255,255,0.28)",
          background: open ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)",
          color: "#fff", cursor: "pointer",
        }}
      ><SettingsIcon size={18} /></button>

      <FontChooser
        open={fontOpen}
        onClose={() => setFontOpen(false)}
        returnFocusRef={gearRef}
        value={font}
        onChange={chooseFont}
        note={fontNote}
        labels={{ title: t("font.label"), hint: t("font.staffHint"), defaultName: t("font.default"),
          reset: t("font.reset"), done: t("font.done"), close: t("common.close"), sample: t("font.sample") }}
      />
      {open && (
        <div style={{
          position: "absolute", right: 0, top: 42, minWidth: 226,
          background: THEME.surface, color: THEME.text, border: `1px solid ${THEME.border}`,
          borderRadius: 4, boxShadow: "0 12px 32px rgba(0,0,0,0.22)", zIndex: 100, overflow: "hidden",
        }}>
          <SettingsItem icon={<LockIcon />} onClick={() => { setOpen(false); navigate("/dashboard/change-password"); }}>
            {t("pw.changeTitle")}
          </SettingsItem>

          {canManageSignature && (
            <SettingsItem icon={<EditIcon />} onClick={() => { setOpen(false); navigate("/dashboard/signature-stamp"); }}>
              {t("set.signature")}
            </SettingsItem>
          )}

          {canManageSms && (
            <SettingsItem icon={<MessageIcon />} onClick={() => { setOpen(false); navigate("/dashboard/sms-gateway"); }}>
              {t("set.sms")}
            </SettingsItem>
          )}

          {isHeadMaster && (
            <SettingsItem icon={<ShieldIcon />} onClick={() => { setOpen(false); navigate("/dashboard/backups"); }}>
              {t("set.backup")}
            </SettingsItem>
          )}

          <button type="button" aria-haspopup="dialog" onClick={() => { setOpen(false); setThemeOpen(false); setFontOpen(true); }} style={{
            display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
            padding: "11px 14px", background: "none", border: "none", borderTop: `1px solid ${THEME.border}`, cursor: "pointer",
            fontSize: 13, color: THEME.text,
          }}>
            <span aria-hidden="true" style={{ width: 15, textAlign: "center", fontWeight: 800, fontSize: 12 }}>Aa</span>
            <span style={{ flex: 1 }}>{t("font.label")}</span>
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderTop: `1px solid ${THEME.border}`, fontSize: 13, color: THEME.text }}>
            <span style={{ flex: 1 }}>{t("common.language")}</span>
            <StaffLangToggle dark={false} />
          </div>

          <div style={{ borderTop: `1px solid ${THEME.border}` }}>
            <button
              onClick={() => setThemeOpen((t) => !t)}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                padding: "11px 14px", background: "none", border: "none", cursor: "pointer",
                fontSize: 13, color: THEME.text,
              }}
            >
              <PaletteIcon />
              <span style={{ flex: 1 }}>{t("set.theme")}</span>
              <span style={{ display: "flex", transform: themeOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }}>
                <ChevronDownIcon />
              </span>
            </button>
            {themeOpen && (
              <div style={{ padding: "2px 6px 8px" }}>
                {THEME_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setTheme(opt.value)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                      padding: "8px 10px", background: theme === opt.value ? THEME.bg : "none",
                      border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12.5, color: THEME.text,
                    }}
                  >
                    <span style={{ width: 14, height: 14, borderRadius: "50%", background: opt.swatch, border: `1px solid ${THEME.border}`, flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>{t(`theme.${opt.value}`)}</span>
                    {theme === opt.value && <CheckIcon size={13} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsItem({ icon, children, onClick, danger }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
      padding: "11px 14px", background: "none", border: "none", cursor: "pointer",
      fontSize: 13, color: danger ? THEME.danger : THEME.text,
    }}>{icon}{children}</button>
  );
}


