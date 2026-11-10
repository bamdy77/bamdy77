import { useState, useEffect } from "react";

// <img> that never shows a broken-image icon: if the file is missing it
// renders `fallback` instead (so the page looks fine before the school has
// uploaded its photos). Keeps a fixed box so the layout doesn't jump.
export default function SmartImage({ src, alt, fallback = null, style = {}, wrapStyle = {}, ...rest }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  return (
    <div style={{ position: "relative", overflow: "hidden", ...wrapStyle }}>
      {failed ? fallback : (
        <img
          src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", ...style }}
          {...rest}
        />
      )}
    </div>
  );
}

// Returns only those image URLs that actually exist/load, so a gallery can
// hide itself entirely until real photos are uploaded.
export function useLoadedImages(srcs) {
  const key = srcs.join("|");
  const [loaded, setLoaded] = useState([]);
  useEffect(() => {
    let cancelled = false;
    const ok = new Set();
    let pending = srcs.length;
    const done = () => { pending -= 1; if (!cancelled && pending <= 0) setLoaded(srcs.filter((s) => ok.has(s))); };
    srcs.forEach((src) => {
      const img = new Image();
      img.onload = () => { ok.add(src); done(); };
      img.onerror = done;
      img.src = src;
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return loaded;
}

// Card photo that cross-fades through several images, one every `interval`
// ms (default 5s). Only images that actually load are used; one image is
// shown still, none shows `fallback`. Honours "reduce motion" (no auto-play)
// and pauses while the visitor hovers the card.
export function Slideshow({ srcs, alt, interval = 5000, fallback = null, wrapStyle = {}, imgStyle = {} }) {
  const loaded = useLoadedImages(srcs);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = loaded.length;
  useEffect(() => { setI(0); }, [n]);
  useEffect(() => {
    if (n < 2 || paused) return undefined;
    const reduce = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return undefined;
    const t = setInterval(() => setI((k) => (k + 1) % n), interval);
    return () => clearInterval(t);
  }, [n, paused, interval]);
  return (
    <div style={{ position: "relative", overflow: "hidden", ...wrapStyle }}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {n === 0 ? fallback : loaded.map((src, k) => (
        <img key={src} src={src} alt={k === i ? alt : ""} aria-hidden={k === i ? undefined : true} decoding="async"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block",
            opacity: k === i ? 1 : 0, transition: "opacity .8s ease", ...imgStyle }} />
      ))}
      {n > 1 && (
        <div style={{ position: "absolute", bottom: 8, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 6 }}>
          {loaded.map((src, k) => (
            <button key={src} type="button" onClick={() => setI(k)} aria-label={`${alt} ${k + 1}`}
              style={{ width: 8, height: 8, padding: 0, borderRadius: "50%", border: "none", cursor: "pointer",
                background: k === i ? "#fff" : "rgba(255,255,255,0.5)", boxShadow: "0 0 2px rgba(0,0,0,0.5)" }} />
          ))}
        </div>
      )}
    </div>
  );
}
