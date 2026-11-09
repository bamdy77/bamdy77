// components/TrendChart.jsx - a small, dependency-free line chart used by
// the Analytics Dashboard (Head Master / Second Master). The project has
// no charting library installed, so this draws plain SVG - consistent
// with how the rest of the app already renders its own icons by hand.
import { THEME } from "../styles/theme";

// points: [{ label, value }]  - value may be null (gap in the data, e.g. a
// term the school didn't run this exam). `higherIsBetter` only affects the
// color of the line/dots (green trending the right way, red the wrong way)
// - it never changes what's plotted.
export default function TrendChart({
  points, height = 220, higherIsBetter = true, valueSuffix = "", valueFormatter, color, emptyText = "Not enough data yet for a trend.",
}) {
  const usable = points.filter((p) => p.value != null);
  if (!points.length || usable.length < 2) {
    return (
      <div style={{
        height, display: "flex", alignItems: "center", justifyContent: "center",
        color: THEME.muted, fontSize: 13, background: THEME.bg, borderRadius: 10, border: `1px dashed ${THEME.border}`,
      }}>
        {emptyText}
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
  const lineColor = color || (good ? THEME.success : THEME.danger);

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
            {seg.map(([x, y, p], i) => (
              <g key={i}>
                <circle cx={x} cy={y} r="3.5" fill={lineColor} />
                <title>{`${p.label}: ${fmt(p.value)}`}</title>
              </g>
            ))}
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
