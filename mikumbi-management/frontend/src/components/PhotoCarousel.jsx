import { useState, useEffect } from "react";

// Rotates through picha1.png..picha5.png every 5 seconds. Deliberately no
// captions/labels on top - per spec, each photo is poster-style and
// self-explanatory. Place the actual files in /public/assets/.
const PHOTOS = ["/assets/picha1.png", "/assets/picha2.png", "/assets/picha3.png", "/assets/picha4.png", "/assets/picha5.png"];

export default function PhotoCarousel({ style = {} }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIndex((i) => (i + 1) % PHOTOS.length), 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", borderRadius: "inherit", ...style }}>
      {PHOTOS.map((src, i) => (
        <img
          key={src}
          src={src}
          alt=""
          onError={(e) => { e.currentTarget.style.opacity = 0; }}
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover",
            opacity: i === index ? 1 : 0, transition: "opacity 1s ease-in-out",
          }}
        />
      ))}
    </div>
  );
}
