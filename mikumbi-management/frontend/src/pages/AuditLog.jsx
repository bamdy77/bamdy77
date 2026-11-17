// pages/AuditLog.jsx - Head Master, Second Master, and Academic Master.
//
// A read-only trail of sensitive actions across the system: who changed
// what, and when - most importantly, marks edited AFTER a subject was
// already locked/submitted, sheet unlocks, include/exclude toggles,
// deleted teacher submissions, and publish/withdraw actions on results the
// public can see. Entries are written server-side by
// backend/src/utils/auditLogger.js - this page only reads them.
import { useState, useEffect, useCallback, Fragment } from "react";
import { useAuth } from "../context/AuthContext";
import { STRINGS } from "../i18n";
import { formatDate as fmtDate } from "../i18n/display";
import { apiFetch } from "../utils/api";
import { THEME } from "../styles/theme";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { FileClockIcon, CalendarIcon, SearchIcon, SpinnerIcon, ChevronLeftIcon, ChevronRightIcon } from "../components/icons";

// Action codes are shown with their name in the current language
// (keys "audit.action.<code>"); an unknown new code is shown as it is.
const actionLabel = (a, t) => { const k = `audit.action.${a}`; return STRINGS[k] ? t(k) : a; };

const ACTION_COLOR = (a) => {
  if (a === "score.edit_after_lock") return THEME.danger;
  if (a.startsWith("sheet.unlock")) return THEME.warning;
  if (a === "sheet.exclude" || a === "published.hide" || a.endsWith(".delete")) return THEME.danger;
  return THEME.heading;
};

export default function AuditLog() {
  const { t, tn, lang } = useLang();
  const formatDate = (iso) => (iso ? fmtDate(lang, iso, { withTime: true }) : "-");
  const { token } = useAuth();
  const { isMobile, isTablet } = useBreakpoint();
  const isCompact = isMobile || isTablet;

  const [rows, setRows] = useState([]);
  const [actions, setActions] = useState([]);
  const [filters, setFilters] = useState({ from: "", to: "", action: "", q: "" });
  const [appliedFilters, setAppliedFilters] = useState({ from: "", to: "", action: "", q: "" });
  const [page, setPage] = useState(1);
  const [pageInfo, setPageInfo] = useState({ total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [expanded, setExpanded] = useState(null); // row id whose metadata is expanded

  useEffect(() => {
    apiFetch("/audit/actions", {}, token).then((d) => setActions(d.actions || [])).catch(() => {});
  }, [token]);

  const load = useCallback(() => {
    setLoading(true); setLoadError("");
    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (appliedFilters.from) params.set("from", appliedFilters.from);
    if (appliedFilters.to) params.set("to", appliedFilters.to);
    if (appliedFilters.action) params.set("action", appliedFilters.action);
    if (appliedFilters.q) params.set("q", appliedFilters.q);
    apiFetch(`/audit?${params.toString()}`, {}, token)
      .then((d) => {
        setRows(d.records || []);
        setPageInfo({ total: d.total || 0, totalPages: d.totalPages || 1 });
      })
      .catch((err) => { setRows([]); setLoadError(err.message || "Failed to load the audit log."); })
      .finally(() => setLoading(false));
  }, [page, appliedFilters, token]);

  useEffect(() => { load(); }, [load]);

  const applyFilters = () => { setPage(1); setAppliedFilters(filters); };
  const clearFilters = () => { const empty = { from: "", to: "", action: "", q: "" }; setFilters(empty); setAppliedFilters(empty); setPage(1); };

  return (
    <div style={{ padding: isMobile ? "16px 12px" : isTablet ? "24px 20px" : 40 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ color: THEME.heading, fontSize: isMobile ? 16 : 20, margin: 0, display: "flex", alignItems: "center", gap: 9 }}>
          <FileClockIcon size={19} />{t("menu.audit-log")}
        </h2>
        <p style={{ color: THEME.muted, fontSize: 12.5, marginTop: 5 }}>
          {t("audit.intro")}
        </p>
      </div>

      <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, padding: 14, marginBottom: 18 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <Field label={t("visits.from")}>
            <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} style={inputStyle} />
          </Field>
          <Field label={t("visits.to")}>
            <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} style={inputStyle} />
          </Field>
          <Field label={t("audit.action")}>
            <select value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })} style={inputStyle}>
              <option value="">{t("audit.allActions")}</option>
              {actions.map((a) => <option key={a} value={a}>{actionLabel(a, t)}</option>)}
            </select>
          </Field>
          <Field label={t("audit.search")}>
            <input type="text" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder={t("audit.searchPh")} style={{ ...inputStyle, minWidth: 200 }} />
          </Field>
          <button onClick={applyFilters} style={{ ...btnPrimary, display: "inline-flex", alignItems: "center", gap: 6 }}><SearchIcon size={13} />{t("audit.filter")}</button>
          <button onClick={clearFilters} style={btnSecondary}>{t("audit.clear")}</button>
        </div>
      </div>

      {loadError && <div style={errorBox}>⚠ {loadError}</div>}
      {loading && <p style={loadingText}><SpinnerIcon size={13} /> {t("common.loading")}</p>}

      {!loading && !loadError && (
        <>
          <p style={{ fontSize: 12, color: THEME.muted, marginBottom: 10 }}>{tn("audit.found", pageInfo.total)}</p>

          {isCompact ? (
            <div style={{ display: "grid", gap: 10 }}>
              {rows.length === 0 ? <Empty /> : rows.map((r) => (
                <div key={r.id} style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: ACTION_COLOR(r.action) }}>{actionLabel(r.action, t)}</span>
                    <span style={{ fontSize: 11, color: THEME.muted }}>{formatDate(r.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: THEME.text, marginBottom: 6 }}>{r.description}</div>
                  <div style={{ fontSize: 11, color: THEME.muted }}>{t("audit.by")}: <strong>{r.actor_name || t("audit.unknown")}</strong>{r.actor_role ? ` (${r.actor_role})` : ""}</div>
                  {r.metadata && (
                    <button onClick={() => setExpanded(expanded === r.id ? null : r.id)} style={{ ...linkBtn, marginTop: 6 }}>
                      {expanded === r.id ? t("audit.hideDetails") : t("audit.showDetails")}
                    </button>
                  )}
                  {expanded === r.id && r.metadata && (
                    <pre style={metaBox}>{JSON.stringify(r.metadata, null, 2)}</pre>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, overflow: "hidden", minWidth: 900 }}>
                <div style={{ ...rowStyle, fontWeight: 700, background: THEME.bg }}>
                  <span style={{ flex: 1.3 }}><CalendarIcon size={12} /> {t("audit.dateTime")}</span>
                  <span style={{ flex: 1.4 }}>{t("audit.action")}</span>
                  <span style={{ flex: 3 }}>{t("audit.description")}</span>
                  <span style={{ flex: 1.3 }}>{t("audit.by")}</span>
                  <span style={{ flex: 0.6 }}></span>
                </div>
                {rows.length === 0 ? <Empty /> : rows.map((r, i) => (
                  <Fragment key={r.id}>
                    <div style={{ ...rowStyle, borderTop: i === 0 ? "none" : `1px solid ${THEME.border}` }}>
                      <span style={{ flex: 1.3, color: THEME.muted }}>{formatDate(r.created_at)}</span>
                      <span style={{ flex: 1.4, color: ACTION_COLOR(r.action), fontWeight: 600 }}>{actionLabel(r.action, t)}</span>
                      <span style={{ flex: 3 }}>{r.description}</span>
                      <span style={{ flex: 1.3 }}>{r.actor_name || t("audit.unknown")}{r.actor_role ? <span style={{ color: THEME.muted }}> ({r.actor_role})</span> : ""}</span>
                      <span style={{ flex: 0.6, textAlign: "right" }}>
                        {r.metadata && (
                          <button onClick={() => setExpanded(expanded === r.id ? null : r.id)} style={linkBtn}>
                            {expanded === r.id ? t("common.hide") : t("audit.details")}
                          </button>
                        )}
                      </span>
                    </div>
                    {expanded === r.id && r.metadata && (
                      <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${THEME.border}` }}>
                        <pre style={metaBox}>{JSON.stringify(r.metadata, null, 2)}</pre>
                      </div>
                    )}
                  </Fragment>
                ))}
              </div>
            </div>
          )}

          {pageInfo.totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 18 }}>
              <button onClick={() => setPage((p) => Math.max(p - 1, 1))} disabled={page <= 1} style={{ ...btnSecondary, opacity: page <= 1 ? 0.5 : 1 }}>
                <ChevronLeftIcon size={13} />
              </button>
              <span style={{ fontSize: 12.5, color: THEME.muted }}>{t("audit.page", { page, total: pageInfo.totalPages })}</span>
              <button onClick={() => setPage((p) => Math.min(p + 1, pageInfo.totalPages))} disabled={page >= pageInfo.totalPages} style={{ ...btnSecondary, opacity: page >= pageInfo.totalPages ? 0.5 : 1 }}>
                <ChevronRightIcon size={13} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}


function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: THEME.muted }}>
      {label}
      {children}
    </label>
  );
}
function Empty() {
  const { t } = useLang();
  return <div style={{ padding: 20, fontSize: 13, color: THEME.muted, textAlign: "center" }}>{t("audit.empty")}</div>;
}

const inputStyle = { padding: "8px 10px", border: `1px solid ${THEME.border}`, borderRadius: 4, fontSize: 13, background: THEME.surface, color: THEME.text };
const btnPrimary = { padding: "8px 16px", borderRadius: 4, border: "none", background: THEME.navy, color: "#fff", fontWeight: 600, fontSize: 12.5, cursor: "pointer" };
const btnSecondary = { ...btnPrimary, background: THEME.surface, color: THEME.text, border: `1px solid ${THEME.border}` };
const linkBtn = { background: "none", border: "none", color: THEME.link, fontSize: 11.5, fontWeight: 600, cursor: "pointer", padding: 0, textDecoration: "underline" };
const errorBox = { marginBottom: 18, padding: 12, borderRadius: 4, fontSize: 13.5, background: THEME.dangerLight, color: THEME.danger };
const loadingText = { fontSize: 13, color: THEME.muted, marginBottom: 16, display: "flex", alignItems: "center", gap: 7 };
const rowStyle = { display: "flex", gap: 12, padding: "10px 14px", fontSize: 12.5, alignItems: "center" };
const metaBox = { background: THEME.bg, border: `1px solid ${THEME.border}`, borderRadius: 4, padding: 10, fontSize: 11, color: THEME.text, overflowX: "auto", margin: "0 14px 0 0" };
