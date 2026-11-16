import { useCallback, useEffect, useState } from "react";
import { useAuth, API_BASE } from "../context/AuthContext";
import { apiFetch } from "../utils/api";
import { THEME } from "../styles/theme";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { SpinnerIcon } from "../components/icons";
import { showSuccess } from "../components/SuccessModal";
import { showError } from "../components/ErrorModal";

// Database backups - Head Master only. Backups are made automatically
// (whenever the newest one is more than 24 hours old) and on demand here.
const fmtSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const fmtDate = (iso) => new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Dar_es_Salaam", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function BackupSettings() {
  const { token } = useAuth();
  const { isMobile } = useBreakpoint();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(null);

  const load = useCallback(() => {
    setLoadError("");
    apiFetch("/backups", {}, token).then(setData).catch((e) => setLoadError(e.message));
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const createNow = async () => {
    setBusy(true);
    try {
      await apiFetch("/backups", { method: "POST" }, token);
      showSuccess("Backup", "Backup created successfully.");
      load();
    } catch (e) { showError(e.message); } finally { setBusy(false); }
  };

  // Fetch with the login token (never put it in the URL), then save the file.
  const download = async (b) => {
    setDownloading(b.id);
    try {
      const res = await fetch(`${API_BASE}/backups/${b.id}/download`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message || "Download failed."); }
      const blob = await res.blob();
      const name = (res.headers.get("content-disposition") || "").match(/filename="([^"]+)"/)?.[1] || `mikumbi-backup-${b.id}.json.gz`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { showError(e.message); } finally { setDownloading(null); }
  };

  const latest = data?.backups?.[0];
  const stale = !latest || Date.now() - new Date(latest.created_at).getTime() > 36 * 3600 * 1000;

  return (
    <div style={{ padding: isMobile ? "16px 12px 32px" : "24px 16px 40px", maxWidth: 760, margin: "0 auto" }}>
      <h2 style={{ color: THEME.heading, fontSize: isMobile ? 17 : 20, marginBottom: 4 }}>Database Backup</h2>
      <p style={{ color: THEME.muted, fontSize: 13.5, marginBottom: 18, maxWidth: 620, lineHeight: 1.6 }}>
        A full copy of the school's data is saved automatically every day, encrypted and stored outside the database.
        The last {data?.keep || 14} backups are kept. Download one now and then and keep it somewhere safe (for example a flash disk in the office).
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", background: stale ? THEME.dangerLight : THEME.successLight, border: `1px solid ${THEME.border}`, borderRadius: 4, padding: "12px 14px", marginBottom: 18 }}>
        <div style={{ flex: 1, minWidth: 220, fontSize: 13.5, color: stale ? THEME.danger : THEME.success, fontWeight: 600 }}>
          {!data ? "Checking…" : latest ? `Latest backup: ${fmtDate(latest.created_at)}` : "No backup has been made yet."}
          {data && stale && " - please create one now."}
        </div>
        <button type="button" onClick={createNow} disabled={busy} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 4, border: "none", background: THEME.navy, color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}>
          {busy && <SpinnerIcon size={14} />}{busy ? "Creating backup…" : "Create backup now"}
        </button>
      </div>

      {loadError && <div style={{ color: THEME.danger, background: THEME.dangerLight, padding: 12, borderRadius: 4, fontSize: 13.5, marginBottom: 14 }}>{loadError}</div>}

      {data && (
        <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, overflow: "hidden" }}>
          {data.backups.length === 0 ? (
            <div style={{ padding: 16, fontSize: 13.5, color: THEME.muted }}>No backups yet.</div>
          ) : data.backups.map((b, i) => (
            <div key={b.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "11px 14px", borderTop: i ? `1px solid ${THEME.border}` : "none", fontSize: 13 }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontWeight: 700, color: THEME.text }}>{fmtDate(b.created_at)}</div>
                <div style={{ color: THEME.muted, fontSize: 12 }}>{b.trigger === "manual" ? "Created manually" : "Automatic"} · {b.table_count} tables · {b.row_count.toLocaleString()} records · {fmtSize(b.file_size)}</div>
              </div>
              <button type="button" onClick={() => download(b)} disabled={downloading === b.id} style={{ padding: "7px 14px", borderRadius: 4, border: `1px solid ${THEME.navy}`, background: THEME.surface, color: THEME.navy, fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
                {downloading === b.id ? "Downloading…" : "Download"}
              </button>
            </div>
          ))}
        </div>
      )}

      <p style={{ color: THEME.muted, fontSize: 12.5, marginTop: 16, lineHeight: 1.6 }}>
        The downloaded file contains all school records (students, results, phone numbers). Keep it private.
        Restoring a backup replaces the current data, so it is done by the system administrator with the
        restore tool (backend/src/db/restore-backup.js), never from this page.
      </p>
    </div>
  );
}
