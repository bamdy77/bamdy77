// Shared, modern stroke-style icon set - same convention as the icons in
// PasswordInput.jsx (24x24 viewBox, currentColor stroke, 2px, round caps).
// Used by the Settings menu (Layout.jsx) and anywhere else that wants a
// consistent, professional icon instead of an emoji.

const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" };

export function SettingsIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} {...base}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

export function LockIcon({ size = 17 }) {
  return (
    <svg width={size} height={size} {...base}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M7.5 10.5V7a4.5 4.5 0 0 1 9 0v3.5" />
    </svg>
  );
}

export function PaletteIcon({ size = 17 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M12 2a10 10 0 1 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.3-.5-.8-.5-1.3 0-1.1.9-2 2-2H17a3 3 0 0 0 3-3c0-5.5-3.6-10.4-8-10.4Z" />
      <circle cx="7.5" cy="10.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="11" cy="7" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function LogoutIcon({ size = 17 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export function UserCircleIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} {...base}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6.3 18.5a6 6 0 0 1 11.4 0" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function CheckIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function MenuIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M3 6h18" /><path d="M3 12h18" /><path d="M3 18h18" />
    </svg>
  );
}

export function CropIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M6 2v14a2 2 0 0 0 2 2h14" />
      <path d="M18 22V8a2 2 0 0 0-2-2H2" />
    </svg>
  );
}

export function CloseIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M18 6 6 18" /><path d="M6 6l12 12" />
    </svg>
  );
}

export function DotsVerticalIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}

export function EditIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

export function KeyIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} {...base}>
      <circle cx="8" cy="15" r="4" />
      <path d="M10.85 12.15 19 4" />
      <path d="M16 7l2 2" />
      <path d="M19 4l2 2" />
    </svg>
  );
}

export function PauseCircleIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} {...base}>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 9v6" /><path d="M14 9v6" />
    </svg>
  );
}

export function RefreshIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 4v5h-5" />
    </svg>
  );
}

export function TrashIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" /><path d="M14 11v6" />
    </svg>
  );
}

export function BookIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    </svg>
  );
}

export function SchoolIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M2 10.5 12 5l10 5.5-10 5.5Z" />
      <path d="M6 12.5V18c0 1 2.7 2.5 6 2.5s6-1.5 6-2.5v-5.5" />
      <path d="M22 10.5V16" />
    </svg>
  );
}

export function ShieldIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M12 2.5 5 5.5v5c0 5 3 8.4 7 9.5 4-1.1 7-4.5 7-9.5v-5Z" />
      <path d="M9 12l2 2 4-4.5" />
    </svg>
  );
}

export function ClockIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

export function CoinsIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <ellipse cx="9" cy="7" rx="6" ry="3.5" />
      <path d="M3 7v5c0 1.93 2.69 3.5 6 3.5s6-1.57 6-3.5V7" />
      <path d="M3 12v5c0 1.93 2.69 3.5 6 3.5 2.4 0 4.5-.83 5.4-2.06" />
      <path d="M15 10.2c3 .2 6-.9 6-3.2s-2.69-3.5-6-3.5c-.9 0-1.75.11-2.5.32" />
      <path d="M15 15.2c3 .1 6-1 6-3.2v5c0 2.2-3 3.4-6 3.2" />
    </svg>
  );
}

export function CalendarIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 9.5h18" />
      <path d="M8 2.5v4M16 2.5v4" />
    </svg>
  );
}

// A ream (stack) of paper - three overlapping sheets, the front one showing
// text lines - used for the "Ream(s)" school-supply contribution. The old
// BasketIcon here was left over from when this field was called "Limu"
// (produce/lemons) and no longer fits now that it means reams of paper.
export function ReamIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <rect x="6" y="3" width="14" height="17" rx="1.4" />
      <path d="M3.5 6v14a1.4 1.4 0 0 0 1.4 1.4h13" />
      <line x1="9" y1="8" x2="17" y2="8" />
      <line x1="9" y1="11.5" x2="17" y2="11.5" />
      <line x1="9" y1="15" x2="14" y2="15" />
    </svg>
  );
}

export function LocationPinIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M12 21.5s7-7.2 7-12.3A7 7 0 0 0 5 9.2C5 14.3 12 21.5 12 21.5Z" />
      <circle cx="12" cy="9.2" r="2.6" />
    </svg>
  );
}

export function MegaphoneIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M3 11v3a2 2 0 0 0 2 2h1l1.5 5H10l-1-5h1l9 4V7L10 11H3Z" />
      <path d="M19 5v14" />
    </svg>
  );
}

export function MessageIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v9A2.5 2.5 0 0 1 17.5 17H9l-5 4Z" />
      <line x1="8" y1="8.5" x2="16" y2="8.5" />
      <line x1="8" y1="12" x2="13" y2="12" />
    </svg>
  );
}

export function SendIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M21.5 2.5 2 10.3l7.2 3 2.9 7.2 9.4-18Z" />
      <path d="M21.5 2.5 9.2 13.3" />
    </svg>
  );
}

export function PlusCircleIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

export function SaveIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M4.5 3.5h12L20.5 8v12a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z" />
      <path d="M7.5 3.5v6h8v-6" />
      <path d="M7 21v-6h10v6" />
    </svg>
  );
}

export function ChevronRightIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function TableIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="9" y1="4" x2="9" y2="20" />
      <line x1="15" y1="4" x2="15" y2="20" />
    </svg>
  );
}

export function LoginIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M11 4H6.5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2H11" />
      <path d="M15 8l4 4-4 4" />
      <line x1="19" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export function GraduationCapIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M2 9.5 12 5l10 4.5-10 4.5-10-4.5Z" />
      <path d="M6.5 11.7v4.6c0 1.5 2.5 3.2 5.5 3.2s5.5-1.7 5.5-3.2v-4.6" />
      <path d="M20.5 9.5v6" />
    </svg>
  );
}

export function UsersIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <circle cx="9" cy="8" r="3.3" />
      <path d="M2.8 19.5c0-3.2 2.8-5.3 6.2-5.3s6.2 2.1 6.2 5.3" />
      <path d="M15.5 5.3a3.3 3.3 0 0 1 0 6.4" />
      <path d="M18 14.5c2.4.5 3.7 2.2 3.7 5" />
    </svg>
  );
}

export function UtensilsIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M6 2.5v8a2 2 0 0 0 2 2v9" />
      <path d="M4 2.5v5.2M6 2.5v5.2M8 2.5v5.2" />
      <path d="M17 2.5c-1.8 0-3 2-3 5s1.2 5 3 5" />
      <path d="M17 2.5v19" />
    </svg>
  );
}

export function BarChartIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <line x1="4" y1="21" x2="20" y2="21" />
      <rect x="6" y="12" width="3.4" height="9" />
      <rect x="10.3" y="7" width="3.4" height="14" />
      <rect x="14.6" y="3" width="3.4" height="18" />
    </svg>
  );
}

export function SunIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <circle cx="12" cy="12" r="4.3" />
      <path d="M12 2.5v2.6M12 18.9v2.6M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12h2.6M18.9 12h2.6M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8" />
    </svg>
  );
}

export function ChevronLeftIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

export function CameraIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13.5" r="3.6" />
    </svg>
  );
}

export function ArrowUpCircleIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16V8M8.5 11.5 12 8l3.5 3.5" />
    </svg>
  );
}

export function HomeIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M3.5 10.5 12 3.5l8.5 7" />
      <path d="M5.5 9v10a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9" />
      <path d="M9.5 20v-6h5v6" />
    </svg>
  );
}

export function StarIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M12 2.8 14.9 8.9 21.6 9.8 16.8 14.4 18 21 12 17.8 6 21 7.2 14.4 2.4 9.8 9.1 8.9Z" />
    </svg>
  );
}

export function InfoIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="11" x2="12" y2="16.5" />
      <circle cx="12" cy="7.6" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function BasketIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M4 10h16l-1.6 8.6a2 2 0 0 1-2 1.65H7.6a2 2 0 0 1-2-1.65Z" />
      <path d="M8 10 9.5 4.5M16 10 14.5 4.5M9 14v3M12 14v3M15 14v3" />
    </svg>
  );
}

export function WalletIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h12A2.5 2.5 0 0 1 20 7.5" />
      <rect x="3" y="7.5" width="18" height="12" rx="2.5" />
      <path d="M15.5 13a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />
    </svg>
  );
}

export function UserHistoryIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <circle cx="10" cy="8" r="3.5" />
      <path d="M3.5 19.5c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5" />
      <path d="M20.5 13.5a4 4 0 1 1-4-4" />
      <path d="M16.5 9v1.8l1.2.9" />
    </svg>
  );
}

export function CheckCircleIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.3 10.8 15 16 9.5" />
    </svg>
  );
}

export function LayersIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M12 3 2.5 8 12 13l9.5-5Z" />
      <path d="M2.5 12 12 17l9.5-5" />
      <path d="M2.5 16 12 21l9.5-5" />
    </svg>
  );
}

export function CalendarPlusIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 9.5h18" />
      <path d="M8 2.5v4M16 2.5v4" />
      <path d="M12 13v5M9.5 15.5h5" />
    </svg>
  );
}

export function BedIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M2.5 19V7.5" />
      <path d="M2.5 19v-3.5h19V19" />
      <path d="M2.5 15.5V11a2 2 0 0 1 2-2h15a2 2 0 0 1 2 2v4.5" />
      <rect x="4.5" y="6.5" width="6" height="4" rx="1.2" />
      <path d="M21.5 19v2M2.5 19v2" />
    </svg>
  );
}

export function DownloadIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M4 19.5h16" />
    </svg>
  );
}

export function ReceiptIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M5 2.5h14v19l-2.5-1.6L14 21.5l-2-1.6-2 1.6-2.5-1.6L5 21.5Z" />
      <path d="M8 7.5h8M8 11h8M8 14.5h5" />
    </svg>
  );
}

// "View Profile Photo" button - a clean, modern eye glyph, same outline
// convention as the rest of the set.
export function EyeIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// Default avatar placeholder - a filled bust silhouette on a solid circle,
// the same style used by WhatsApp/Instagram for an account with no photo
// yet, instead of showing initials.
export function PersonSilhouetteIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <circle cx="12" cy="8.5" r="4" />
      <path d="M4 20.2C4.4 15.9 7.7 13 12 13s7.6 2.9 8 7.2c.06.6-.4 1.1-1 1.1H5c-.6 0-1.06-.5-1-1.1Z" />
    </svg>
  );
}

// Small branded loading indicator - the same two-ring MIKUMBI look as
// MikumbiLoader.jsx (navy/coral outer ring, teal/coral inner ring, spinning
// in opposite directions) but icon-sized and with no center wordmark, since
// there isn't room to read it at this scale. This is THE spinner used
// everywhere in the app: the account avatar upload overlay, the
// "Uploading.../Saving.../Please wait..." pills and buttons, and any plain
// "Loading..." label. Driven by the shared @keyframes mikumbi-loader-cw /
// mikumbi-loader-ccw in index.css, so nothing extra needs to load.
export function SpinnerIcon({ size = 16 }) {
  const outerThickness = Math.max(1.5, size * 0.16);
  const innerInset = Math.round(size * 0.22);
  const innerSize = Math.max(1, size - innerInset * 2);
  const innerThickness = Math.max(1.5, size * 0.14);
  return (
    <span style={{ position: "relative", display: "inline-block", width: size, height: size, flexShrink: 0 }}>
      <span aria-hidden="true" style={{
        position: "absolute", inset: 0, borderRadius: "50%",
        background: "conic-gradient(from 0deg, transparent 0deg, #1a50c7 65deg, #FF7F50 205deg, transparent 330deg, transparent 360deg)",
        WebkitMask: `radial-gradient(farthest-side, transparent calc(100% - ${outerThickness}px), #000 calc(100% - ${outerThickness}px))`,
        mask: `radial-gradient(farthest-side, transparent calc(100% - ${outerThickness}px), #000 calc(100% - ${outerThickness}px))`,
        animation: "mikumbi-loader-cw 1.25s linear infinite",
      }} />
      <span aria-hidden="true" style={{
        position: "absolute", top: innerInset, left: innerInset, width: innerSize, height: innerSize, borderRadius: "50%",
        background: "conic-gradient(from 180deg, transparent 0deg, #008B8B 75deg, #FF7F50 215deg, transparent 320deg, transparent 360deg)",
        WebkitMask: `radial-gradient(farthest-side, transparent calc(100% - ${innerThickness}px), #000 calc(100% - ${innerThickness}px))`,
        mask: `radial-gradient(farthest-side, transparent calc(100% - ${innerThickness}px), #000 calc(100% - ${innerThickness}px))`,
        animation: "mikumbi-loader-ccw 1.65s linear infinite",
      }} />
    </span>
  );
}

// "Search Results" - used for the Students Management / Results Management
// per-student result lookup button.
export function SearchIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

// Print button next to a student's compiled result.
export function PrinterIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M6 9V3h12v6" />
      <rect x="4" y="9" width="16" height="8" rx="1.5" />
      <path d="M6 17v4h12v-4" />
    </svg>
  );
}

// Top-10 performers table.
export function TrophyIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M7 5H4a1 1 0 0 0-1 1v1a4 4 0 0 0 4 4" />
      <path d="M17 5h3a1 1 0 0 1 1 1v1a4 4 0 0 1-4 4" />
      <path d="M12 13v4M9 20.5h6M9.5 20.5 10.3 17h3.4l.8 3.5" />
    </svg>
  );
}

// Bottom-10 performers table.
export function TrendingDownIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="m3 6 7 7 4-4 7 7" />
      <path d="M21 8v8h-8" />
    </svg>
  );
}

// Analytics Dashboard - "improving" trend indicator.
export function TrendingUpIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="m3 17 7-7 4 4 7-7" />
      <path d="M14 7h7v7" />
    </svg>
  );
}

// Analytics Dashboard - flat/no-clear-trend indicator.
export function TrendingFlatIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M3 12h14" />
      <path d="m13 8 4 4-4 4" />
    </svg>
  );
}

// Audit Log - file/history document icon.
export function FileClockIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M13 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v3" />
      <circle cx="16" cy="16" r="5" />
      <path d="M16 14.5V16l1.2.8" />
    </svg>
  );
}

// Notification Center - bell icon (header).
export function BellIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

