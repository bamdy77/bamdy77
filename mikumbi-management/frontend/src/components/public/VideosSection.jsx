import { useEffect, useState } from "react";
import { apiFetch, API_BASE } from "../../utils/api";
import { useLang } from "../../i18n";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { SectionTitle } from "./NewsSection";

// "Ujumbe kwa Mzazi/Mlezi" on the parents' home page: training videos uploaded by
// the school (Communications → Parent Videos). Watch in place or download.
// The whole section is hidden while there are no videos.
const NAVY = "#007aff";

export default function VideosSection() {
  const { t } = useLang();
  const { isMobile, isTablet } = useBreakpoint();
  const [videos, setVideos] = useState([]);

  useEffect(() => {
    let off = false;
    apiFetch("/public/videos").then((d) => { if (!off) setVideos(Array.isArray(d.videos) ? d.videos : []); }).catch(() => {});
    return () => { off = true; };
  }, []);

  if (!videos.length) return null;
  return (
    <section id="videos" className="pub-section" style={{ background: "#fff", padding: isMobile ? "48px 18px" : "70px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <SectionTitle title={t("videos.title")} subtitle={t("videos.subtitle")} />
        {/* Centred row: one video sits in the middle, two side by side in the middle, and so on. */}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 20 }}>
          {videos.map((v) => (
            <article key={v.id} style={{ width: isMobile ? "100%" : isTablet ? "calc(50% - 10px)" : "calc(33.333% - 14px)", maxWidth: 420, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 4, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              {/* preload="none": nothing is downloaded until the parent presses play (saves data). */}
              <video controls preload="none" poster={v.poster} playsInline controlsList="nodownload"
                style={{ width: "100%", aspectRatio: "16 / 9", background: "#0f172a", display: "block" }}>
                <source src={v.url} />
              </video>
              <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                <h3 style={{ color: NAVY, fontSize: 18, fontWeight: 800, margin: 0 }}>{v.title}</h3>
                {v.description && <p style={{ color: "#475569", fontSize: 15, lineHeight: 1.6, margin: 0 }}>{v.description}</p>}
                <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
                  <a href={`${API_BASE}/public/videos/${v.id}/download`} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 4, background: NAVY, color: "#fff", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
                    {t("videos.download")}
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
