import { Link } from "react-router-dom";
import { THEME, SCHOOL } from "../styles/theme";

function LegalShell({ title, children }) {
  return (
    <div style={{ minHeight: "100vh", background: THEME.bg }}>
      <nav style={{ background: THEME.navy, padding: "14px 24px", display: "flex", alignItems: "center", gap: 14 }}>
        <Link to="/" style={{ color: "#fff", textDecoration: "none", fontWeight: 700, fontSize: 14 }}>← {SCHOOL.name}</Link>
      </nav>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "44px 24px 80px" }}>
        <h1 style={{ color: THEME.heading, fontSize: 24, fontWeight: 800, marginBottom: 20 }}>{title}</h1>
        <div style={{ color: THEME.text, fontSize: 14, lineHeight: 1.8 }}>{children}</div>
      </div>
    </div>
  );
}

const h2 = { color: THEME.heading, fontSize: 16, fontWeight: 700, marginTop: 26, marginBottom: 8 };

export function PrivacyPolicy() {
  return (
    <LegalShell title="Privacy Policy">
      <p>This system ({SCHOOL.name} Unified School Management System) collects and stores information needed to run the school's day-to-day operations - student records, exam results, attendance, hostel and contribution records, and staff accounts.</p>
      <h2 style={h2}>What we collect</h2>
      <p>Student names, class/form, guardian contact details, exam scores, hostel occupancy, and food/financial contribution records; staff names, usernames, roles, and attendance/GPS check-in data (Teacher Attendance Management System - TAMS). We also store the Head Master's signature, the school stamp, and each Class Teacher's own signature (uploaded via Settings), which are used only to complete printed Parent Reports.</p>
      <h2 style={h2}>Why we collect it</h2>
      <p>Solely to manage academic records, school attendance, hostel life, and contributions - and so that every teacher can view results and the timetable easily, without needing to go to the Academic Office every time. The system also keeps the records of exams of any kind, accessible at any time from anywhere. Guardian contact numbers are used only to send that student's own results by SMS - never shared with, or mixed up between, other students' parents.</p>
      <h2 style={h2}>Who can see it</h2>
      <p>Access is role-based - teachers, Class Teachers, the Academic Master, the Second Master, and the Head Master each see only what their role requires. A Class Teacher can generate Parent Reports for their own class only. Parents and students do not use this system and never have access to it.</p>
      <h2 style={h2}>Data storage</h2>
      <p>Data is stored on a secured, password-protected database. Only authorized school staff accounts, issued and managed by the Head Master, can access the system.</p>
      <h2 style={h2}>Contact</h2>
      <p>For any questions about your data, contact the school administration directly.</p>
    </LegalShell>
  );
}

export function TermsOfService() {
  return (
    <LegalShell title="Terms of Service">
      <p>By using this system, staff agree to the following. This system is for school staff only - parents and students do not use it and are not covered by these terms.</p>
      <h2 style={h2}>Acceptable use</h2>
      <p>Accounts are for official school use only. Sharing login credentials, attempting to access data outside your assigned role, or submitting false attendance/results is strictly prohibited.</p>
      <h2 style={h2}>Attendance (TAMS)</h2>
      <p>Teachers must check in truthfully, from their own registered device, within the school's registration window and GPS radius. Attempting to falsify location or check in on behalf of another teacher is a serious violation.</p>
      <h2 style={h2}>Academic records</h2>
      <p>Only authorized roles (Head Master, Second Master, Academic Master) may add, edit, or publish student records and results. A Class Teacher may generate and send Parent Reports for their own class only. Once published, every teacher can view results and the timetable directly in the system, without visiting the Academic Office. The system keeps the record of exams of any kind, accessible at any time from anywhere.</p>
      <h2 style={h2}>Signature and stamp images</h2>
      <p>Whoever uploads the Head Master's signature, the school stamp, or a Class Teacher's signature (via Settings) confirms they are authorized to do so on that person's behalf. These images are applied automatically to Parent Reports and must be kept accurate and up to date.</p>
      <h2 style={h2}>Changes</h2>
      <p>The school may update these terms as the system evolves. Continued use after an update means you accept the revised terms.</p>
    </LegalShell>
  );
}

export function SupportPage() {
  return (
    <LegalShell title="Support">
      <p>Need help using the system? Start here:</p>
      <h2 style={h2}>Common issues</h2>
      <ul style={{ paddingLeft: 20 }}>
        <li style={{ marginBottom: 8 }}>Forgot your password? Use "Forgot Password" on the Login page and enter your registered Gmail address - this works for every account, including School Patron and School Matron. If your account has no email on file yet, ask the Head Master or Second Master to add one in User Accounts.</li>
        <li style={{ marginBottom: 8 }}>TAMS check-in failing? Confirm GPS is enabled, you're within the school compound, and you're checking in between 6:00-8:00 AM.</li>
        <li style={{ marginBottom: 8 }}>Can't see a module? Access is role-based - contact the Head Master or Second Master to confirm your assigned role.</li>
        <li style={{ marginBottom: 8 }}>Signature or stamp looking small, or still showing its paper background, on a Parent Report? Re-upload it in Settings - Signature &amp; Stamp using a clear, evenly-lit photo with plain paper around the ink; the system removes the background automatically.</li>
      </ul>
      <h2 style={h2}>Still stuck?</h2>
      <p>Contact the school's system administrator (Head Master / Second Master) directly, or use the Msaidizi wa Mfumo chat assistant in the bottom-right corner of the site for instant answers to common questions.</p>
    </LegalShell>
  );
}
