import { useState, useEffect } from "react";

// Breakpoints: mobile < 640px, tablet 640-1023px, desktop >= 1024px.
// These match the common Tailwind-style breakpoints so they feel familiar,
// and cover phones, iPads/Android tablets, and laptop/desktop screens.
export function useBreakpoint() {
  const [width, setWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1280);

  useEffect(() => {
    let frame;
    const onResize = () => {
      // rAF-throttled so a window drag doesn't fire dozens of re-renders/sec.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setWidth(window.innerWidth));
    };
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); cancelAnimationFrame(frame); };
  }, []);

  const mode = width < 640 ? "mobile" : width < 1024 ? "tablet" : "desktop";
  return { width, mode, isMobile: mode === "mobile", isTablet: mode === "tablet", isDesktop: mode === "desktop" };
}
