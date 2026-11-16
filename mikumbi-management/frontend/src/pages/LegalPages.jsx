import { Link } from "react-router-dom";
import { THEME, SCHOOL } from "../styles/theme";
import LegalDoc, { ul, li } from "../components/LegalDoc";
import { siteConfig, toTelHref } from "../config/siteConfig";

// Privacy / Terms / Support for the STAFF site (English). The parents'
// versions are in pages/public/PublicLegal.jsx. Keep both in line with what
// the system really does.
const UPDATED = "16 November 2026";
const TABS = [
  { to: "/privacy", label: "Privacy Policy" },
  { to: "/terms", label: "Terms of Use" },
  { to: "/support", label: "Help & Support" },
];
const LABELS = { updated: "Last updated", contents: "Contents", tabsLabel: "Policy pages" };
const CONTACT = {
  title: "Contact the system administrators",
  body: <>The Head Master and the Second Master manage all staff accounts.<br />
    Phone: {siteConfig.phones.map((p, i) => <span key={p}>{i ? ", " : ""}<a href={toTelHref(p)} style={{ color: "inherit", fontWeight: 700 }}>{p}</a></span>)}<br />
    Email: <a href={`mailto:${siteConfig.email}`} style={{ color: "inherit", fontWeight: 700 }}>{siteConfig.email}</a></>,
};

function LegalShell({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: THEME.bg }}>
      <nav style={{ background: THEME.navy, padding: "14px 24px", display: "flex", alignItems: "center", gap: 14 }}>
        <Link to="/" style={{ color: "#fff", textDecoration: "none", fontWeight: 700, fontSize: 14 }}>← {SCHOOL.name}</Link>
      </nav>
      {children}
    </div>
  );
}
const P = ({ children }) => <p style={{ margin: 0 }}>{children}</p>;

export function PrivacyPolicy() {
  return (
    <LegalShell>
      <LegalDoc tabs={TABS} labels={LABELS} updated={UPDATED} contact={CONTACT} title="Privacy Policy"
        summary="This staff system holds the school's student, results, attendance and finance records. It collects only what the school needs, shows each person only what their role requires, and never sells or shares data."
        sections={[
          { id: "what", title: "What the system holds", body: <ul style={ul}>
            <li style={li}><b>Students:</b> names, form, gender, guardian contacts, admission and results login numbers, photos, hostel, contribution and food records, and exam results.</li>
            <li style={li}><b>Staff:</b> names, usernames, roles, subjects, phone/email, profile photo, and TAMS attendance (time, GPS distance from school, device).</li>
            <li style={li}><b>Documents:</b> the Head Master's signature, the school stamp and Class Teachers' signatures, used only on official documents.</li>
            <li style={li}><b>Preferences:</b> theme and font choice. Your font choice is saved on your account so it follows you to other devices.</li>
          </ul> },
          { id: "why", title: "Why it is used", body: <P>Only to run the school: academic records and results, attendance, timetable, hostel, contributions, communication with parents, and official documents. Guardian phone numbers are used only for that student's own messages and as the parent's results password.</P> },
          { id: "who", title: "Who can see what", body: <ul style={ul}>
            <li style={li}>Access is role-based: each role (Head Master, Second Master, Academic Master, Class Teacher, Teacher, Patron/Matron, Food Teacher) sees only its own modules.</li>
            <li style={li}>A Class Teacher sees only their own class; a Teacher enters scores only for their own subjects and forms.</li>
            <li style={li}>Parents see only their own child's published results on the parents' website, view-only.</li>
            <li style={li}>Sensitive actions are recorded in the Audit Log.</li>
          </ul> },
          { id: "security", title: "How it is protected", body: <ul style={ul}>
            <li style={li}>Encrypted connection (HTTPS), hashed passwords and a protected database; sensitive settings are encrypted.</li>
            <li style={li}>Accounts lock for 15 minutes after 8 wrong passwords. Changing a password signs out every other session.</li>
            <li style={li}>Head Master, Second Master and Academic Master accounts need a code sent to their email when signing in from a new device.</li>
            <li style={li}>The database is backed up automatically every day, encrypted, and kept outside the database.</li>
            <li style={li}>Request limits protect the system from automated attacks.</li>
            <li style={li}>QR codes on documents show full details only for genuine, school-issued documents.</li>
          </ul> },
          { id: "retention", title: "How long records are kept", body: <P>Academic and attendance records are kept as official school records. Graduated students' records are removed automatically after the retention period set by the school. Encrypted daily backups are kept for 14 days and then deleted automatically.</P> },
          { id: "rights", title: "Corrections", body: <P>If any record about you or a student is wrong, ask the Head Master or Second Master to correct it.</P> },
          { id: "changes", title: "Changes", body: <P>This policy is updated when the system changes. The date at the top shows the current version.</P> },
        ]} />
    </LegalShell>
  );
}

export function TermsOfService() {
  return (
    <LegalShell>
      <LegalDoc tabs={TABS} labels={LABELS} updated={UPDATED} contact={CONTACT} title="Terms of Use"
        summary="This system is for authorized Mikumbi Secondary School staff only. By signing in you agree to use it honestly and to protect students' information."
        sections={[
          { id: "accounts", title: "Your account", body: <ul style={ul}>
            <li style={li}>Accounts are created only by the Head Master or Second Master and are personal. Never share your password.</li>
            <li style={li}>Use a strong password (at least 8 characters, with letters and numbers) and sign out on shared devices.</li>
            <li style={li}>Report a lost phone or a suspected break-in to the Head Master straight away.</li>
          </ul> },
          { id: "use", title: "Acceptable use", body: <ul style={ul}>
            <li style={li}>Use the system only for official school work and only within your role.</li>
            <li style={li}>Do not try to open data outside your role, and do not copy student data out of the system without permission.</li>
            <li style={li}>Do not enter false results, attendance, payments or records.</li>
          </ul> },
          { id: "tams", title: "Attendance (TAMS)", body: <P>Check in truthfully, yourself, from your own registered device, inside the school area and within the registration window. Checking in for someone else or faking your location is a serious offence.</P> },
          { id: "results", title: "Results and documents", body: <P>Only authorized roles may enter, compile, publish or hide results. Publishing results to parents is a decision of the Head Master. Signatures and the stamp may be uploaded only by the person authorized to do so, and are applied automatically to official documents.</P> },
          { id: "privacy", title: "Student privacy", body: <P>Treat every student record as confidential. Do not share results, phone numbers or photos on social media or with anyone not entitled to them. A downloaded backup file contains all school records and must be kept private.</P> },
          { id: "breach", title: "Breaking these terms", body: <P>Misuse may lead to the account being suspended and to disciplinary action under the school's and the Government's rules.</P> },
          { id: "changes", title: "Changes", body: <P>The school may update these terms as the system evolves. Continuing to use the system means you accept the updated terms.</P> },
        ]} />
    </LegalShell>
  );
}

export function SupportPage() {
  return (
    <LegalShell>
      <LegalDoc tabs={TABS} labels={LABELS} updated={UPDATED} contact={CONTACT} title="Help & Support"
        summary="Quick answers to common questions. Tap a question to see its answer. You can also ask the system assistant (chat button, bottom right) once signed in."
        faqs={[
          { id: "account", title: "Signing in", items: [
            { q: "I forgot my password.", a: "Use \"Forgot Password\" on the login page and enter your registered email. If your account has no email yet, ask the Head Master or Second Master to add one in User Accounts." },
            { q: "My account is locked.", a: "After 8 wrong passwords the account locks for 15 minutes. Wait, then try again, or ask the Head Master to reset your password." },
            { q: "I was signed out suddenly.", a: "Your password was changed (by you or an administrator), which signs out other sessions. Sign in with the new password." },
            { q: "Why am I asked for a login code?", a: "The Head Master, Second Master and Academic Master accounts must confirm a 6-digit code sent to their email when signing in from a new device. The device is then remembered for 30 days. Changing your password forgets all remembered devices." },
            { q: "I can't see a module.", a: "Modules depend on your role. Ask the Head Master or Second Master to check your role in User Accounts." },
          ] },
          { id: "tams", title: "Attendance (TAMS)", items: [
            { q: "My check-in fails.", a: "Turn on GPS (location), make sure you are inside the school area, and check in during the registration window (6:00 to 8:00 AM)." },
            { q: "It says this device belongs to another teacher.", a: "Each device can check in only one teacher. Use your own phone, or ask the Head Master." },
          ] },
          { id: "results", title: "Results and documents", items: [
            { q: "A teacher can't enter scores.", a: "Check that the teacher's subjects and forms are set in User Accounts, and that the sheet is not locked." },
            { q: "The signature or stamp looks wrong on reports.", a: "Re-upload it in Settings → Signature & Stamp using a clear photo on plain white paper; the background is removed automatically." },
            { q: "Where is a student's Results Login Number?", a: "In Student Management, open the ⋮ menu on the student's row and choose \"Login No.\"." },
          ] },
          { id: "backup", title: "Backups", items: [
            { q: "Is the school's data backed up?", a: "Yes. A full, encrypted copy is made automatically every day and the last 14 are kept outside the database. The Head Master can see them in Settings → Database Backup." },
            { q: "How do I keep my own copy?", a: "Head Master: open Settings → Database Backup and press Download. Keep the file private (for example on a flash disk in the office); it contains all school records." },
            { q: "Can a backup be restored from the website?", a: "No. Restoring replaces the current data, so it is done only by the system administrator with the restore tool, after checking the backup first." },
          ] },
          { id: "app", title: "App, theme and font", items: [
            { q: "How do I install the app?", a: "Open the staff site home page and tap \"Download the App\". On iPhone, use Safari's Share button → \"Add to Home Screen\"." },
            { q: "How do I change the font or theme?", a: "Open Settings (gear icon) → Font or Theme. Your font choice is saved on your account." },
          ] },
        ]} />
    </LegalShell>
  );
}
