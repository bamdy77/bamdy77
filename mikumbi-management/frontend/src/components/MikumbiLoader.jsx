import { THEME } from "../styles/theme";

// Branded "system is working" indicator - two colored rings spinning in
// opposite directions around the MIKUMBI wordmark, styled after the
// reference design supplied for the project (a circular badge with a
// glowing ring sweeping around it). Used anywhere the app needs to show
// a loading / updating / uploading state at a decent size: cold start
// (WakingUp.jsx), auth check (ProtectedRoute.jsx), page-level "please
// wait" moments, submit buttons, etc.
//
// Colors, exactly as requested:
//   - navy   (brand navy, THEME.navy / #0c426f)
//   - coral  #FF7F50
//   - teal   #008B8B
// Two rings, spinning in opposite directions. Pure CSS (conic-gradient
// for the color sweep + a radial-gradient mask to cut a ring shape out
// of the gradient disc) - no extra library, nothing that can fail to
// load, so there is nothing here that can "error out".
export default function MikumbiLoader({
  size = 120,
  caption = null,
  wordmark = "MIKUMBI",
}) {
  const outerThickness = Math.max(3, Math.round(size * 0.055));
  const innerInset = Math.round(size * 0.16);
  const innerSize = size - innerInset * 2;
  const innerThickness = Math.max(3, Math.round(size * 0.045));
  const coreInset = innerThickness + 3;
  const coreSize = innerSize - coreInset * 2;
  // Fit the wordmark to the core circle: pick the largest font size that
  // still lets the whole word sit on one line with a little side padding,
  // instead of a fixed ratio that was overflowing/clipping at small sizes.
  const corePadding = coreSize * 0.1;
  const availableWidth = coreSize - corePadding * 2;
  const avgCharWidth = 0.62; // approx width-to-height ratio for bold caps
  const fontSizeByWidth = availableWidth / (wordmark.length * avgCharWidth);
  const fontSizeByHeight = coreSize * 0.3;
  const fontSize = Math.min(fontSizeByWidth, fontSizeByHeight);
  // Below this, "MIKUMBI" physically cannot fit on one line at a legible
  // size (e.g. a small inline/button-sized spinner on mobile). Rather than
  // shrink the text into illegible pixels or let it clip past the circle,
  // just show the two spinning rings with a plain center - still reads
  // clearly as "the app is working" at tiny sizes.
  const canShowWordmark = fontSize >= 8;

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: Math.max(8, Math.round(size * 0.09)) }}>
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        {/* Outer ring - navy sweeping into coral, clockwise */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: "conic-gradient(from 0deg, transparent 0deg, #0c426f 65deg, #FF7F50 205deg, transparent 330deg, transparent 360deg)",
            WebkitMask: `radial-gradient(farthest-side, transparent calc(100% - ${outerThickness}px), #000 calc(100% - ${outerThickness}px))`,
            mask: `radial-gradient(farthest-side, transparent calc(100% - ${outerThickness}px), #000 calc(100% - ${outerThickness}px))`,
            animation: "mikumbi-loader-cw 1.25s linear infinite",
          }}
        />
        {/* Inner ring - teal sweeping into coral, counter-clockwise */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: innerInset,
            left: innerInset,
            width: innerSize,
            height: innerSize,
            borderRadius: "50%",
            background: "conic-gradient(from 180deg, transparent 0deg, #008B8B 75deg, #FF7F50 215deg, transparent 320deg, transparent 360deg)",
            WebkitMask: `radial-gradient(farthest-side, transparent calc(100% - ${innerThickness}px), #000 calc(100% - ${innerThickness}px))`,
            mask: `radial-gradient(farthest-side, transparent calc(100% - ${innerThickness}px), #000 calc(100% - ${innerThickness}px))`,
            animation: "mikumbi-loader-ccw 1.65s linear infinite",
          }}
        />
        {/* Center disc + wordmark */}
        <div
          style={{
            position: "absolute",
            top: innerInset + coreInset,
            left: innerInset + coreInset,
            width: coreSize,
            height: coreSize,
            borderRadius: "50%",
            background: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 12px rgba(12,66,111,0.2)",
          }}
        >
          <span
            style={{
              fontWeight: 800,
              letterSpacing: "0.01em",
              color: "#0c426f",
              fontSize,
              whiteSpace: "nowrap",
              textAlign: "center",
              lineHeight: 1.1,
              userSelect: "none",
              opacity: canShowWordmark ? 1 : 0,
            }}
          >
            {canShowWordmark ? wordmark : ""}
          </span>
        </div>
      </div>

      {caption && (
        <div style={{ fontSize: Math.max(11, Math.round(size * 0.1)), fontWeight: 600, color: THEME.muted, textAlign: "center" }}>
          {caption}
        </div>
      )}
    </div>
  );
}
