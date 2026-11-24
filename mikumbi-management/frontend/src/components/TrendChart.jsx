// components/TrendChart.jsx - a small, dependency-free line chart used by
// the Analytics Dashboard (Head Master / Second Master). The project has
// no charting library installed, so this draws plain SVG - consistent
// with how the rest of the app already renders its own icons by hand.
import { THEME } from "../styles/theme";
import { useLang } from "../i18n";

// Colour a single value by how good/poor it is, mirroring the feel of the
// Results Management grades (green = good, amber = average, red = poor/worst).
// `metric` tells us the scale: "pct"/"marks" are 0–100 (higher is better),
// "gpa" is 1 (best) → 5 (worst), "division" is 1 (Div I) → 5 (Div 0).
const AMBER = "#D97706";
function bandColor(metric, v) {
  if (v == null || !metric) return null;
  if (metric === "pct" || metric === "marks") return v >= 65 ? THEME.success : v >= 40 ? AMBER : THEME.danger;
  if (metric === "gpa") return v <= 2 ? THEME.success : v <= 3.5 ? AMBER : THEME.danger;
  if (metric === "division") return v <= 2 ? THEME.success : v <= 3 ? AMBER : THEME.danger;
  return null;
}

// points: [{ label, value }]  - value may be null (gap in the data, e.g. a
// term the school didn't run this exam). `higherIsBetter` only affects the
// color of the line/dots (green trending the right way, red the wrong way)
// - it never changes what's plotted.
export default function TrendChart({
  points, height = 220, higherIsBetter = true, valueSuffix = "", valueFormatter, color, emptyText, metric,
}) {
  const { t } = useLang();
  const usable = points.filter((p) => p.value != null);
  if (!points.length || usable.length < 2) {
    return (
      <div style={{
        height, display: "flex", alignItems: "center", justifyContent: "center",
        color: THEME.muted, fontSize: 13, background: THEME.bg, borderRadius: 4, border: `1px dashed ${THEME.border}`,
      }}>
        {emptyText || t("an.notEnough")}
      </div>
    );
  }

  const width = 640;
  const padL = 44, padR = 16, padT = 18, padB = 34;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const vals = usable.map((p) => p.value);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.12;
  min -= pad; max += pad;

  const n = points.length;
  const xFor = (i) => padL + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1));
  const yFor = (v) => padT + plotH - ((v - min) / (max - min)) * plotH;

  // Build the polyline, breaking it into separate segments across any
  // null (missing) values instead of drawing a misleading straight line
  // over a gap in the data.
  const segments = [];
  let current = [];
  points.forEach((p, i) => {
    if (p.value == null) {
      if (current.length) segments.push(current);
      current = [];
    } else {
      current.push([xFor(i), yFor(p.value), p]);
    }
  });
  if (current.length) segments.push(current);

  const trendUp = usable[usable.length - 1].value >= usable[0].value;
  const good = higherIsBetter ? trendUp : !trendUp;
  // With a per-value metric, the line stays a neutral grey so the good/poor
  // colour of each point (dot + its number) is what stands out; otherwise the
  // whole line is coloured by the trend direction, as before.
  const lineColor = color || (metric ? THEME.muted : (good ? THEME.success : THEME.danger));

  const fmt = (v) => (valueFormatter ? valueFormatter(v) : `${v}${valueSuffix}`);

  // Gridlines: min, mid, max
  const gridVals = [min + pad, (min + max) / 2, max - pad];

  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height, minWidth: 420 }}>
        {gridVals.map((gv, i) => (
          <g key={i}>
            <line x1={padL} x2={width - padR} y1={yFor(gv)} y2={yFor(gv)} stroke={THEME.border} strokeWidth="1" strokeDasharray={i === 1 ? "4 4" : "0"} />
            <text x={padL - 8} y={yFor(gv) + 4} fontSize="10" fill={THEME.muted} textAnchor="end">{fmt(Math.round(gv * 10) / 10)}</text>
          </g>
        ))}

        {segments.map((seg, si) => (
          <g key={si}>
            {seg.length > 1 && (
              <polyline
                fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
                points={seg.map(([x, y]) => `${x},${y}`).join(" ")}
              />
            )}
            {seg.map(([x, y, p], i) => {
              // Colour the dot and its number by how good/poor the value is
              // (red = poor, like Results Management) when a metric is given.
              const dotColor = bandColor(metric, p.value) || lineColor;
              return (
              <g key={i}>
                <circle cx={x} cy={y} r="4" fill={dotColor} />
                {/* Print the actual value on each point so the chart shows
                    real data, not just a shape. Sits above the dot, or just
                    below it when the point is near the top edge. */}
                <text x={x} y={y - 8 < padT + 4 ? y + 14 : y - 8} fontSize="10" fontWeight="700" fill={dotColor} textAnchor="middle">{fmt(p.value)}</text>
                <title>{`${p.label}: ${fmt(p.value)}`}</title>
              </g>
              );
            })}
          </g>
        ))}

        {points.map((p, i) => (
          <text key={i} x={xFor(i)} y={height - 10} fontSize="9.5" fill={THEME.muted} textAnchor="middle">
            {p.label.length > 10 ? `${p.label.slice(0, 9)}…` : p.label}
          </text>
        ))}
      </svg>
    </div>
  );
}
