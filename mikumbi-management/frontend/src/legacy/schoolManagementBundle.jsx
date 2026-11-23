import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { showSuccess } from "../components/SuccessModal";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { BedIcon, ReceiptIcon, ClockIcon, ShieldIcon, CalendarPlusIcon, DownloadIcon, CloseIcon, CheckIcon, SaveIcon, CameraIcon, ArrowUpCircleIcon, SearchIcon, PrinterIcon, SpinnerIcon } from "../components/icons";
import { replaceBackgroundLightBlue } from "../utils/photoBackground";
import { REGIONS, getDistricts, getWards, getVillages, findRegionForDistrict } from "../data/locations";
import { getLang, translate, useLang } from "../i18n";

// Non-reactive translator for this bundle's module-level helpers and shared
// components. The top-level feature components (StudentModule, TimetableModule,
// HostelModule, ContributionsModule) subscribe via useLang() so their whole
// subtree re-renders when the language is switched.
const tr = (key, vars) => translate(getLang(), key, vars);

// ─── CONFIG ───────────────────────────────────────────────────────────────────
// Local development - the Vite dev proxy forwards /api → http://localhost:5000/api.
// Production - if the frontend and backend are deployed as ONE service, the
// relative "/api" path just works. If deployed as TWO separate services
// (e.g. Render: a Web Service for the backend + a Static Site for the
// frontend), set VITE_API_URL as an environment variable on the frontend's
// service (e.g. https://mikumbi-backend.onrender.com/api) - no code change
// needed. This matches src/context/AuthContext.jsx's API_BASE exactly.
const API_BASE = import.meta.env.VITE_API_URL || "/api";
// Uploaded photos are served outside /api (e.g. /uploads/students/xxx.jpg) - this
// derives the correct backend origin whether API_BASE is a relative path (local dev,
// proxied by Vite) or a full production URL like "https://your-app.up.railway.app/api".
const FILE_BASE = API_BASE.replace(/\/api\/?$/, "");
// Cloudinary photo_url values are already full https:// links - used as-is.
// (Falls back to FILE_BASE-prefixing only for any old local-path photos.)
const photoSrc = (url) => (!url ? null : /^https?:\/\//.test(url) ? url : `${FILE_BASE}${url}`);

// Shrinks a photo (from the camera or file picker) to a sensible passport-photo
// size and re-encodes it as a JPEG, well under the server's 5MB upload limit.
//
// ROOT CAUSE OF THE "low memory" CRASH (fixed here): modern phone cameras
// routinely produce 12–108 MEGAPIXEL photos (a single Samsung/Xiaomi shot can
// be 9000×12000px). The previous approach decoded that full-resolution photo
// into a plain <img> element first (`new Image()` + `img.src = objectUrl`),
// which forces the browser to allocate an UNCOMPRESSED bitmap buffer of
// width×height×4 bytes in memory BEFORE any resizing ever happens - for a
// 108MP photo that's ~430MB for one decode, on a budget Android phone that
// may only have a few hundred MB of free RAM per browser tab. That decode
// step would silently fail (caught by the try/catch below) and fall back to
// returning the ORIGINAL, still full-size file - which then went on to
// replaceBackgroundLightBlue() and its own canvas + ML segmentation model,
// compounding the memory pressure and producing the "low memory"/upload
// failure the user sees. This had NOTHING to do with Cloudinary - it never
// even got as far as a network request.
//
// Fix: decode via createImageBitmap() with its native `resizeWidth` /
// `resizeHeight` options. Unlike <img>, createImageBitmap can downscale
// DURING decode - the browser never has to materialize the full-resolution
// bitmap in JS-visible memory at all, so even a 100MP camera photo decodes
// straight down to ~1000px using only a small fraction of the memory.
// Falls back to the old <img>-based path only on browsers without
// createImageBitmap resize support, and to the original file untouched if
// everything fails, so a photo is never lost.
const MAX_PHOTO_DIMENSION = 1000; // px, long edge - plenty for a passport photo
const PHOTO_JPEG_QUALITY = 0.92; // bumped from 0.82 - photos are now also used for printed Identity Cards, where softening from heavier compression is much more visible than on a screen thumbnail.

async function computeResizeTarget(file) {
  // Peek at the image's natural dimensions cheaply (no full decode) via a
  // throwaway bitmap - createImageBitmap without resize options still avoids
  // the <img> full decode-to-DOM cost and lets us compute the target size.
  const probe = await createImageBitmap(file);
  const { width, height } = probe;
  probe.close?.();
  if (width <= MAX_PHOTO_DIMENSION && height <= MAX_PHOTO_DIMENSION) return { width, height };
  const scale = MAX_PHOTO_DIMENSION / Math.max(width, height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

const compressPhotoFileViaImage = (file) => new Promise((resolve) => {
  const img = new Image();
  const objectUrl = URL.createObjectURL(file);
  const cleanup = () => URL.revokeObjectURL(objectUrl);
  img.onload = () => {
    try {
      let { width, height } = img;
      if (width > MAX_PHOTO_DIMENSION || height > MAX_PHOTO_DIMENSION) {
        const scale = MAX_PHOTO_DIMENSION / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        cleanup();
        if (!blob) return resolve(null); // decoding/encoding failed
        resolve(new File([blob], (file.name || "photo").replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }));
      }, "image/jpeg", PHOTO_JPEG_QUALITY);
    } catch { cleanup(); resolve(null); }
  };
  img.onerror = () => { cleanup(); resolve(null); };
  img.src = objectUrl;
});

const compressPhotoFile = async (file) => {
  if (!file.type.startsWith("image/")) return file;

  // Preferred path: createImageBitmap with native resize-during-decode -
  // this is the fix for the memory crash on high-megapixel camera photos
  // (see the comment above).
  if (typeof createImageBitmap === "function") {
    try {
      const target = await computeResizeTarget(file);
      const bitmap = await createImageBitmap(file, {
        resizeWidth: target.width,
        resizeHeight: target.height,
        resizeQuality: "medium",
      });
      const canvas = document.createElement("canvas");
      canvas.width = target.width; canvas.height = target.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0, target.width, target.height);
      bitmap.close?.();
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", PHOTO_JPEG_QUALITY));
      if (blob) return new File([blob], (file.name || "photo").replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
      // fall through to the <img>-based path below on encode failure
    } catch {
      // fall through - some browsers (older Safari) don't support the
      // resize options and throw; try the <img> path next.
    }
  }

  const viaImage = await compressPhotoFileViaImage(file);
  if (viaImage) return viaImage;

  // SAFETY NET: every decode/resize attempt failed. Returning the original
  // multi-megapixel file here is exactly what caused the original "low
  // memory" crash further down the pipeline (background replacement +
  // upload). Refuse it instead of silently passing a huge file along -
  // handlePhotoFile below surfaces this to the user so they know to pick a
  // smaller photo, rather than the device silently running out of memory.
  return null;
};

// Reads a picked/captured photo file into a data-URL preview, used by both the
// "Take Photo" (camera) and "Choose File" buttons. Compresses first (see
// compressPhotoFile above) so neither the in-memory preview nor the eventual
// upload can overwhelm the device or the server's size limit. Then
// automatically replaces whatever is behind the student with a plain
// light-blue backdrop (see utils/photoBackground.js) - sets
// form.photoProcessing while that runs so the UI can show a "please wait"
// state, since it can take a few seconds on the first photo of a session.
const handlePhotoFile = async (e, setForm) => {
  const file = e.target.files?.[0];
  e.target.value = ""; // allow re-selecting the same file again later
  if (!file) return;
  setForm(p => ({ ...p, photoProcessing: true }));
  const compressed = await compressPhotoFile(file);
  if (!compressed) {
    // Every decode/resize attempt failed - this is the scenario that used
    // to silently fall through with the original huge file and crash later
    // with a "low memory" error. Tell the user plainly instead.
    setForm(p => ({ ...p, photoProcessing: false }));
    window.alert(tr("lg.photoReadFail"));
    return;
  }
  // Background replacement runs its own ML segmentation model on a full
  // canvas of whatever it's given - only worth risking on an
  // already-compressed, passport-sized photo. If compression somehow still
  // left a large file (e.g. a browser without createImageBitmap resize
  // support falling back to a bigger size), skip this heavier step rather
  // than stacking two memory-intensive operations on a struggling device.
  const SKIP_BG_REPLACEMENT_ABOVE_BYTES = 2 * 1024 * 1024; // 2MB
  const withBlueBackground = compressed.size > SKIP_BG_REPLACEMENT_ABOVE_BYTES
    ? compressed
    : await replaceBackgroundLightBlue(compressed);
  const reader = new FileReader();
  reader.onload = () => setForm(p => ({ ...p, photoFile: withBlueBackground, photoPreview: reader.result, photoProcessing: false }));
  reader.onerror = () => setForm(p => ({ ...p, photoProcessing: false }));
  reader.readAsDataURL(withBlueBackground);
};

// Simple passport-photo placeholder (person silhouette) shown before any photo is attached.
const PassportPlaceholderIcon = () => (
  <svg viewBox="0 0 76 92" width="100%" height="100%" style={{display:"block"}}>
    <rect width="76" height="92" fill={C.bg}/>
    <circle cx="38" cy="34" r="15" fill={C.border}/>
    <path d="M10 88c0-15 12-27 28-27s28 12 28 27" fill={C.border}/>
  </svg>
);

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const SCHOOL = {
  line1: "THE PRESIDENT'S OFFICE",
  line2: "REGIONAL ADMINISTRATION AND LOCAL GOVERNMENT",
  line3: "MIKUMBI SECONDARY SCHOOL",
  line4: "GENERAL SCHOOL TIME TABLE",
  code: "S4005",
  location: "Newala, Mtwara",
};

const FORMS   = ["Form I","Form II","Form III","Form IV"];
const STREAMS = ["A","B","C"];
const DAYS    = ["Monday","Tuesday","Wednesday","Thursday","Friday"];
const MONTHS  = ["January","February","March","April","May","June","July","August","September","October","November","December"];
// Rolling year list (two back, two ahead) so pickers never go stale.
const CURRENT_YEAR = String(new Date().getFullYear());
const YEARS   = Array.from({ length: 5 }, (_, i) => String(Number(CURRENT_YEAR) - 2 + i));
const SUBJECTS = ["AGRICULTURE","BIOLOGY","BOOKKEEPING","BUSINESS STUDY","CHEMISTRY","CIVICS","COMMERCE","COMPUTER SCIENCE","EDK","ENGLISH","GEOGRAPHY","H/T MAADILI","HISTORY","KISWAHILI","LT IN ENGLISH","MATHEMATICS","PHYSICS"]; // ascending (A→Z)
const CHARGE_TYPES = ["Academics (Part-time Teachers)","Ream","Other"];
const VEGETABLE_TYPES = ["Njugu","Maharagwe","Mbaazi","Kunde"];
const CONTRIB_TERMS = ["Term I","Term II","Term III","Term IV","Full Year"];
const HOSTELS = ["Girls Hostel","Boys Hostel"];
const ALL_CLASSES = FORMS.flatMap(f => STREAMS.map(s => `${f} ${s}`));
// Fixed draft-attempt labels - a school gets at most 4 generation attempts/day
// (see backend MAX_GENERATIONS_PER_DAY), and the person exporting/publishing
// gets to pick which of these labels prints on the document, since earlier
// attempts on a given day are often just trials.
const DRAFT_LABELS = ["1st Draft", "2nd Draft", "3rd Draft", "4th Draft"];

// Fallback only - the live list (incl. any optional afternoon periods the Admin/Academic
// has switched on) is fetched from the API at /timetable/periods.
// 12-slot school day - BREAK and LUNCH occupy slots 5 and 8 in the sequence
// (hence P4→P6 and P7→P9 skipping those slot numbers) but are never
// selectable as teaching periods anywhere in the app (isBreak:true keeps
// them out of every subject/event dropdown).
const PERIODS = [
  { label:"P1",    time:"08:00–08:40", isBreak:false },
  { label:"P2",    time:"08:40–09:20", isBreak:false },
  { label:"P3",    time:"09:20–10:00", isBreak:false },
  { label:"P4",    time:"10:00–10:40", isBreak:false },
  { label:"BREAK", time:"10:40–11:00", isBreak:true  },
  { label:"P6",    time:"11:00–11:40", isBreak:false },
  { label:"P7",    time:"11:40–12:20", isBreak:false },
  { label:"LUNCH", time:"12:20–12:50", isBreak:true  },
  { label:"P9",    time:"12:50–13:30", isBreak:false },
  { label:"P10",   time:"13:30–14:10", isBreak:false },
  { label:"P11",   time:"14:10–14:50", isBreak:false },
  { label:"P12",   time:"14:50–15:30", isBreak:false },
];
const LESSON_PERIODS = PERIODS.filter(p => !p.isBreak);

// ─── COLORS ───────────────────────────────────────────────────────────────────
const C = {
  bg:"var(--mk-bg, #F8FAFC)", surface:"var(--mk-surface, #FFFFFF)", border:"var(--mk-border, #E2E8F0)",
  text:"var(--mk-text, #0F172A)", muted:"var(--mk-muted, #64748B)",
  accent:"var(--mk-navy, #1a50c7)", accentLight:"var(--mk-accent-light, #EEF1FA)", accentText:"var(--mk-link, #1a50c7)",
  dangerSolid:"var(--mk-danger-solid, #DC2626)", successSolid:"var(--mk-success-solid, #16A34A)", warningSolid:"var(--mk-warning-solid, #D97706)",
  danger:"var(--mk-danger, #DC2626)", dangerLight:"var(--mk-danger-light, #FEF2F2)",
  success:"var(--mk-success, #15803D)", successLight:"var(--mk-success-light, #F0FDF4)",
  warning:"var(--mk-warning, #B45309)", warningLight:"var(--mk-warning-light, #FFFBEB)",
  girl:"var(--mk-girl, #9333EA)", girlLight:"var(--mk-girl-light, #FAF5FF)",
  boy:"var(--mk-boy, #0369A1)", boyLight:"var(--mk-boy-light, #F0F9FF)",
};

const SUBJ_COLORS = {};
const PAL = ["#4F46E5","#0369A1","#9333EA","#16A34A","#D97706","#DC2626","#0891B2","#7C3AED","#065F46","#92400E","#1D4ED8","#BE185D","#0F766E","#6D28D9","#15803D","#B45309","#1E40AF"];
// Subject colours are dark tones; in Dark/Nocturne they are mixed with white
// (--mk-subj-lift, 0% in the light theme) so subject names stay readable.
SUBJECTS.forEach((s,i) => { SUBJ_COLORS[s] = `color-mix(in srgb, ${PAL[i % PAL.length]}, #fff var(--mk-subj-lift, 0%))`; });

// ─── API HELPER ───────────────────────────────────────────────────────────────
// Every successful save/update/delete (POST/PUT/PATCH/DELETE) shows the same
// "Successfully Saved" confirmation popup used everywhere else in the
// system - using the backend's own message when it sends one, otherwise a
// sensible default for that HTTP method. Pass { silent: true } in the
// options for the rare call that already has its own dedicated success UI
// and shouldn't also pop this up (e.g. a background auto-refresh).
const apiFetch = async (path, options = {}, token) => {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    // Network-level failure - most commonly the free-tier backend is
    // asleep/restarting and the connection never completes. Surface this
    // as a normal, catchable error (never let it look like a silent freeze).
    throw new Error(tr("lg.serverUnreachable"));
  }
  // A cold-starting/restarting Render backend can return an HTML gateway
  // page (502/504) instead of JSON. Without this check, res.json() throws
  // an obscure "Unexpected token '<'" that looks like the button did
  // nothing - this turns it into the same friendly, catchable message.
  const isJson = res.headers.get("content-type")?.includes("application/json");
  if (!isJson) {
    throw new Error(res.ok ? tr("lg.badResponse") : tr("lg.serverRestarting"));
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || tr("lg.requestFailed"));
  const method = (options.method || "GET").toUpperCase();
  if (!options.silent && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const defaultMsg = method === "DELETE" ? tr("lg.removedOk") : tr("lg.savedOk");
    showSuccess(tr("lg.success"), data.message || defaultMsg);
  }
  return data;
};

// ─── SHARED UI ────────────────────────────────────────────────────────────────
const IS = {
  border:`1px solid ${C.border}`, borderRadius:4, padding:"8px 12px",
  fontSize:14, color:C.text, background:C.surface, outline:"none",
  width:"100%", boxSizing:"border-box",
};

const Badge = ({ color="default", children }) => {
  const m = {
    default:{bg:"#F1F5F9",text:"#475569"}, indigo:{bg:C.accentLight,text:C.accent},
    green:{bg:C.successLight,text:C.success}, red:{bg:C.dangerLight,text:C.danger},
    amber:{bg:C.warningLight,text:C.warning}, purple:{bg:C.girlLight,text:C.girl},
    blue:{bg:C.boyLight,text:C.boy},
  };
  const s = m[color]||m.default;
  return <span style={{background:s.bg,color:s.text,fontSize:11,fontWeight:600,letterSpacing:"0.04em",padding:"2px 8px",borderRadius:4,display:"inline-block",textTransform:"uppercase"}}>{children}</span>;
};

const Btn = ({ variant="primary", size="md", onClick, children, style={}, disabled, loading }) => {
  const base = { border:"none", borderRadius:4, cursor:disabled||loading?"not-allowed":"pointer", fontWeight:600, fontSize:size==="sm"?12:14, padding:size==="sm"?"5px 12px":"8px 18px", opacity:disabled?0.5:1, display:"inline-flex", alignItems:"center", gap:6 };
  const v = { primary:{background:C.accent,color:"#fff"}, secondary:{background:C.border,color:C.text}, danger:{background: C.dangerSolid,color:"#fff"}, ghost:{background:"transparent",color:C.accentText,border:`1px solid ${C.accent}`}, success:{background: C.successSolid,color:"#fff"}, warning:{background: C.warningSolid,color:"#fff"}, cancel:{background:C.surface,color:C.danger,border:`1.5px solid ${C.danger}`} };
  // Custom `style` (e.g. the Enroll Student button's deep green) must win
  // over the variant's default color - it's applied LAST, not merged into
  // `base` before the variant, which used to let the variant silently
  // override any custom background/color passed in.
  return <button style={{...base,...v[variant],...style}} onClick={onClick} disabled={disabled||loading}>{loading?<><SpinnerIcon size={13} />{tr("lg.loading")}</>:children}</button>;
};

const Inp = ({ label, value, onChange, type="text", options, placeholder, required, readOnly }) => (
  <div style={{display:"flex",flexDirection:"column",gap:4}}>
    {label && <label style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.05em"}}>{label}{required&&" *"}</label>}
    {options
      ? <select value={value} onChange={e=>onChange(e.target.value)} style={IS} disabled={readOnly}><option value="">{tr("lg.selectDots")}</option>{options.map(o=><option key={o.value??o} value={o.value??o}>{o.label??o}</option>)}</select>
      : <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{...IS,background:readOnly?C.bg:C.surface}} readOnly={readOnly}/>}
  </div>
);

// Sentinel value shown as the last option in every location dropdown below,
// letting the user fall back to free typing for any place not (yet) in the
// Mtwara/Lindi/Ruvuma dataset (e.g. a student from outside those regions, or
// a spelling the source list doesn't have) - this way the dropdown can never
// block someone from enrolling a student.
const LOCATION_OTHER = "__OTHER__";

// A Region/District/Ward/Village dropdown that cascades off its parent
// selection (via `options`, computed by the caller) and falls back to a
// plain text box - with a "back to list" link - the moment its value isn't
// one of the known options (either because the user picked "Other" or
// because an existing student's saved value predates this dataset).
// Keyed by the caller on the parent selection so it remounts (and
// re-evaluates its manual/list mode) whenever the parent level changes.
// `isMobile`/`isTablet` (from useBreakpoint) scale up font-size, padding and
// tap targets on touch screens - 16px stops iOS Safari auto-zooming into the
// field on focus, and the larger padding/min-height gives a proper thumb-sized
// tap area for both the <select> and the "Choose from list" link.
const LocationField = ({ label, value, onChange, options, required, isMobile, isTablet }) => {
  const touch = isMobile || isTablet;
  const [manual, setManual] = useState(() => !!value && !options.includes(value));
  const fieldStyle = { ...IS, fontSize: touch ? 16 : 14, padding: touch ? "11px 12px" : "8px 12px" };
  const labelEl = label && (
    <label style={{fontSize:touch?12:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.05em"}}>{label}{required&&" *"}</label>
  );
  if (manual) {
    return (
      <div style={{display:"flex",flexDirection:"column",gap:touch?8:4}}>
        {labelEl}
        <input value={value} onChange={e=>onChange(e.target.value)} placeholder={tr("lg.typeHere")} style={fieldStyle}/>
        <button type="button" onClick={()=>{onChange("");setManual(false);}}
          style={{alignSelf:"flex-start",background:"none",border:"none",color:C.accentText,fontWeight:touch?600:400,fontSize:touch?13:11,cursor:"pointer",padding:touch?"6px 2px":0,minHeight:touch?32:"auto",textDecoration:"underline"}}>{tr("lg.chooseFromList")}</button>
      </div>
    );
  }
  return (
    <div style={{display:"flex",flexDirection:"column",gap:touch?8:4}}>
      {labelEl}
      <select
        value={value}
        onChange={e => { const v = e.target.value; if (v===LOCATION_OTHER) { onChange(""); setManual(true); } else { onChange(v); } }}
        style={fieldStyle}
      >
        <option value="">{tr("lg.selectDots")}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
        <option value={LOCATION_OTHER}>{tr("lg.otherNotInList")}</option>
      </select>
    </div>
  );
};

const Card = ({ children, style={}, ...rest }) => <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:4,padding:22,...style}} {...rest}>{children}</div>;

// ── Icon set (plain inline SVG - no emoji, no external icon package) ────────
// Small (15px default) line icons used inside every dropdown/menu item across
// the whole app (ActionsMenu row-menus, MoreMenu toolbar-menus). Keeping
// these as plain SVG means no new npm dependency and nothing that can fail
// to load - they inherit `currentColor`, so they automatically match
// whatever text color (muted/danger/etc) the menu item is already using.
const svgIcon = (paths) => ({ size = 15, style = {} } = {}) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,...style}}>
    {paths}
  </svg>
);
const Icon = {
  Edit: svgIcon(<><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></>),
  Trash: svgIcon(<><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></>),
  Clock: svgIcon(<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></>),
  FileText: svgIcon(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M9 13h6"/><path d="M9 17h6"/></>),
  Download: svgIcon(<><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></>),
  UploadCloud: svgIcon(<><path d="M12 16V8"/><path d="m8.5 11.5 3.5-3.5 3.5 3.5"/><path d="M6.5 19a4.5 4.5 0 0 1-.5-9 5.5 5.5 0 0 1 10.9-1.1A4 4 0 0 1 17 19H6.5Z"/></>),
  EyeOff: svgIcon(<><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a17.4 17.4 0 0 1-3.11 4.36M6.1 6.1C3.5 7.9 2 12 2 12s3 8 10 8a9.3 9.3 0 0 0 4.9-1.4"/><path d="m2 2 20 20"/><path d="M9.5 9.5a3 3 0 0 0 4.24 4.24"/></>),
  Wallet: svgIcon(<><path d="M20 12V8a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7"/><circle cx="17" cy="14" r="1"/></>),
  ArrowLeftRight: svgIcon(<><path d="m17 3 4 4-4 4"/><path d="M3 7h18"/><path d="m7 21-4-4 4-4"/><path d="M21 17H3"/></>),
  Power: svgIcon(<><path d="M12 2v8"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/></>),
  Bed: svgIcon(<><path d="M2 18v-6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v6"/><path d="M2 18h20"/><path d="M4 12V6a2 2 0 0 1 2-2h4v6"/></>),
  CreditCard: svgIcon(<><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></>),
  Receipt: svgIcon(<><path d="M4 2h16v20l-3-2-3 2-3-2-3 2-3-2-1 1Z"/><path d="M8 8h8"/><path d="M8 12h8"/></>),
  RefreshCw: svgIcon(<><path d="M21 12a9 9 0 0 1-15.3 6.3L3 15"/><path d="M3 12a9 9 0 0 1 15.3-6.3L21 9"/><path d="M21 3v6h-6"/><path d="M3 21v-6h6"/></>),
  ArrowLeft: svgIcon(<><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></>),
  Book: svgIcon(<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></>),
  Layers: svgIcon(<><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/></>),
  Calendar: svgIcon(<><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></>),
  Plus: svgIcon(<><path d="M12 5v14"/><path d="M5 12h14"/></>),
  UserPlus: svgIcon(<><circle cx="9" cy="8" r="4"/><path d="M2 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2"/><path d="M19 8v6M22 11h-6"/></>),
  MoreVertical: svgIcon(<><circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/></>),
  ChevronDown: svgIcon(<path d="m6 9 6 6 6-6"/>),
  ChevronUp: svgIcon(<path d="m18 15-6-6-6 6"/>),
  Dot: svgIcon(<circle cx="12" cy="12" r="2.5"/>),
};
// Auto-picks a sensible icon for a menu item purely from its label text, so
// every ActionsMenu/MoreMenu item gets a fitting icon without having to hand
// -wire one at each of the 10+ call sites across every module. An explicit
// `item.icon` (if a call site ever supplies one) always wins over this guess.
const iconForLabel = (label = "") => {
  const l = label.toLowerCase();
  if (l.includes("unpublish")) return Icon.EyeOff;
  if (l.includes("publish")) return Icon.UploadCloud;
  if (l.includes("edit") || l.includes("exit edit")) return Icon.Edit;
  if (l.includes("delete") || l.includes("remove")) return Icon.Trash;
  if (l.includes("history")) return Icon.Clock;
  if (l.includes("receipt")) return Icon.Receipt;
  if (l.includes("pdf")) return Icon.FileText;
  if (l.includes("report")) return Icon.Download;
  if (l.includes("contribution")) return Icon.Wallet;
  if (l.includes("transfer")) return Icon.ArrowLeftRight;
  if (l.includes("disable") || l.includes("enable")) return Icon.Power;
  if (l.includes("bed") || l.includes("room")) return Icon.Bed;
  if (l.includes("payment")) return Icon.CreditCard;
  if (l.includes("generate")) return Icon.RefreshCw;
  if (l.includes("back")) return Icon.ArrowLeft;
  if (l.includes("subject")) return Icon.Book;
  if (l.includes("class")) return Icon.Layers;
  if (l.includes("period")) return Icon.Calendar;
  if (l.includes("admit") || l.includes("add")) return Icon.UserPlus;
  return Icon.Dot;
};

// Compact "⋮ More" dropdown for secondary/destructive actions - keeps
// mobile/tablet toolbars from turning into a tall pile of stacked full-width
// buttons. `items` is [{ label, onClick, variant }] - variant "danger"
// colors the label red. Renders nothing (returns null) if items is empty.
const MoreMenu = ({ items, label=tr("lg.more") }) => {
  const [open, setOpen] = useState(false);
  if (!items || !items.length) return null;
  return (
    <div style={{position:"relative",display:"inline-block"}}>
      <button
        onClick={()=>setOpen(o=>!o)}
        style={{display:"flex",alignItems:"center",gap:6,border:"none",borderRadius:4,background:C.accent,color:"#fff",fontWeight:700,fontSize:13,padding:"8px 14px",cursor:"pointer",width:"100%",justifyContent:"center"}}>
        {label} <span style={{display:"inline-flex",color:"#fff",opacity:0.85}}>{open?<Icon.ChevronUp size={13}/>:<Icon.ChevronDown size={13}/>}</span>
      </button>
      {open && <>
        <div onClick={()=>setOpen(false)} style={{position:"fixed",inset:0,zIndex:40}}/>
        <div style={{position:"absolute",top:"calc(100% + 6px)",right:0,minWidth:210,background:C.surface,border:`1px solid ${C.border}`,borderRadius:4,boxShadow:"0 8px 24px rgba(15,23,42,0.14)",zIndex:41,overflow:"hidden"}}>
          {items.map((it,i)=>{
            const ItemIcon = it.icon || iconForLabel(it.label);
            const color = it.disabled?C.muted:(it.variant==="danger"?C.danger:C.text);
            return (
              <button key={i} onClick={()=>{setOpen(false);it.onClick();}} disabled={it.disabled}
                style={{display:"flex",alignItems:"center",gap:9,width:"100%",textAlign:"left",padding:"10px 14px",border:"none",background:"transparent",cursor:it.disabled?"not-allowed":"pointer",fontSize:13.5,fontWeight:600,color,opacity:it.disabled?0.5:1,borderBottom:i<items.length-1?`1px solid ${C.border}`:"none"}}>
                <ItemIcon size={15}/>
                <span>{it.label}</span>
              </button>
            );
          })}
        </div>
      </>}
    </div>
  );
};
// Drop your real school logo at frontend/public/logo.png and it will be used
// everywhere automatically - falls back to a professional initials badge until then.
const SchoolLogo = ({ size = 56 }) => {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div style={{width:size,height:size,background:C.accent,borderRadius:4,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",color:"#fff",fontWeight:800,fontSize:size*0.34,letterSpacing:"0.02em"}}>
        MSS
      </div>
    );
  }
  return <img src="/logo.png" alt={tr("lg.schoolLogoAlt")} onError={()=>setFailed(true)}
    style={{width:size,height:size,objectFit:"contain",borderRadius:4,margin:"0 auto 16px",display:"block"}}/>;
};

const SLabel = ({ children, style={} }) => <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8,...style}}>{children}</div>;

// Shows only the digits of an ID-style value on screen (e.g. "ENT-001" -> "001"),
// so official-looking numbers don't carry internal prefixes.
const digitsOnly = (v) => { if (!v) return "-"; const d = String(v).replace(/\D/g,""); return d || v; };

// Compact "⋮" actions menu - click to reveal a dropdown of all row actions instead
// of a row of separate buttons. Closes when clicking anywhere else on the page.
// The dropdown itself renders in a PORTAL (document.body), positioned with
// `fixed` coordinates measured from the button - NOT as a normal nested
// child. This matters because our tables scroll horizontally
// (overflow-x: auto), and per CSS that forces the vertical axis to clip
// too, so a normal absolutely-positioned dropdown for the LAST row (or any
// row near the bottom) would be invisibly cut off. A portal is never
// affected by any ancestor's overflow/clipping at all.
const ActionsMenu = ({ items }) => {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    const onDocClick = e => {
      if (btnRef.current && !btnRef.current.contains(e.target) && !e.target.closest("[data-actionsmenu-portal]")) setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDocClick);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const menuWidth = 170;
      // Estimated dropdown height (each item ~38px) - needed because the OLD
      // logic only clamped the top edge to the viewport, never accounting for
      // how tall the menu itself is. For a row near the bottom of the screen
      // (exactly what the LAST row is, once you've scrolled down to it), that
      // clamped `top` still left the menu's body extending far past
      // `window.innerHeight`, off-screen with no way to scroll to it - which
      // is why the last row's "⋮" menu looked completely invisible on
      // mobile/tablet. Now: if there isn't enough room below the button, the
      // menu opens UPWARD instead, and either way it's clamped to fully fit.
      const menuHeight = items.filter(Boolean).length * 38 + 8;
      const spaceBelow = window.innerHeight - r.bottom;
      const openUpward = spaceBelow < menuHeight + 10 && r.top > menuHeight + 10;
      setPos({
        top: openUpward
          ? Math.max(8, r.top - menuHeight - 4)
          : Math.min(r.bottom + 4, Math.max(8, window.innerHeight - menuHeight - 8)),
        left: Math.max(8, Math.min(r.right - menuWidth, window.innerWidth - menuWidth - 8)),
      });
    }
    setOpen(p => !p);
  };

  return (
    <div style={{ display: "inline-block" }}>
      <button ref={btnRef} onClick={toggle} aria-label={tr("lg.moreActions")} style={{display:"flex",alignItems:"center",justifyContent:"center",width:30,height:30,borderRadius:4,border:`1px solid ${C.border}`,background:C.bg,cursor:"pointer",color:C.muted}}>
        <Icon.MoreVertical size={16}/>
      </button>
      {open && createPortal(
        <div data-actionsmenu-portal style={{position:"fixed",top:pos.top,left:pos.left,zIndex:9600,background:C.surface,border:`1px solid ${C.border}`,borderRadius:4,boxShadow:"0 8px 24px rgba(0,0,0,0.12)",minWidth:190,overflow:"hidden"}}>
          {items.filter(Boolean).map((it,i)=>{
            const ItemIcon = it.icon || iconForLabel(it.label);
            return (
              <button key={i} onClick={()=>{setOpen(false);it.onClick();}} style={{display:"flex",alignItems:"center",gap:9,width:"100%",textAlign:"left",padding:"9px 14px",border:"none",background:"none",cursor:"pointer",fontSize:13,fontWeight:500,color:it.danger?C.danger:C.text}}>
                <ItemIcon size={15}/>
                <span>{it.label}</span>
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
};

// Full pale-tinted card instead of a thin colored edge: the whole card
// fills with a faded version of `color` (never fully saturated, so the
// label/value text stays easy to read), with a matching soft border. Uses
// color-mix() so it re-derives live from whatever `color` resolves to -
// including the --mk-xxx CSS variables - meaning it repaints correctly on
// every theme (System Default / Dark / Nocturne) with no extra logic here.
const StatCard = ({ label, value, sub, color=C.accentText }) => (
  <div style={{background:`color-mix(in srgb, ${color} 16%, ${C.surface})`,border: `1px solid ${C.border}`,borderRadius:4,padding:18}}>
    <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>{label}</div>
    <div style={{fontSize:26,fontWeight:800,color}}>{value}</div>
    {sub&&<div style={{fontSize:12,color:C.muted,marginTop:3}}>{sub}</div>}
  </div>
);

// NECTA-style cream/yellow-and-navy-blue palette - same colors the printed
// Parent Report and Results Management tables use (necta.go.tz look) - so
// any Tbl can opt into it via theme="necta" instead of the plain
// white/grey default, with a full visible grid on every cell (not just a
// bottom border) so the lines read clearly against the cream fill.
const NECTA_TEXT = "#0A1F5C";
const NECTA_BG = "#FFFEEA";
const NECTA_HEAD_BG = "#FCF3C0";
const NECTA_BORDER = "#7C93B8";
// Matches the light-blue page backdrop the backend paints behind the
// "MATOKEO YA JUMLA" results table and the Parent Report (NECTA_SUMMARY_BG
// in resultsController.js). The table itself stays cream/yellow (that's
// the deliberate "official report" look, kept as-is) - this just wraps
// each necta-themed section in the same blue panel those PDFs use, instead
// of sitting on plain white.
const NECTA_PANEL_BG = "#ADD8E6";

const Tbl = ({ columns, rows, emptyMsg=tr("lg.noRecords"), loading, theme }) => {
  const necta = theme === "necta";
  return (
  <div style={{overflowX:"auto", ...(necta ? {border:`1px solid ${NECTA_BORDER}`, borderRadius:4} : {})}}>
    {loading
      ? <div style={{padding:40,textAlign:"center",color:C.muted,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><SpinnerIcon size={16} />{tr("lg.loading")}</div>
      : <table style={{width:"100%",borderCollapse:"collapse",fontSize:14,...(necta?{background:NECTA_BG}:{})}}>
          <thead>
            <tr style={{background:necta?NECTA_HEAD_BG:C.bg}}>
              {columns.map(c=><th key={c.key} style={{padding:"9px 13px",textAlign:"left",fontSize:11,fontWeight:700,color:necta?NECTA_TEXT:C.muted,textTransform:"uppercase",letterSpacing:"0.05em",border:necta?`1px solid ${NECTA_BORDER}`:"none",borderBottom:`1px solid ${necta?NECTA_BORDER:C.border}`,whiteSpace:"nowrap"}}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length===0
              ? <tr><td colSpan={columns.length} style={{padding:28,textAlign:"center",color:necta?NECTA_TEXT:C.muted,...(necta?{border:`1px solid ${NECTA_BORDER}`}:{})}}>{emptyMsg}</td></tr>
              : rows.map((row,i)=>(
                  <tr key={row.id||i} style={{borderBottom:`1px solid ${necta?NECTA_BORDER:C.border}`,background:necta?(i%2===0?NECTA_HEAD_BG:NECTA_BG):"transparent"}}
                    onMouseEnter={e=>e.currentTarget.style.background=necta?NECTA_HEAD_BG:C.bg}
                    onMouseLeave={e=>e.currentTarget.style.background=necta?(i%2===0?NECTA_HEAD_BG:NECTA_BG):"transparent"}>
                    {columns.map(c=><td key={c.key} style={{padding:"10px 13px",color:necta?NECTA_TEXT:C.text,border:necta?`1px solid ${NECTA_BORDER}`:"none"}}>{c.render?c.render(row):row[c.key]}</td>)}
                  </tr>
                ))}
          </tbody>
        </table>}
  </div>
  );
};

const Modal = ({ title, onClose, children, wide }) => (
  <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9000,padding:16}}
    onClick={e=>e.target===e.currentTarget&&onClose()}>
    <div style={{background:C.surface,borderRadius:4,width:"100%",maxWidth:wide?760:580,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,.2)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"18px 24px",borderBottom:`1px solid ${C.border}`}}>
        <span style={{fontWeight:700,fontSize:16,color:C.text}}>{title}</span>
        <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:C.muted,lineHeight:1,display:"flex",alignItems:"center"}}><CloseIcon size={18}/></button>
      </div>
      <div style={{padding:24}}>{children}</div>
    </div>
  </div>
);

// In-app confirmation dialog - replaces the browser's native window.confirm()
// popup (which shows "localhost:3000 says…") with the system's own styled UI.
const ConfirmDialog = ({ message, confirmLabel=tr("common.yes"), cancelLabel=tr("common.no"), danger=true, onConfirm, onCancel }) => (
  <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9500,padding:16}}
    onClick={e=>e.target===e.currentTarget&&onCancel()}>
    <div style={{background:C.surface,borderRadius:4,width:"100%",maxWidth:400,boxShadow:"0 20px 60px rgba(0,0,0,.25)",padding:24}}>
      <p style={{fontSize:14,color:C.text,lineHeight:1.5,margin:"0 0 20px"}}>{message}</p>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
        <Btn variant="cancel" onClick={onCancel}>{cancelLabel}</Btn>
        <Btn variant={danger?"danger":"primary"} onClick={onConfirm}>{confirmLabel}</Btn>
      </div>
    </div>
  </div>
);

// Hook: gives components a drop-in replacement for window.confirm(). This
// renders the school's OWN "Una uhakika? YES/NO" modal (ConfirmDialog above)
// - never the browser's native confirm() popup. Usage:
//   const { confirm, ConfirmDialogPortal } = useConfirm();
//   confirm("Delete this?", () => actuallyDelete());
//   ...and render {ConfirmDialogPortal} once near the end of the component.
const useConfirm = () => {
  const [state, setState] = useState(null); // {message, onYes}
  const confirm = (message, onYes, opts={}) => setState({ message, onYes, ...opts });
  const ConfirmDialogPortal = state ? (
    <ConfirmDialog
      message={state.message}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      danger={state.danger !== false}
      onConfirm={()=>{ const fn = state.onYes; setState(null); fn(); }}
      onCancel={()=>setState(null)}
    />
  ) : null;
  return { confirm, ConfirmDialogPortal };
};

const Alert = ({ type="error", message, onClose }) => {
  if (!message) return null;
  const col = type==="success"
    ? {bg:C.successLight,text:C.success,border:C.success}
    : {bg:C.dangerLight,text:C.danger,border:C.danger};
  return (
    <div style={{background:col.bg,border:`1px solid ${col.border}40`,borderRadius:4,padding:"10px 16px",fontSize:13,color:col.text,fontWeight:600,display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
      <span>{message}</span>
      {onClose&&<button onClick={onClose} style={{background:"none",border:"none",color:col.text,cursor:"pointer",lineHeight:1,marginLeft:12,display:"flex",alignItems:"center"}}><CloseIcon size={15}/></button>}
    </div>
  );
};

// ─── STUDENT RESULT LOOKUP ("Search Results") ──────────────────────────────
// Used from Students Management (Admin/Second Master) via the student row's
// ⋮ menu - the student is already chosen, so this only asks which exam
// period to view. Form/Exam Type/Month/Year are cascading selects sourced
// ONLY from periods this particular student actually has a computed,
// "Included in Results" result for (never a blind guess at what exists).
function StudentResultLookupModal({ token, student, onClose }) {
  const { isMobile } = useBreakpoint();
  const [periods, setPeriods] = useState([]);
  const [loadingPeriods, setLoadingPeriods] = useState(true);
  const [sel, setSel] = useState({ form: "", exam_type: "", month: "", year: "" });
  const [result, setResult] = useState(null);
  const [loadingResult, setLoadingResult] = useState(false);
  const [busyPdf, setBusyPdf] = useState(false);
  const [err, setErr] = useState("");

  const fullName = [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(" ");

  useEffect(() => {
    apiFetch(`/results-mgmt/student-periods?student_id=${student.id}`, {}, token)
      .then((rows) => {
        setPeriods(rows || []);
        if (rows && rows.length) {
          const first = rows[0];
          setSel({ form: first.form, exam_type: first.exam_type, month: first.month, year: String(first.year) });
        }
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoadingPeriods(false));
  }, [student.id, token]);

  const forms = [...new Set(periods.map((p) => p.form))];
  const examTypes = [...new Set(periods.filter((p) => p.form === sel.form).map((p) => p.exam_type))];
  const months = [...new Set(periods.filter((p) => p.form === sel.form && p.exam_type === sel.exam_type).map((p) => p.month))];
  const years = [...new Set(periods.filter((p) => p.form === sel.form && p.exam_type === sel.exam_type && p.month === sel.month).map((p) => String(p.year)))];
  const matched = periods.find((p) => p.form === sel.form && p.exam_type === sel.exam_type && p.month === sel.month && String(p.year) === sel.year);

  const viewResult = async () => {
    if (!matched) return;
    setLoadingResult(true); setErr(""); setResult(null);
    try {
      const data = await apiFetch(`/results-mgmt/student-result?sheet_id=${matched.sheet_id}&student_id=${student.id}`, { silent: true }, token);
      setResult(data);
    } catch (e) { setErr(e.message); }
    finally { setLoadingResult(false); }
  };

  const pdfAction = async (mode) => {
    if (!matched) return;
    setBusyPdf(true); setErr("");
    try {
      const res = await fetch(`${API_BASE}/results-mgmt/student-result/export-pdf?sheet_id=${matched.sheet_id}&student_id=${student.id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error(tr("lg.couldNotResultPdf"));
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      if (mode === "print") {
        window.open(url, "_blank");
      } else {
        const a = document.createElement("a");
        a.href = url; a.download = `${digitsOnly(student.reg_no || student.id)}-${sel.exam_type}-result.pdf`.replace(/\s+/g, "-");
        document.body.appendChild(a); a.click(); a.remove();
      }
      setTimeout(() => window.URL.revokeObjectURL(url), 30000);
    } catch (e) { setErr(e.message); }
    finally { setBusyPdf(false); }
  };

  return (
    <Modal title={tr("lg.searchResultsFor", { name: fullName })} onClose={onClose} wide>
      {err && <Alert type="error" message={err} onClose={() => setErr("")} />}
      {loadingPeriods ? (
        <div style={{ padding: 24, textAlign: "center", color: C.muted }}>{tr("lg.loadingPeriods")}</div>
      ) : !periods.length ? (
        <p style={{ color: C.muted, fontSize: 14 }}>{tr("lg.noPublishedFor", { name: fullName })}</p>
      ) : (
        <>
          <div style={isMobile ? { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 } : { display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <Inp label={tr("lg.classForm")} value={sel.form} onChange={(v) => setSel({ form: v, exam_type: "", month: "", year: "" })} options={forms} />
            <Inp label={tr("lg.examType")} value={sel.exam_type} onChange={(v) => setSel((p) => ({ ...p, exam_type: v, month: "", year: "" }))} options={examTypes} />
            <Inp label={tr("lg.month")} value={sel.month} onChange={(v) => setSel((p) => ({ ...p, month: v, year: "" }))} options={months} />
            <Inp label={tr("lg.year")} value={sel.year} onChange={(v) => setSel((p) => ({ ...p, year: v }))} options={years} />
          </div>
          <Btn onClick={viewResult} disabled={!matched} loading={loadingResult} style={{ marginBottom: 18, display: "inline-flex", alignItems: "center", gap: 7 }}>
            <SearchIcon size={14} />{tr("lg.viewResults")}
          </Btn>

          {result && (
            <StudentResultCard result={result} isMobile={isMobile} busy={busyPdf}
              onPrint={() => pdfAction("print")} onExport={() => pdfAction("export")} />
          )}
        </>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
        <Btn variant="secondary" onClick={onClose}><span style={{ display: "flex", alignItems: "center", gap: 6 }}><CloseIcon size={13} />{tr("common.close")}</span></Btn>
      </div>
    </Modal>
  );
}

// One student's compiled report - subjects table plus GPA/Division/Position
// summary - shared visual output for the lookup modal above, printed via
// the browser's own PDF viewer (Print) or saved to disk (Export PDF).
// Same NECTA-style blue page / cream-yellow table look as the PDF export
// (drawn by renderStudentResultPdfBuffer in resultsController.js), so the
// on-screen preview matches what gets printed or downloaded.
function StudentResultCard({ result, isMobile, onPrint, onExport, busy }) {
  const { sheet, student } = result;
  return (
    <div style={{ border: `1px solid ${NECTA_BORDER}`, borderRadius: 4, padding: isMobile ? 14 : 18, background: NECTA_PANEL_BG }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: NECTA_TEXT }}>{student.full_name}</div>
          <div style={{ fontSize: 12, color: NECTA_TEXT }}>{sheet.form} · {sheet.exam_type} · {sheet.month} {sheet.year} · {tr("lg.regNoLabel")} {student.reg_no || student.entry_no || "-"}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn variant="secondary" size="sm" loading={busy} onClick={onPrint}><span style={{ display: "flex", alignItems: "center", gap: 6 }}><PrinterIcon size={13} />{tr("lg.print")}</span></Btn>
          <Btn variant="secondary" size="sm" loading={busy} onClick={onExport}><span style={{ display: "flex", alignItems: "center", gap: 6 }}><DownloadIcon size={13} />{tr("lg.exportPdf")}</span></Btn>
        </div>
      </div>
      <div style={{ overflowX: "auto", border: `1px solid ${NECTA_BORDER}`, borderRadius: 4 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13, background: NECTA_BG }}>
          <thead>
            <tr style={{ background: NECTA_HEAD_BG }}>
              <th style={thS}>{tr("lg.subject")}</th><th style={thS}>{tr("lg.marks")}</th><th style={thS}>{tr("lg.grade")}</th>
            </tr>
          </thead>
          <tbody>
            {student.scores.map((s, i) => (
              <tr key={s.subject_code} style={{ background: i % 2 === 0 ? NECTA_HEAD_BG : NECTA_BG }}>
                <td style={tdS}>{s.subject_name}</td><td style={tdS}>{s.marks ?? "-"}</td><td style={tdS}>{s.grade || "-"}</td>
              </tr>
            ))}
            {!student.scores.length && <tr><td style={tdS} colSpan={3}>{tr("lg.noSubjectScores")}</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 16 }}>
        <SummaryStat label={tr("lg.division")} value={student.division ?? "-"} />
        <SummaryStat label={tr("lg.points")} value={student.points ?? "-"} />
        <SummaryStat label={tr("lg.position")} value={student.position != null && student.total_students != null ? tr("lg.outOf", { pos: student.position, total: student.total_students }) : (student.position ?? "-")} />
        <SummaryStat label={tr("lg.avgGrade")} value={student.avg_grade ?? "-"} />
        <SummaryStat label="GPA" value={student.gpa ?? "-"} />
        <SummaryStat label={tr("lg.subjectsSat")} value={student.subjects_sat ?? "-"} />
      </div>
    </div>
  );
}
const thS = { padding: "7px 10px", textAlign: "left", fontWeight: 700, fontSize: 11.5, color: NECTA_TEXT, border: `1px solid ${NECTA_BORDER}` };
const tdS = { padding: "6px 10px", border: `1px solid ${NECTA_BORDER}`, color: NECTA_TEXT };
const SummaryStat = ({ label, value }) => (
  <div style={{ background: NECTA_BG, border: `1px solid ${NECTA_BORDER}`, borderRadius: 4, padding: "8px 12px" }}>
    <div style={{ fontSize: 10.5, fontWeight: 700, color: NECTA_TEXT, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
    <div style={{ fontSize: 16, fontWeight: 800, color: NECTA_TEXT }}>{value}</div>
  </div>
);

// ─── STUDENTS MODULE ──────────────────────────────────────────────────────────
function StudentModule({ token, role, extraMoreItems=[] }) {
  useLang();
  const { confirm, ConfirmDialogPortal } = useConfirm();
  const { isMobile, isTablet } = useBreakpoint();
  const [students, setStudents] = useState([]);
  const [stats, setStats]       = useState({ total:0, by_gender:[], by_status:[] });
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [filterForm, setFilterForm]     = useState("");
  const [filterGender, setFilterGender] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [modal, setModal]           = useState(null);
  const [chargeModal, setChargeModal] = useState(null);
  const [chargeModalLoading, setChargeModalLoading] = useState(false);
  const [historyModal, setHistoryModal] = useState(null); // student row
  const [history, setHistory]       = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [form, setForm]             = useState({});
  const [photoFile, setPhotoFile]     = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [chargeForm, setChargeForm] = useState({ charge_type:"", amount:"", note:"", reamBrought:false });
  const [saving, setSaving] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [error, setError]   = useState("");
  const [success, setSuccess] = useState("");
  const [transferModal, setTransferModal] = useState(null); // student row being marked transferred out
  const [loginNoStudent, setLoginNoStudent] = useState(null); // student whose Results login number is shown
  const [premStudent, setPremStudent] = useState(null); // student whose PREM number is being typed in (⋮ menu)
  const [premValue, setPremValue] = useState("");
  const [premBusy, setPremBusy] = useState(false);
  const [premError, setPremError] = useState("");
  const [loginNoCopied, setLoginNoCopied] = useState(false);
  const [transferForm, setTransferForm] = useState({ dest_region:"", dest_district:"", dest_school:"", transfer_out_date:new Date().toISOString().slice(0,10) });
  const [reportModal, setReportModal] = useState(null); // student row for Admin bulk download
  const [reportInclude, setReportInclude] = useState({ hostel:false, contributions:false, results:false });
  const [reportResultPeriods, setReportResultPeriods] = useState([]); // exam periods this student has a result for
  const [loadingReportResultPeriods, setLoadingReportResultPeriods] = useState(false);
  const [reportResultsSheetId, setReportResultsSheetId] = useState("");
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [resultsModalStudent, setResultsModalStudent] = useState(null); // student row for "Search Results"

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterForm)   params.set("form", filterForm);
      if (filterGender) params.set("gender", filterGender);
      if (filterStatus) params.set("status", filterStatus);
      if (search)       params.set("search", search);
      const [sRes, stRes] = await Promise.all([
        apiFetch(`/students?${params}`, {}, token),
        apiFetch("/students/stats", {}, token),
      ]);
      setStudents(sRes.data);
      setStats(stRes.data);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [token, filterForm, filterGender, filterStatus, search]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    const seq = (stats.total||0) + 1;
    const yr  = new Date().getFullYear();
    setForm({
      form:"Form I", gender:"Female", status:"Active",
      admission_date: new Date().toISOString().slice(0,10),
      entry_no: `${yr}${String(seq).padStart(3,"0")}`,
    });
    setModal("add");
  };

  const save = async () => {
    if (!form.first_name||!form.last_name||!form.form) {
      setError(tr("lg.nameFormRequired"));
      return;
    }
    // NOTE: entry_no used to be required here (backend once enforced a
    // NOT NULL/UNIQUE constraint on it). That constraint was dropped in the
    // database migration - entry_no is now fully retired and nullable. The
    // old guard below blocked EVERY edit of an existing student, because
    // students loaded from the backend never carry an entry_no value
    // anymore, so `form.entry_no` was always falsy once you clicked Edit.
    setSaving(true); setError("");
    try {
      const { photoFile, photoPreview, ...cleanForm } = form;
      let studentId = form.id;
      if (modal==="add") {
        const res = await apiFetch("/students", { method:"POST", body:cleanForm }, token);
        studentId = res.data.id;
        setSuccess(tr("lg.enrolledOk", { login: res.data.results_login_no || "-" }));
      } else {
        await apiFetch(`/students/${form.id}`, { method:"PUT", body:cleanForm }, token);
        setSuccess(tr("lg.studentUpdated"));
      }
      if (photoFile && studentId) {
        const fd = new FormData();
        fd.append("photo", photoFile);
        const photoRes = await fetch(`${API_BASE}/students/${studentId}/photo`, {
          method: "POST",
          headers: token ? { Authorization:`Bearer ${token}` } : {},
          body: fd,
        });
        if (!photoRes.ok) { const j = await photoRes.json().catch(()=>({})); setError(j.message || tr("lg.photoUploadFail")); }
      }
      setModal(null); load();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  // Removes a photo that's already saved on the server (form.photo_url), as
  // opposed to one just picked locally and not uploaded yet (photoFile/
  // photoPreview), which the "Remove Photo" button can discard without a
  // server call. This is what makes "Remove Photo" actually work for a
  // student who was registered earlier with a photo already on file.
  const removeSavedPhoto = () => {
    confirm(tr("lg.deletePhotoConfirm"), async () => {
      try {
        await apiFetch(`/students/${form.id}/photo`, { method:"DELETE" }, token);
        setForm(p => ({ ...p, photo_url:null }));
        setSuccess(tr("lg.photoDeleted"));
        load();
      } catch (err) { setError(err.message); }
    });
  };

  const remove = (id) => {
    confirm(tr("lg.removeStudentConfirm"), async () => {
      try {
        await apiFetch(`/students/${id}`, { method:"DELETE" }, token);
        setSuccess(tr("lg.studentRemoved")); load();
      } catch (err) { setError(err.message); }
    });
  };

  const submitCharge = async () => {
    setSaving(true);
    try {
      const isItem = chargeForm.charge_type === "Ream";
      const created = await apiFetch(`/students/${chargeModal.id}/charges`, { method:"POST", body:{...chargeForm, amount: isItem ? 0 : chargeForm.amount} }, token);
      if (isItem) {
        // Ream is submitted already "brought" - lock it immediately, no separate step.
        await apiFetch(`/students/${chargeModal.id}/charges/${created.data.id}/pay`, { method:"PATCH" }, token);
      }
      const res = await apiFetch(`/students/${chargeModal.id}`, {}, token);
      setChargeModal(res.data);
      setChargeForm({ charge_type:"", amount:"", note:"", reamBrought:false });
      setSuccess(tr("lg.chargeAdded"));
      load();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const addCharge = () => {
    const isItem = chargeForm.charge_type === "Ream";
    if (!chargeForm.charge_type || (!isItem && !chargeForm.amount)) { setError(tr("lg.typeAmountRequired")); return; }
    if (isItem && !chargeForm.reamBrought) { setError(tr("lg.tickReam")); return; }
    if (isItem) {
      confirm(tr("lg.reamConfirm"), submitCharge);
    } else {
      submitCharge();
    }
  };

  const markPaid = async (studentId, chargeId) => {
    try {
      await apiFetch(`/students/${studentId}/charges/${chargeId}/pay`, { method:"PATCH" }, token);
      const res = await apiFetch(`/students/${studentId}`, {}, token);
      setChargeModal(res.data);
    } catch (err) { setError(err.message); }
  };

  const openHistory = async (student) => {
    setHistoryModal(student); setHistory([]); setHistoryLoading(true);
    try {
      const res = await apiFetch(`/students/${student.id}/history`, {}, token);
      setHistory(res.data);
    } catch (err) { setError(err.message); }
    finally { setHistoryLoading(false); }
  };

  // Opens the Contributions modal. IMPORTANT: the row object `r` passed in
  // from the table only carries the LIST columns (name, form, status,
  // etc.) - never charges/food_contributions/hostel_fee_contributions,
  // which only come back from the full single-student detail endpoint
  // (those three arrays are expensive aggregated JOINs, deliberately left
  // out of the list query for every-row performance). Opening the modal
  // straight off the list row (as this used to do) meant `charges`,
  // `food_contributions` and `hostel_fee_contributions` were always
  // `undefined` -> always fell back to `[]` in the render below -> the
  // modal ALWAYS showed "no contributions" / "TZS 0" / "no hostel fee
  // recorded", regardless of what was actually paid. Fetching the real
  // detail record here (same as History already correctly does above) is
  // the fix - the list row still opens the modal immediately so there's no
  // blank flash while the fetch is in flight.
  const openChargeModal = async (student) => {
    setChargeModal(student); setChargeModalLoading(true); setError("");
    try {
      const res = await apiFetch(`/students/${student.id}`, {}, token);
      setChargeModal(res.data);
    } catch (err) { setError(err.message); }
    finally { setChargeModalLoading(false); }
  };

  // Downloads a PDF from the API using the auth token (can't use a plain <a href>).
  const downloadPdf = async (path, filename) => {
    setExportingPdf(true);
    try {
      const res = await fetch(`${API_BASE}${path}`, { headers: token ? { Authorization:`Bearer ${token}` } : {} });
      if (!res.ok) throw new Error(tr("lg.couldNotPdf"));
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) { setError(err.message); }
    finally { setExportingPdf(false); }
  };

  const exportListPdf = () => {
    const params = new URLSearchParams();
    if (filterForm)   params.set("form", filterForm);
    if (filterGender) params.set("gender", filterGender);
    if (filterStatus) params.set("status", filterStatus);
    if (search)       params.set("search", search);
    downloadPdf(`/students/pdf?${params}`, "students-list.pdf");
  };

  const [cleaningGraduates, setCleaningGraduates] = useState(false);
  // Manual trigger for the same rule the nightly job applies automatically
  // (Graduated 2+ years ago) - lets Admin/Second Master see exactly how many
  // records were removed right now, instead of only relying on the scheduled
  // cleanup in the backend.
  const deleteOldGraduates = () => {
    confirm(
      tr("lg.removeOldGradsConfirm"),
      async () => {
        setCleaningGraduates(true); setError("");
        try {
          const res = await apiFetch("/students/graduated/cleanup", { method:"DELETE" }, token);
          setSuccess(res.message || tr("lg.oldGradsRemoved"));
          load();
        } catch (err) { setError(err.message); }
        finally { setCleaningGraduates(false); }
      },
      { confirmLabel:tr("lg.yesRemove"), cancelLabel:tr("common.cancel") }
    );
  };

  const total       = stats.total || 0;
  const graduated   = stats.graduated || 0;
  const transferred = stats.transferred || 0;
  const male   = stats.by_gender?.find(g=>g.gender==="Male")?.count   || 0;
  const female = stats.by_gender?.find(g=>g.gender==="Female")?.count || 0;
  const active = stats.by_status?.find(s=>s.status==="Active")?.count || 0;

  const TH = {padding:"9px 13px",textAlign:"left",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.05em",borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"};
  // Enrollment-form field groups collapse to 1 column on mobile, 2 on tablet,
  // and their original column count on desktop - so form fields stay readable
  // and tappable instead of squeezed into 3 tiny columns on a phone.
  const gridCols = (desktopCols, gap=12, marginBottom=18) => ({
    display:"grid",
    gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr 1fr" : `repeat(${desktopCols},1fr)`,
    gap, marginBottom,
  });

  return (
    <div style={{display:"flex",flexDirection:"column",gap:20,padding:isMobile?"16px 12px":isTablet?"24px 20px":32,boxSizing:"border-box",width:"100%"}}>
      <div style={{display:"flex",flexDirection:isMobile?"column":"row",justifyContent:"space-between",alignItems:isMobile?"stretch":"flex-start",flexWrap:"wrap",gap:12}}>
        <div>
          <h2 style={{margin:0,fontSize:isMobile?18:22,fontWeight:800,color:C.text}}>{tr("lg.studentMgmt")}</h2>
          <p style={{margin:"4px 0 0",color:C.muted,fontSize:isMobile?12.5:14}}>{tr("lg.formIiv")} · {SCHOOL.line3}</p>
        </div>
        {(isMobile || isTablet) ? (
          <div style={{display:"flex",gap:8,width:isMobile?"100%":"auto"}}>
            <Btn onClick={openAdd} style={isMobile?{flex:1,justifyContent:"center"}:{}}><span style={{display:"flex",alignItems:"center",gap:6}}><Icon.UserPlus size={14}/>{tr("lg.enrollStudent")}</span></Btn>
            <MoreMenu label={tr("lg.more")} items={[
              { label:tr("lg.importCsv"), icon:Icon.UploadCloud, onClick:()=>setImportOpen(true) },
              { label:tr("lg.promoteStudents"), onClick:()=>setPromoteOpen(true) },
              ...extraMoreItems,
            ]}/>
          </div>
        ) : (
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <Btn variant="secondary" onClick={()=>setPromoteOpen(true)}><span style={{display:"flex",alignItems:"center",gap:6}}><ArrowUpCircleIcon size={14}/>{tr("lg.promoteStudents")}</span></Btn>
            <Btn variant="secondary" onClick={()=>setImportOpen(true)}><span style={{display:"flex",alignItems:"center",gap:6}}><Icon.UploadCloud size={14}/>{tr("lg.importCsv")}</span></Btn>
            {extraMoreItems.map((it,i)=>(
              <Btn key={i} variant="secondary" onClick={it.onClick}><span style={{display:"flex",alignItems:"center",gap:6}}>{it.icon && <it.icon size={14}/>}{it.label}</span></Btn>
            ))}
            <Btn onClick={openAdd}><span style={{display:"flex",alignItems:"center",gap:6}}><Icon.UserPlus size={14}/>{tr("lg.enrollStudent")}</span></Btn>
          </div>
        )}
      </div>

      {error   && <Alert type="error"   message={error}   onClose={()=>setError("")}/>}
      {success && <Alert type="success" message={success} onClose={()=>setSuccess("")}/>}

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:14}}>
        <StatCard label={tr("lg.totalEnrolled")} value={total}  color={C.accentText}/>
        <StatCard label={tr("lg.active")} value={active} color={C.success}/>
        {/* Male/Female cards in the neutral text colour (no blue/purple), per school request. */}
        <StatCard label={tr("lg.male")} value={male}   color={C.text}/>
        <StatCard label={tr("lg.female")} value={female} color={C.text}/>
        <div onClick={()=>setFilterForm("GRADUATED")} style={{cursor:"pointer"}} title={tr("lg.viewGraduated")}>
          <StatCard label={tr("lg.graduated")} value={graduated} color="#6366F1"/>
        </div>
        <div onClick={()=>setFilterForm("TRANSFERRED")} style={{cursor:"pointer"}} title={tr("lg.viewTransferred")}>
          <StatCard label={tr("lg.transferred")} value={transferred} color="#F59E0B"/>
        </div>
      </div>

      <Card>
        <div style={isMobile
          ? {display:"grid",gridTemplateColumns:"1fr",gap:10,marginBottom:16}
          : isTablet
            ? {display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}
            : {display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={tr("lg.searchStudents")} style={{...IS,maxWidth:isMobile||isTablet?"none":300, gridColumn:isTablet?"1 / -1":"auto"}}/>
          <select value={filterForm}   onChange={e=>setFilterForm(e.target.value)}   style={{...IS,width:isMobile||isTablet?"100%":140}}><option value="">{tr("lg.allForms")}</option>{FORMS.map(f=><option key={f}>{f}</option>)}<option value="GRADUATED">{tr("lg.graduated")}</option><option value="TRANSFERRED">{tr("lg.transferred")}</option></select>
          <select value={filterGender} onChange={e=>setFilterGender(e.target.value)} style={{...IS,width:isMobile||isTablet?"100%":130}}><option value="">{tr("lg.allGenders")}</option><option value="Male">{tr("lg.male")}</option><option value="Female">{tr("lg.female")}</option></select>
          <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{...IS,width:isMobile||isTablet?"100%":140}}><option value="">{tr("lg.allStatuses")}</option><option value="Active">{tr("lg.active")}</option><option value="Inactive">{tr("lg.inactive")}</option><option value="Transferred">{tr("lg.transferred")}</option><option value="Graduated">{tr("lg.graduated")}</option></select>
          <Btn variant="secondary" size="sm" onClick={load} style={isMobile||isTablet?{width:"100%",justifyContent:"center"}:{}}><span style={{display:"flex",alignItems:"center",gap:6}}><Icon.RefreshCw size={13}/>{tr("lg.refresh")}</span></Btn>
          <Btn variant="secondary" size="sm" onClick={exportListPdf} loading={exportingPdf} style={isMobile||isTablet?{width:"100%",justifyContent:"center"}:{}}><span style={{display:"flex",alignItems:"center",gap:6}}><DownloadIcon size={13}/>{tr("lg.exportPdf")}</span></Btn>
        </div>
        {filterForm==="GRADUATED" && (role==="admin"||role==="second_master") && (
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:14}}>
            <Btn variant="danger" size="sm" loading={cleaningGraduates} onClick={deleteOldGraduates} style={{display:"inline-flex",alignItems:"center",gap:6,...(isMobile?{width:"100%",justifyContent:"center"}:{})}}>
              <Icon.Trash size={13}/>{tr("lg.removeOldGrads")}
            </Btn>
          </div>
        )}
        <Tbl loading={loading} rows={students} columns={[
          {key:"photo", label:"", render:r=>(
            <div style={{width:34,height:34,borderRadius:"50%",overflow:"hidden",background:C.bg,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center"}}>
              {r.photo_url ? <img src={photoSrc(r.photo_url)} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : <span style={{fontSize:12,fontWeight:700,color:C.muted}}>{(r.first_name?.[0]||"").toUpperCase()}</span>}
            </div>
          )},
          {key:"reg_no",    label:tr("lg.regNoCol"), render:r=>r.reg_no||<span style={{color:C.muted}}>-</span>},
          {key:"name",      label:tr("lg.fullName"), render:r=>[r.first_name,r.middle_name,r.last_name].filter(Boolean).join(" ")},
          filterForm==="GRADUATED"
            ? {key:"graduated_year", label:tr("lg.gradYear"), render:r=>r.graduated_at ? <Badge color="indigo">{new Date(r.graduated_at).getFullYear()}</Badge> : <span style={{color:C.muted}}>-</span>}
            : filterForm==="TRANSFERRED"
              ? {key:"transferred_to", label:tr("lg.transferredTo"), render:r=>r.dest_school ? <span>{r.dest_school}{r.dest_district?`, ${r.dest_district}`:""}{r.dest_region?`, ${r.dest_region}`:""}</span> : <span style={{color:C.muted}}>-</span>}
              : {key:"form", label:tr("lg.form")},
          {key:"gender",    label:tr("lg.gender"), render:r=>r.gender||"-"},
          {key:"registered_by", label:tr("lg.registeredBy"), render:r=>r.registered_by||<span style={{color:C.muted}}>-</span>},
          filterForm==="GRADUATED"
            ? {key:"graduated_at", label:tr("lg.gradOn"), render:r=>r.graduated_at?.slice(0,10)||"-"}
            : filterForm==="TRANSFERRED"
              ? {key:"transfer_out_date", label:tr("lg.transferredOn"), render:r=>r.transfer_out_date?.slice(0,10)||"-"}
              : {key:"admission_date", label:tr("lg.admissionDate"), render:r=>r.admission_date?.slice(0,10)||"-"},
          {key:"parent_name", label:tr("lg.parent")},
          {key:"parent_phone",label:tr("lg.phone")},
          {key:"status",    label:tr("lg.status"), render:r=><Badge color={r.status==="Active"?"green":r.status==="Graduated"?"indigo":r.status==="Transferred"?"amber":"red"}>{r.status}</Badge>},
          {key:"actions",   label:"", render:r=>(
            <ActionsMenu items={[
              { label:tr("lg.edit"),     onClick:()=>{setForm({...r,dob:r.dob?.slice(0,10),admission_date:r.admission_date?.slice(0,10),_region:findRegionForDistrict(r.district)});setModal(r);} },
              { label:tr("lg.loginNo"), onClick:()=>{setLoginNoCopied(false);setLoginNoStudent(r);} },
              { label:tr("lg.premNo"), onClick:()=>{setPremError("");setPremValue(r.prem_no||"");setPremStudent(r);} },
              { label:tr("lg.contributions"), onClick:()=>openChargeModal(r) },
              ...(r.status!=="Transferred" ? [{ label:tr("lg.markTransferred"), onClick:()=>{setTransferForm({dest_region:"",dest_district:"",dest_school:"",transfer_out_date:new Date().toISOString().slice(0,10)});setTransferModal(r);} }] : []),
              { label:tr("lg.searchResults"), icon:SearchIcon, onClick:()=>setResultsModalStudent(r) },
              ...(role==="admin" ? [{ label:tr("lg.downloadReport"), onClick:()=>{setReportInclude({hostel:false,contributions:false,results:false});setReportResultPeriods([]);setReportResultsSheetId("");setReportModal(r);} }] : []),
              { label:tr("lg.remove"),   onClick:()=>remove(r.id), danger:true },
            ]}/>
          )},
        ]}/>
      </Card>

      {loginNoStudent && (
        <Modal title={tr("lg.loginNoResults")} onClose={()=>setLoginNoStudent(null)}>
          <div style={{fontSize:13,color:C.muted,marginBottom:4}}>{[loginNoStudent.first_name,loginNoStudent.middle_name,loginNoStudent.last_name].filter(Boolean).join(" ")} · {loginNoStudent.form}</div>
          <div style={{fontFamily:"monospace",fontSize:30,fontWeight:800,letterSpacing:"0.04em",color:C.text,margin:"10px 0 14px"}}>{loginNoStudent.results_login_no || "-"}</div>
          <p style={{fontSize:12.5,color:C.muted,margin:"0 0 16px",lineHeight:1.6}}>
            {tr("lg.parentLoginInfo")}{loginNoStudent.parent_phone ? <> (<b>{loginNoStudent.parent_phone}</b>)</> : ""}.
          </p>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            {loginNoStudent.results_login_no && (
              <Btn variant="secondary" onClick={()=>{ try { navigator.clipboard.writeText(loginNoStudent.results_login_no); setLoginNoCopied(true); } catch { /* clipboard blocked */ } }}>{loginNoCopied ? tr("lg.copied") : tr("lg.copy")}</Btn>
            )}
            <Btn onClick={()=>setLoginNoStudent(null)}>{tr("common.close")}</Btn>
          </div>
        </Modal>
      )}

      {premStudent && (
        <Modal title={tr("lg.premNo")} onClose={()=>setPremStudent(null)}>
          <div style={{fontSize:13,color:C.muted,marginBottom:10}}>{[premStudent.first_name,premStudent.middle_name,premStudent.last_name].filter(Boolean).join(" ")} · {premStudent.form}</div>
          <Inp label={tr("lg.premNumber")} value={premValue} onChange={v=>setPremValue(v)} placeholder={tr("lg.premPlaceholder")}/>
          {premError && <div style={{color:C.danger,fontSize:13,marginTop:8}}>{premError}</div>}
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:16}}>
            <Btn variant="secondary" onClick={()=>setPremStudent(null)}>{tr("common.cancel")}</Btn>
            <Btn disabled={premBusy} onClick={async()=>{
              setPremBusy(true); setPremError("");
              try{
                const r = await fetch(`${API_BASE}/students/${premStudent.id}/prem-no`,{method:"PATCH",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({prem_no:premValue})});
                const d = await r.json();
                if(!d.success) throw new Error(d.message);
                setPremStudent(null); setSuccess(d.message); load();
              }catch(e){ setPremError(e.message||tr("lg.premSaveFail")); }
              finally{ setPremBusy(false); }
            }}>{premBusy?tr("lg.savingDots"):tr("common.save")}</Btn>
          </div>
        </Modal>
      )}

      {transferModal && (
        <Modal title={tr("lg.markTransferredTitle", { name: `${transferModal.first_name} ${transferModal.last_name}` })} onClose={()=>setTransferModal(null)}>
          {error && <div style={{color:C.danger,fontSize:13,marginBottom:10}}>{error}</div>}
          <div style={gridCols(2,12,16)}>
            <Inp label={tr("lg.region")}      value={transferForm.dest_region}   onChange={v=>setTransferForm(p=>({...p,dest_region:v}))}/>
            <Inp label={tr("lg.district")}    value={transferForm.dest_district} onChange={v=>setTransferForm(p=>({...p,dest_district:v}))}/>
            <Inp label={tr("lg.school")}      value={transferForm.dest_school}   onChange={v=>setTransferForm(p=>({...p,dest_school:v}))}/>
            <Inp label={tr("lg.transferDate")} type="date" value={transferForm.transfer_out_date} onChange={v=>setTransferForm(p=>({...p,transfer_out_date:v}))}/>
          </div>
          <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
            <Btn variant="ghost" onClick={()=>setTransferModal(null)}><span style={{display:"flex",alignItems:"center",gap:6}}><CloseIcon size={13}/>{tr("common.cancel")}</span></Btn>
            <Btn onClick={()=>{
              if(!transferForm.dest_region||!transferForm.dest_district||!transferForm.dest_school||!transferForm.transfer_out_date){
                setError(tr("lg.transferFieldsRequired")); return;
              }
              confirm(tr("lg.transferConfirm", { name: `${transferModal.first_name} ${transferModal.last_name}`, school: transferForm.dest_school }), async ()=>{
                try{
                  const r = await fetch(`${API_BASE}/students/${transferModal.id}/transfer-out`,{method:"PATCH",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify(transferForm)});
                  const d = await r.json();
                  if(!d.success) throw new Error(d.message);
                  setTransferModal(null); setError(""); load();
                }catch(e){ setError(e.message||tr("lg.transferFail")); }
              });
            }}>{tr("lg.confirmTransfer")}</Btn>
          </div>
        </Modal>
      )}

      {reportModal && (
        <Modal title={tr("lg.downloadReportTitle", { name: `${reportModal.first_name} ${reportModal.last_name}` })} onClose={()=>setReportModal(null)}>
          <div style={{fontSize:13,color:C.muted,marginBottom:12}}>{tr("lg.reportIntro")}</div>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
            <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13}}>
              <input type="checkbox" checked={reportInclude.hostel} onChange={e=>setReportInclude(p=>({...p,hostel:e.target.checked}))}/>
              {tr("lg.reportHostel")}
            </label>
            <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13}}>
              <input type="checkbox" checked={reportInclude.contributions} onChange={e=>setReportInclude(p=>({...p,contributions:e.target.checked}))}/>
              {tr("lg.reportContributions")}
            </label>
            <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13}}>
              <input type="checkbox" checked={reportInclude.results} onChange={async e=>{
                const checked = e.target.checked;
                setReportInclude(p=>({...p,results:checked}));
                if (checked && !reportResultPeriods.length && !loadingReportResultPeriods) {
                  setLoadingReportResultPeriods(true);
                  try {
                    const rows = await apiFetch(`/results-mgmt/student-periods?student_id=${reportModal.id}`, {}, token);
                    setReportResultPeriods(rows || []);
                    if (rows && rows.length) setReportResultsSheetId(String(rows[0].sheet_id));
                  } catch (err) { setError(err.message); }
                  finally { setLoadingReportResultPeriods(false); }
                }
              }}/>
              {tr("lg.reportResults")}
            </label>
            {reportInclude.results && (
              <div style={{marginLeft:26}}>
                {loadingReportResultPeriods ? (
                  <div style={{fontSize:12.5,color:C.muted}}>{tr("lg.loadingExamPeriods")}</div>
                ) : reportResultPeriods.length ? (
                  <select value={reportResultsSheetId} onChange={e=>setReportResultsSheetId(e.target.value)} style={{...IS,width:"100%"}}>
                    {reportResultPeriods.map(p=>(
                      <option key={p.sheet_id} value={p.sheet_id}>{p.exam_type} - {p.month} {p.year} ({p.form})</option>
                    ))}
                  </select>
                ) : (
                  <div style={{fontSize:12.5,color:C.muted}}>{tr("lg.noExamResults")}</div>
                )}
              </div>
            )}
          </div>
          <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
            <Btn variant="ghost" onClick={()=>setReportModal(null)}><span style={{display:"flex",alignItems:"center",gap:6}}><CloseIcon size={13}/>{tr("common.cancel")}</span></Btn>
            <Btn onClick={async()=>{
              if (reportInclude.results && !reportResultsSheetId) { setError(tr("lg.chooseExamResults")); return; }
              const include = Object.entries(reportInclude).filter(([,v])=>v).map(([k])=>k).join(",");
              const sheetParam = (reportInclude.results && reportResultsSheetId) ? `&results_sheet_id=${reportResultsSheetId}` : "";
              await downloadPdf(`/students/${reportModal.id}/report?include=${include}${sheetParam}&lang=${getLang()}`, `${digitsOnly(reportModal.reg_no || reportModal.id)}-report.pdf`);
              setReportModal(null);
            }}>{tr("lg.downloadPdf")}</Btn>
          </div>
        </Modal>
      )}

      {modal && (
        <Modal wide title={modal==="add"?tr("lg.enrollNewStudent"):tr("lg.editName", { name: `${form.first_name} ${form.last_name}` })} onClose={()=>{setModal(null);setError("");}}>
          {error && <Alert type="error" message={error} onClose={()=>setError("")}/>}

          <SLabel>{tr("lg.photoOptional")}</SLabel>
          <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:6}}>
            <div style={{width:76,height:92,borderRadius:4,overflow:"hidden",background:C.bg,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              {form.photoPreview
                ? <img src={form.photoPreview} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                : form.photo_url
                  ? <img src={photoSrc(form.photo_url)} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                  : <PassportPlaceholderIcon/>}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              <input type="file" accept="image/*" capture="environment" id="studentPhotoCameraInput" style={{display:"none"}}
                onChange={e=>handlePhotoFile(e, setForm)}/>
              <input type="file" accept="image/*" id="studentPhotoFileInput" style={{display:"none"}}
                onChange={e=>handlePhotoFile(e, setForm)}/>
              <div style={{display:"flex",gap:6}}>
                <Btn size="sm" variant="secondary" disabled={form.photoProcessing} onClick={()=>document.getElementById("studentPhotoCameraInput").click()}><span style={{display:"flex",alignItems:"center",gap:6}}><CameraIcon size={13}/>{tr("lg.takePhoto")}</span></Btn>
                <Btn size="sm" variant="secondary" disabled={form.photoProcessing} onClick={()=>document.getElementById("studentPhotoFileInput").click()}><span style={{display:"flex",alignItems:"center",gap:6}}><Icon.FileText size={13}/>{tr("lg.chooseFile")}</span></Btn>
              </div>
              {(form.photoFile||form.photoPreview) && !form.photoProcessing && <Btn size="sm" variant="ghost" onClick={()=>setForm(p=>({...p,photoFile:null,photoPreview:null}))}><span style={{display:"flex",alignItems:"center",gap:6}}><Icon.Trash size={13}/>{tr("lg.removePhoto")}</span></Btn>}
              {!(form.photoFile||form.photoPreview) && form.photo_url && !form.photoProcessing && <Btn size="sm" variant="ghost" onClick={removeSavedPhoto}><span style={{display:"flex",alignItems:"center",gap:6}}><Icon.Trash size={13}/>{tr("lg.removePhoto")}</span></Btn>}
            </div>
          </div>
          {form.photoProcessing && <div style={{fontSize:12,color:C.muted,marginBottom:18}}>{tr("lg.makingBlueBg")}</div>}
          {!form.photoProcessing && <div style={{fontSize:12,color:C.muted,marginBottom:18}}>{tr("lg.blueBgNote")}</div>}

          <SLabel>{tr("lg.idNumbers")}</SLabel>
          <div style={gridCols(2)}>
            <Inp label={tr("lg.regNoOptional")} value={form.reg_no||""} onChange={v=>setForm(p=>({...p,reg_no:v}))} placeholder={modal==="add"?tr("lg.autoIfBlank"):""}/>
          </div>
          <SLabel>{tr("lg.personalDetails")}</SLabel>
          <div style={gridCols(3)}>
            <Inp label={tr("lg.firstName")}     value={form.first_name||""}   onChange={v=>setForm(p=>({...p,first_name:v}))}   required/>
            <Inp label={tr("lg.middleName")}    value={form.middle_name||""}  onChange={v=>setForm(p=>({...p,middle_name:v}))}/>
            <Inp label={tr("lg.lastName")}      value={form.last_name||""}    onChange={v=>setForm(p=>({...p,last_name:v}))}    required/>
            <Inp label={tr("lg.gender")}         value={form.gender||""}       onChange={v=>setForm(p=>({...p,gender:v}))}       options={[{value:"Female",label:tr("lg.female")},{value:"Male",label:tr("lg.male")}]} required/>
            <Inp label={tr("lg.dob")}  type="date" value={form.dob||""} onChange={v=>setForm(p=>({...p,dob:v}))}/>
            <Inp label={tr("lg.admissionDate")} type="date" value={form.admission_date||""} onChange={v=>setForm(p=>({...p,admission_date:v}))}/>
            <LocationField key="region" label={tr("lg.regionMkoa")} isMobile={isMobile} isTablet={isTablet}
              value={form._region||""}
              onChange={v=>setForm(p=>({...p,_region:v,district:"",ward:"",village:""}))}
              options={REGIONS}/>
            <LocationField key={`district-${form._region||""}`} label={tr("lg.districtWilaya")} isMobile={isMobile} isTablet={isTablet}
              value={form.district||""}
              onChange={v=>setForm(p=>({...p,district:v,ward:"",village:""}))}
              options={getDistricts(form._region)}/>
            <LocationField key={`ward-${form._region||""}-${form.district||""}`} label={tr("lg.wardKata")} isMobile={isMobile} isTablet={isTablet}
              value={form.ward||""}
              onChange={v=>setForm(p=>({...p,ward:v,village:""}))}
              options={getWards(form._region, form.district)}/>
            <LocationField key={`village-${form._region||""}-${form.district||""}-${form.ward||""}`} label={tr("lg.villageKijiji")} isMobile={isMobile} isTablet={isTablet}
              value={form.village||""}
              onChange={v=>setForm(p=>({...p,village:v}))}
              options={getVillages(form._region, form.district, form.ward)}/>
          </div>

          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
            <input type="checkbox" id="isTransferIn" checked={!!form.is_transfer_in}
              onChange={e=>setForm(p=>({...p,is_transfer_in:e.target.checked}))}/>
            <label htmlFor="isTransferIn" style={{fontSize:13,color:C.text}}>{tr("lg.isTransferPre")}<strong>{tr("lg.transferWord")}</strong>{tr("lg.isTransferPost")}</label>
          </div>
          {form.is_transfer_in && (
            <>
              <SLabel>{tr("lg.transferFrom")}</SLabel>
              <div style={gridCols(3)}>
                <LocationField key="origin-region" label={tr("lg.region")} isMobile={isMobile} isTablet={isTablet}
                  value={form.origin_region||""}
                  onChange={v=>setForm(p=>({...p,origin_region:v,origin_district:""}))}
                  options={REGIONS}/>
                <LocationField key={`origin-district-${form.origin_region||""}`} label={tr("lg.district")} isMobile={isMobile} isTablet={isTablet}
                  value={form.origin_district||""}
                  onChange={v=>setForm(p=>({...p,origin_district:v}))}
                  options={getDistricts(form.origin_region)}/>
                <Inp label={tr("lg.previousSchool")}  value={form.origin_school||""}   onChange={v=>setForm(p=>({...p,origin_school:v}))}/>
                <Inp label={tr("lg.transferDate")} type="date" value={form.transfer_in_date||""} onChange={v=>setForm(p=>({...p,transfer_in_date:v}))}/>
              </div>
            </>
          )}

          <SLabel>{tr("lg.academicPlacement")}</SLabel>
          <div style={gridCols(2)}>
            <Inp label={tr("lg.form")}   value={form.form||""}   onChange={v=>setForm(p=>({...p,form:v}))}   options={FORMS.map(f=>({value:f,label:f}))} required/>
            <Inp label={tr("lg.status")} value={form.status||""} onChange={v=>setForm(p=>({...p,status:v}))} options={[{value:"Active",label:tr("lg.active")},{value:"Inactive",label:tr("lg.inactive")},{value:"Transferred",label:tr("lg.transferred")},...(form.status==="Graduated"?[{value:"Graduated",label:tr("lg.graduated")}]:[])]}/>
          </div>
          {form.status==="Transferred" && form.dest_school && (
            <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,padding:14,marginBottom:18,fontSize:13}}>
              <div style={{fontWeight:700,marginBottom:6,color:C.muted,textTransform:"uppercase",fontSize:11,letterSpacing:"0.06em"}}>{tr("lg.transferredOut")}</div>
              <div>{tr("lg.toColon")} <strong>{form.dest_school}</strong>, {form.dest_district}, {form.dest_region}</div>
              <div>{tr("lg.dateColon")} {form.transfer_out_date?.slice?.(0,10) || form.transfer_out_date}</div>
            </div>
          )}
          <SLabel>{tr("lg.parentGuardianLbl")}</SLabel>
          <div style={gridCols(2,12,20)}>
            <Inp label={tr("lg.fullName")} value={form.parent_name||""}  onChange={v=>setForm(p=>({...p,parent_name:v}))}/>
            <Inp label={tr("lg.phone")}     value={form.parent_phone||""} onChange={v=>setForm(p=>({...p,parent_phone:v}))} placeholder="07XXXXXXXX"/>
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <Btn variant="secondary" onClick={()=>{setModal(null);setError("");}}><span style={{display:"flex",alignItems:"center",gap:6}}><CloseIcon size={13}/>{tr("common.cancel")}</span></Btn>
            <Btn onClick={save} loading={saving} disabled={form.photoProcessing}><span style={{display:"flex",alignItems:"center",gap:6}}><SaveIcon size={13}/>{tr("lg.saveStudent")}</span></Btn>
          </div>
        </Modal>
      )}

      {chargeModal && (
        <Modal wide title={tr("lg.contributionsTitle", { name: [chargeModal.first_name, chargeModal.middle_name, chargeModal.last_name].filter(Boolean).join(" "), reg: chargeModal.reg_no })} onClose={()=>{setChargeModal(null);setError("");}}>
          {error && <Alert type="error" message={error} onClose={()=>setError("")}/>}

          <div style={{background:NECTA_PANEL_BG,borderRadius:4,padding:14,marginBottom:16}}>
          <SLabel>{tr("lg.ptReamOther")}</SLabel>
          <div style={{fontSize:12,color:NECTA_TEXT,marginBottom:10}}>{tr("lg.readonlyContrib")}</div>
          {(() => {
            // Part-Time Teachers contributions live in their own table
            // (contribution_parttime) - separate from Ream/Other Expenses
            // (student_charges) - so they're merged into ONE list here
            // (newest first) instead of only ever showing Ream/Other, which
            // previously made this modal look empty for any student who had
            // only paid Part-Time Teachers fees (by far the most common
            // contribution).
            const combined = [
              ...(chargeModal.charges||[]).map(ch => ({
                key:`c${ch.id}`, type: ch.charge_type,
                amountNote: ch.charge_type==="Ream" ? (ch.note||"-") : `TZS ${Number(ch.amount).toLocaleString()}${ch.note?` - ${ch.note}`:""}`,
                date: ch.charge_date,
                status: ch.charge_type==="Ream" ? (ch.paid?tr("lg.brought"):tr("lg.notBrought")) : (ch.paid?tr("lg.paid"):tr("lg.unpaid")),
                color: ch.paid?"green":"red",
                amount: ch.charge_type!=="Ream" ? Number(ch.amount) : 0,
              })),
              ...(chargeModal.parttime_contributions||[]).map((p,idx) => ({
                key:`p${p.year}-${p.month}-${idx}`, type: tr("lg.partTimeTeachers"),
                amountNote: tr("lg.ptOf2000", { paid: Number(p.amount_paid).toLocaleString(), month: (MONTHS[p.month-1] ? tr("month."+p.month) : p.month), year: p.year }),
                date: p.updated_at,
                status: p.completed ? tr("lg.completed") : tr("lg.partial"),
                color: p.completed ? "green" : "red",
                amount: Number(p.amount_paid),
              })),
            ].sort((a,b) => new Date(b.date||0) - new Date(a.date||0));
            return (
              <>
                <Tbl
                  theme="necta"
                  columns={[
                    {key:"type", label:tr("lg.type")},
                    {key:"amountNote", label:tr("lg.amountNote")},
                    {key:"date", label:tr("lg.date"), render:r=>r.date?.slice(0,10) || "-"},
                    {key:"status", label:tr("lg.status"), render:r=><Badge color={r.color}>{r.status}</Badge>},
                  ]}
                  loading={chargeModalLoading}
                  rows={combined}
                  emptyMsg={tr("lg.noContribRecorded")}
                />
                {!!combined.length && (
                  <div style={{display:"flex",justifyContent:"flex-end",padding:"8px 2px",fontWeight:700,fontSize:14,color:NECTA_TEXT}}>
                    {tr("lg.totalColon")} TZS {combined.reduce((a,r)=>a+r.amount,0).toLocaleString()}
                  </div>
                )}
              </>
            );
          })()}
          </div>

          {(() => {
            const fs = chargeModal.food_summary || [];
            const curYear = fs[0]?.year || new Date().getFullYear();
            const FL = { title: tr("lg.food.title"), note: tr("lg.food.note"), type: tr("lg.food.type"), required: tr("lg.food.required"), brought: tr("lg.food.brought"), owed: tr("lg.food.owed"), status: tr("lg.food.status"), done: tr("lg.food.done"), owes: tr("lg.food.owes"), dates: tr("lg.food.dates"), empty: tr("lg.food.empty") };
            return (
              <div style={{marginTop:20,background:NECTA_PANEL_BG,borderRadius:4,padding:14}}>
                <SLabel>{FL.title} — {curYear}</SLabel>
                <div style={{fontSize:12,color:NECTA_TEXT,marginBottom:10}}>{FL.note}</div>
                <Tbl
                  theme="necta"
                  columns={[
                    {key:"label", label:FL.type},
                    {key:"required", label:FL.required, render:r=>r.required?`${Number(r.required).toLocaleString()} ${r.unit_short}`:"—"},
                    {key:"brought", label:`${FL.brought} (${curYear})`, render:r=>`${Number(r.brought).toLocaleString()} ${r.unit_short}`},
                    {key:"remaining", label:FL.owed, render:r=>r.required==null?"—":(r.remaining>0?`${Number(r.remaining).toLocaleString()} ${r.unit_short}`:"0")},
                    {key:"status", label:FL.status, render:r=>r.required==null?<span style={{color:NECTA_TEXT}}>—</span>:<Badge color={r.completed?"green":"red"}>{r.completed?FL.done:FL.owes}</Badge>},
                  ]}
                  loading={chargeModalLoading}
                  rows={fs}
                  emptyMsg={FL.empty}
                />
                {fs.some(r=>r.entries?.length) && (
                  <div style={{marginTop:12}}>
                    <div style={{fontSize:12,fontWeight:700,color:NECTA_TEXT,marginBottom:6}}>{FL.dates}:</div>
                    <div style={{display:"grid",gap:6}}>
                      {fs.filter(r=>r.entries?.length).map(r=>(
                        <div key={r.type} style={{fontSize:12,color:NECTA_TEXT}}>
                          <b>{r.label}:</b>{" "}
                          {r.entries.map((e,i)=>(
                            <span key={i} style={{whiteSpace:"nowrap"}}>
                              {e.date?.slice(0,10)} ({Number(e.quantity).toLocaleString()} {r.unit_short}{Number(e.year)!==curYear?`, ${e.year}`:""}){i<r.entries.length-1?",  ":""}
                            </span>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          <div style={{marginTop:20,background:NECTA_PANEL_BG,borderRadius:4,padding:14}}>
            <SLabel>{tr("lg.hostelFee")}</SLabel>
            <div style={{fontSize:12,color:NECTA_TEXT,marginBottom:10}}>{tr("lg.readonlyHostel")}</div>
            <Tbl
              theme="necta"
              columns={[
                {key:"hostel_fee", label:tr("lg.amount"), render:r=>`TZS ${Number(r.hostel_fee).toLocaleString()}`},
                {key:"term", label:tr("lg.term"), render:r=>r.term || "—"},
                {key:"academic_year", label:tr("lg.academicYear"), render:r=>r.academic_year || "—"},
                {key:"created_at", label:tr("lg.date"), render:r=>r.created_at?.slice(0,10) || "—"},
                {key:"comment", label:tr("lg.note"), render:r=>r.comment || "—"},
              ]}
              loading={chargeModalLoading}
              rows={chargeModal.hostel_fee_contributions||[]}
              emptyMsg={tr("lg.noHostelFee")}
            />
          </div>

          <div style={{display:"flex",gap:10,marginTop:16,justifyContent:"flex-end"}}>
            <Btn variant="secondary" onClick={()=>{setChargeModal(null);setError("");}}><span style={{display:"flex",alignItems:"center",gap:6}}><CloseIcon size={13}/>{tr("common.close")}</span></Btn>
          </div>
        </Modal>
      )}

      {historyModal && (
        <Modal title={tr("lg.enrollHistoryTitle", { name: [historyModal.first_name,historyModal.middle_name,historyModal.last_name].filter(Boolean).join(" ") })} onClose={()=>setHistoryModal(null)}>
          <div style={{display:"flex",justifyContent:"flex-end",alignItems:"center",marginBottom:14}}>
            <Btn size="sm" variant="secondary" onClick={()=>downloadPdf(`/students/${historyModal.id}/pdf`, `${digitsOnly(historyModal.reg_no || historyModal.id)}-profile.pdf`)}><span style={{display:"flex",alignItems:"center",gap:6}}><DownloadIcon size={13}/>{tr("lg.pdf")}</span></Btn>
          </div>
          {historyLoading
            ? <div style={{padding:24,textAlign:"center",color:C.muted,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><SpinnerIcon size={14} />{tr("lg.loading")}</div>
            : !history.length
              ? <p style={{color:C.muted,fontSize:14}}>{tr("lg.noHistory")}</p>
              : <div style={{display:"flex",flexDirection:"column",gap:0}}>
                  {history.map(h=>(
                    <div key={h.id} style={{display:"flex",gap:12,padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:C.accent,marginTop:6,flexShrink:0}}/>
                      <div>
                        <div style={{fontWeight:700,fontSize:14,color:C.text}}>
                          {h.event_type}
                          {h.from_value && h.to_value && <span style={{fontWeight:400,color:C.muted}}> - {h.from_value} → {h.to_value}</span>}
                        </div>
                        {h.note && <div style={{fontSize:13,color:C.muted,marginTop:2}}>{h.note}</div>}
                        <div style={{fontSize:11,color:C.muted,marginTop:3}}>
                          {h.event_at_tz}{h.recorded_by_name?` · by ${h.recorded_by_name}`:""}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>}
        </Modal>
      )}
      {promoteOpen && <PromoteStudentsModal token={token} onClose={()=>setPromoteOpen(false)} onDone={()=>{setPromoteOpen(false);load();}} />}
      {importOpen && <ImportStudentsModal token={token} onClose={()=>setImportOpen(false)} onDone={()=>{setImportOpen(false);load();}} />}
      {resultsModalStudent && <StudentResultLookupModal token={token} student={resultsModalStudent} onClose={()=>setResultsModalStudent(null)} />}
      {ConfirmDialogPortal}
    </div>
  );
}

// End-of-year bulk promotion: Form I->II->III->IV, Form IV -> Graduated.
// Every student in the picked form is pre-checked (i.e. "will be promoted");
// unchecking someone excludes ONLY them from this batch (e.g. a repeater).
function PromoteStudentsModal({ token, onClose, onDone }) {
  const { confirm, ConfirmDialogPortal } = useConfirm();
  const [selForm, setSelForm] = useState("Form I");
  const [roster, setRoster] = useState([]);
  const [checked, setChecked] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const destination = selForm === "Form IV" ? "Graduated" : FORMS[FORMS.indexOf(selForm) + 1];

  useEffect(() => {
    setLoading(true); setError("");
    apiFetch(`/students?form=${encodeURIComponent(selForm)}&status=Active`, {}, token)
      .then(r => { setRoster(r.data || []); setChecked(new Set((r.data || []).map(s => s.id))); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [selForm, token]);

  const toggle = id => setChecked(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setChecked(checked.size === roster.length ? new Set() : new Set(roster.map(s => s.id)));

  const doPromote = () => {
    if (!checked.size) { setError(tr("lg.noStudentsSelected")); return; }
    confirm(
      tr("lg.promoteConfirm", { count: checked.size, from: selForm, to: destination }),
      async () => {
        setBusy(true); setError("");
        try {
          await apiFetch("/students/promote", { method: "POST", body: { student_ids: [...checked] } }, token);
          onDone();
        } catch (err) { setError(err.message); } finally { setBusy(false); }
      }
    );
  };

  return (
    <Modal title={tr("lg.promoteStudents")} onClose={onClose} wide>
      <p style={{fontSize:13,color:C.muted,marginBottom:14}}>
        {tr("lg.promoteIntro")} {selForm} → <b>{destination}</b>.
      </p>
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        {FORMS.map(f => (
          <Btn key={f} variant={selForm===f?"primary":"secondary"} onClick={()=>setSelForm(f)}>{f}</Btn>
        ))}
      </div>
      {error && <p style={{color:C.danger,fontSize:13,marginBottom:10}}>{error}</p>}
      {loading ? <p style={{color:C.muted,fontSize:13,display:"flex",alignItems:"center",gap:7}}><SpinnerIcon size={14} />{tr("lg.loading")}</p> : (
        <div style={{border:`1px solid ${C.border}`,borderRadius:4,maxHeight:360,overflowY:"auto"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"9px 14px",background:C.bg,borderBottom:`1px solid ${C.border}`,fontWeight:700,fontSize:12.5}}>
            <input type="checkbox" checked={roster.length>0 && checked.size===roster.length} onChange={toggleAll} />
            <span>{tr("lg.promoteCount", { form: selForm, total: roster.length, sel: checked.size })}</span>
          </div>
          {roster.map(s => (
            <label key={s.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 14px",borderBottom:`1px solid ${C.border}`,fontSize:13,cursor:"pointer"}}>
              <input type="checkbox" checked={checked.has(s.id)} onChange={()=>toggle(s.id)} />
              <span>{s.first_name} {s.middle_name||""} {s.last_name}</span>
              <span style={{marginLeft:"auto",color:C.muted,fontSize:11.5}}>{s.reg_no||""}</span>
            </label>
          ))}
          {!roster.length && <p style={{padding:14,fontSize:13,color:C.muted}}>{tr("lg.noActiveIn", { form: selForm })}</p>}
        </div>
      )}
      <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:18}}>
        <Btn variant="cancel" onClick={onClose}><span style={{display:"flex",alignItems:"center",gap:6}}><CloseIcon size={13}/>{tr("common.close")}</span></Btn>
        <Btn onClick={doPromote} loading={busy} disabled={!roster.length}><span style={{display:"flex",alignItems:"center",gap:6}}><CheckIcon size={13}/>{tr("lg.confirmPromotion")}</span></Btn>
      </div>
      {ConfirmDialogPortal}
    </Modal>
  );
}

// ─── BULK STUDENT IMPORT (CSV / Excel) ─────────────────────────────────────────
// Three steps: pick a file -> preview (parsed + validated, nothing saved
// yet) -> confirm to actually import. Nothing reaches the database until
// the Head Master/Second Master reviews the preview and presses Import —
// rows with a problem are shown but pre-unchecked, never silently
// imported. PDF isn't offered here: a spreadsheet has real columns
// (Gender is always Gender); a PDF is just laid-out text, so "reading" one
// means guessing which words are which field - too easy to get silently
// wrong on student records. Converting/saving the PDF roster as CSV or
// Excel first (any spreadsheet app, or most PDF table-export tools, can do
// this) keeps every row reliable.
const IMPORT_TEMPLATE_CSV =
  "First Name,Middle Name,Last Name,Gender,Form,Date of Birth,District,Admission Date,Parent Name,Parent Phone,Village,Ward\n" +
  "Juma,,Ally,Male,Form I,,,,, ,,\n";

function downloadImportTemplate() {
  const blob = new Blob([IMPORT_TEMPLATE_CSV], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "student-import-template.csv";
  document.body.appendChild(a); a.click(); a.remove();
  window.URL.revokeObjectURL(url);
}

function ImportStudentsModal({ token, onClose, onDone }) {
  const fileRef = useRef(null);
  const [step, setStep] = useState("pick"); // pick | preview | done
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [rows, setRows] = useState([]); // [{row, parsed, errors, valid}]
  const [checked, setChecked] = useState(new Set()); // indices of `rows` selected to import
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null); // {created, failed}

  const pickFile = () => fileRef.current?.click();

  const onFileChosen = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-choosing the same file name after a fix
    if (!file) return;
    setError(""); setFileName(file.name); setParsing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_BASE}/students/bulk-import/preview`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const isJson = res.headers.get("content-type")?.includes("application/json");
      const data = isJson ? await res.json() : null;
      if (!res.ok || !data) throw new Error(data?.message || tr("lg.couldNotReadFile"));
      setRows(data.rows);
      // Pre-check every VALID row; invalid/duplicate rows start unchecked
      // (the Head Master/Second Master can still tick one on after fixing
      // the file and re-uploading — nothing here is a hard block, it's a
      // safety default).
      setChecked(new Set(data.rows.map((r, i) => (r.valid ? i : null)).filter((i) => i !== null)));
      setStep("preview");
    } catch (err) { setError(err.message); }
    finally { setParsing(false); }
  };

  const toggleRow = (i) => setChecked((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const toggleAllValid = () => {
    const validIdx = rows.map((r, i) => (r.valid ? i : null)).filter((i) => i !== null);
    const allOn = validIdx.length > 0 && validIdx.every((i) => checked.has(i));
    setChecked(allOn ? new Set() : new Set(validIdx));
  };

  const startOver = () => { setStep("pick"); setRows([]); setChecked(new Set()); setError(""); setResult(null); setFileName(""); };

  const doImport = async () => {
    if (!checked.size) { setError(tr("lg.noRowsSelected")); return; }
    setImporting(true); setError("");
    try {
      const selected = [...checked].map((i) => rows[i].parsed);
      const data = await apiFetch("/students/bulk-import/commit", { method: "POST", body: { rows: selected } }, token);
      setResult({ created: data.created, failed: data.failed || [] });
      setStep("done");
    } catch (err) { setError(err.message); }
    finally { setImporting(false); }
  };

  const validCount = rows.filter((r) => r.valid).length;

  return (
    <Modal title={tr("lg.importTitle")} onClose={onClose} wide>
      {error && <Alert type="error" message={error} onClose={() => setError("")} />}

      {step === "pick" && (
        <div>
          <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 14 }}>
            {tr("lg.importIntro")}
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
            <Btn onClick={pickFile} loading={parsing}><span style={{ display: "flex", alignItems: "center", gap: 6 }}><Icon.UploadCloud size={14} />{tr("lg.chooseFile")}</span></Btn>
            <Btn variant="secondary" onClick={downloadImportTemplate}><span style={{ display: "flex", alignItems: "center", gap: 6 }}><DownloadIcon size={14} />{tr("lg.downloadTemplate")}</span></Btn>
          </div>
          {fileName && !parsing && <p style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>{fileName}</p>}
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style={{ display: "none" }} onChange={onFileChosen} />
        </div>
      )}

      {step === "preview" && (
        <div>
          <p style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>
            <b>{rows.length}</b> {tr("lg.rowsFound")} · <b style={{ color: C.success }}>{validCount}</b> {tr("lg.lookReady")}
            {rows.length - validCount > 0 && <> · <b style={{ color: C.danger }}>{rows.length - validCount}</b> {tr("lg.needAttention")}</>}.
            {tr("lg.untickConfirm")}
          </p>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 4, maxHeight: 380, overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", background: C.bg, borderBottom: `1px solid ${C.border}`, fontWeight: 700, fontSize: 12.5, position: "sticky", top: 0, flexWrap: "wrap" }}>
              <input type="checkbox" checked={validCount > 0 && rows.every((r, i) => !r.valid || checked.has(i))} onChange={toggleAllValid} />
              <span>{tr("lg.selectAllValid")}</span>
              <span style={{ marginLeft: "auto", color: C.muted, fontWeight: 500 }}>{tr("lg.selectedN", { n: checked.size })}</span>
            </div>
            {rows.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
                <input type="checkbox" checked={checked.has(i)} onChange={() => toggleRow(i)} style={{ marginTop: 3 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline" }}>
                    <span style={{ fontWeight: 600 }}>{[r.parsed.first_name, r.parsed.middle_name, r.parsed.last_name].filter(Boolean).join(" ") || tr("lg.rowN", { n: r.row })}</span>
                    <span style={{ color: C.muted, fontSize: 11.5 }}>{tr("lg.rowN", { n: r.row })}</span>
                    {r.parsed.gender && <span>{r.parsed.gender}</span>}
                    {r.parsed.form && <Badge>{r.parsed.form}</Badge>}
                  </div>
                  {r.errors.length > 0 && <div style={{ color: C.danger, fontSize: 12, marginTop: 3 }}>{r.errors.join(" ")}</div>}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
            <Btn variant="cancel" onClick={startOver}><span style={{ display: "flex", alignItems: "center", gap: 6 }}><Icon.ArrowLeft size={13} />{tr("lg.chooseDifferentFile")}</span></Btn>
            <Btn onClick={doImport} loading={importing} disabled={!checked.size}><span style={{ display: "flex", alignItems: "center", gap: 6 }}><CheckIcon size={13} />{tr("lg.importN", { n: checked.size })}</span></Btn>
          </div>
        </div>
      )}

      {step === "done" && result && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 14, borderRadius: 4, background: C.successLight, color: C.success, marginBottom: 14 }}>
            <CheckIcon size={16} />
            <span style={{ fontSize: 14, fontWeight: 600 }}>{tr("lg.importedOk", { n: result.created })}</span>
          </div>
          {result.failed.length > 0 && (
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>{tr("lg.rowsSkipped", { n: result.failed.length })}</p>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 4, maxHeight: 240, overflowY: "auto" }}>
                {result.failed.map((f, i) => (
                  <div key={i} style={{ padding: "8px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 12.5 }}>
                    <b>{f.name}</b> ({tr("lg.rowLower", { n: f.row })}) - <span style={{ color: C.danger }}>{f.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
            <Btn onClick={onDone}><span style={{ display: "flex", alignItems: "center", gap: 6 }}><CheckIcon size={13} />{tr("common.done")}</span></Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── TIMETABLE MODULE ─────────────────────────────────────────────────────────
function TimetableModule({ token, canGenerate = true, restrictedForms = null, myTeacherLabel = null }) {
  const { confirm, ConfirmDialogPortal } = useConfirm();
  const { isMobile, isTablet } = useBreakpoint();
  const stackCols = isMobile ? "1fr" : isTablet ? "1fr 1fr" : "repeat(4,1fr)"; // class-picker grids (Step 1 & 2)
  const [teachers, setTeachers]       = useState([]);
  const [timetable, setTimetable]     = useState([]);
  const [masterClasses, setMasterClasses] = useState(null);
  const [periods, setPeriods]         = useState(PERIODS);
  const [classes, setClasses]         = useState([]);   // dynamic: [{id,form,stream,label}]
  const [subjects, setSubjects]       = useState([]);   // dynamic: [{id,name}]
  const [showClassMgr, setShowClassMgr] = useState(false);
  const [classForm, setClassForm]     = useState({ form:"Form I", stream:"" });
  const [eventTypes, setEventTypes]   = useState([]);
  const [eventSchedule, setEventSchedule] = useState([]);
  const [genStatus, setGenStatus]     = useState({ used:0, remaining:4, max:4 });
  const [drafts, setDrafts]           = useState([]);
  const [selectedDraft, setSelectedDraft] = useState("");
  const [loading, setLoading]         = useState(false);
  const [generating, setGenerating]   = useState(false);
  const [view, setView]               = useState(canGenerate ? "setup" : "result");
  const [wizardStep, setWizardStep]   = useState(1); // 1: Teachers/Subject/Class  2: Events, Day, Time & Classes
  const [genClasses, setGenClasses]   = useState(ALL_CLASSES);
  const [viewTab, setViewTab]         = useState("class");
  const [viewClass, setViewClass]     = useState("Form I A");
  const [viewTeacher, setViewTeacher] = useState(myTeacherLabel || "");
  const [sharedInfo, setSharedInfo]   = useState(null); // { shared, draft_label } - Teachers/Patron/etc only
  const [ttYear, setTTYear]           = useState(CURRENT_YEAR);
  const [ttTerm, setTTTerm]           = useState("Term 1");
  const [ttMonth, setTTMonth]         = useState(MONTHS[new Date().getMonth()]);
  const [editMode, setEditMode]       = useState(false);
  const [editingCell, setEditingCell] = useState(null);
  const [editCellForm, setEditCellForm] = useState({ subject:"", teacher_id:"" });
  const [showAddTeacher, setShowAddTeacher] = useState(false);
  const [editTeacher, setEditTeacher] = useState(null);
  const [tForm, setTForm]             = useState({ short_name:"", subject:"", classes:[] }); // classes: [{cls, periods_per_week}]
  const [evForm, setEvForm]           = useState({ event_type_id:"", day:"Monday", period_label:"", period_label_to:"", classes:[] });
  const [newEventName, setNewEventName] = useState("");
  const [showPeriodMgr, setShowPeriodMgr] = useState(false);
  const [allPeriods, setAllPeriods]   = useState([]);
  const [periodForm, setPeriodForm]   = useState({ label:"", start_time:"", end_time:"" });
  const [exportingPdf, setExportingPdf] = useState(false);
  const [error, setError]             = useState("");
  const [success, setSuccess]         = useState("");
  // Draft-label picker - shown right before any Export PDF / Publish action so
  // the person acting gets to confirm/choose which label (1st..4th Draft)
  // appears on that document, since earlier attempts are often just trials.
  const [draftPicker, setDraftPicker] = useState(null); // { title, hint, label, run(label) }

  const loadTeachers = useCallback(async () => {
    try { const r = await apiFetch("/teachers", {}, token); setTeachers(r.data); }
    catch (err) { setError(err.message); }
  }, [token]);

  const loadTimetable = useCallback(async () => {
    setLoading(true);
    try {
      const draftParam = selectedDraft ? `&draft=${encodeURIComponent(selectedDraft)}` : "";
      const r = await apiFetch(`/timetable?academic_year=${ttYear}&term=${encodeURIComponent(ttTerm)}${draftParam}`, {}, token);
      setTimetable(r.data);
      if (r.draft_label && !selectedDraft) setSelectedDraft(r.draft_label);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [token, ttYear, ttTerm, selectedDraft]);

  const loadMasterClasses = useCallback(async () => {
    try {
      const draftParam = selectedDraft ? `&draft=${encodeURIComponent(selectedDraft)}` : "";
      const r = await apiFetch(`/timetable?masterOnly=true&academic_year=${ttYear}&term=${encodeURIComponent(ttTerm)}${draftParam}`, {}, token);
      setMasterClasses(r.master_classes && r.master_classes.length ? r.master_classes : null);
    } catch { /* non-fatal */ }
  }, [token, ttYear, ttTerm, selectedDraft]);

  const loadDrafts = useCallback(async () => {
    try {
      const r = await apiFetch(`/timetable/drafts?academic_year=${ttYear}&term=${encodeURIComponent(ttTerm)}`, {}, token);
      setDrafts(r.data);
      // Ordinary Teachers/Patron/Matron/Class Teacher/Food Teacher never get
      // to just see "whatever the latest draft is" - they only ever see
      // whichever ONE draft Admin/Second Master/Academic explicitly shared
      // (see loadSharedStatus below). Auto-picking the latest draft here is
      // only correct for the generate-capable roles.
      if (canGenerate && r.data.length && !r.data.includes(selectedDraft)) setSelectedDraft(r.data[r.data.length - 1]);
    } catch { /* non-fatal */ }
  }, [token, ttYear, ttTerm, canGenerate]);

  // Teachers/Patron/Matron/Class Teacher/Food Teacher only ("View Timetable"
  // by default, no "Generate") - which draft (if any) Admin/Second
  // Master/Academic has shared with everyone.
  const loadSharedStatus = useCallback(async () => {
    try {
      const r = await apiFetch(`/timetable/shared-status?academic_year=${ttYear}&term=${encodeURIComponent(ttTerm)}`, {}, token);
      setSharedInfo(r);
      if (!canGenerate) setSelectedDraft(r.shared ? r.draft_label : "");
    } catch { /* non-fatal */ }
  }, [token, ttYear, ttTerm, canGenerate]);

  // ── Share with Teachers - "every OTHER logged-in teacher's own Timetable
  //    module". Confirm YES/NO, then a clear success/failure message, per
  //    spec. (The separate public-internet-facing "Publish to Public Site"
  //    feature has been removed - Share to Teachers is now the only way a
  //    draft is distributed.) ──
  const shareCurrentDraft = (label) => {
    const lbl = label || selectedDraft;
    if (!lbl) return;
    confirm(`Unataka ku-share ${lbl} kwa walimu wengine wote?`, async () => {
      try {
        await apiFetch("/timetable/share", { method:"POST", body:{ academic_year:ttYear, term:ttTerm, draft_label:lbl } }, token);
        setSuccess(`Umefanikiwa ku-share ${lbl} kwa walimu wote.`);
        loadSharedStatus();
      } catch (err) { setError(err.message || "Imeshindikana ku-share timetable."); }
    }, { danger:false });
  };
  const openSharePicker = () => requestDraftLabel(
    "Chagua Draft ya Ku-share",
    "Chagua draft (1st, 2nd, 3rd au 4th) itakayoonekana kwa walimu wengine.",
    (label) => shareCurrentDraft(label)
  );
  const unshareTimetable = () => confirm("Unataka kuondoa timetable isionekane tena kwa walimu wengine?", async () => {
    try {
      await apiFetch("/timetable/unshare", { method:"POST", body:{ academic_year:ttYear, term:ttTerm } }, token);
      setSuccess("Timetable haishirikiwi tena na walimu.");
      loadSharedStatus();
    } catch (err) { setError(err.message || "Imeshindikana kuondoa share."); }
  });

  const deleteSelectedDraft = () => {
    if (!selectedDraft) return;
    confirm(`Permanently delete ${selectedDraft}? This cannot be undone. (Use this once you've decided you won't use this trial.)`, async () => {
      try {
        await apiFetch("/timetable/draft", { method:"DELETE", body:{ academic_year:ttYear, term:ttTerm, draft_label:selectedDraft } }, token);
        setSuccess(`${selectedDraft} deleted.`);
        setSelectedDraft("");
        await loadDrafts();
      } catch (err) { setError(err.message); }
    }, { danger:true });
  };

  const loadClasses = useCallback(async () => {
    try { const r = await apiFetch("/classes", {}, token); setClasses(r.data); }
    catch (err) { setError(err.message); }
  }, [token]);

  const loadSubjects = useCallback(async () => {
    try { const r = await apiFetch("/subjects", {}, token); setSubjects(r.data); }
    catch (err) { setError(err.message); }
  }, [token]);

  const addClass = async () => {
    if (!classForm.form) { setError("Choose a Form."); return; }
    try {
      await apiFetch("/classes", { method:"POST", body:classForm }, token);
      setClassForm({ form:"Form I", stream:"" });
      loadClasses();
    } catch (err) { setError(err.message); }
  };
  const removeClass = id => {
    confirm("Remove this class? (Existing timetable rows for it are kept, but it won't appear in future setup.)", async () => {
      setError("");
      try { await apiFetch(`/classes/${id}`, { method:"DELETE" }, token); loadClasses(); }
      catch (err) { setError(err.message || "Could not remove this class."); }
    });
  };

  const loadPeriods = useCallback(async () => {
    try {
      const r = await apiFetch("/timetable/periods", {}, token);
      setPeriods(r.data.map(p => ({ label:p.label, time:`${p.start_time}–${p.end_time}`, isBreak:p.is_break, isCore:p.is_core })));
    } catch (err) { setError(err.message); }
  }, [token]);

  const loadAllPeriods = useCallback(async () => {
    try { const r = await apiFetch("/timetable/periods/all", {}, token); setAllPeriods(r.data); }
    catch (err) { setError(err.message); }
  }, [token]);

  const loadEventTypes = useCallback(async () => {
    try { const r = await apiFetch("/timetable/events", {}, token); setEventTypes(r.data); }
    catch (err) { setError(err.message); }
  }, [token]);

  const loadEventSchedule = useCallback(async () => {
    try {
      const r = await apiFetch(`/timetable/event-schedule?academic_year=${ttYear}&term=${encodeURIComponent(ttTerm)}`, {}, token);
      setEventSchedule(r.data);
    } catch (err) { setError(err.message); }
  }, [token, ttYear, ttTerm]);

  const loadGenStatus = useCallback(async () => {
    try {
      const r = await apiFetch(`/timetable/generation-status?academic_year=${ttYear}&term=${encodeURIComponent(ttTerm)}`, {}, token);
      setGenStatus(r.data);
    } catch { /* non-fatal */ }
  }, [token, ttYear, ttTerm]);

  useEffect(() => { loadTeachers(); loadPeriods(); loadEventTypes(); loadClasses(); loadSubjects(); loadDrafts(); }, [loadTeachers, loadPeriods, loadEventTypes, loadClasses, loadSubjects, loadDrafts]);
  useEffect(() => { loadEventSchedule(); loadGenStatus(); }, [loadEventSchedule, loadGenStatus]);
  useEffect(() => { if (view==="result") { loadDrafts(); loadTimetable(); loadMasterClasses(); if (!canGenerate) loadSharedStatus(); } }, [view, loadDrafts, loadTimetable, loadMasterClasses, canGenerate, loadSharedStatus]);

  // ── Teacher / subject / class&stream (+ periods-per-week) - Wizard Step 1 ──
  const toggleClass = cls => setTForm(p => {
    const exists = p.classes.find(c => c.cls === cls);
    return { ...p, classes: exists ? p.classes.filter(c => c.cls !== cls) : [...p.classes, { cls, periods_per_week: 4, subject: p.subject }] };
  });
  // Stores the raw typed value as-is (even "" or a momentarily-invalid number)
  // instead of clamping on every keystroke. Clamping on every keystroke is
  // what caused the mobile bug where deleting a digit snapped the field back
  // to "1" before the next digit was typed, so typing "4" after clearing
  // produced "14" - the old "1" was still there when the new digit landed.
  const setClassPeriods = (cls, val) => setTForm(p => ({
    ...p, classes: p.classes.map(c => c.cls === cls ? { ...c, periods_per_week: val } : c),
  }));
  // Clamps to a valid 1-10 integer only once the person leaves the field.
  const clampClassPeriods = (cls, val) => setTForm(p => ({
    ...p, classes: p.classes.map(c => c.cls === cls ? { ...c, periods_per_week: Math.max(1, Math.min(10, Number(val) || 1)) } : c),
  }));
  const setClassSubject = (cls, subj) => setTForm(p => ({
    ...p, classes: p.classes.map(c => c.cls === cls ? { ...c, subject: subj } : c),
  }));

  const saveTeacher = async () => {
    if (!tForm.short_name.trim()||!tForm.subject) { setError("Name and subject required."); return; }
    const payload = { ...tForm, classes: tForm.classes.map(c => ({ ...c, periods_per_week: Math.max(1, Math.min(10, Number(c.periods_per_week) || 1)) })) };
    try {
      if (editTeacher) await apiFetch(`/teachers/${editTeacher.id}`, { method:"PUT", body:payload }, token);
      else             await apiFetch("/teachers", { method:"POST", body:payload }, token);
      setShowAddTeacher(false); setEditTeacher(null);
      setTForm({ short_name:"", subject:"", classes:[] });
      setSuccess("Teacher saved."); loadTeachers();
    } catch (err) { setError(err.message); }
  };

  const removeTeacher = id => {
    confirm("Remove teacher?", async () => {
      try { await apiFetch(`/teachers/${id}`, { method:"DELETE" }, token); loadTeachers(); }
      catch (err) { setError(err.message); }
    });
  };

  const openEditTeacher = t => {
    // The subjects this teacher is registered for NOW (User Accounts). After
    // a re-assignment (new subject / new Form for a new year) the roster row
    // and its old class assignments can still carry the previous subject -
    // pre-selecting that stale value made the Subject dropdown show one
    // thing while saving another, so the new subject never took effect.
    const allowed = (t.registered_subjects||[]).filter(Boolean);
    const mainSubject = allowed.length && !allowed.includes(t.subject) ? allowed[0] : (t.subject || allowed[0] || "");
    setTForm({ short_name:t.short_name, subject:mainSubject, classes:(t.assignments||[]).map(a=>({ cls:[a.form,a.stream].filter(Boolean).join(" "), periods_per_week:a.periods_per_week||4, subject:(a.subject && (!allowed.length || allowed.includes(a.subject))) ? a.subject : mainSubject })) });
    setEditTeacher(t); setShowAddTeacher(true);
  };

  // ── Special Events - Wizard Step 2 ──────────────────────────────────────────
  const toggleEvClass = cls => setEvForm(p => ({ ...p, classes: p.classes.includes(cls) ? p.classes.filter(c=>c!==cls) : [...p.classes, cls] }));

  const addNewEventType = async () => {
    if (!newEventName.trim()) return;
    try { await apiFetch("/timetable/events", { method:"POST", body:{ name:newEventName.trim() } }, token); setNewEventName(""); loadEventTypes(); }
    catch (err) { setError(err.message); }
  };

  const addScheduledEvent = async () => {
    if (!evForm.event_type_id||!evForm.day||!evForm.period_label||!evForm.classes.length) {
      setError("Choose an event, day, time and at least one class."); return;
    }
    const fromIdx = lessonPeriods.findIndex(p=>p.label===evForm.period_label);
    const toLabel = evForm.period_label_to || evForm.period_label;
    const toIdx = lessonPeriods.findIndex(p=>p.label===toLabel);
    if (fromIdx === -1 || toIdx === -1 || toIdx < fromIdx) {
      setError("'To' period must be the same as or after 'From' period."); return;
    }
    const rangeLabels = lessonPeriods.slice(fromIdx, toIdx + 1).map(p=>p.label);
    try {
      for (const label of rangeLabels) {
        await apiFetch("/timetable/event-schedule", { method:"POST", body:{ ...evForm, period_label:label, academic_year:ttYear, term:ttTerm } }, token);
      }
      setEvForm(p => ({ ...p, classes:[] }));
      setSuccess(rangeLabels.length > 1 ? `Event scheduled across ${rangeLabels.join(", ")}.` : "Event scheduled.");
      loadEventSchedule();
    } catch (err) { setError(err.message); }
  };

  const removeScheduledEvent = async id => {
    try { await apiFetch(`/timetable/event-schedule/${id}`, { method:"DELETE" }, token); loadEventSchedule(); }
    catch (err) { setError(err.message); }
  };

  const toggleGenClass = cls => setGenClasses(p => p.includes(cls) ? p.filter(c=>c!==cls) : [...p, cls]);

  // ── Periods manager (optional afternoon periods, from 14:10, admin-added) ──
  const addPeriod = async () => {
    if (!periodForm.label||!periodForm.start_time||!periodForm.end_time) { setError("Label, start and end time required."); return; }
    try {
      await apiFetch("/timetable/periods", { method:"POST", body:periodForm }, token);
      setPeriodForm({ label:"", start_time:"", end_time:"" });
      loadAllPeriods(); loadPeriods();
    } catch (err) { setError(err.message); }
  };
  const togglePeriodActive = async id => {
    try { await apiFetch(`/timetable/periods/${id}/toggle`, { method:"PATCH" }, token); loadAllPeriods(); loadPeriods(); }
    catch (err) { setError(err.message); }
  };
  const removePeriod = id => {
    confirm("Remove this optional period?", async () => {
      try { await apiFetch(`/timetable/periods/${id}`, { method:"DELETE" }, token); loadAllPeriods(); loadPeriods(); }
      catch (err) { setError(err.message); }
    });
  };

  // ── Generate ─────────────────────────────────────────────────────────────
  const generate = async () => {
    setGenerating(true); setError("");
    try {
      const r = await apiFetch("/timetable/generate", { method:"POST", body:{ academic_year:ttYear, term:ttTerm, classes:genClasses } }, token);
      setSuccess(r.message); setSelectedDraft(r.draft_label); setView("result"); loadGenStatus();
    } catch (err) { setError(err.message); }
    finally { setGenerating(false); }
  };

  // Downloads a PDF from the API using the auth token.
  const downloadPdf = async (path, filename) => {
    setExportingPdf(true);
    try {
      const res = await fetch(`${API_BASE}${path}`, { headers: token ? { Authorization:`Bearer ${token}` } : {} });
      if (!res.ok) throw new Error(tr("lg.couldNotPdf"));
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) { setError(err.message); }
    finally { setExportingPdf(false); }
  };

  // Opens the draft-label confirm step before an Export PDF / Publish action
  // actually runs. `run(label)` is called with whichever label the person
  // confirms - defaults to the draft currently being viewed.
  const requestDraftLabel = (title, hint, run) => {
    const options = drafts.length ? drafts : DRAFT_LABELS;
    setDraftPicker({ title, hint, label: selectedDraft && options.includes(selectedDraft) ? selectedDraft : options[0], run });
  };

  // Dynamic classes (falls back to the default Form I-IV x A-C grid until the API responds)
  const classList = (() => {
    const base = classes.length ? classes : null;
    // Ordinary Teachers/Patron/Matron/Class Teacher/Food Teacher only ever
    // see the classes they actually teach ("kama yalivyosajiliwa kwenye
    // user Accounts") - Admin/Second Master/Academic see everything, same
    // as before.
    if (!canGenerate && restrictedForms && restrictedForms.length && base) {
      const restricted = base.filter(c => restrictedForms.includes(c.form)).map(c => c.label);
      return restricted.length ? restricted : (base.map(c => c.label));
    }
    return base ? base.map(c => c.label) : ALL_CLASSES;
  })();

  useEffect(() => {
    if (classList.length && !classList.includes(viewClass)) setViewClass(classList[0]);
  }, [classList.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  // Classes actually in use - i.e. picked during Teacher Assignment (Step 1) -
  // is what Events should offer, not every class configured in the school.
  const assignedClassList = Array.from(new Set(
    teachers.flatMap(t => (t.assignments||[]).map(a => [a.form, a.stream].filter(Boolean).join(" ")))
  )).sort();
  const classesByForm = FORMS.map(f => ({ form: f, items: classes.filter(c => c.form === f).map(c => c.label) }));

  // Build ttMap[cls][day][period]
  const ttMap = {};
  classList.forEach(cls => { ttMap[cls]={}; DAYS.forEach(d=>{ ttMap[cls][d]={}; }); });
  timetable.forEach(row => {
    const cls = row.stream ? `${row.form} ${row.stream}` : row.form;
    if (!ttMap[cls]) ttMap[cls]={};
    if (!ttMap[cls][row.day]) ttMap[cls][row.day]={};
    ttMap[cls][row.day][row.period] = { subject:row.subject, teacher_name:row.teacher_name, is_event:row.is_event, event_name:row.event_name };
  });

  // Reliable form/stream lookup for a class label - uses the real `classes` data
  // (never guesses by splitting words, which breaks for stream-less classes like "Form I").
  const classFormStream = (label) => {
    const found = classes.find(c => c.label === label);
    if (found) return { form: found.form, stream: found.stream || "" };
    // Fallback only for the default Form I-IV x A-C grid before the API responds.
    const parts = label.split(" "); const stream = parts.length > 2 ? parts.pop() : (STREAMS.includes(parts[parts.length-1]) ? parts.pop() : "");
    return { form: parts.join(" "), stream };
  };

  const openEditCell = (cls, day, period) => {
    if (!editMode||period.isBreak) return;
    const { form, stream } = classFormStream(cls);
    const existing = ttMap[cls]?.[day]?.[period.label];
    const t = teachers.find(t=>(t.registered_username||t.short_name)===existing?.teacher_name);
    setEditCellForm({ subject:existing?.subject||"", teacher_id:t?.id||"", form, stream, day, period:period.label });
    setEditingCell({ cls, day, period });
  };

  const saveEditCell = async () => {
    try {
      await apiFetch("/timetable/cell", { method:"PUT", body:{...editCellForm, academic_year:ttYear, term:ttTerm, draft_label:selectedDraft} }, token);
      setEditingCell(null); loadTimetable();
    } catch (err) { setError(err.message); }
  };

  const clearEditCell = async () => {
    try {
      await apiFetch("/timetable/cell", { method:"DELETE", body:{ form:editCellForm.form, stream:editCellForm.stream, day:editCellForm.day, period:editCellForm.period, academic_year:ttYear, term:ttTerm, draft_label:selectedDraft } }, token);
      setEditingCell(null); loadTimetable();
    } catch (err) { setError(err.message); }
  };

  const TH = {padding:"9px 10px",textAlign:"left",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.04em",borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"};
  const TD = {padding:"7px 9px",borderBottom:`1px solid ${C.border}`,verticalAlign:"top"};
  // On mobile/tablet the tables scroll sideways - keep the leading column (Period/Class)
  // pinned in view so people always know which row they're looking at while they swipe.

  const CellView = ({ cls, day, period, compact=false }) => {
    if (period.isBreak) return <div style={{textAlign:"center",color:C.muted,fontSize:compact?9:11,fontStyle:"italic",padding:"4px 0"}}>{period.label}</div>;
    const cell = ttMap[cls]?.[day]?.[period.label];
    if (!cell) return (
      <div onClick={()=>openEditCell(cls,day,period)} style={{height:compact?28:40,display:"flex",alignItems:"center",justifyContent:"center",color:editMode?"#94A3B8":"#E2E8F0",fontSize:compact?9:18,cursor:editMode?"pointer":"default",borderRadius:4,border:editMode?"1px dashed #CBD5E1":"none"}}>
        {editMode?"+":"-"}
      </div>
    );
    if (cell.is_event) return (
      <div onClick={()=>openEditCell(cls,day,period)} style={{background:"#FEF3C7",border:"1px solid #FCD34D",borderRadius:4,padding:compact?"3px 5px":"6px 8px",cursor:editMode?"pointer":"default"}}>
        <div style={{fontWeight:700,color:"#92400E",fontSize:compact?9:11,lineHeight:1.2}}>{cell.event_name}</div>
      </div>
    );
    const sc = SUBJ_COLORS[cell?.subject]||C.accentText;
    return (
      <div onClick={()=>openEditCell(cls,day,period)} style={{background:`color-mix(in srgb, ${sc} 8%, transparent)`,border:`1px solid color-mix(in srgb, ${sc} 25%, transparent)`,borderRadius:4,padding:compact?"3px 5px":"6px 8px",cursor:editMode?"pointer":"default"}}>
        <div style={{fontWeight:700,color:sc,fontSize:compact?9:11,lineHeight:1.2}}>{cell.subject}</div>
        <div style={{fontSize:compact?8:10,color:C.muted,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cell.teacher_name}</div>
      </div>
    );
  };

  // ── Unified weekly grid: FIVE separate tables, one per Day (Monday…Friday),
  // Period (P1…P12) running ACROSS as columns of each table - like the
  // person's own handwritten layout: one table per Day, Period columns with
  // their time ranges on top, one data row underneath. Used identically by
  // Per Class, Per Teacher AND General View so every timetable on screen
  // reads the same way.
  const WeekGrid = ({ renderCell }) => {
    const compact = isMobile||isTablet;
    return (
      <div style={{display:"flex",flexDirection:"column",gap:compact?14:18}}>
        {DAYS.map(d=>(
          <div key={d}>
            <div style={{fontWeight:800,fontSize:compact?12.5:13.5,color:C.accentText,padding:compact?"0 12px 6px":"0 16px 7px",textTransform:"uppercase",letterSpacing:"0.03em"}}>{d}</div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:compact?12:13,minWidth:compact?680:900}}>
                <thead>
                  <tr style={{background:C.bg}}>
                    {periods.map(p=><th key={p.label} style={{...TH,fontSize:compact?9.5:11,textAlign:"center",minWidth:compact?58:74,color:p.isBreak?C.muted:C.text}}>
                      {p.label}<br/><span style={{fontWeight:400,fontSize:compact?8:9.5,color:C.muted}}>{p.time}</span>
                    </th>)}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {periods.map(p=>(
                      <td key={p.label} style={{...TD,padding:compact?"5px 6px":TD.padding,textAlign:"center",...(p.isBreak?{background:C.bg}:{})}}>
                        {p.isBreak
                          ? <span style={{color:C.muted,fontSize:compact?9:10,fontStyle:"italic"}}>{p.label}</span>
                          : renderCell(d,p)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ── General View grid: exactly FIVE tables total - one per Day - each
  // showing EVERY class's schedule that day (Class as rows, Period as
  // columns). This is the one true "whole school" timetable, unlike
  // WeekGrid above (which is per single class/teacher).
  const MasterDayGrid = ({ rows }) => {
    const compact = isMobile||isTablet;
    return (
      <div style={{display:"flex",flexDirection:"column",gap:compact?14:18}}>
        {DAYS.map(d=>(
          <Card key={d} style={{padding:0}}>
            <div style={{padding:isMobile?"10px 14px":"10px 16px",borderBottom:`1px solid ${C.border}`,fontWeight:800,fontSize:isMobile?13:14,color:C.accentText,textTransform:"uppercase",letterSpacing:"0.03em"}}>{d}</div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:compact?12:13,minWidth:compact?820:1060}}>
                <thead>
                  <tr style={{background:C.bg}}>
                    <th style={{...TH,fontSize:compact?10:11,minWidth:compact?70:90}}>Class</th>
                    {periods.map(p=><th key={p.label} style={{...TH,fontSize:compact?9.5:11,textAlign:"center",minWidth:compact?58:74,color:p.isBreak?C.muted:C.text}}>
                      {p.label}<br/><span style={{fontWeight:400,fontSize:compact?8:9.5,color:C.muted}}>{p.time}</span>
                    </th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(cls=>(
                    <tr key={cls}>
                      <td style={{...TD,fontWeight:700,fontSize:compact?10.5:12,whiteSpace:"nowrap",padding:compact?"6px 8px":TD.padding}}>{cls}</td>
                      {periods.map(p=>(
                        <td key={p.label} style={{...TD,padding:compact?"5px 6px":TD.padding,textAlign:"center",...(p.isBreak?{background:C.bg}:{})}}>
                          {p.isBreak
                            ? <span style={{color:C.muted,fontSize:compact?9:10,fontStyle:"italic"}}>{p.label}</span>
                            : <CellView cls={cls} day={d} period={p} compact/>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>
    );
  };

  // ── Maelezo ya chini ya kila Ratiba - kwa Kiswahili, kama inavyotakiwa. ──
  const TimetableFooterNote = () => (
    <div style={{marginTop:2,padding:isMobile?"12px 14px":"14px 18px",fontSize:isMobile?11:11.5,color:C.muted,lineHeight:1.9,borderTop:`1px dashed ${C.border}`}}>
      <div>*This timetable is subject to change depending on requirements</div>
      <div>*If there is a clash of periods, please visit the Academic Office to resolve the issue</div>
      <div>*For any other issue related to the Timetable, please visit the Academic Office</div>
    </div>
  );

  const lessonPeriods = periods.filter(p=>!p.isBreak);
  // Counts real scheduled lesson cells for a teacher across the whole week -
  // read straight from the generated timetable (ttMap), not from the
  // planned "periods/week" figures set during setup, so the number shown
  // on Per Teacher always matches exactly what's on their grid.
  const countTeacherWeeklyPeriods = teacherLabel => {
    if (!teacherLabel) return 0;
    let count = 0;
    DAYS.forEach(d => lessonPeriods.forEach(p => {
      const hit = classList.some(cls => ttMap[cls]?.[d]?.[p.label]?.teacher_name === teacherLabel);
      if (hit) count++;
    }));
    return count;
  };
  const candidateMasterRows = masterClasses || genClasses || classList;
  // Only show/print classes that actually have at least one scheduled cell in
  // this draft - a class picked in "Generate" but with no teacher/subject
  // assigned would otherwise show up as an all-empty row (and, in the PDF,
  // pad out extra blank pages for nothing).
  const rowsWithData = candidateMasterRows.filter(cls => DAYS.some(d => Object.keys(ttMap[cls]?.[d] || {}).length > 0));
  const masterRows = rowsWithData.length ? rowsWithData : candidateMasterRows;

  // Admin / Academic Master / Second Master land on Timetable with a clear
  // choice up front: "Generate Timetable" (the setup wizard) or "View
  // Timetable" (the result/grid view) — not gated behind whether a draft
  // already exists. Everyone else (ordinary teachers, patrons, matrons,
  // class/food teachers) never sees this switch — they only ever get the
  // View (canGenerate=false skips the "setup" branch below entirely,
  // since `view` starts at "result" and nothing here flips it back).
  const viewToggle = canGenerate && (
    <div style={{display:"flex",gap:4,background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,padding:4,width:isMobile?"100%":"fit-content"}}>
      <button type="button" onClick={()=>setView("setup")} style={{flex:isMobile?1:"none",display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"8px 16px",border:"none",borderRadius:4,background:view==="setup"?C.accent:"transparent",fontWeight:700,color:view==="setup"?"#fff":C.muted,cursor:"pointer",fontSize:12.5,whiteSpace:"nowrap"}}><Icon.RefreshCw size={13}/>Generate Timetable</button>
      <button type="button" onClick={()=>setView("result")} style={{flex:isMobile?1:"none",display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"8px 16px",border:"none",borderRadius:4,background:view==="result"?C.accent:"transparent",fontWeight:700,color:view==="result"?"#fff":C.muted,cursor:"pointer",fontSize:12.5,whiteSpace:"nowrap"}}><ClockIcon size={13}/>View Timetable</button>
    </div>
  );

  // ── Setup view (WIZARD) ──────────────────────────────────────────────────
  if (view==="setup") return (
    <div style={{display:"flex",flexDirection:"column",gap:20,padding:isMobile?"16px 12px":isTablet?"24px 20px":32,boxSizing:"border-box",width:"100%"}}>
      {viewToggle}
      <div style={{display:"flex",flexDirection:isMobile?"column":"row",justifyContent:"space-between",alignItems:isMobile?"stretch":"flex-start",flexWrap:"wrap",gap:12}}>
        <div>
          <h2 style={{margin:0,fontSize:isMobile?18:22,fontWeight:800,color:C.text}}>Timetable Generator</h2>
          <p style={{margin:"4px 0 0",color:C.muted,fontSize:isMobile?12.5:14,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <span>Step {wizardStep} of 2 - {wizardStep===1 ? "Teachers, Subject, Class & Stream" : "Events, Day, Time & Class Selection"}</span>
            <Badge color={genStatus.remaining>0?"green":"red"}>{genStatus.used}/{genStatus.max} generated today</Badge>
          </p>
        </div>
        <div style={{display:"flex",flexDirection:isMobile?"column":"row",gap:isMobile?8:10,flexWrap:"wrap",alignItems:isMobile?"stretch":"center"}}>
          <div style={{display:"flex",gap:8}}>
            <select value={ttYear} onChange={e=>setTTYear(e.target.value)} style={{...IS,width:isMobile?"auto":90,flex:isMobile?1:"none"}}>{YEARS.map(y=><option key={y}>{y}</option>)}</select>
            <select value={ttTerm} onChange={e=>setTTTerm(e.target.value)} style={{...IS,width:isMobile?"auto":120,flex:isMobile?1:"none"}}>{["Term 1","Term 2","Term 3"].map(t=><option key={t}>{t}</option>)}</select>
          </div>
          {(isMobile || isTablet) ? (
            <div style={{display:"flex",gap:8}}>
              <div style={{flex:1}}>
                <MoreMenu label="Manage" items={[
                  { label: "Classes", onClick: ()=>setShowClassMgr(true) },
                  { label: "Periods", onClick: ()=>{loadAllPeriods();setShowPeriodMgr(true);} },
                ]}/>
              </div>
              {drafts.length>0 && <Btn variant="secondary" onClick={()=>setView("result")} style={{flex:1,justifyContent:"center"}}><span style={{display:"flex",alignItems:"center",gap:6}}><ClockIcon size={13}/>View Saved</span></Btn>}
            </div>
          ) : (<>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <Btn variant="ghost" onClick={()=>setShowClassMgr(true)}><span style={{display:"flex",alignItems:"center",gap:6}}><Icon.Layers size={13}/>Classes</span></Btn>
              <Btn variant="ghost" onClick={()=>{loadAllPeriods();setShowPeriodMgr(true);}}><span style={{display:"flex",alignItems:"center",gap:6}}><Icon.Calendar size={13}/>Periods</span></Btn>
            </div>
            {drafts.length>0 && <Btn variant="secondary" onClick={()=>setView("result")}><span style={{display:"flex",alignItems:"center",gap:6}}><ClockIcon size={13}/>View Saved Timetables</span></Btn>}
          </>)}
        </div>
      </div>
      {error   && <Alert type="error"   message={error}   onClose={()=>setError("")}/>}
      {success && <Alert type="success" message={success} onClose={()=>setSuccess("")}/>}

      {/* ── STEP 1 : Teachers / Subject / Class & Stream ─────────────────── */}
      {wizardStep===1 && <>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:14}}>
          <StatCard label="Teachers"    value={teachers.length} color={C.accentText}/>
          <StatCard label="Assignments" value={teachers.reduce((a,t)=>a+(t.assignments?.length||0),0)} sub="teacher–class pairs" color={C.success}/>
          <StatCard label="Classes"     value={classList.length} sub={classes.length? "configured":"default Form I–IV, A–C"} color={C.boy}/>
        </div>
        <div style={{display:"flex",justifyContent:"flex-end"}}>
          <span style={{fontSize:12,color:C.muted}}>New teachers appear here automatically once the Head Master creates their User Account - click "Edit" on a row to assign classes.</span>
        </div>
        <Card style={{padding:0}}>
          <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontWeight:700,fontSize:15}}>Teacher Assignment Table</div>
          <Tbl rows={teachers} columns={[
            {key:"short_name",label:"Teacher", render:r=>r.registered_username||r.short_name},
            {key:"subject",   label:"Subject(s)", render:r=><div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{(r.subjects||[r.subject]).map(s=><span key={s} style={{fontWeight:600,color:SUBJ_COLORS[s]||C.accentText}}>{s}</span>)}</div>},
            {key:"classes",   label:"Assigned Classes (subject · periods/week)", render:r=><div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{(r.assignments||[]).map(a=><Badge key={a.id} color="indigo">{[a.form,a.stream].filter(Boolean).join(" ")} · {a.subject} · {a.periods_per_week||4}p</Badge>)}</div>},
            {key:"actions",   label:"", render:r=>(
              <ActionsMenu items={[
                { label:"Edit",   onClick:()=>openEditTeacher(r) },
                { label:"Remove", onClick:()=>removeTeacher(r.id), danger:true },
              ]}/>
            )},
          ]}/>
        </Card>
        <div style={{display:"flex",justifyContent:"flex-end"}}>
          <Btn onClick={()=>setWizardStep(2)} disabled={!teachers.length}>Next: Events & Classes →</Btn>
        </div>

        {showAddTeacher && editTeacher && (
          <Modal wide title={`Edit - ${editTeacher.registered_username||editTeacher.short_name}`} onClose={()=>{setShowAddTeacher(false);setEditTeacher(null);setTForm({short_name:"",subject:"",classes:[]});setError("");}}>
            {error && <Alert type="error" message={error} onClose={()=>setError("")}/>}
            {!editTeacher.registered_username && (
              <Alert type="error" message="This teacher has no linked User Account yet - ask the Head Master to create one for them in User Accounts. Assignments made here won't let this teacher log in, use TAMS, or enter Results until that's done." />
            )}
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:14,marginBottom:20}}>
              <div>
                <SLabel>Teacher (Username, from User Accounts)</SLabel>
                <div style={{padding:"9px 12px",borderRadius:4,border:`1px solid ${C.border}`,background:C.bg,fontSize:13,color:C.text}}>
                  {editTeacher.registered_username ? `@${editTeacher.registered_username}` : editTeacher.short_name}
                </div>
              </div>
              <Inp label="Subject" value={tForm.subject} onChange={v=>setTForm(p=>({...p,subject:v,classes:p.classes.map(c=>({...c,subject:v}))}))}
                options={(editTeacher.registered_subjects?.length ? editTeacher.registered_subjects : (subjects.length?subjects.map(s=>s.name):SUBJECTS)).map(s=>({value:s,label:s}))} required/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <SLabel style={{marginBottom:0}}>Assigned Classes, Subject &amp; Periods/Week - click a class to select ({tForm.classes.length} selected)</SLabel>
              <div style={{display:"flex",gap:8}}>
                <Btn size="sm" variant="ghost" onClick={()=>setShowClassMgr(true)}><span style={{display:"flex",alignItems:"center",gap:6}}><Icon.Layers size={13}/>Manage Classes</span></Btn>
              </div>
            </div>
            <p style={{fontSize:12,color:C.muted,marginTop:-2,marginBottom:10}}>
              If this teacher teaches more than one subject, change the subject dropdown per class below
              (defaults to the main subject above). New subjects are added from User Accounts.
            </p>
            <div style={{display:"grid",gridTemplateColumns:stackCols,gap:8,marginBottom:20}}>
              {classesByForm.map(({form,items})=>(
                <div key={form}>
                  <div style={{fontSize:11,fontWeight:700,color:C.muted,marginBottom:6}}>{form}</div>
                  {items.map(cls=>{
                    const sel=tForm.classes.find(c=>c.cls===cls);
                    return (
                      <div key={cls} style={{display:"flex",flexDirection:"column",gap:3,marginBottom:6}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <div onClick={()=>toggleClass(cls)} style={{flex:1,padding:"7px 10px",borderRadius:4,cursor:"pointer",border:`1px solid ${sel?C.accent:C.border}`,background:sel?C.accentLight:C.bg,color:sel?C.accentText:C.muted,fontWeight:sel?700:400,fontSize:13,userSelect:"none"}}>{cls}</div>
                          {sel && <input type="number" min={1} max={10} value={sel.periods_per_week} onChange={e=>setClassPeriods(cls,e.target.value)} onBlur={e=>clampClassPeriods(cls,e.target.value)} title="Periods per week" style={{width:44,padding:"6px 4px",borderRadius:4,border:`1px solid ${C.border}`,fontSize:12,textAlign:"center"}}/>}
                        </div>
                        {sel && (
                          <select value={sel.subject||tForm.subject} onChange={e=>setClassSubject(cls,e.target.value)} style={{...IS,fontSize:11,padding:"4px 6px"}}>
                            {(subjects.length?subjects.map(s=>s.name):SUBJECTS).map(s=><option key={s} value={s}>{s}</option>)}
                          </select>
                        )}
                      </div>
                    );
                  })}
                  {!items.length && <div style={{fontSize:11,color:C.muted,fontStyle:"italic"}}>No classes yet</div>}
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <Btn variant="secondary" onClick={()=>{setShowAddTeacher(false);setEditTeacher(null);setTForm({short_name:"",subject:"",classes:[]});setError("");}}><span style={{display:"flex",alignItems:"center",gap:6}}><CloseIcon size={13}/>{tr("common.cancel")}</span></Btn>
              <Btn onClick={saveTeacher}><span style={{display:"flex",alignItems:"center",gap:6}}><SaveIcon size={13}/>Save Teacher</span></Btn>
            </div>
          </Modal>
        )}
      </>}

      {/* ── STEP 2 : Events, Day, Time & Class Selection ─────────────────── */}
      {wizardStep===2 && <>
        <Card style={{padding:"16px 20px"}}>
          <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>Special Events</div>
          <p style={{margin:"0 0 14px",fontSize:13,color:C.muted}}>Debate, Subject Club, Religion, Sports and Games, Free Period, etc. - reserved before subjects are placed.</p>
          <div style={{display:"grid",gridTemplateColumns:stackCols,gap:10,marginBottom:10}}>
            <Inp label="Event"  value={evForm.event_type_id} onChange={v=>setEvForm(p=>({...p,event_type_id:v}))} options={eventTypes.map(e=>({value:e.id,label:e.name}))} required/>
            <Inp label="Day"    value={evForm.day}            onChange={v=>setEvForm(p=>({...p,day:v}))}            options={DAYS.map(d=>({value:d,label:d}))} required/>
            <Inp label="From Period"   value={evForm.period_label}   onChange={v=>setEvForm(p=>{
              const fromIdx = lessonPeriods.findIndex(x=>x.label===v);
              const toIdx = lessonPeriods.findIndex(x=>x.label===p.period_label_to);
              return { ...p, period_label:v, period_label_to: toIdx >= fromIdx ? p.period_label_to : v };
            })}   options={lessonPeriods.map(p=>({value:p.label,label:`${p.label} (${p.time})`}))} required/>
            <Inp label="To Period (optional - for a block of periods)" value={evForm.period_label_to} onChange={v=>setEvForm(p=>({...p,period_label_to:v}))} options={lessonPeriods.map(p=>({value:p.label,label:`${p.label} (${p.time})`}))} />
          </div>
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            <input placeholder="+ Add a new event type…" value={newEventName} onChange={e=>setNewEventName(e.target.value)} style={{...IS,flex:1}}/>
            <Btn variant="ghost" onClick={addNewEventType}><span style={{display:"flex",alignItems:"center",gap:6}}><Icon.Plus size={13}/>Add Event Type</span></Btn>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <SLabel style={{marginBottom:0}}>Classes for this event ({evForm.classes.length} selected) - from Teacher Assignment Tables</SLabel>
            <div style={{display:"flex",gap:8}}>
              <Btn size="sm" variant="ghost" onClick={()=>setEvForm(p=>({...p,classes:assignedClassList}))}><span style={{display:"flex",alignItems:"center",gap:6}}><CheckIcon size={13}/>Select All</span></Btn>
              <Btn size="sm" variant="ghost" onClick={()=>setEvForm(p=>({...p,classes:[]}))}><span style={{display:"flex",alignItems:"center",gap:6}}><CloseIcon size={13}/>Clear</span></Btn>
            </div>
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
            {(assignedClassList.length ? assignedClassList : classList).map(cls=>{
              const sel = evForm.classes.includes(cls);
              return <div key={cls} onClick={()=>toggleEvClass(cls)} style={{padding:"5px 10px",borderRadius:4,cursor:"pointer",border:`1px solid ${sel?C.accent:C.border}`,background:sel?C.accentLight:C.bg,color:sel?C.accentText:C.muted,fontWeight:sel?700:400,fontSize:12}}>{cls}</div>;
            })}
            {!assignedClassList.length && <span style={{fontSize:12,color:C.muted,fontStyle:"italic"}}>No classes have a teacher assignment yet - go to Step 1 first.</span>}
          </div>
          <Btn onClick={addScheduledEvent}><span style={{display:"flex",alignItems:"center",gap:6}}><CalendarPlusIcon size={13}/>Schedule Event</span></Btn>

          {!!eventSchedule.length && (
            <div style={{marginTop:18}}>
              <SLabel>Scheduled Events ({ttYear} · {ttTerm})</SLabel>
              <Tbl rows={eventSchedule} columns={[
                {key:"event_name",label:"Event"},
                {key:"day",label:"Day"},
                {key:"period_label",label:"Time"},
                {key:"classes",label:"Classes",render:r=><div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{r.classes.map(c=><Badge key={c} color="purple">{c}</Badge>)}</div>},
                {key:"actions",label:"",render:r=><ActionsMenu items={[{ label:"Remove", onClick:()=>removeScheduledEvent(r.id), danger:true }]}/>},
              ]}/>
            </div>
          )}
        </Card>

        <Card style={{padding:"16px 20px"}}>
          <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>Classes to Generate</div>
          <p style={{margin:"0 0 12px",fontSize:13,color:C.muted}}>Only the classes you select here will appear anywhere in the timetable (incl. the General View) once generated.</p>
          <div style={{display:"flex",gap:10,marginBottom:10}}>
            <Btn size="sm" variant="ghost" onClick={()=>setGenClasses(classList)}><span style={{display:"flex",alignItems:"center",gap:6}}><CheckIcon size={13}/>Select All</span></Btn>
            <Btn size="sm" variant="ghost" onClick={()=>setGenClasses([])}><span style={{display:"flex",alignItems:"center",gap:6}}><CloseIcon size={13}/>Clear</span></Btn>
          </div>
          <div style={{display:"grid",gridTemplateColumns:stackCols,gap:8}}>
            {classesByForm.map(({form,items})=>(
              <div key={form}>
                <div style={{fontSize:11,fontWeight:700,color:C.muted,marginBottom:6}}>{form}</div>
                {items.map(cls=>{
                  const sel=genClasses.includes(cls);
                  return <div key={cls} onClick={()=>toggleGenClass(cls)} style={{padding:"7px 10px",borderRadius:4,marginBottom:5,cursor:"pointer",border:`1px solid ${sel?C.success:C.border}`,background:sel?C.successLight:C.bg,color:sel?C.success:C.muted,fontWeight:sel?700:400,fontSize:13,userSelect:"none"}}>{cls}</div>;
                })}
                {!items.length && <div style={{fontSize:11,color:C.muted,fontStyle:"italic"}}>No classes yet</div>}
              </div>
            ))}
          </div>
        </Card>

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <Btn variant="secondary" onClick={()=>setWizardStep(1)}><span style={{display:"flex",alignItems:"center",gap:6}}><Icon.ArrowLeft size={13}/>Back</span></Btn>
          <Btn variant="success" onClick={generate} loading={generating} disabled={!genClasses.length || genStatus.remaining<=0}>
            {genStatus.remaining<=0 ? `Daily limit reached (${genStatus.max}/${genStatus.max})` : `Generate Timetable  (${genStatus.remaining} of ${genStatus.max} left today)`}
          </Btn>
        </div>
      </>}

      {showPeriodMgr && (
        <Modal title="Manage Periods" onClose={()=>setShowPeriodMgr(false)}>
          <p style={{fontSize:13,color:C.muted,marginBottom:12}}>
            Core periods (P1–P7, plus the break and 13:00–13:30 lunch) are fixed. Afternoon periods from 14:10 onward
            up to 15:30 are optional - add them here if extra lessons are needed on a given day.
          </p>
          <Tbl rows={allPeriods} columns={[
            {key:"label",label:"Label"},
            {key:"time",label:"Time",render:r=>`${r.start_time}–${r.end_time}`},
            {key:"type",label:"Type",render:r=>r.is_break?<Badge color="red">Break</Badge>:r.is_core?<Badge color="blue">Core</Badge>:<Badge color="green">Optional</Badge>},
            {key:"active",label:"Active",render:r=>r.is_active?"Active":"Inactive"},
            {key:"actions",label:"",render:r=>r.is_core?null:(
              <ActionsMenu items={[
                { label: r.is_active?"Disable":"Enable", onClick:()=>togglePeriodActive(r.id) },
                { label:"Delete", onClick:()=>removePeriod(r.id), danger:true },
              ]}/>
            )},
          ]}/>
          <div style={{marginTop:18}}>
            <SLabel>+ Add Optional Afternoon Period</SLabel>
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr 1fr auto",gap:8,alignItems:"end"}}>
              <Inp label="Label" value={periodForm.label} onChange={v=>setPeriodForm(p=>({...p,label:v}))} placeholder="e.g. P8"/>
              <Inp label="Start (HH:MM)" value={periodForm.start_time} onChange={v=>setPeriodForm(p=>({...p,start_time:v}))} placeholder="14:10"/>
              <Inp label="End (HH:MM)" value={periodForm.end_time} onChange={v=>setPeriodForm(p=>({...p,end_time:v}))} placeholder="14:50"/>
              <Btn onClick={addPeriod}><span style={{display:"flex",alignItems:"center",gap:6}}><Icon.Plus size={13}/>Add</span></Btn>
            </div>
          </div>
          <div style={{display:"flex",justifyContent:"flex-end",marginTop:18}}>
            <Btn variant="secondary" onClick={()=>setShowPeriodMgr(false)}><span style={{display:"flex",alignItems:"center",gap:6}}><CloseIcon size={13}/>{tr("common.close")}</span></Btn>
          </div>
        </Modal>
      )}

      {showClassMgr && (
        <Modal title="Manage Classes" onClose={()=>{setShowClassMgr(false);setError("");}}>
          {error && <Alert type="error" message={error} onClose={()=>setError("")}/>}
          <p style={{fontSize:13,color:C.muted,marginBottom:12}}>
            Configure exactly the classes your school has. Leave "Stream" blank if a Form has only one
            single class with no stream split at all (e.g. just "Form I"). Otherwise enter a stream
            letter - you're not limited to A–C, you can add as many as you need (A, B, C, D, E…).
          </p>
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr auto",gap:8,alignItems:"end",marginBottom:18}}>
            <Inp label="Form" value={classForm.form} onChange={v=>setClassForm(p=>({...p,form:v}))} options={FORMS.map(f=>({value:f,label:f}))}/>
            <Inp label="Stream (optional)" value={classForm.stream} onChange={v=>setClassForm(p=>({...p,stream:v}))} placeholder="e.g. A, B, C, D… (blank = no stream)"/>
            <Btn onClick={addClass}><span style={{display:"flex",alignItems:"center",gap:6}}><Icon.Plus size={13}/>Add Class</span></Btn>
          </div>
          {classesByForm.map(({form,items})=>(
            <div key={form} style={{marginBottom:12}}>
              <SLabel>{form}</SLabel>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                {items.length ? items.map(label=>{
                  const cls = classes.find(c=>c.label===label);
                  if (!cls) return null;
                  return (
                    <div key={label} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",borderRadius:4,border:`1px solid ${C.border}`,background:C.bg}}>
                      <span style={{fontSize:13,fontWeight:600}}>{label}</span>
                      <button onClick={()=>removeClass(cls.id)} style={{background:"none",border:"none",cursor:"pointer",color:C.danger,lineHeight:1,display:"flex",alignItems:"center"}}><CloseIcon size={12}/></button>
                    </div>
                  );
                }) : <span style={{fontSize:12,color:C.muted,fontStyle:"italic"}}>No classes configured for {form} yet.</span>}
              </div>
            </div>
          ))}
          <div style={{display:"flex",justifyContent:"flex-end",marginTop:10}}>
            <Btn variant="secondary" onClick={()=>setShowClassMgr(false)}><span style={{display:"flex",alignItems:"center",gap:6}}><CloseIcon size={13}/>{tr("common.close")}</span></Btn>
          </div>
        </Modal>
      )}
      {ConfirmDialogPortal}
    </div>
  );

  // ── Result view ─────────────────────────────────────────────────────────────
  return (
    <div style={{display:"flex",flexDirection:"column",gap:20,padding:isMobile?"16px 12px":isTablet?"24px 20px":32,boxSizing:"border-box",width:"100%"}}>
      <style>{`@media print{body *{visibility:hidden!important}#root{height:0!important;overflow:hidden!important}#tt-print,#tt-print *{visibility:visible!important}#tt-print{position:fixed;left:0;top:0;width:100%;height:auto!important}@page{size:A4 landscape;margin:8mm}}`}</style>
      {viewToggle}

      <div style={{display:"flex",flexDirection:isMobile?"column":"row",justifyContent:"space-between",alignItems:isMobile?"stretch":"flex-start",flexWrap:"wrap",gap:12}}>
        <div>
          <h2 style={{margin:0,fontSize:isMobile?18:22,fontWeight:800,color:C.text}}>School Timetable</h2>
          <p style={{margin:"4px 0 0",color:C.muted,fontSize:isMobile?12.5:14}}>{ttYear} · {ttTerm}{canGenerate && <> · <Badge color={genStatus.remaining>0?"green":"red"}>{genStatus.used}/{genStatus.max} generated today</Badge></>}</p>
        </div>
        <div style={{display:"flex",flexDirection:isMobile?"column":"row",gap:8,flexWrap:"wrap",alignItems:isMobile?"stretch":"center"}}>
          <div style={{display:"flex",gap:8}}>
            {canGenerate && drafts.length>0 && (
              <select value={selectedDraft} onChange={e=>setSelectedDraft(e.target.value)} style={{...IS,width:isMobile?"auto":150,flex:isMobile?1:"none"}}>
                {drafts.map(d=><option key={d} value={d}>{d}</option>)}
              </select>
            )}
            <select value={ttMonth} onChange={e=>setTTMonth(e.target.value)} style={{...IS,width:isMobile?"auto":130,flex:isMobile?1:"none"}}>{MONTHS.map(m=><option key={m}>{m}</option>)}</select>
          </div>
          {!canGenerate ? null : (isMobile || isTablet) ? (
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              {selectedDraft
                ? (sharedInfo?.shared && sharedInfo?.draft_label===selectedDraft
                    ? <Btn variant="warning" onClick={unshareTimetable} style={{flex:1,justifyContent:"center"}}><span style={{display:"flex",alignItems:"center",gap:6}}><Icon.EyeOff size={13}/>Acha Ku-share</span></Btn>
                    : <Btn variant="primary" onClick={openSharePicker} style={{flex:1,justifyContent:"center"}}><span style={{display:"flex",alignItems:"center",gap:6}}><Icon.UploadCloud size={13}/>Share kwa Walimu</span></Btn>)
                : <Btn variant="ghost" onClick={()=>{setView("setup");setWizardStep(2);}} disabled={genStatus.remaining<=0} style={{flex:1,justifyContent:"center"}}><span style={{display:"flex",alignItems:"center",gap:6}}><Icon.RefreshCw size={13}/>Generate New Draft ({genStatus.remaining} left)</span></Btn>
              }
              <MoreMenu items={[
                { label: editMode?"Exit Edit Mode":"Edit Cells", onClick: ()=>setEditMode(p=>!p) },
                { label: `Generate New Draft (${genStatus.remaining} left)`, onClick: ()=>{setView("setup");setWizardStep(2);}, disabled: genStatus.remaining<=0 },
                { label: "Back to Setup", onClick: ()=>{setView("setup");setWizardStep(2);setEditMode(false);} },
                ...(selectedDraft ? [{ label: "Delete This Draft", onClick: deleteSelectedDraft, variant: "danger" }] : []),
              ]}/>
            </div>
          ) : (<>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <Btn variant={editMode?"warning":"ghost"} onClick={()=>setEditMode(p=>!p)}><span style={{display:"flex",alignItems:"center",gap:6}}><Icon.Edit size={13}/>{editMode?"Exit Edit":"Edit"}</span></Btn>
            <Btn variant="secondary" onClick={()=>{setView("setup");setWizardStep(2);setEditMode(false);}}><span style={{display:"flex",alignItems:"center",gap:6}}><Icon.ArrowLeft size={13}/>Back to Setup</span></Btn>
          </div>
          <Btn variant="ghost" onClick={()=>{setView("setup");setWizardStep(2);}} disabled={genStatus.remaining<=0}><span style={{display:"flex",alignItems:"center",gap:6}}><Icon.RefreshCw size={13}/>Generate New Draft ({genStatus.remaining} left)</span></Btn>
          {selectedDraft && (sharedInfo?.shared && sharedInfo?.draft_label===selectedDraft
            ? <Btn variant="warning" onClick={unshareTimetable}><span style={{display:"flex",alignItems:"center",gap:6}}><Icon.EyeOff size={13}/>Acha Ku-share</span></Btn>
            : <Btn variant="secondary" onClick={openSharePicker}><span style={{display:"flex",alignItems:"center",gap:6}}><Icon.UploadCloud size={13}/>Share kwa Walimu</span></Btn>
          )}
          {selectedDraft && <Btn variant="danger" onClick={deleteSelectedDraft}><span style={{display:"flex",alignItems:"center",gap:6}}><Icon.Trash size={13}/>Delete This Draft</span></Btn>}
          </>)}
        </div>
      </div>
      {!canGenerate && (
        <p style={{margin:0,fontSize:12,color:C.muted}}>
          {sharedInfo===null ? "Inapakia..." : sharedInfo.shared
            ? <>Timetable iliyoshirikiwa: <strong>{sharedInfo.draft_label}</strong></>
            : "Hakuna Timetable iliyoshirikiwa na Admin/Academic Master bado."}
        </p>
      )}
      {canGenerate && selectedDraft && <p style={{margin:0,fontSize:12,color:C.muted}}>Viewing: <strong>{selectedDraft}</strong></p>}

      {error   && <Alert type="error"   message={error}   onClose={()=>setError("")}/>}
      {success && <Alert type="success" message={success} onClose={()=>setSuccess("")}/>}
      {editMode && <Alert type="success" message="Edit mode ON - click any cell to modify it."/>}

      {(canGenerate || sharedInfo?.shared) && (<>
      {(isMobile || isTablet) ? (
        <div style={{display:"flex",gap:4,background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,padding:4}}>
          {[["class","Per Class"],["master","General View"],["teacher","Per Teacher"]].map(([id,label])=>(
            <button key={id} onClick={()=>setViewTab(id)} style={{flex:1,whiteSpace:"nowrap",padding:"9px 6px",border:"none",borderRadius:4,background:viewTab===id?C.accent:"transparent",fontWeight:viewTab===id?700:600,color:viewTab===id?"#fff":C.muted,cursor:"pointer",fontSize:12.5,transition:"background 0.15s,color 0.15s"}}>{label}</button>
          ))}
        </div>
      ) : (
        <div style={{display:"flex",gap:0,borderBottom:`1px solid ${C.border}`}}>
          {[["class","Per Class"],["master","General View"],["teacher","Per Teacher"]].map(([id,label])=>(
            <button key={id} onClick={()=>setViewTab(id)} style={{flex:"none",whiteSpace:"nowrap",padding:"9px 20px",border:"none",borderBottom:viewTab===id?`3px solid ${C.accent}`:"3px solid transparent",background:"transparent",fontWeight:viewTab===id?700:500,color:viewTab===id?C.accentText:C.muted,cursor:"pointer",fontSize:14}}>{label}</button>
          ))}
        </div>
      )}

      {viewTab==="class" && (
        <>
          <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
            <span style={{fontSize:13,fontWeight:600,color:C.muted}}>Class:</span>
            <select value={viewClass} onChange={e=>setViewClass(e.target.value)} style={{...IS,width:isMobile?"100%":160,flex:isMobile?"1 1 100%":"none"}}>{classList.map(c=><option key={c}>{c}</option>)}</select>
            <Btn size="sm" variant="secondary" loading={exportingPdf} style={isMobile?{flex:"1 1 100%",justifyContent:"center"}:{}} onClick={()=>requestDraftLabel(
              "Choose the Draft to Print",
              `Choose which draft should appear on the ${viewClass} PDF.`,
              (label) => {
                const { form, stream } = classFormStream(viewClass);
                downloadPdf(`/timetable/pdf/class?form=${encodeURIComponent(form)}&stream=${encodeURIComponent(stream)}&academic_year=${ttYear}&term=${encodeURIComponent(ttTerm)}&draft=${encodeURIComponent(label)}`, `${viewClass}-${label}-timetable.pdf`);
              }
            )}>Export PDF</Btn>
          </div>
          <Card style={{padding:0}}>
            <div style={{padding:isMobile?"11px 14px":"13px 18px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:6}}>
              <span style={{fontWeight:700,fontSize:isMobile?13.5:15}}>{viewClass} - Weekly Timetable</span>
              <span style={{fontSize:12,color:C.muted}}>{ttMonth} {ttYear}</span>
            </div>
            <WeekGrid renderCell={(d,p)=><CellView cls={viewClass} day={d} period={p} compact={isMobile||isTablet}/>}/>
          </Card>
          <TimetableFooterNote/>
        </>
      )}

      {viewTab==="master" && (
        <>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
            <span style={{fontSize:13,fontWeight:600,color:C.muted}}>Ratiba ya Jumla - jedwali tano (5), moja kwa kila siku, likiwa na madarasa yote.</span>
            <Btn size="sm" variant="secondary" loading={exportingPdf} style={isMobile?{width:"100%",justifyContent:"center"}:{}} onClick={()=>requestDraftLabel(
              "Choose the Draft to Print",
              "Choose which draft should appear on the General School Timetable PDF.",
              (label) => downloadPdf(`/timetable/pdf/master?academic_year=${ttYear}&term=${encodeURIComponent(ttTerm)}&draft=${encodeURIComponent(label)}`, `general-school-timetable-${label}.pdf`)
            )}>Export PDF (All Classes)</Btn>
          </div>
          <Card style={{padding:isMobile?"14px 16px":"16px 20px"}}>
            <div style={{textAlign:"center",lineHeight:1.8}}>
              <div style={{fontWeight:800,fontSize:isMobile?13.5:15}}>{SCHOOL.line1}</div>
              <div style={{fontWeight:700,fontSize:isMobile?12.5:14}}>{SCHOOL.line2}</div>
              <div style={{fontWeight:700,fontSize:isMobile?12.5:14,color:C.accentText}}>{SCHOOL.line3}</div>
              <div style={{fontWeight:600,fontSize:isMobile?12:13}}>{SCHOOL.line4}</div>
              <div style={{fontSize:12,color:C.muted,marginTop:4}}>{ttMonth} {ttYear} · {ttTerm}</div>
              {!masterClasses && <div style={{fontSize:11,color:C.warning,marginTop:6}}>No timetable generated yet for this year/term.</div>}
            </div>
          </Card>

          {/* General View: exactly FIVE tables total - one per Day - each
              showing every class's schedule that day (Class rows, Period
              columns), so the whole school's timetable per day is in one
              place. */}
          <MasterDayGrid rows={masterRows}/>
          <TimetableFooterNote/>
        </>
      )}

      {viewTab==="teacher" && (
        <>
          <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
            <span style={{fontSize:13,fontWeight:600,color:C.muted}}>Teacher:</span>
            {myTeacherLabel ? (
              <strong style={{fontSize:13.5,color:C.text}}>{myTeacherLabel}</strong>
            ) : (
              <select value={viewTeacher} onChange={e=>setViewTeacher(e.target.value)} style={{...IS,width:isMobile?"100%":200,flex:isMobile?"1 1 100%":"none"}}>
                <option value="">Select teacher…</option>
                {teachers.map(t=><option key={t.id} value={t.registered_username||t.short_name}>{t.registered_username||t.short_name}</option>)}
              </select>
            )}
            {viewTeacher && <Btn size="sm" variant="secondary" loading={exportingPdf} style={isMobile?{flex:"1 1 100%",justifyContent:"center"}:{}} onClick={()=>requestDraftLabel(
              "Choose the Draft to Print",
              `Choose which draft should appear on the ${viewTeacher} PDF.`,
              (label) => {
                const t = teachers.find(t=>(t.registered_username||t.short_name)===viewTeacher);
                if (t) downloadPdf(`/timetable/pdf/teacher/${t.id}?academic_year=${ttYear}&term=${encodeURIComponent(ttTerm)}&draft=${encodeURIComponent(label)}`, `${viewTeacher}-${label}-timetable.pdf`);
              }
            )}>Export PDF</Btn>}
          </div>
          {viewTeacher && (
            <Card style={{padding:0}}>
              <div style={{padding:isMobile?"11px 14px":"13px 18px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6}}>
                <span style={{fontWeight:700,fontSize:isMobile?13.5:15}}>{viewTeacher} - Weekly Timetable</span>
                <span style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                  <Badge color="indigo">{countTeacherWeeklyPeriods(viewTeacher)} periods per week</Badge>
                  <span style={{fontSize:12,color:C.muted}}>{ttMonth} {ttYear}</span>
                </span>
              </div>
                <WeekGrid renderCell={(d,p)=>{
                let found=null;
                classList.forEach(cls=>{const c=ttMap[cls]?.[d]?.[p.label];if(c&&c.teacher_name===viewTeacher)found={...c,cls};});
                const sc=found?SUBJ_COLORS[found.subject]||C.accentText:null;
                const compact=isMobile||isTablet;
                return found
                  ?<div style={{background:`color-mix(in srgb, ${sc} 8%, transparent)`,border:`1px solid color-mix(in srgb, ${sc} 25%, transparent)`,borderRadius:4,padding:compact?"3px 5px":"6px 8px"}}><div style={{fontWeight:700,color:sc,fontSize:compact?9.5:11}}>{found.subject}</div><div style={{fontSize:compact?8.5:10,color:C.muted,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{found.cls}</div></div>
                  :<div style={{height:compact?28:38,display:"flex",alignItems:"center",justifyContent:"center",color:"#E2E8F0",fontSize:compact?9.5:11}}>-</div>;
              }}/>
            </Card>
          )}
          {viewTeacher && <TimetableFooterNote/>}
        </>
      )}
      </>)}

      {editingCell && (
        <Modal title={`Edit - ${editingCell.cls} · ${editingCell.day} · ${editingCell.period.label}`} onClose={()=>setEditingCell(null)}>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <Inp label="Subject" value={editCellForm.subject} onChange={v=>setEditCellForm(p=>({...p,subject:v}))} options={(subjects.length?subjects.map(s=>s.name):SUBJECTS).map(s=>({value:s,label:s}))} required/>
            <Inp label="Teacher" value={editCellForm.teacher_id && editCellForm.subject ? `${editCellForm.teacher_id}|${editCellForm.subject}` : ""} onChange={v=>{ const [tid,subj]=v.split("|"); setEditCellForm(p=>({...p,teacher_id:tid,subject:subj||p.subject})); }}
              options={teachers.flatMap(t=>{
                const label = t.registered_username || t.short_name;
                const subs = (t.subjects && t.subjects.length ? t.subjects : [t.subject]).filter(Boolean);
                // A teacher who teaches more than one subject appears once PER
                // subject (e.g. "MR.BEYENGA - BIOLOGY" and "MR.BEYENGA - CHEMISTRY")
                // so picking one sets both the teacher AND the correct subject.
                return subs.map(s=>({ value:`${t.id}|${s}`, label:`${label} - ${s}` }));
              })}/>
          </div>
          <div style={{display:"flex",gap:10,marginTop:20,justifyContent:"space-between"}}>
            <Btn variant="danger" onClick={clearEditCell}><span style={{display:"flex",alignItems:"center",gap:6}}><CloseIcon size={13}/>Clear Cell</span></Btn>
            <div style={{display:"flex",gap:10}}><Btn variant="secondary" onClick={()=>setEditingCell(null)}><span style={{display:"flex",alignItems:"center",gap:6}}><CloseIcon size={13}/>{tr("common.cancel")}</span></Btn><Btn onClick={saveEditCell}><span style={{display:"flex",alignItems:"center",gap:6}}><SaveIcon size={13}/>Save</span></Btn></div>
          </div>
        </Modal>
      )}

      {draftPicker && (
        <Modal title={draftPicker.title} onClose={()=>setDraftPicker(null)}>
          <p style={{fontSize:13,color:C.muted,marginBottom:14,lineHeight:1.5}}>{draftPicker.hint}</p>
          <Inp label="Draft" value={draftPicker.label} onChange={v=>setDraftPicker(p=>({...p,label:v}))}
            options={(drafts.length?drafts:DRAFT_LABELS).map(d=>({value:d,label:d}))}/>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:20}}>
            <Btn variant="secondary" onClick={()=>setDraftPicker(null)}><span style={{display:"flex",alignItems:"center",gap:6}}><CloseIcon size={13}/>Ghairi</span></Btn>
            <Btn onClick={()=>{ const { label, run } = draftPicker; setDraftPicker(null); run(label); }}><span style={{display:"flex",alignItems:"center",gap:6}}><CheckIcon size={13}/>Endelea</span></Btn>
          </div>
        </Modal>
      )}
      {ConfirmDialogPortal}
    </div>
  );
}

// ─── Room card (Girls Hostel) - each card tracks its own hover state so the
// one the user is pointing at lifts/highlights, making it easy to tell rooms
// apart at a glance. ──────────────────────────────────────────────────────
function RoomCard({ room, occ, full, free, hc, hb, C, fullNameOf, onEditBeds, onDeleteRoom, onHistory, onRemoveOcc, onDeleteOccPermanent, onAdmit }) {
  const [hover, setHover] = useState(false);
  return (
    <Card
      style={{
        padding: 0,
        transition: "transform .15s ease, box-shadow .15s ease, border-color .15s ease",
        transform: hover ? "translateY(-3px)" : "translateY(0)",
        boxShadow: hover ? `0 10px 24px ${hc}26` : "none",
        borderColor: hover ? hc : C.border,
        cursor: "default",
      }}
      onMouseEnter={()=>setHover(true)}
      onMouseLeave={()=>setHover(false)}
      onTouchStart={()=>setHover(true)}
      onTouchEnd={()=>setHover(false)}
    >
      <div style={{padding:"13px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontWeight:700,fontSize:15,color:hover?hc:C.text}}>{room.room_number}</div>
          <div style={{fontSize:12,color:C.muted}}>Capacity: {room.capacity} beds</div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <Badge color={full?"red":free<=2?"amber":hb}>{full?"Full":`${free} free`}</Badge>
          <ActionsMenu items={[
            { label:"Edit Beds", onClick:onEditBeds },
            occ.length===0 ? { label:"Delete Room", onClick:onDeleteRoom, danger:true } : null,
          ]}/>
        </div>
      </div>
      <div style={{padding:"12px 16px"}}>
        <div style={{display:"grid",gridTemplateColumns:`repeat(${room.capacity},1fr)`,gap:5,marginBottom:12}}>
          {Array.from({length:room.capacity}).map((_,i)=>{
            const o=occ[i];
            return <div key={i} title={o?fullNameOf(o):"Empty"} style={{height:28,borderRadius:4,background:o?hc+"18":C.bg,border:`1px solid ${o?hc+"50":C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:o?hc:C.muted}}>
              {o?o.first_name.slice(0,3).toUpperCase():"-"}
            </div>;
          })}
        </div>
        {occ.map(o=>(
          <div key={o.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:13,padding:"6px 0",borderBottom:`1px solid ${C.border}`}}>
            <div>
              <div style={{fontWeight:600}}>{fullNameOf(o)}</div>
              <div style={{fontSize:11,color:C.muted}}>{o.form} · {o.admitted_date?.slice(0,10)}</div>
            </div>
            <ActionsMenu items={[
              { label:"History", onClick:()=>onHistory(o) },
              { label:"Remove (Departed)",  onClick:()=>onRemoveOcc(o.id), danger:true },
              { label:"Delete Registration (Mistake)", onClick:()=>onDeleteOccPermanent(o.id), danger:true },
            ]}/>
          </div>
        ))}
        {!full && <Btn size="sm" variant="ghost" style={{marginTop:10,width:"100%"}} onClick={onAdmit}><span style={{display:"flex",alignItems:"center",gap:6}}><Icon.UserPlus size={13}/>Admit Student</span></Btn>}
      </div>
    </Card>
  );
}

// ─── HOSTEL MODULE ────────────────────────────────────────────────────────────
function HostelModule({ token, isHistoryOnly, canDeletePermanent }) {
  const { isMobile, isTablet } = useBreakpoint();
  const isCompact = isMobile || isTablet;
  const { confirm, ConfirmDialogPortal } = useConfirm();
  const [pageTab, setPageTab] = useState(isHistoryOnly ? "history" : "maladhi"); // maladhi | fees | history
  const [rooms, setRooms]         = useState([]);
  const [boys, setBoys]           = useState([]);
  const [stats, setStats]         = useState([]);
  const [disc, setDisc]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [selHostel, setSelHostel] = useState("Girls Hostel");

  const [assignModal, setAssignModal] = useState(null);   // room object (Girls) or "boys" (Boys)
  const [af, setAf] = useState({ student_id:"", studentLabel:"", admitted_date:"" });
  const [studentSearch, setStudentSearch] = useState("");
  const [studentResults, setStudentResults] = useState([]);
  const [studentSearching, setStudentSearching] = useState(false);

  const [roomModal, setRoomModal] = useState(null); // null | "add" | room object (edit)
  const [roomForm, setRoomForm]   = useState({ room_number:"", capacity:6 });

  const [contribModal, setContribModal] = useState(null); // occupant
  const [contribs, setContribs]         = useState([]);
  const [cf, setCf] = useState({ term:"Term I", academic_year:CURRENT_YEAR, maize_kg:"", vegetable_type:"", vegetables_kg:"", oil_litres:"", salt_kg:"", other_item:"", other_qty:"", hostel_fee:"", owes:false, comment:"" });

  const [historyModal, setHistoryModal] = useState(null); // occupant
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [discModal, setDiscModal] = useState(false);
  const [df, setDf] = useState({ student_name:"", hostel_name:"Girls Hostel", room_number:"", severity:"Minor", issue:"", action_taken:"", incident_date:"" });

  const [exportingPdf, setExportingPdf] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const calls = [ apiFetch("/hostel/stats", {}, token), apiFetch(`/hostel/discipline?hostel=${encodeURIComponent(selHostel)}`, {}, token) ];
      if (selHostel === "Girls Hostel") calls.push(apiFetch(`/hostel/rooms?hostel=${encodeURIComponent(selHostel)}`, {}, token));
      else calls.push(apiFetch("/hostel/boys", {}, token));
      const [sRes, dRes, thirdRes] = await Promise.all(calls);
      setStats(sRes.data); setDisc(dRes.data);
      if (selHostel === "Girls Hostel") setRooms(thirdRes.data); else setBoys(thirdRes.data);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [token, selHostel]);

  useEffect(() => { load(); }, [load]);

  // ── Admission ────────────────────────────────────────────────────────────
  const assign = async () => {
    if (!af.student_id) { setError("Search and select an enrolled student first."); return; }
    setSaving(true);
    try {
      const body = { student_id: af.student_id, admitted_date: af.admitted_date };
      if (assignModal === "boys") await apiFetch("/hostel/boys", { method:"POST", body }, token);
      else await apiFetch(`/hostel/rooms/${assignModal.id}/assign`, { method:"POST", body }, token);
      setSuccess("Student admitted."); setAssignModal(null);
      setAf({ student_id:"", studentLabel:"", admitted_date:"" });
      setStudentSearch(""); setStudentResults([]);
      load();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  // ── Enrolled-student search (Hostel can only admit students who already
  // exist in Student Management - no free-text name typing allowed) ────────
  const searchStudents = useCallback(async (q) => {
    if (!q || q.trim().length < 2) { setStudentResults([]); return; }
    setStudentSearching(true);
    try {
      const r = await apiFetch(`/students?search=${encodeURIComponent(q.trim())}`, {}, token);
      setStudentResults(r.data);
    } catch (err) { setError(err.message); }
    finally { setStudentSearching(false); }
  }, [token]);

  // "Remove" = the student genuinely left the hostel (Departed). This is a
  // soft delete - by design they keep showing up in History forever as
  // "Departed", which is the correct permanent admission record.
  const removeOcc = occupantId => {
    confirm("Remove this student from the hostel? They will still appear in History as 'Departed' (this is a real departure record).", async () => {
      try { await apiFetch(`/hostel/occupants/${occupantId}`, { method:"DELETE" }, token); load(); }
      catch (err) { setError(err.message); }
    });
  };

  // "Delete Registration (Mistake)" = the registration itself was an error
  // (wrong student picked, duplicate entry) and should never have existed.
  // This permanently erases the record (history/contributions included) so
  // it stops lingering in History, and doesn't leave a duplicate behind if
  // the same student is then correctly re-registered.
  const deleteOccPermanent = occupantId => {
    confirm("Delete this registration completely? Use this ONLY if the student was registered by mistake. This cannot be undone and the record will disappear from History entirely (unlike 'Remove', which keeps a Departed record).", async () => {
      try { await apiFetch(`/hostel/occupants/${occupantId}/permanent`, { method:"DELETE" }, token); load(); }
      catch (err) { setError(err.message); }
    });
  };

  // ── Rooms & Beds (Girls Hostel only) ────────────────────────────────────────
  const saveRoom = async () => {
    const capacityNum = parseInt(roomForm.capacity, 10);
    if (!roomForm.room_number || !roomForm.capacity || !Number.isFinite(capacityNum) || capacityNum < 1) {
      setError("Room number and bed count required."); return;
    }
    const body = { ...roomForm, capacity: capacityNum };
    try {
      if (roomModal === "add") await apiFetch("/hostel/rooms", { method:"POST", body:{ hostel_name:"Girls Hostel", ...body } }, token);
      else await apiFetch(`/hostel/rooms/${roomModal.id}`, { method:"PUT", body }, token);
      setRoomModal(null); setRoomForm({ room_number:"", capacity:6 });
      setSuccess("Room saved."); load();
    } catch (err) { setError(err.message); }
  };

  const removeRoom = id => {
    confirm("Delete this room? (Only possible if it has no residents.)", async () => {
      try { await apiFetch(`/hostel/rooms/${id}`, { method:"DELETE" }, token); load(); }
      catch (err) { setError(err.message); }
    });
  };

  // ── Contributions ────────────────────────────────────────────────────────
  const openContrib = async occ => {
    setContribModal(occ);
    try { const r = await apiFetch(`/hostel/occupants/${occ.id}/contributions`, {}, token); setContribs(r.data); }
    catch (err) { setError(err.message); }
  };
  const addContrib = async () => {
    setSaving(true);
    try {
      await apiFetch(`/hostel/occupants/${contribModal.id}/contributions`, { method:"POST", body:cf }, token);
      setCf({ term:"Term I", academic_year:CURRENT_YEAR, maize_kg:"", vegetable_type:"", vegetables_kg:"", oil_litres:"", salt_kg:"", other_item:"", other_qty:"", hostel_fee:"", owes:false, comment:"" });
      const r = await apiFetch(`/hostel/occupants/${contribModal.id}/contributions`, {}, token); setContribs(r.data);
      setSuccess("Contribution recorded.");
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };
  const removeContrib = async id => {
    try { await apiFetch(`/hostel/contributions/${id}`, { method:"DELETE" }, token);
      const r = await apiFetch(`/hostel/occupants/${contribModal.id}/contributions`, {}, token); setContribs(r.data);
    } catch (err) { setError(err.message); }
  };

  // ── History ──────────────────────────────────────────────────────────────
  const openHistory = async occ => {
    setHistoryModal(occ); setHistory([]); setHistoryLoading(true);
    try { const r = await apiFetch(`/hostel/occupants/${occ.id}/history`, {}, token); setHistory(r.data); }
    catch (err) { setError(err.message); }
    finally { setHistoryLoading(false); }
  };

  // ── Discipline ───────────────────────────────────────────────────────────
  const addDisc = async () => {
    if (!df.student_name||!df.issue) { setError("Name and issue required."); return; }
    setSaving(true);
    try {
      await apiFetch("/hostel/discipline", { method:"POST", body:df }, token);
      setSuccess("Record saved."); setDiscModal(false);
      setDf({ student_name:"", hostel_name:"Girls Hostel", room_number:"", severity:"Minor", issue:"", action_taken:"", incident_date:"" });
      load();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  // ── PDF ──────────────────────────────────────────────────────────────────
  const downloadPdf = async (path, filename) => {
    setExportingPdf(true);
    try {
      const res = await fetch(`${API_BASE}${path}`, { headers: token ? { Authorization:`Bearer ${token}` } : {} });
      if (!res.ok) throw new Error(tr("lg.couldNotPdf"));
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) { setError(err.message); }
    finally { setExportingPdf(false); }
  };

  const hc = selHostel==="Girls Hostel" ? C.girl : C.boy;
  const hb = selHostel==="Girls Hostel" ? "purple" : "blue";
  const hStats    = stats.find(s=>s.hostel_name===selHostel)||{ total_beds:0, occupied:0 };
  const girlStats = stats.find(s=>s.hostel_name==="Girls Hostel")||{ occupied:0, total_beds:0 };
  const boyStats  = stats.find(s=>s.hostel_name==="Boys Hostel")||{ occupied:0 };
  const pct = hStats.total_beds ? Math.round((hStats.occupied||0)/hStats.total_beds*100) : 0;
  const fullNameOf = o => [o.first_name,o.middle_name,o.last_name].filter(Boolean).join(" ");

  const hostelTabs = [
    ["maladhi", "Accommodation", BedIcon],
    ["fees", "Hostel Fees", ReceiptIcon],
    ["history", "History", ClockIcon],
  ];

  return (
    <div style={{display:"flex",flexDirection:"column",gap:20,padding:isMobile?"16px 12px":isTablet?"24px 20px":32,boxSizing:"border-box",width:"100%"}}>
      <div>
        <h2 style={{margin:0,fontSize:isMobile?18:22,fontWeight:800,color:C.text}}>Hostel Management</h2>
        {isHistoryOnly && <p style={{margin:"4px 0 0",color:C.muted,fontSize:isMobile?12.5:13}}>Read-only view - admission and fee collection are handled by the Matron/Patron.</p>}
      </div>
      {!isHistoryOnly && (
        isCompact ? (
          <div style={{display:"grid",gridTemplateColumns:"repeat(3, 1fr)",gap:8}}>
            {hostelTabs.map(([key,label,Icon])=>{
              const active = pageTab===key;
              return (
                <button key={key} onClick={()=>setPageTab(key)} style={{
                  display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,
                  padding:"12px 6px 10px",borderRadius:4,cursor:"pointer",textAlign:"center",
                  border:active?`1px solid ${C.accent}`:`1px solid ${C.border}`,
                  background:active?C.accent:"#fff",
                  boxShadow:active?"0 4px 14px rgba(15,23,42,0.18)":"0 1px 3px rgba(15,23,42,0.05)",
                }}>
                  <span style={{display:"flex",alignItems:"center",justifyContent:"center",width:28,height:28,borderRadius:"50%",background:active?"rgba(255,255,255,0.18)":C.bg,color:active?"#fff":C.accentText}}><Icon size={15}/></span>
                  <span style={{fontSize:11,fontWeight:700,lineHeight:1.2,color:active?"#fff":C.text}}>{label}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {hostelTabs.map(([key,label,Icon])=>{
              const active = pageTab===key;
              return (
                <button key={key} onClick={()=>setPageTab(key)} style={{
                  display:"inline-flex",alignItems:"center",gap:7,padding:"9px 18px",borderRadius:4,
                  border:active?"none":`1px solid ${C.border}`,background:active?C.accent:"#fff",
                  color:active?"#fff":C.text,fontWeight:600,fontSize:13,cursor:"pointer",
                }}><Icon size={14}/>{label}</button>
              );
            })}
          </div>
        )
      )}

      {pageTab==="fees" && !isHistoryOnly && <HostelFeesTab token={token} />}
      {(pageTab==="history" || isHistoryOnly) && <HostelHistoryTab token={token} canDeletePermanent={canDeletePermanent} />}

      {pageTab==="maladhi" && !isHistoryOnly && (
      <div style={{display:"flex",flexDirection:"column",gap:20}}>
      <div style={{display:"flex",flexDirection:isMobile?"column":"row",justifyContent:"space-between",alignItems:isMobile?"stretch":"flex-start",flexWrap:"wrap",gap:12}}>
        <div>
          <h2 style={{margin:0,fontSize:isMobile?17:22,fontWeight:800,color:C.text}}>Accommodation</h2>
          <p style={{margin:"4px 0 0",color:C.muted,fontSize:isMobile?12.5:14}}>Room/bed allocation (Girls) · Hall (Boys) · discipline</p>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",flexDirection:isMobile?"column":"row"}}>
          <Btn variant="secondary" loading={exportingPdf} onClick={()=>downloadPdf(`/hostel/pdf?hostel=${encodeURIComponent(selHostel)}`, `${selHostel}-residents.pdf`)} style={isMobile?{width:"100%",justifyContent:"center"}:{}}><span style={{display:"flex",alignItems:"center",gap:6}}><DownloadIcon size={14}/>Export PDF</span></Btn>
          <Btn variant="ghost" onClick={()=>setDiscModal(true)} style={isMobile?{width:"100%",justifyContent:"center"}:{}}><span style={{display:"flex",alignItems:"center",gap:6}}><ShieldIcon size={14}/>Discipline Record</span></Btn>
        </div>
      </div>

      {error   && <Alert type="error"   message={error}   onClose={()=>setError("")}/>}
      {success && <Alert type="success" message={success} onClose={()=>setSuccess("")}/>}

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:14}}>
        <StatCard label="Girls Hostel Beds" value={girlStats.total_beds||0} color={C.girl}/>
        <StatCard label="Girls Residents"   value={girlStats.occupied||0}  sub="in rooms" color={C.girl}/>
        <StatCard label="Boys Hostel (Hall)" value={boyStats.occupied||0}  sub="residents - no room count" color={C.boy}/>
      </div>

      <div style={{display:"flex",gap:0,borderBottom:`1px solid ${C.border}`}}>
        {HOSTELS.map(h=>{const sel=selHostel===h;const col=h==="Girls Hostel"?C.girl:C.boy;return(
          <button key={h} onClick={()=>setSelHostel(h)} style={{padding:"9px 22px",border:"none",borderBottom:sel?`3px solid ${col}`:"3px solid transparent",background:"transparent",fontWeight:sel?700:500,fontSize:14,color:sel?col:C.muted,cursor:"pointer"}}>{h}</button>
        );})}
      </div>

      {selHostel==="Girls Hostel" ? (
        <>
          <Card style={{padding:16}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8,fontSize:13,fontWeight:600}}>
              <span>Girls Hostel Occupancy</span>
              <span style={{color:hc}}>{hStats.occupied||0}/{hStats.total_beds||0} ({pct}%)</span>
            </div>
            <div style={{background:C.border,borderRadius:4,height:10}}>
              <div style={{background:hc,width:`${pct}%`,height:"100%",borderRadius:4,transition:"width .4s"}}/>
            </div>
          </Card>

          <div style={{display:"flex",justifyContent:"flex-end"}}>
            <Btn variant="ghost" onClick={()=>{setRoomForm({room_number:"",capacity:6});setRoomModal("add");}} style={isMobile?{width:"100%",justifyContent:"center"}:{}}><span style={{display:"flex",alignItems:"center",gap:6}}><BedIcon size={14}/>Add Room</span></Btn>
          </div>

          {loading ? <div style={{padding:40,textAlign:"center",color:C.muted,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><SpinnerIcon size={16} />{tr("lg.loading")}</div> : (
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:16}}>
              {rooms.map(room=>{
                const occ  = room.occupants||[];
                const free = room.capacity - occ.length;
                const full = free === 0;
                return (
                  <RoomCard
                    key={room.id}
                    room={room} occ={occ} full={full} free={free}
                    hc={hc} hb={hb} C={C} fullNameOf={fullNameOf}
                    onEditBeds={()=>{setRoomForm({room_number:room.room_number,capacity:room.capacity});setRoomModal(room);}}
                    onDeleteRoom={()=>removeRoom(room.id)}
                    onHistory={openHistory}
                    onRemoveOcc={removeOcc}
                    onDeleteOccPermanent={deleteOccPermanent}
                    onAdmit={()=>{setAf({student_id:"",studentLabel:"",admitted_date:""});setStudentSearch("");setStudentResults([]);setAssignModal(room);}}
                  />
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <Card style={{padding:16}}>
            <div style={{fontSize:13,color:C.muted}}>
              Due to the lack of a boys' hostel, a classroom has been converted into temporary
              accommodation for male students to allow them to stay near the school. This simply
              tracks current residents and their admission dates.
            </div>
          </Card>
          <div style={{display:"flex",justifyContent:"flex-end"}}>
            <Btn onClick={()=>{setAf({student_id:"",studentLabel:"",admitted_date:""});setStudentSearch("");setStudentResults([]);setAssignModal("boys");}} style={isMobile?{width:"100%",justifyContent:"center"}:{}}><span style={{display:"flex",alignItems:"center",gap:6}}><CalendarPlusIcon size={14}/>Admit to Boarding Facility</span></Btn>
          </div>
          <Card style={{padding:0}}>
            <Tbl loading={loading} rows={boys} columns={[
              {key:"name", label:"Full Name", render:r=>fullNameOf(r)},
              {key:"form", label:tr("lg.form")},
              {key:"admitted_date", label:"Admitted", render:r=>r.admitted_date?.slice(0,10)},
              {key:"actions", label:"", render:r=>(
                <ActionsMenu items={[
                  { label:"History",       onClick:()=>openHistory(r) },
                  { label:"PDF",           onClick:()=>downloadPdf(`/hostel/occupants/${r.id}/pdf`, `${fullNameOf(r)}.pdf`) },
                  { label:"Remove (Departed)", onClick:()=>removeOcc(r.id), danger:true },
                  { label:"Delete Registration (Mistake)", onClick:()=>deleteOccPermanent(r.id), danger:true },
                ]}/>
              )},
            ]}/>
          </Card>
        </>
      )}

      <Card>
        <div style={{display:"flex",flexDirection:isMobile?"column":"row",justifyContent:"space-between",alignItems:isMobile?"stretch":"center",gap:10,marginBottom:14}}>
          <h3 style={{margin:0,fontSize:16,fontWeight:700}}>Discipline Records</h3>
          <Btn size="sm" variant="secondary" loading={exportingPdf} onClick={()=>downloadPdf(`/hostel/discipline/pdf?hostel=${encodeURIComponent(selHostel)}`, `discipline-${selHostel}.pdf`)} style={isMobile?{width:"100%",justifyContent:"center"}:{}}><span style={{display:"flex",alignItems:"center",gap:6}}><DownloadIcon size={13}/>{tr("lg.exportPdf")}</span></Btn>
        </div>
        <Tbl rows={disc} columns={[
          {key:"incident_date", label:"Date",     render:r=>r.incident_date?.slice(0,10)},
          {key:"student_name",  label:"Student"},
          {key:"hostel_name",   label:"Hostel"},
          {key:"room_number",   label:"Room"},
          {key:"severity",      label:"Severity", render:r=><Badge color={r.severity==="Minor"?"amber":r.severity==="Serious"?"red":"indigo"}>{r.severity}</Badge>},
          {key:"issue",         label:"Issue"},
          {key:"action_taken",  label:"Action Taken"},
        ]}/>
      </Card>

      {/* ── Admission Modal (Girls: room-based / Boys: Hall) ────────────── */}
      {assignModal && (
        <Modal title={assignModal==="boys" ? "Admit - Boys Boarding Facility" : `Admit - ${assignModal.hostel_name} · ${assignModal.room_number}`} onClose={()=>{setAssignModal(null);setError("");}}>
          {error && <Alert type="error" message={error} onClose={()=>setError("")}/>}
          {assignModal!=="boys" && (
            <div style={{background:C.girlLight,border:`1px solid ${hc}30`,borderRadius:4,padding:"8px 12px",marginBottom:14,fontSize:13,fontWeight:600,color:hc}}>
              {assignModal.room_number} · {assignModal.capacity-(assignModal.occupants||[]).length} bed(s) available
            </div>
          )}

          <SLabel>Find Enrolled Student</SLabel>
          <p style={{fontSize:12,color:C.muted,marginTop:-4,marginBottom:10}}>
            Only students already enrolled in Student Management can be admitted to the hostel.
          </p>
          <div style={{position:"relative",marginBottom:14}}>
            <input
              value={studentSearch}
              onChange={e=>{ setStudentSearch(e.target.value); searchStudents(e.target.value); if(af.student_id) setAf(p=>({...p,student_id:"",studentLabel:""})); }}
              placeholder="Type name or Reg. No…"
              style={{...IS,width:"100%"}}
            />
            {studentSearch && !af.student_id && (
              <div style={{position:"absolute",top:40,left:0,right:0,zIndex:20,background:C.surface,border:`1px solid ${C.border}`,borderRadius:4,boxShadow:"0 8px 24px rgba(0,0,0,0.12)",maxHeight:220,overflowY:"auto"}}>
                {studentSearching
                  ? <div style={{padding:12,fontSize:13,color:C.muted}}>Searching…</div>
                  : studentResults.length
                    ? studentResults.map(s=>(
                        <button key={s.id} onClick={()=>{
                          const label = [s.first_name,s.middle_name,s.last_name].filter(Boolean).join(" ");
                          setAf(p=>({...p,student_id:s.id,studentLabel:label}));
                          setStudentSearch(label);
                          setStudentResults([]);
                        }} style={{display:"block",width:"100%",textAlign:"left",padding:"9px 14px",border:"none",borderBottom:`1px solid ${C.border}`,background:"none",cursor:"pointer"}}>
                          <div style={{fontWeight:600,fontSize:13}}>{[s.first_name,s.middle_name,s.last_name].filter(Boolean).join(" ")}</div>
                          <div style={{fontSize:11,color:C.muted}}>{s.form} · {s.reg_no||"-"} · {s.status}</div>
                        </button>
                      ))
                    : <div style={{padding:12,fontSize:13,color:C.muted}}>No student found. Make sure they've already been registered in Student Management.</div>}
              </div>
            )}
          </div>

          {af.student_id && (
            <div style={{background:C.successLight,border:`1px solid ${C.success}30`,borderRadius:4,padding:"8px 12px",marginBottom:14,fontSize:13,fontWeight:600,color:C.success}}>
              Aliyechaguliwa: {af.studentLabel}
            </div>
          )}

          <Inp label="Admission Date" type="date" value={af.admitted_date} onChange={v=>setAf(p=>({...p,admitted_date:v}))}/>

          <div style={{display:"flex",gap:10,marginTop:20,justifyContent:"flex-end"}}>
            <Btn variant="secondary" onClick={()=>{setAssignModal(null);setError("");}}><span style={{display:"flex",alignItems:"center",gap:6}}><CloseIcon size={13}/>{tr("common.cancel")}</span></Btn>
            <Btn onClick={assign} loading={saving} disabled={!af.student_id}>Admit</Btn>
          </div>
        </Modal>
      )}

      {/* ── Room (beds) add/edit ────────────────────────────────────────── */}
      {roomModal && (
        <Modal title={roomModal==="add" ? "Add Room" : `Edit - ${roomModal.room_number}`} onClose={()=>setRoomModal(null)}>
          {error && <Alert type="error" message={error} onClose={()=>setError("")}/>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <Inp label="Room Number" value={roomForm.room_number} onChange={v=>setRoomForm(p=>({...p,room_number:v}))} placeholder="e.g. Room 7" required/>
            <Inp label="Bed Capacity" type="number" value={roomForm.capacity} onChange={v=>setRoomForm(p=>({...p,capacity:v}))} required/>
          </div>
          <div style={{display:"flex",gap:10,marginTop:20,justifyContent:"flex-end"}}>
            <Btn variant="secondary" onClick={()=>setRoomModal(null)}><span style={{display:"flex",alignItems:"center",gap:6}}><CloseIcon size={13}/>{tr("common.cancel")}</span></Btn>
            <Btn onClick={saveRoom}>Save</Btn>
          </div>
        </Modal>
      )}

      {/* ── Contributions ────────────────────────────────────────────────── */}
      {contribModal && (
        <Modal wide title={`Contributions - ${fullNameOf(contribModal)}`} onClose={()=>{setContribModal(null);setError("");}}>
          {error && <Alert type="error" message={error} onClose={()=>setError("")}/>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
            <Inp label="Term"          value={cf.term}          onChange={v=>setCf(p=>({...p,term:v}))}          options={CONTRIB_TERMS.map(t=>({value:t,label:t}))}/>
            <Inp label="Academic Year" value={cf.academic_year} onChange={v=>setCf(p=>({...p,academic_year:v}))} options={YEARS.map(y=>({value:y,label:y}))}/>
            <Inp label="Maize (Kg)" type="number" value={cf.maize_kg} onChange={v=>setCf(p=>({...p,maize_kg:v}))}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <Inp label="Vegetable Type" value={cf.vegetable_type} onChange={v=>setCf(p=>({...p,vegetable_type:v}))} options={VEGETABLE_TYPES.map(v=>({value:v,label:v}))}/>
              <Inp label="Vegetables (Kg)" type="number" value={cf.vegetables_kg} onChange={v=>setCf(p=>({...p,vegetables_kg:v}))}/>
            </div>
            <Inp label="Cooking Oil (Litres)" type="number" value={cf.oil_litres} onChange={v=>setCf(p=>({...p,oil_litres:v}))}/>
            <Inp label="Salt (Kg)"            type="number" value={cf.salt_kg}   onChange={v=>setCf(p=>({...p,salt_kg:v}))}/>
            <Inp label="Hostel Fee (Tsh.)"    type="number" value={cf.hostel_fee} onChange={v=>setCf(p=>({...p,hostel_fee:v}))}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <Inp label="Other Item"     value={cf.other_item} onChange={v=>setCf(p=>({...p,other_item:v}))} placeholder="e.g. Soap"/>
              <Inp label="Other Qty"      value={cf.other_qty}  onChange={v=>setCf(p=>({...p,other_qty:v}))}/>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
            <input type="checkbox" id="owes" checked={cf.owes} onChange={e=>setCf(p=>({...p,owes:e.target.checked}))}/>
            <label htmlFor="owes" style={{fontSize:13,color:C.text}}>This student still has an <strong>outstanding contribution</strong></label>
          </div>
          <Inp label="Comment" value={cf.comment} onChange={v=>setCf(p=>({...p,comment:v}))} placeholder="e.g. outstanding maize for Term II / fully paid"/>
          <div style={{display:"flex",justifyContent:"flex-end",marginTop:10,marginBottom:20}}>
            <Btn onClick={addContrib} loading={saving}>+ Add Contribution</Btn>
          </div>

          <SLabel>History of Contributions</SLabel>
          {!contribs.length
            ? <p style={{fontSize:13,color:C.muted}}>No contributions recorded yet.</p>
            : <Tbl rows={contribs} columns={[
                {key:"created_at_tz", label:"Recorded"},
                {key:"term", label:tr("lg.term"), render:r=>`${r.term||"-"} ${r.academic_year||""}`},
                {key:"maize_kg", label:"Maize (kg)"},
                {key:"vegetables_kg", label:"Vegetables", render:r=>Number(r.vegetables_kg)?`${r.vegetable_type||""} ${r.vegetables_kg}kg`:"-"},
                {key:"oil_litres", label:"Cooking Oil (L)"},
                {key:"salt_kg", label:"Salt (kg)"},
                {key:"other_item", label:"Other", render:r=>r.other_item?`${r.other_item} ${r.other_qty||""}`:"-"},
                {key:"hostel_fee", label:"Fee (Tsh.)", render:r=>Number(r.hostel_fee).toLocaleString()},
                {key:"owes", label:"Status", render:r=><Badge color={r.owes?"red":"green"}>{r.owes?"Outstanding":"Paid"}</Badge>},
                {key:"actions", label:"", render:r=><ActionsMenu items={[{ label:"Remove", onClick:()=>removeContrib(r.id), danger:true }]}/>},
              ]}/>}

          <div style={{display:"flex",justifyContent:"flex-end",marginTop:16}}>
            <Btn variant="secondary" onClick={()=>{setContribModal(null);setError("");}}><span style={{display:"flex",alignItems:"center",gap:6}}><CloseIcon size={13}/>{tr("common.close")}</span></Btn>
          </div>
        </Modal>
      )}

      {/* ── History ──────────────────────────────────────────────────────── */}
      {historyModal && (
        <Modal title={`History - ${fullNameOf(historyModal)}`} onClose={()=>setHistoryModal(null)}>
          <div style={{display:"flex",justifyContent:"flex-end",alignItems:"center",marginBottom:14}}>
            <Btn size="sm" variant="secondary" onClick={()=>downloadPdf(`/hostel/occupants/${historyModal.id}/pdf`, `${fullNameOf(historyModal)}.pdf`)}><span style={{display:"flex",alignItems:"center",gap:6}}><DownloadIcon size={13}/>{tr("lg.pdf")}</span></Btn>
          </div>
          {historyLoading
            ? <div style={{padding:24,textAlign:"center",color:C.muted,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><SpinnerIcon size={14} />{tr("lg.loading")}</div>
            : !history.length
              ? <p style={{color:C.muted,fontSize:14}}>{tr("lg.noHistory")}</p>
              : <div style={{display:"flex",flexDirection:"column"}}>
                  {history.map(h=>(
                    <div key={h.id} style={{display:"flex",gap:12,padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:C.accent,marginTop:6,flexShrink:0}}/>
                      <div>
                        <div style={{fontWeight:700,fontSize:14,color:C.text}}>{h.event_type}</div>
                        {h.note && <div style={{fontSize:13,color:C.muted,marginTop:2}}>{h.note}</div>}
                        <div style={{fontSize:11,color:C.muted,marginTop:3}}>{h.event_at_tz}{h.recorded_by_name?` · by ${h.recorded_by_name}`:""}</div>
                      </div>
                    </div>
                  ))}
                </div>}
        </Modal>
      )}

      {/* ── Discipline ───────────────────────────────────────────────────── */}
      {discModal && (
        <Modal title="New Discipline Record" onClose={()=>{setDiscModal(false);setError("");}}>
          {error && <Alert type="error" message={error} onClose={()=>setError("")}/>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <Inp label="Student Name"    value={df.student_name} onChange={v=>setDf(p=>({...p,student_name:v}))} required/>
            <Inp label="Hostel"          value={df.hostel_name}  onChange={v=>setDf(p=>({...p,hostel_name:v}))}  options={HOSTELS.map(h=>({value:h,label:h}))}/>
            <Inp label="Room"            value={df.room_number}  onChange={v=>setDf(p=>({...p,room_number:v}))}  placeholder="e.g. Room 3 (leave blank for Boys Hall)"/>
            <Inp label="Date" type="date" value={df.incident_date} onChange={v=>setDf(p=>({...p,incident_date:v}))}/>
            <Inp label="Severity"        value={df.severity}     onChange={v=>setDf(p=>({...p,severity:v}))}     options={[{value:"Minor",label:"Minor"},{value:"Serious",label:"Serious"},{value:"Expulsion Risk",label:"Expulsion Risk"}]}/>
            <div style={{gridColumn:"1/-1"}}><Inp label="Issue Description" value={df.issue}         onChange={v=>setDf(p=>({...p,issue:v}))}         required/></div>
            <div style={{gridColumn:"1/-1"}}><Inp label="Action Taken"      value={df.action_taken} onChange={v=>setDf(p=>({...p,action_taken:v}))}/></div>
          </div>
          <div style={{display:"flex",gap:10,marginTop:20,justifyContent:"flex-end"}}>
            <Btn variant="secondary" onClick={()=>{setDiscModal(false);setError("");}}><span style={{display:"flex",alignItems:"center",gap:6}}><CloseIcon size={13}/>{tr("common.cancel")}</span></Btn>
            <Btn onClick={addDisc} loading={saving}>Save Record</Btn>
          </div>
        </Modal>
      )}
      </div>
      )}
      {ConfirmDialogPortal}
    </div>
  );
}

// Hostel Fees - records the cost of hostel boarding services (accommodation
// costs), separate from Maladhi (room/bed allocation) and separate from
// student contributions collected via Contributions Management.
function HostelFeesTab({ token }) {
  const { isMobile } = useBreakpoint();
  const { confirm, ConfirmDialogPortal } = useConfirm();
  const [hostel, setHostel] = useState("Girls Hostel");
  const [occupants, setOccupants] = useState([]);
  const [feeModal, setFeeModal] = useState(null); // occupant being billed
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [entries, setEntries] = useState({}); // occupant.id -> list of fee entries

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/hostel/occupants?hostel=${encodeURIComponent(hostel)}`, {}, token);
      setOccupants(r.data || []);
    } catch (e) { setError(e.message); }
  }, [hostel, token]);
  useEffect(() => { load(); }, [load]);

  const loadEntries = async (occ) => {
    try {
      const r = await apiFetch(`/hostel/occupants/${occ.id}/contributions`, {}, token);
      setEntries(p => ({ ...p, [occ.id]: (r.data || []).filter(c => c.hostel_fee) }));
    } catch (e) { setError(e.message); }
  };

  const openFeeModal = (occ) => { setFeeModal(occ); setAmount(""); setNote(""); loadEntries(occ); };

  const submitFee = async () => {
    if (!amount || Number(amount) <= 0) { setError("Enter a valid amount in TZS."); return; }
    setSaving(true); setError("");
    try {
      await apiFetch(`/hostel/occupants/${feeModal.id}/contributions`, { method: "POST", body: {
        term: "N/A", academic_year: String(new Date().getFullYear()), hostel_fee: amount, owes: false, comment: note,
      } }, token);
      setSuccess("Hostel fee recorded.");
      loadEntries(feeModal);
      setAmount(""); setNote("");
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  const removeFee = (id) => confirm("Remove this hostel fee entry?", async () => {
    try { await apiFetch(`/hostel/contributions/${id}`, { method: "DELETE" }, token); loadEntries(feeModal); }
    catch (e) { setError(e.message); }
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ margin: 0, color: C.muted, fontSize: 14 }}>Record money spent on hostel boarding services (accommodation costs), in TZS, per student.</p>
      {error && <Alert type="error" message={error} onClose={() => setError("")} />}
      {success && <Alert type="success" message={success} onClose={() => setSuccess("")} />}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${C.border}` }}>
        {HOSTELS.map(h => { const sel = hostel === h; const col = h === "Girls Hostel" ? C.girl : C.boy; return (
          <button key={h} onClick={() => setHostel(h)} style={{ padding: "9px 22px", border: "none", borderBottom: sel ? `3px solid ${col}` : "3px solid transparent", background: "transparent", fontWeight: sel ? 700 : 500, fontSize: 14, color: sel ? col : C.muted, cursor: "pointer" }}>{h}</button>
        ); })}
      </div>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {occupants.map((o, i) => (
          isMobile ? (
            <div key={o.id} onClick={() => openFeeModal(o)} className="mk-row-card" style={{ padding: "12px 14px", cursor: "pointer", borderTop: i > 0 ? `1px solid ${C.border}` : "none" }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 4 }}>{[o.first_name, o.middle_name, o.last_name].filter(Boolean).join(" ")}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: C.muted }}>{o.form}</span>
                <span style={{ fontSize: 12, color:C.accentText, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}><ReceiptIcon size={12} />Record fee</span>
              </div>
            </div>
          ) : (
            <div key={o.id} onClick={() => openFeeModal(o)} style={{ display: "flex", alignItems: "center", padding: "10px 16px", fontSize: 13, cursor: "pointer", borderTop: i > 0 ? `1px solid ${C.border}` : "none" }}>
              <span style={{ flex: 1 }}>{[o.first_name, o.middle_name, o.last_name].filter(Boolean).join(" ")}</span>
              <span style={{ flex: 1, color: C.muted }}>{o.form}</span>
              <span style={{ fontSize: 12, color:C.accentText, display: "flex", alignItems: "center", gap: 4 }}><ReceiptIcon size={12} />Record fee</span>
            </div>
          )
        ))}
        {!occupants.length && <p style={{ padding: 16, fontSize: 13, color: C.muted }}>No residents in {hostel} yet.</p>}
      </Card>
      {feeModal && (
        <Modal title={`Hostel Fees - ${[feeModal.first_name, feeModal.last_name].join(" ")}`} onClose={() => setFeeModal(null)}>
          <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
            <Inp label="Amount (TZS)" type="number" value={amount} onChange={setAmount} required />
            <Inp label="Note (optional)" value={note} onChange={setNote} />
          </div>
          <Btn onClick={submitFee} loading={saving}>Record Fee</Btn>
          <div style={{ marginTop: 18 }}>
            <SLabel>Previous entries</SLabel>
            {(entries[feeModal.id] || []).map(en => (
              <div key={en.id} style={{ display: "flex", flexDirection: "column", padding: "6px 0", fontSize: 12.5, borderTop: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>TZS {Number(en.hostel_fee).toLocaleString()} {en.comment ? `- ${en.comment}` : ""}</span>
                  <button onClick={() => removeFee(en.id)} style={{ background: "none", border: "none", color: C.danger, cursor: "pointer", fontSize: 12 }}>Remove</button>
                </div>
                <span style={{ color: C.muted, fontSize: 11 }}>{en.created_at_tz}{en.recorded_by_name ? ` · by ${en.recorded_by_name}` : ""}</span>
              </div>
            ))}
            {!(entries[feeModal.id] || []).length && <p style={{ fontSize: 12.5, color: C.muted }}>No fee entries yet for this student.</p>}
          </div>
        </Modal>
      )}
      {ConfirmDialogPortal}
    </div>
  );
}

// History - full admission record by class/Form, for Boys and Girls.
function HostelHistoryTab({ token, canDeletePermanent }) {
  const { isMobile } = useBreakpoint();
  const { confirm, ConfirmDialogPortal } = useConfirm();
  const [hostel, setHostel] = useState("Girls Hostel");
  const [byForm, setByForm] = useState({});
  const [error, setError] = useState("");
  const [editOcc, setEditOcc] = useState(null); // occupant being edited

  const load = () => {
    apiFetch(`/hostel/history-by-class?hostel_name=${encodeURIComponent(hostel)}`, {}, token)
      .then(r => setByForm(r.data || {}))
      .catch(e => setError(e.message));
  };
  useEffect(load, [hostel, token]); // eslint-disable-line react-hooks/exhaustive-deps

  const forms = Object.keys(byForm).sort();

  // Correcting a mistaken registration: a student registered in error and
  // then "Removed" (soft delete -> Departed) drops out of the current-
  // occupant list everywhere else in Hostel Management, but keeps showing
  // up HERE forever (History deliberately never forgets a real departure).
  // Before this there was no way to actually erase such a mistake from
  // this view - only from the Accommodation tab's per-room "..." menu,
  // which no longer lists them once they're no longer a current occupant.
  const deletePermanent = (s) => {
    confirm(
      "Delete this registration completely? Use this ONLY if the student was registered by mistake. This cannot be undone and the record will disappear from History entirely.",
      async () => {
        try { await apiFetch(`/hostel/occupants/${s.id}/permanent`, { method: "DELETE" }, token); load(); }
        catch (e) { setError(e.message); }
      }
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {ConfirmDialogPortal}
      <p style={{ margin: 0, color: C.muted, fontSize: 14 }}>Every student ever admitted to this hostel, grouped by class - current residents and past ones.</p>
      {error && <Alert type="error" message={error} onClose={() => setError("")} />}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${C.border}` }}>
        {HOSTELS.map(h => { const sel = hostel === h; const col = h === "Girls Hostel" ? C.girl : C.boy; return (
          <button key={h} onClick={() => setHostel(h)} style={{ padding: "9px 22px", border: "none", borderBottom: sel ? `3px solid ${col}` : "3px solid transparent", background: "transparent", fontWeight: sel ? 700 : 500, fontSize: 14, color: sel ? col : C.muted, cursor: "pointer" }}>{h}</button>
        ); })}
      </div>
      {forms.map(form => (
        <Card key={form} style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "10px 16px", fontWeight: 700, fontSize: 13.5, background: C.bg, borderBottom: `1px solid ${C.border}` }}>{form}</div>
          {byForm[form].map((s, i) => (
            isMobile ? (
              <div key={s.id} className="mk-row-card" style={{ padding: "12px 14px", borderTop: i > 0 ? `1px solid ${C.border}` : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{[s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ")}</div>
                  {canDeletePermanent && <ActionsMenu items={[{ label: "Edit", onClick: () => setEditOcc({ ...s, hostel_name: hostel }) }, { label: "Delete Registration (Mistake)", onClick: () => deletePermanent(s), danger: true }]} />}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11.5 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.muted }}>Room</span><span>{s.room_number || "-"}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.muted }}>Admitted</span><span>{s.admitted_date ? String(s.admitted_date).slice(0, 10) : "-"}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.muted }}>Status</span><span style={{ color: s.is_active ? C.girl : C.muted, fontWeight: 600 }}>{s.is_active ? "Current" : `Departed ${s.departed_date ? String(s.departed_date).slice(0, 10) : ""}`}</span></div>
                </div>
              </div>
            ) : (
              <div key={s.id} style={{ display: "flex", alignItems: "center", padding: "8px 16px", fontSize: 12.5, borderTop: i > 0 ? `1px solid ${C.border}` : "none" }}>
                <span style={{ flex: 1.5 }}>{[s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ")}</span>
                <span style={{ flex: 1, color: C.muted }}>Room: {s.room_number || "-"}</span>
                <span style={{ flex: 1, color: C.muted }}>Admitted: {s.admitted_date ? String(s.admitted_date).slice(0, 10) : "-"}</span>
                <span style={{ flex: 1, color: s.is_active ? C.girl : C.muted, fontWeight: 600 }}>{s.is_active ? "Current" : `Departed ${s.departed_date ? String(s.departed_date).slice(0, 10) : ""}`}</span>
                {canDeletePermanent && <span style={{ width: 40, textAlign: "right" }}><ActionsMenu items={[{ label: "Edit", onClick: () => setEditOcc({ ...s, hostel_name: hostel }) }, { label: "Delete Registration (Mistake)", onClick: () => deletePermanent(s), danger: true }]} /></span>}
              </div>
            )
          ))}
        </Card>
      ))}
      {!forms.length && !error && <p style={{ fontSize: 13, color: C.muted }}>No history yet for {hostel}.</p>}
      {editOcc && <HostelEditModal token={token} occ={editOcc} onClose={() => setEditOcc(null)} onSaved={() => { setEditOcc(null); load(); }} />}
    </div>
  );
}

// Fix a mistaken hostel registration: the admission date, and (Girls Hostel
// only, for a current resident) the room. Name/class come from Student
// Management and are not edited here.
function HostelEditModal({ token, occ, onClose, onSaved }) {
  const [date, setDate] = useState(occ.admitted_date ? String(occ.admitted_date).slice(0, 10) : "");
  const [roomId, setRoomId] = useState("");
  const [rooms, setRooms] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canMoveRoom = occ.hostel_name === "Girls Hostel" && occ.is_active;
  const name = [occ.first_name, occ.middle_name, occ.last_name].filter(Boolean).join(" ");

  useEffect(() => {
    if (!canMoveRoom) return;
    apiFetch(`/hostel/rooms?hostel_name=${encodeURIComponent(occ.hostel_name)}`, {}, token)
      .then((r) => setRooms(r.data || [])).catch(() => {});
  }, [token, occ.hostel_name, canMoveRoom]);

  const save = async () => {
    setBusy(true); setError("");
    try {
      const body = {};
      if (date) body.admitted_date = date;
      if (canMoveRoom && roomId) body.room_id = Number(roomId);
      await apiFetch(`/hostel/occupants/${occ.id}`, { method: "PATCH", body: JSON.stringify(body) }, token);
      showSuccess("Hostel", "Registration updated.");
      onSaved();
    } catch (e) { setError(e.message); setBusy(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9000, padding: 16 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: C.surface, borderRadius: 6, padding: 22, width: "100%", maxWidth: 420 }}>
        <h3 style={{ marginTop: 0, marginBottom: 4, color: C.heading, fontSize: 16 }}>Edit Registration</h3>
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>{name} - {occ.hostel_name}</p>
        {error && <Alert type="error" message={error} onClose={() => setError("")} />}
        <label style={{ display: "grid", gap: 5, fontSize: 12.5, fontWeight: 600, color: C.text, marginBottom: 14 }}>Admission date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 13.5, background: C.surface, color: C.text }} /></label>
        {canMoveRoom && (
          <label style={{ display: "grid", gap: 5, fontSize: 12.5, fontWeight: 600, color: C.text, marginBottom: 14 }}>Move to room (optional)
            <select value={roomId} onChange={(e) => setRoomId(e.target.value)} style={{ padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 13.5, background: C.surface, color: C.text }}>
              <option value="">Keep current room ({occ.room_number || "-"})</option>
              {rooms.filter((r) => Number(r.occupied_count) < Number(r.capacity) && r.room_number !== occ.room_number).map((r) => (
                <option key={r.id} value={r.id}>{r.room_number} ({r.occupied_count}/{r.capacity})</option>
              ))}
            </select></label>
        )}
        {occ.hostel_name === "Girls Hostel" && !occ.is_active && (
          <p style={{ fontSize: 11.5, color: C.muted, marginBottom: 14 }}>This student has left the hostel, so the room cannot be changed here.</p>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={save} loading={busy}>Save</Btn>
        </div>
      </div>
    </div>
  );
}


// ─── SCHOOL CONTRIBUTIONS MODULE (Michango ya Shule) ──────────────────────────
// Academic Office: Part-time Teachers / Ream / Other Expenses.
// Hostel: the same contribution-recording that used to live inside the Hostel
// module (moved here per request - Hostel module no longer has its own).
function ContributionsModule({ token, role }) {
  const { confirm, ConfirmDialogPortal } = useConfirm();
  const [officeTab, setOfficeTab] = useState("academic"); // academic | hostel
  const [subTab, setSubTab]       = useState("parttime");  // parttime | ream | other
  const [error, setError]     = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving]   = useState(false);

  // ── Part-time Teachers ──
  const [ptYear, setPtYear]   = useState(CURRENT_YEAR);
  const [ptMonth, setPtMonth] = useState(String(new Date().getMonth()+1));
  const [ptRows, setPtRows]   = useState([]);
  const [ptLoading, setPtLoading] = useState(false);
  const [payModal, setPayModal] = useState(null); // row
  const [payAmount, setPayAmount] = useState("");
  const isHoliday = ["6","12"].includes(String(ptMonth));

  const loadPartTime = async () => {
    if (isHoliday) { setPtRows([]); return; }
    setPtLoading(true);
    try { const r = await apiFetch(`/contributions/parttime?year=${ptYear}&month=${ptMonth}`, {}, token); setPtRows(r.data||[]); }
    catch (e) { setError(e.message||"Failed to load Part-time Teachers contributions."); }
    finally { setPtLoading(false); }
  };
  useEffect(()=>{ if(officeTab==="academic" && subTab==="parttime") loadPartTime(); }, [officeTab, subTab, ptYear, ptMonth]);

  const submitPayment = async () => {
    if (!payAmount || Number(payAmount) <= 0) { setError("Enter a valid amount."); return; }
    setSaving(true); setError("");
    try {
      await apiFetch(`/contributions/parttime/${payModal.student_id}`, { method:"POST", body:{ year: ptYear, month: Number(ptMonth), amount: Number(payAmount) } }, token);
      setPayModal(null); setPayAmount(""); setSuccess("Payment recorded."); loadPartTime();
    } catch (e) { setError(e.message||"Failed to record payment."); }
    finally { setSaving(false); }
  };

  // ── Ream & Other Expenses (reuse student_charges via /students/:id/charges) ──
  const [reamRows, setReamRows]   = useState([]);
  const [otherRows, setOtherRows] = useState([]);
  const [chargesLoading, setChargesLoading] = useState(false);
  const [addModal, setAddModal] = useState(null); // "ream" | "other"
  const [studentSearch, setStudentSearch]   = useState("");
  const [studentResults, setStudentResults] = useState([]);
  const [studentSearching, setStudentSearching] = useState(false);
  const [pickedStudent, setPickedStudent]   = useState(null);
  const [reamBrought, setReamBrought]       = useState(false);
  const [otherAmount, setOtherAmount]       = useState("");
  const [otherNote, setOtherNote]           = useState("");
  const [editChargeModal, setEditChargeModal] = useState(null); // charge row being edited
  const [editAmount, setEditAmount] = useState("");
  const [editNote, setEditNote]     = useState("");

  const loadReam  = async () => { setChargesLoading(true); try { const r = await apiFetch("/contributions/ream", {}, token); setReamRows(r.data||[]); } catch(e){ setError(e.message);} finally { setChargesLoading(false);} };
  const loadOther = async () => { setChargesLoading(true); try { const r = await apiFetch("/contributions/other", {}, token); setOtherRows(r.data||[]); } catch(e){ setError(e.message);} finally { setChargesLoading(false);} };
  useEffect(()=>{
    if (officeTab!=="academic") return;
    if (subTab==="ream") loadReam();
    if (subTab==="other") loadOther();
  }, [officeTab, subTab]);

  const searchDebounceRef = useRef(null);
  const searchStudents = (q) => {
    clearTimeout(searchDebounceRef.current);
    if (!q || q.trim().length < 2) { setStudentResults([]); return; }
    setStudentSearching(true);
    searchDebounceRef.current = setTimeout(async ()=>{
      try { const r = await apiFetch(`/students?search=${encodeURIComponent(q.trim())}`, {}, token); setStudentResults(r.data||[]); }
      finally { setStudentSearching(false); }
    }, 300);
  };

  const openAdd = (kind) => {
    setAddModal(kind); setError("");
    setStudentSearch(""); setStudentResults([]); setPickedStudent(null);
    setReamBrought(false); setOtherAmount(""); setOtherNote("");
  };

  const submitAdd = () => {
    if (!pickedStudent) { setError("Please search and select a student first."); return; }
    if (addModal==="ream" && !reamBrought) { setError("Tick the box to confirm Ream was brought before submitting."); return; }
    if (addModal==="other" && (!otherAmount || Number(otherAmount)<=0)) { setError("Enter a valid amount."); return; }

    const message = addModal==="ream"
      ? `Submit that ${pickedStudent.label} has brought Ream? This cannot be edited once submitted.`
      : `Add an Other Expense of TZS ${Number(otherAmount).toLocaleString()} for ${pickedStudent.label}?`;

    confirm(message, async ()=>{
      setSaving(true); setError("");
      try {
        if (addModal==="ream") {
          const created = await apiFetch(`/students/${pickedStudent.id}/charges`, { method:"POST", body:{ charge_type:"Ream", amount:0 } }, token);
          await apiFetch(`/students/${pickedStudent.id}/charges/${created.data.id}/pay`, { method:"PATCH" }, token);
          loadReam();
        } else {
          await apiFetch(`/students/${pickedStudent.id}/charges`, { method:"POST", body:{ charge_type:"Other", amount:Number(otherAmount), note:otherNote } }, token);
          loadOther();
        }
        setAddModal(null); setSuccess("Saved successfully.");
      } catch (e) { setError(e.message||"Failed to save."); }
      finally { setSaving(false); }
    }, { danger: addModal==="ream" });
  };

  const submitEditCharge = async () => {
    if (!editAmount || Number(editAmount) <= 0) { setError("Enter a valid amount."); return; }
    setSaving(true); setError("");
    try {
      await apiFetch(`/contributions/charge/${editChargeModal.id}`, { method:"PUT", body:{ amount:Number(editAmount), note:editNote } }, token);
      setEditChargeModal(null); setSuccess("Updated."); loadOther();
    } catch (e) { setError(e.message||"Failed to update."); }
    finally { setSaving(false); }
  };

  const removeCharge = (studentId, chargeId) => {
    confirm("Remove this contribution record permanently?", async ()=>{
      try { await apiFetch(`/students/${studentId}/charges/${chargeId}`, { method:"DELETE" }, token); loadReam(); loadOther(); }
      catch(e){ setError(e.message||"Failed to remove - Admin access is required."); }
    }, { danger:true });
  };

  const downloadReceiptCharge = async (chargeId, label) => {
    const res = await fetch(`${API_BASE}/contributions/receipt/charge/${chargeId}`, { headers:{ Authorization:`Bearer ${token}` } });
    const blob = await res.blob(); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `receipt-${label}.pdf`; a.click(); URL.revokeObjectURL(url);
  };
  const downloadReceiptPartTime = async (id) => {
    const res = await fetch(`${API_BASE}/contributions/receipt/parttime/${id}`, { headers:{ Authorization:`Bearer ${token}` } });
    const blob = await res.blob(); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `receipt-parttime-${id}.pdf`; a.click(); URL.revokeObjectURL(url);
  };

  // ── Hostel section (moved here from the Hostel module) ──
  const [hOccSearch, setHOccSearch]   = useState("");
  const [hOccResults, setHOccResults] = useState([]);
  const [hOcc, setHOcc]               = useState(null); // picked occupant
  const [hContribs, setHContribs]     = useState([]);
  const [cf, setCf] = useState({ term:"", academic_year:"", maize_kg:"", vegetable_type:"", vegetables_kg:"", oil_litres:"", salt_kg:"", rice_kg:"", hostel_fee:"", owes:false, comment:"" });

  const hSearchDebounceRef = useRef(null);
  const searchOccupants = (q) => {
    clearTimeout(hSearchDebounceRef.current);
    if (!q || q.trim().length < 2) { setHOccResults([]); return; }
    hSearchDebounceRef.current = setTimeout(async ()=>{
      try { const r = await apiFetch(`/hostel/occupants?search=${encodeURIComponent(q.trim())}`, {}, token); setHOccResults(r.data||[]); } catch {}
    }, 300);
  };
  const pickOccupant = async (o) => {
    setHOcc(o); setHOccSearch([o.first_name,o.middle_name,o.last_name].filter(Boolean).join(" ")); setHOccResults([]);
    try { const r = await apiFetch(`/hostel/occupants/${o.id}/contributions`, {}, token); setHContribs(r.data||[]); } catch(e){ setError(e.message); }
  };
  const addHostelContribution = async () => {
    setSaving(true); setError("");
    try {
      await apiFetch(`/hostel/occupants/${hOcc.id}/contributions`, { method:"POST", body:cf }, token);
      const r = await apiFetch(`/hostel/occupants/${hOcc.id}/contributions`, {}, token); setHContribs(r.data||[]);
      setCf({ term:"", academic_year:"", maize_kg:"", vegetable_type:"", vegetables_kg:"", oil_litres:"", salt_kg:"", rice_kg:"", hostel_fee:"", owes:false, comment:"" });
      setSuccess("Hostel contribution recorded.");
    } catch (e) { setError(e.message||"Failed to record contribution."); }
    finally { setSaving(false); }
  };
  const removeHostelContribution = (id) => {
    confirm("Remove this hostel contribution record?", async ()=>{
      try { await apiFetch(`/hostel/contributions/${id}`, { method:"DELETE" }, token); const r = await apiFetch(`/hostel/occupants/${hOcc.id}/contributions`, {}, token); setHContribs(r.data||[]); }
      catch(e){ setError(e.message); }
    }, { danger:true });
  };
  const downloadHostelReceipt = async (id) => {
    const res = await fetch(`${API_BASE}/hostel/contributions/${id}/receipt`, { headers:{ Authorization:`Bearer ${token}` } });
    const blob = await res.blob(); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `receipt-hostel-${id}.pdf`; a.click(); URL.revokeObjectURL(url);
  };

  const TabBtn = ({active_, onClick, children}) => (
    <button onClick={onClick} style={{padding:"8px 16px",borderRadius:4,border:"none",cursor:"pointer",fontWeight:700,fontSize:13,background:active_?C.accent:"transparent",color:active_?"#fff":C.muted}}>{children}</button>
  );

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,background:C.surface,border:`1px solid ${C.border}`,borderRadius:4,padding:8}}>
        <TabBtn active_={officeTab==="academic"} onClick={()=>setOfficeTab("academic")}>Academic Office</TabBtn>
        <TabBtn active_={officeTab==="hostel"}   onClick={()=>setOfficeTab("hostel")}>Hostel</TabBtn>
      </div>

      {error   && <Alert type="error"   message={error}   onClose={()=>setError("")}/>}
      {success && <Alert type="success" message={success} onClose={()=>setSuccess("")}/>}

      {officeTab==="academic" && (
        <>
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            <TabBtn active_={subTab==="parttime"} onClick={()=>setSubTab("parttime")}>Part-time Teachers</TabBtn>
            <TabBtn active_={subTab==="ream"}     onClick={()=>setSubTab("ream")}>Ream</TabBtn>
            <TabBtn active_={subTab==="other"}    onClick={()=>setSubTab("other")}>Other Expenses</TabBtn>
          </div>

          {subTab==="parttime" && (
            <Card style={{padding:16}}>
              <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:16}}>
                <Inp label="Academic Year" value={ptYear}  onChange={setPtYear}  options={YEARS.map(y=>({value:y,label:y}))}/>
                <Inp label="Month" value={ptMonth} onChange={setPtMonth} options={MONTHS.map((m,i)=>({value:String(i+1),label:m}))}/>
              </div>
              {isHoliday
                ? <p style={{color:C.muted,fontSize:14}}>No contribution is billed for {MONTHS[Number(ptMonth)-1]} - this is a school holiday month.</p>
                : <Tbl loading={ptLoading} rows={ptRows} columns={[
                    {key:"name", label:"Full Name", render:r=>[r.first_name,r.middle_name,r.last_name].filter(Boolean).join(" ")},
                    {key:"form", label:tr("lg.form")},
                    {key:"amount_paid", label:"Paid (of TZS 2,000)", render:r=>`TZS ${Number(r.amount_paid).toLocaleString()}`},
                    {key:"installments", label:"Installments", render:r=>`${r.installments} of 4`},
                    {key:"completed", label:"Status", render:r=><Badge color={r.completed?"green":"red"}>{r.completed?"Completed":"Pending"}</Badge>},
                    {key:"actions", label:"", render:r=>(
                      <ActionsMenu items={[
                        ...(!r.completed && r.installments<4 ? [{ label:"Add Payment", onClick:()=>{setPayModal(r);setPayAmount("");} }] : []),
                        ...(r.contribution_id ? [{ label:"Print Receipt", onClick:()=>downloadReceiptPartTime(r.contribution_id) }] : []),
                      ]}/>
                    )},
                  ]}/>}
            </Card>
          )}

          {subTab==="ream" && (
            <Card style={{padding:16}}>
              <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
                <Btn onClick={()=>openAdd("ream")}>+ Add Ream Record</Btn>
              </div>
              <Tbl loading={chargesLoading} rows={reamRows} columns={[
                {key:"name", label:"Full Name", render:r=>[r.first_name,r.middle_name,r.last_name].filter(Boolean).join(" ")},
                {key:"form", label:tr("lg.form")},
                {key:"charge_date", label:"Date", render:r=>r.charge_date?.slice(0,10)},
                {key:"paid", label:"Status", render:r=><Badge color={r.paid?"green":"red"}>{r.paid?"Brought":"Not brought"}</Badge>},
                {key:"actions", label:"", render:r=>(
                  <ActionsMenu items={[
                    { label:"Print Receipt", onClick:()=>downloadReceiptCharge(r.id, "ream") },
                    ...(role==="admin" ? [{ label:"Delete", onClick:()=>removeCharge(r.student_id, r.id), danger:true }] : []),
                  ]}/>
                )},
              ]}/>
            </Card>
          )}

          {subTab==="other" && (
            <Card style={{padding:16}}>
              <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
                <Btn onClick={()=>openAdd("other")}>+ Add Other Expense</Btn>
              </div>
              <Tbl loading={chargesLoading} rows={otherRows} columns={[
                {key:"name", label:"Full Name", render:r=>[r.first_name,r.middle_name,r.last_name].filter(Boolean).join(" ")},
                {key:"form", label:tr("lg.form")},
                {key:"amount", label:"Amount (TZS)", render:r=>Number(r.amount).toLocaleString()},
                {key:"note", label:"Note"},
                {key:"charge_date", label:"Date", render:r=>r.charge_date?.slice(0,10)},
                {key:"actions", label:"", render:r=>(
                  <ActionsMenu items={[
                    ...(!r.locked ? [{ label:"Edit Payment", onClick:()=>{setEditChargeModal(r);setEditAmount(String(r.amount));setEditNote(r.note||"");} }] : []),
                    { label:"Print Receipt", onClick:()=>downloadReceiptCharge(r.id, "other") },
                    ...(role==="admin" ? [{ label:"Delete", onClick:()=>removeCharge(r.student_id, r.id), danger:true }] : []),
                  ]}/>
                )},
              ]}/>
            </Card>
          )}
        </>
      )}

      {officeTab==="hostel" && (
        <Card style={{padding:16}}>
          <SLabel>Find Resident</SLabel>
          <div style={{position:"relative",marginBottom:16,maxWidth:420}}>
            <input value={hOccSearch} onChange={e=>{setHOccSearch(e.target.value);searchOccupants(e.target.value);if(hOcc)setHOcc(null);}} placeholder="Type resident's name…" style={{...IS,width:"100%"}}/>
            {hOccSearch && !hOcc && hOccResults.length>0 && (
              <div style={{position:"absolute",top:40,left:0,right:0,zIndex:20,background:C.surface,border:`1px solid ${C.border}`,borderRadius:4,boxShadow:"0 8px 24px rgba(0,0,0,0.12)",maxHeight:220,overflowY:"auto"}}>
                {hOccResults.map(o=>(
                  <button key={o.id} onClick={()=>pickOccupant(o)} style={{display:"block",width:"100%",textAlign:"left",padding:"9px 14px",border:"none",borderBottom:`1px solid ${C.border}`,background:"none",cursor:"pointer"}}>
                    <div style={{fontWeight:600,fontSize:13}}>{[o.first_name,o.middle_name,o.last_name].filter(Boolean).join(" ")}</div>
                    <div style={{fontSize:11,color:C.muted}}>{o.form} · {o.hostel_name}{o.room_number?` · ${o.room_number}`:""}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {hOcc && (
            <>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
                <Inp label="Term"          value={cf.term}          onChange={v=>setCf(p=>({...p,term:v}))}          options={CONTRIB_TERMS.map(t=>({value:t,label:t}))}/>
                <Inp label="Academic Year" value={cf.academic_year} onChange={v=>setCf(p=>({...p,academic_year:v}))} options={YEARS.map(y=>({value:y,label:y}))}/>
                <Inp label="Maize (Kg)" type="number" value={cf.maize_kg} onChange={v=>setCf(p=>({...p,maize_kg:v}))}/>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <Inp label="Vegetable Type" value={cf.vegetable_type} onChange={v=>setCf(p=>({...p,vegetable_type:v}))} options={VEGETABLE_TYPES.map(v=>({value:v,label:v}))}/>
                  <Inp label="Vegetables (Kg)" type="number" value={cf.vegetables_kg} onChange={v=>setCf(p=>({...p,vegetables_kg:v}))}/>
                </div>
                <Inp label="Cooking Oil (Litres)" type="number" value={cf.oil_litres} onChange={v=>setCf(p=>({...p,oil_litres:v}))}/>
                <Inp label="Salt (Kg)"            type="number" value={cf.salt_kg}   onChange={v=>setCf(p=>({...p,salt_kg:v}))}/>
                <Inp label="Rice (Kg)"            type="number" value={cf.rice_kg}   onChange={v=>setCf(p=>({...p,rice_kg:v}))}/>
                <Inp label="Hostel Fee (TZS)"     type="number" value={cf.hostel_fee} onChange={v=>setCf(p=>({...p,hostel_fee:v}))}/>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <input type="checkbox" id="owes2" checked={cf.owes} onChange={e=>setCf(p=>({...p,owes:e.target.checked}))}/>
                <label htmlFor="owes2" style={{fontSize:13,color:C.text}}>This student still has an <strong>outstanding contribution</strong></label>
              </div>
              <Inp label="Comment" value={cf.comment} onChange={v=>setCf(p=>({...p,comment:v}))} placeholder="e.g. outstanding maize for Term II / fully paid"/>
              <div style={{display:"flex",justifyContent:"flex-end",marginTop:10,marginBottom:20}}>
                <Btn onClick={addHostelContribution} loading={saving}>+ Add Contribution</Btn>
              </div>

              <SLabel>History</SLabel>
              {!hContribs.length
                ? <p style={{fontSize:13,color:C.muted}}>No contributions recorded yet.</p>
                : <Tbl rows={hContribs} columns={[
                    {key:"created_at_tz", label:"Recorded"},
                    {key:"term", label:tr("lg.term"), render:r=>`${r.term||"-"} ${r.academic_year||""}`},
                    {key:"maize_kg", label:"Maize (kg)"},
                    {key:"vegetables_kg", label:"Vegetables", render:r=>Number(r.vegetables_kg)?`${r.vegetable_type||""} ${r.vegetables_kg}kg`:"-"},
                    {key:"oil_litres", label:"Oil (L)"},
                    {key:"salt_kg", label:"Salt (kg)"},
                    {key:"rice_kg", label:"Rice (kg)"},
                    {key:"hostel_fee", label:"Fee (TZS)", render:r=>Number(r.hostel_fee).toLocaleString()},
                    {key:"owes", label:"Status", render:r=><Badge color={r.owes?"red":"green"}>{r.owes?"Outstanding":"Paid"}</Badge>},
                    {key:"actions", label:"", render:r=><ActionsMenu items={[
                      { label:"Print Receipt", onClick:()=>downloadHostelReceipt(r.id) },
                      { label:"Remove", onClick:()=>removeHostelContribution(r.id), danger:true },
                    ]}/>},
                  ]}/>}
            </>
          )}
        </Card>
      )}

      {payModal && (
        <Modal title={`Add Payment - ${[payModal.first_name,payModal.middle_name,payModal.last_name].filter(Boolean).join(" ")}`} onClose={()=>setPayModal(null)}>
          <p style={{fontSize:13,color:C.muted,marginBottom:12}}>{MONTHS[Number(ptMonth)-1]} {ptYear} · Already paid TZS {Number(payModal.amount_paid).toLocaleString()} of 2,000 in {payModal.installments} installment(s).</p>
          <Inp label="Amount (TZS)" type="number" value={payAmount} onChange={setPayAmount}/>
          <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:16}}>
            <Btn variant="ghost" onClick={()=>setPayModal(null)}><span style={{display:"flex",alignItems:"center",gap:6}}><CloseIcon size={13}/>{tr("common.cancel")}</span></Btn>
            <Btn onClick={submitPayment} loading={saving}>Save Payment</Btn>
          </div>
        </Modal>
      )}

      {addModal && (
        <Modal title={addModal==="ream" ? "Add Ream Record" : "Add Other Expense"} onClose={()=>setAddModal(null)}>
          <SLabel>Find Enrolled Student</SLabel>
          <p style={{fontSize:12,color:C.muted,marginTop:-4,marginBottom:10}}>Only students already enrolled in Student Management can be selected.</p>
          <div style={{position:"relative",marginBottom:14}}>
            <input value={studentSearch} onChange={e=>{setStudentSearch(e.target.value);searchStudents(e.target.value);if(pickedStudent)setPickedStudent(null);}} placeholder="Type name or Reg. No…" style={{...IS,width:"100%"}}/>
            {studentSearch && !pickedStudent && (
              <div style={{position:"absolute",top:40,left:0,right:0,zIndex:20,background:C.surface,border:`1px solid ${C.border}`,borderRadius:4,boxShadow:"0 8px 24px rgba(0,0,0,0.12)",maxHeight:220,overflowY:"auto"}}>
                {studentSearching
                  ? <div style={{padding:12,fontSize:13,color:C.muted}}>Searching…</div>
                  : studentResults.length
                    ? studentResults.map(s=>{
                        const label = [s.first_name,s.middle_name,s.last_name].filter(Boolean).join(" ");
                        return (
                          <button key={s.id} onClick={()=>{setPickedStudent({id:s.id,label});setStudentSearch(label);setStudentResults([]);}} style={{display:"block",width:"100%",textAlign:"left",padding:"9px 14px",border:"none",borderBottom:`1px solid ${C.border}`,background:"none",cursor:"pointer"}}>
                            <div style={{fontWeight:600,fontSize:13}}>{label}</div>
                            <div style={{fontSize:11,color:C.muted}}>{s.form} · {s.reg_no||"-"} · {s.status}</div>
                          </button>
                        );
                      })
                    : <div style={{padding:12,fontSize:13,color:C.muted}}>No enrolled student found. Make sure they are registered in Student Management.</div>}
              </div>
            )}
          </div>
          {pickedStudent && (
            <div style={{background:C.successLight,border:`1px solid ${C.success}30`,borderRadius:4,padding:"8px 12px",marginBottom:14,fontSize:13,fontWeight:600,color:C.success}}>
              Selected: {pickedStudent.label}
            </div>
          )}

          {addModal==="ream"
            ? <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <input type="checkbox" id="reamBrought2" checked={reamBrought} onChange={e=>setReamBrought(e.target.checked)}/>
                <label htmlFor="reamBrought2" style={{fontSize:13,color:C.text}}>Confirm Ream has been brought</label>
              </div>
            : <>
                <Inp label="Amount (TZS)" type="number" value={otherAmount} onChange={setOtherAmount}/>
                <Inp label="Note (optional)" value={otherNote} onChange={setOtherNote} placeholder="e.g. Exam paper printing"/>
              </>}

          <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:16}}>
            <Btn variant="ghost" onClick={()=>setAddModal(null)}><span style={{display:"flex",alignItems:"center",gap:6}}><CloseIcon size={13}/>{tr("common.cancel")}</span></Btn>
            <Btn onClick={submitAdd} loading={saving} disabled={addModal==="ream" && !reamBrought}>Submit</Btn>
          </div>
        </Modal>
      )}

      {editChargeModal && (
        <Modal title="Edit Payment" onClose={()=>setEditChargeModal(null)}>
          <Inp label="Amount (TZS)" type="number" value={editAmount} onChange={setEditAmount}/>
          <Inp label="Note (optional)" value={editNote} onChange={setEditNote}/>
          <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:16}}>
            <Btn variant="ghost" onClick={()=>setEditChargeModal(null)}><span style={{display:"flex",alignItems:"center",gap:6}}><CloseIcon size={13}/>{tr("common.cancel")}</span></Btn>
            <Btn onClick={submitEditCharge} loading={saving}>Save Changes</Btn>
          </div>
        </Modal>
      )}
      {ConfirmDialogPortal}
    </div>
  );
}

// ─── Exports for the unified system (each module mounted at its own route) ──
export { StudentModule, TimetableModule, HostelModule, ContributionsModule };
