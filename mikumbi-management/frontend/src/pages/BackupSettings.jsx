import { useCallback, useEffect, useState } from "react";
import { useLang } from "../i18n";
import { formatDate } from "../i18n/display";
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

export default function BackupSettings() {
  const { t, lang } = useLang();
  const fmtDate = (iso) => formatDate(lang, iso, { withTime: true });
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
      showSuccess(t("bk.title"), t("bk.created"));
      load();
    } catch (e) { showError(e.message); } finally { setBusy(false); }
  };

  // Fetch with the login token (never put it in the URL), then save the file.
  // kind "excel" = readable workbook; "full" = complete copy used to restore the system.
  const download = async (b, kind) => {
    setDownloading(`${b.id}-${kind}`);
    try {
      const res = await fetch(`${API_BASE}/backups/${b.id}/${kind === "excel" ? "excel" : "download"}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message || t("bk.downloadFailed")); }
      const blob = await res.blob();
      const name = (res.headers.get("content-disposition") || "").match(/filename="([^"]+)"/)?.[1] || (kind === "excel" ? `Mikumbi-Data-${b.id}.xlsx` : `mikumbi-backup-${b.id}.json.gz`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { showError(e.message); } finally { setDownloading(null); }
  };

  const latest = data?.backups?.[0];
  const stale = !latest || Date.now() - new Date(latest.created_at).getTime() > 36 * 3600 * 1000;

  return (
    <div style={{ padding: isMobile ? "16px 12px 32px" : "24px 16px 40px", maxWidth: 760, margin: "0 auto" }}>
      <h2 style={{ color: THEME.heading, fontSize: isMobile ? 17 : 20, marginBottom: 4 }}>{t("bk.title")}</h2>
      <p style={{ color: THEME.muted, fontSize: 13.5, marginBottom: 18, maxWidth: 620, lineHeight: 1.6 }}>
        {t("bk.intro", { n: data?.keep || 14 })}
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", background: stale ? THEME.dangerLight : THEME.successLight, border: `1px solid ${THEME.border}`, borderRadius: 4, padding: "12px 14px", marginBottom: 18 }}>
        <div style={{ flex: 1, minWidth: 220, fontSize: 13.5, color: stale ? THEME.danger : THEME.success, fontWeight: 600 }}>
          {!data ? t("bk.checking") : latest ? t("bk.latest", { date: fmtDate(latest.created_at) }) : t("bk.noneYet")}
          {data && stale && ` - ${t("bk.createNowHint")}`}
        </div>
        <button type="button" onClick={createNow} disabled={busy} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 4, border: "none", background: THEME.navy, color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}>
          {busy && <SpinnerIcon size={14} />}{busy ? t("bk.creating") : t("bk.createNow")}
        </button>
      </div>

      {loadError && <div style={{ color: THEME.danger, background: THEME.dangerLight, padding: 12, borderRadius: 4, fontSize: 13.5, marginBottom: 14 }}>{loadError}</div>}

      {data && (
        <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, overflow: "hidden" }}>
          {data.backups.length === 0 ? (
            <div style={{ padding: 16, fontSize: 13.5, color: THEME.muted }}>{t("bk.none")}</div>
          ) : data.backups.map((b, i) => (
            <div key={b.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "11px 14px", borderTop: i ? `1px solid ${THEME.border}` : "none", fontSize: 13 }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontWeight: 700, color: THEME.text }}>{fmtDate(b.created_at)}</div>
                <div style={{ color: THEME.muted, fontSize: 12 }}>{b.trigger === "manual" ? t("bk.manual") : t("bk.auto")} · {t("bk.records", { n: b.row_count.toLocaleString() })}</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" onClick={() => download(b, "excel")} disabled={downloading === `${b.id}-excel`} title={t("bk.excelTitle")} style={{ padding: "7px 14px", borderRadius: 4, border: "none", background: THEME.navy, color: "#fff", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
                  {downloading === `${b.id}-excel` ? t("bk.preparing") : t("bk.excel")}
                </button>
                <button type="button" onClick={() => download(b, "full")} disabled={downloading === `${b.id}-full`} title={t("bk.fullTitle")} style={{ padding: "7px 14px", borderRadius: 4, border: `1px solid ${THEME.navy}`, background: THEME.surface, color: THEME.link, fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
                  {downloading === `${b.id}-full` ? t("bk.downloading") : t("bk.full")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 18, background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, padding: "14px 16px", fontSize: 13, lineHeight: 1.7, color: THEME.text }}>
        <div style={{ fontWeight: 800, color: THEME.heading, marginBottom: 6 }}>{t("bk.whichTitle")}</div>
        <div><b>{t("bk.excel")}:</b> {t("bk.excelHelp")}</div>
        <div style={{ marginTop: 6 }}><b>{t("bk.full")}:</b> {t("bk.fullHelp")}</div>
        <div style={{ marginTop: 6, color: THEME.danger }}>{t("bk.private")}</div>
      </div>
    </div>
  );
}
