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
