import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../utils/api";
import { THEME } from "../styles/theme";
import { useLang } from "../i18n";
import { formatDate } from "../i18n/display";
import { SpinnerIcon, RefreshIcon } from "./icons";

// "Parents' website visitors" - Head Master / Second Master only.
// Numbers are DIFFERENT PEOPLE PER DAY (a person who comes back on three days
// counts three times in "last 7 days"); nobody is identified or followed.
export default function VisitorStats({ isCompact }) {
  const { token } = useAuth();
  const { t, lang } = useLang();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Period for the chart / pages / devices. Preset "30" = last 30 days.
  const [preset, setPreset] = useState("30");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = (f = from, tt = to) => {
    setBusy(true); setError("");
    const q = new URLSearchParams();
    if (f) q.set("from", f);
    if (tt) q.set("to", tt);
    apiFetch(`/visits/stats${q.toString() ? `?${q}` : ""}`, {}, token)
      .then((d) => { setData(d); setFrom(d.range.from); setTo(d.range.to); })
      .catch((e) => setError(e.message)).finally(() => setBusy(false));
  };
  useEffect(() => { load("", ""); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = data?.range?.to && preset !== "custom" ? data.range.to : todayISO();
  const choosePreset = (p) => {
    setPreset(p);
    if (p === "custom") return;
    const end = todayISO();
    const start = p === "month" ? `${end.slice(0, 8)}01` : shift(end, -(Number(p) - 1));
    load(start, end);
  };
  const applyCustom = (e) => {
    e.preventDefault();
    if (!from || !to) return setError(t("visits.pickBoth"));
    if (from > to) return setError(t("visits.badOrder"));
    load(from, to);
  };

  const max = Math.max(1, ...(data?.daily || []).map((d) => d.visitors));
  const tile = (label, value, sub) => (
    <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, padding: "12px 14px", minWidth: 0 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: THEME.heading, lineHeight: 1.2, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: THEME.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
  const totalDevices = (data?.devices || []).reduce((a, d) => a + d.visitors, 0) || 1;

  return (
    <section aria-labelledby="visits-title">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
        <h3 id="visits-title" style={{ margin: 0, fontSize: 16, color: THEME.heading }}>{t("visits.title")}</h3>
        <button type="button" onClick={() => load()} disabled={busy} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 4, border: `1px solid ${THEME.border}`, background: THEME.surface, color: THEME.text, fontSize: 12.5, cursor: "pointer" }}>
          {busy ? <SpinnerIcon size={12} /> : <RefreshIcon size={12} />}{t("visits.refresh")}
        </button>
      </div>
      <p style={{ margin: "0 0 14px", fontSize: 12.5, color: THEME.muted, lineHeight: 1.6 }}>{t("visits.hint")}</p>

      {error && <div style={{ color: THEME.danger, fontSize: 13, marginBottom: 10 }}>{error}</div>}
      {!data ? (!error && <div style={{ fontSize: 13, color: THEME.muted }}>{t("common.loading")}</div>) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: isCompact ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))", gap: 10, marginBottom: 16 }}>
            {tile(t("visits.today"), data.today, t("visits.yesterday", { n: data.yesterday }))}
            {tile(t("visits.last7"), data.last7)}
            {tile(t("visits.last30"), data.last30, t("visits.views", { n: data.views30 }))}
            {tile(t("visits.total"), data.total, data.since ? t("visits.since", { date: formatDate(lang, data.since) }) : null)}
          </div>

          {/* Period chooser: quick choices, or any start and end date. */}
          <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: THEME.text, marginBottom: 8 }}>{t("visits.period")}</div>
            <div role="group" aria-label={t("visits.period")} style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: preset === "custom" ? 10 : 0 }}>
              {[["7", t("visits.p7")], ["30", t("visits.p30")], ["month", t("visits.pMonth")], ["90", t("visits.p90")], ["custom", t("visits.pCustom")]].map(([v, label]) => (
                <button key={v} type="button" onClick={() => choosePreset(v)} aria-pressed={preset === v}
                  style={{ padding: "6px 12px", borderRadius: 4, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                    border: `1px solid ${preset === v ? THEME.navy : THEME.border}`, background: preset === v ? THEME.navy : THEME.surface, color: preset === v ? "#fff" : THEME.text }}>
                  {label}
                </button>
              ))}
            </div>
            {preset === "custom" && (
              <form onSubmit={applyCustom} style={{ display: "grid", gridTemplateColumns: isCompact ? "1fr 1fr" : "auto auto auto", justifyContent: "start", alignItems: "end", gap: 8 }}>
                <label style={{ fontSize: 12, color: THEME.muted, display: "grid", gap: 4 }}>
                  {t("visits.from")}
                  <input type="date" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} required
                    style={{ padding: "7px 9px", borderRadius: 4, border: `1px solid ${THEME.border}`, fontSize: 13, background: THEME.surface, color: THEME.text }} />
                </label>
                <label style={{ fontSize: 12, color: THEME.muted, display: "grid", gap: 4 }}>
                  {t("visits.to")}
                  <input type="date" value={to} min={from || undefined} max={todayISO()} onChange={(e) => setTo(e.target.value)} required
                    style={{ padding: "7px 9px", borderRadius: 4, border: `1px solid ${THEME.border}`, fontSize: 13, background: THEME.surface, color: THEME.text }} />
                </label>
                <button type="submit" disabled={busy} style={{ gridColumn: isCompact ? "1 / -1" : "auto", padding: "8px 16px", borderRadius: 4, border: "none", background: THEME.navy, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  {t("visits.show")}
                </button>
              </form>
            )}
            <div style={{ display: "grid", gridTemplateColumns: isCompact ? "1fr 1fr" : "repeat(4, minmax(0, 1fr))", gap: 10, marginTop: 12 }}>
              <Small label={t("visits.rangeVisitors")} value={data.range.visitors} />
              <Small label={t("visits.rangeViews")} value={data.range.views} />
              <Small label={t("visits.rangeAverage")} value={data.range.average} />
              <Small label={t("visits.rangeBusiest")} value={data.range.busiest ? `${formatDate(lang, data.range.busiest.day)} (${data.range.busiest.visitors})` : "-"} />
            </div>
          </div>

          <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: THEME.text, marginBottom: 10 }}>{t("visits.dailyRange", { from: formatDate(lang, data.range.from), to: formatDate(lang, data.range.to) })}</div>
            <div role="img" aria-label={t("visits.daily")} style={{ display: "flex", alignItems: "flex-end", gap: isCompact ? 2 : 4, height: 130 }}>
              {data.daily.map((d) => (
                <div key={String(d.day)} title={`${formatDate(lang, d.day)}: ${d.visitors}`}
                  style={{ flex: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 2 }}>
                  {d.visitors > 0 && <span style={{ fontSize: isCompact ? 8.5 : 10, fontWeight: 700, color: THEME.heading, lineHeight: 1 }}>{d.visitors}</span>}
                  <div style={{ width: "100%", height: `${Math.max(2, (d.visitors / max) * 88)}%`, background: d.visitors ? THEME.navy : THEME.border, borderRadius: "2px 2px 0 0" }} />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: THEME.muted, marginTop: 6 }}>
              <span>{formatDate(lang, data.daily[0]?.day)}</span><span>{formatDate(lang, data.daily[data.daily.length - 1]?.day)}</span>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isCompact ? "1fr" : "1fr 1fr", gap: 14 }}>
            <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, padding: 14 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: THEME.text, marginBottom: 8 }}>{t("visits.pagesRange")}</div>
              {data.pages.length === 0 ? <div style={{ fontSize: 12.5, color: THEME.muted }}>{t("visits.none")}</div> : data.pages.map((p) => (
                <div key={p.page} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0", borderTop: `1px solid ${THEME.border}`, fontSize: 13 }}>
                  <span>{t(`visits.page.${p.page}`)}</span><b>{p.visitors}</b>
                </div>
              ))}
            </div>
            <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, padding: 14 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: THEME.text, marginBottom: 8 }}>{t("visits.devicesRange")}</div>
              {data.devices.length === 0 ? <div style={{ fontSize: 12.5, color: THEME.muted }}>{t("visits.none")}</div> : data.devices.map((d) => (
                <div key={d.device} style={{ padding: "6px 0", borderTop: `1px solid ${THEME.border}`, fontSize: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span>{t(`visits.device.${d.device}`)}</span><b>{Math.round((d.visitors / totalDevices) * 100)}%</b></div>
                  <div style={{ height: 6, background: THEME.bg, borderRadius: 3, marginTop: 4 }}><div style={{ height: 6, width: `${(d.visitors / totalDevices) * 100}%`, background: THEME.navy, borderRadius: 3 }} /></div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function Small({ label, value }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, color: THEME.muted }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color: THEME.heading, overflowWrap: "anywhere" }}>{value}</div>
    </div>
  );
}
// Today's date in the school's time zone, as YYYY-MM-DD.
function todayISO() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Dar_es_Salaam", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
function shift(iso, days) { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
