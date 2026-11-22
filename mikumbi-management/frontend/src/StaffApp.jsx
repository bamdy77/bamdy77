import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { useFont } from "./context/FontContext";
import { useEffect } from "react";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import WakingUp from "./components/WakingUp";
import { SuccessModalHost } from "./components/SuccessModal";
import { ErrorModalHost } from "./components/ErrorModal";
import { LangProvider } from "./i18n";
import { StaffLangSync } from "./i18n/StaffLang";

import Landing from "./pages/Landing";
import { PrivacyPolicy, TermsOfService, SupportPage } from "./pages/LegalPages";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import DashboardHome from "./pages/DashboardHome";
import TAMS from "./pages/TAMS";
import Communications from "./pages/Communications";
import ResultsManagement from "./pages/ResultsManagement";
import StudentManagement from "./pages/StudentManagement";
import TimetableGenerator from "./pages/TimetableGenerator";
import Hostel from "./pages/Hostel";
import Contributions from "./pages/Contributions";
import FoodContributions from "./pages/FoodContributions";
import UserAccounts from "./pages/UserAccounts";
import ChangePassword from "./pages/ChangePassword";
import LoginSecurity from "./pages/LoginSecurity";
import AnalyticsDashboard from "./pages/AnalyticsDashboard";
import AuditLog from "./pages/AuditLog";
import SignatureSettings from "./pages/SignatureSettings";
import SmsGatewaySettings from "./pages/SmsGatewaySettings";
import BackupSettings from "./pages/BackupSettings";
import JoiningInstructions from "./pages/JoiningInstructions";
import IdentityCards from "./pages/IdentityCards";

export default function StaffApp() {
  return (
    <LangProvider site="staff">
    <WakingUp>
      <AuthProvider>
        <AccountFontSync />
        <StaffLangSync />
        <SuccessModalHost />
        <ErrorModalHost />
        <Routes>
          {/* Public */}
          <Route path="/" element={<Landing />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfService />} />
          <Route path="/support" element={<SupportPage />} />
          {/* Results & Joining Instructions live on the parents' site only. */}
          <Route path="/publications" element={<Navigate to="/" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Authenticated shell - each module below is RBAC-gated per spec */}
          <Route path="/dashboard" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<DashboardHome />} />
            <Route path="change-password" element={<ChangePassword />} />
            <Route path="login-security" element={<LoginSecurity />} />
            <Route path="signature-stamp" element={<ProtectedRoute roles={["admin", "second_master", "academic", "class_teacher"]}><SignatureSettings /></ProtectedRoute>} />
            <Route path="sms-gateway" element={<ProtectedRoute roles={["admin", "second_master", "academic"]}><SmsGatewaySettings /></ProtectedRoute>} />
            <Route path="backups" element={<ProtectedRoute roles={["admin"]}><BackupSettings /></ProtectedRoute>} />
            <Route path="students" element={<ProtectedRoute roles={["admin", "second_master"]}><StudentManagement /></ProtectedRoute>} />
            <Route path="contributions" element={<ProtectedRoute roles={["admin", "second_master", "academic", "class_teacher"]}><Contributions /></ProtectedRoute>} />
            <Route path="food" element={<ProtectedRoute roles={["admin", "second_master", "food_teacher"]}><FoodContributions /></ProtectedRoute>} />
            <Route path="timetable" element={<ProtectedRoute roles={["admin", "second_master", "academic", "teacher", "patron", "matron", "class_teacher", "food_teacher"]}><TimetableGenerator /></ProtectedRoute>} />
            <Route path="joining-instructions" element={<ProtectedRoute roles={["admin", "second_master", "academic"]}><JoiningInstructions /></ProtectedRoute>} />
            <Route path="identity-cards" element={<ProtectedRoute roles={["admin", "second_master"]}><IdentityCards /></ProtectedRoute>} />
            <Route path="hostel" element={<ProtectedRoute roles={["admin", "second_master", "patron", "matron"]}><Hostel /></ProtectedRoute>} />
            <Route path="results" element={<ProtectedRoute roles={["admin", "second_master", "academic", "teacher", "patron", "matron", "class_teacher", "food_teacher"]}><ResultsManagement /></ProtectedRoute>} />
            <Route path="tams" element={<ProtectedRoute roles={["admin", "second_master", "academic", "teacher", "patron", "matron", "class_teacher", "food_teacher"]}><TAMS /></ProtectedRoute>} />
            <Route path="communications" element={<ProtectedRoute roles={["admin", "second_master"]}><Communications /></ProtectedRoute>} />
            <Route path="users" element={<ProtectedRoute roles={["admin", "second_master"]}><UserAccounts /></ProtectedRoute>} />
            {/* "academic" (Academic Master) only gets the per-student trend
                panel inside this page, not the school-wide sections - see
                AnalyticsDashboard.jsx, which hides those for that role. */}
            <Route path="analytics" element={<ProtectedRoute roles={["admin", "second_master", "academic", "teacher"]}><AnalyticsDashboard /></ProtectedRoute>} />
            <Route path="audit-log" element={<ProtectedRoute roles={["admin", "second_master", "developer"]}><AuditLog /></ProtectedRoute>} />
          </Route>

          <Route path="*" element={<Landing />} />
        </Routes>
      </AuthProvider>
    </WakingUp>
    </LangProvider>
  );
}

// A logged-in staff member's saved font (users.preferred_font, NULL = default)
// follows them to every device: it is applied after login and whenever /me
// refreshes, and it wins over whatever this browser had stored.
function AccountFontSync() {
  const { user } = useAuth();
  const { setFont } = useFont();
  // Only trust records that carry the field (a user cached before this
  // feature existed would otherwise reset the font until /me answers).
  const saved = user && Object.prototype.hasOwnProperty.call(user, "preferred_font") ? (user.preferred_font || "default") : null;
  useEffect(() => { if (saved) setFont(saved); }, [user?.id, saved, setFont]);
  return null;
}
