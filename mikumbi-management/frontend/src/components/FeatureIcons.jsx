// FeatureIcons.jsx
// Flat, modern, single-weight line icons - replaces the old "soft 3D"
// gradient/shadow illustrations (FeatureIcons3D.jsx). Same idea per feature,
// same function names/size prop so Landing.jsx only needed its import
// path updated. Every glyph uses a thin, consistent stroke (1.7) on a
// flat colored circle badge - no gradients, no drop-shadows, no bevels.

function Badge({ bg, children }) {
  return (
    <>
      <circle cx="50" cy="50" r="34" fill={bg} />
      {children}
    </>
  );
}

const STROKE = 1.7;

// 1. Help Chatbot - friendly robot head, thin outline
export function IconChatbot3D({ size = 90 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <Badge bg="#EEF1FC">
        <g fill="none" stroke="#5B6AC7" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
          <rect x="32" y="38" width="36" height="28" rx="9" />
          <line x1="50" y1="38" x2="50" y2="29" />
          <circle cx="50" cy="25" r="3.2" />
          <circle cx="42" cy="52" r="2.6" fill="#5B6AC7" stroke="none" />
          <circle cx="58" cy="52" r="2.6" fill="#5B6AC7" stroke="none" />
          <path d="M43 60c2.6 2 11.4 2 14 0" />
          <line x1="26" y1="48" x2="32" y2="48" />
          <line x1="68" y1="48" x2="74" y2="48" />
        </g>
      </Badge>
    </svg>
  );
}

// 2. Timetable - calendar with a small clock badge
export function IconTimetable3D({ size = 90 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <Badge bg="#E9F7F5">
        <g fill="none" stroke="#2E8E8A" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
          <rect x="28" y="32" width="38" height="34" rx="4" />
          <line x1="28" y1="42" x2="66" y2="42" />
          <line x1="37" y1="27" x2="37" y2="36" />
          <line x1="57" y1="27" x2="57" y2="36" />
          <line x1="36" y1="50" x2="42" y2="50" />
          <line x1="48" y1="50" x2="54" y2="50" />
          <line x1="36" y1="58" x2="42" y2="58" />
          <circle cx="70" cy="66" r="11" fill="#E9F7F5" />
          <circle cx="70" cy="66" r="11" />
          <path d="M70 60v6l4 3" />
        </g>
      </Badge>
    </svg>
  );
}

// 3. Results - report sheet with a magnifying glass
export function IconResults3D({ size = 90 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <Badge bg="#FCEFF3">
        <g fill="none" stroke="#B2436A" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
          <rect x="30" y="26" width="32" height="42" rx="4" />
          <line x1="37" y1="37" x2="55" y2="37" />
          <line x1="37" y1="45" x2="55" y2="45" />
          <line x1="37" y1="53" x2="49" y2="53" />
          <circle cx="66" cy="66" r="10" />
          <line x1="73.5" y1="73.5" x2="80" y2="80" />
        </g>
      </Badge>
    </svg>
  );
}

// 4. Communication - chat bubble with a notification dot
export function IconCommunication3D({ size = 90 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <Badge bg="#EAF0FE">
        <g fill="none" stroke="#3363C7" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
          <path d="M28 40c0-6.6 5.4-12 12-12h20c6.6 0 12 5.4 12 12v10c0 6.6-5.4 12-12 12H45l-11 9v-9h-1c-3.3 0-5-2.7-5-6Z" />
          <line x1="36" y1="38" x2="60" y2="38" />
          <line x1="36" y1="46" x2="52" y2="46" />
        </g>
        <circle cx="70" cy="30" r="5" fill="#E4463F" />
      </Badge>
    </svg>
  );
}

// 5. Student Management - ID card + graduation cap
export function IconStudent3D({ size = 90 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <Badge bg="#EFEDFB">
        <g fill="none" stroke="#6B5FD1" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
          <rect x="28" y="40" width="34" height="28" rx="4" />
          <circle cx="38" cy="51" r="4.4" />
          <path d="M31 62c0-4.4 3.1-7 7-7s7 2.6 7 7" />
          <line x1="50" y1="49" x2="56" y2="49" />
          <line x1="50" y1="55" x2="56" y2="55" />
          <path d="M46 30 66 22l20 8-20 8Z" />
          <path d="M54 33v9c0 2.4 5.4 4.3 12 4.3s12-1.9 12-4.3v-9" />
          <line x1="84" y1="31" x2="84" y2="43" />
        </g>
      </Badge>
    </svg>
  );
}

// 6. Hostel Management - bed, thin outline
export function IconHostel3D({ size = 90 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <Badge bg="#EAEFFD">
        <g fill="none" stroke="#2748C4" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
          <line x1="26" y1="34" x2="26" y2="72" />
          <path d="M26 58h48v6c0 2.2-1.8 4-4 4H30c-2.2 0-4-1.8-4-4Z" />
          <path d="M26 58v-8c0-3.3 2.7-6 6-6h32c3.3 0 6 2.7 6 6v8" />
          <rect x="31" y="40" width="12" height="9" rx="2.4" />
          <line x1="20" y1="72" x2="80" y2="72" />
          <line x1="30" y1="72" x2="30" y2="78" />
          <line x1="72" y1="72" x2="72" y2="78" />
          <path d="M68 32c1.6 1.6 1.6 4.2 0 5.8M72.5 29c2.8 2.8 2.8 7.4 0 10.2" />
        </g>
      </Badge>
    </svg>
  );
}

// 6b. Food Contributions - plate with fork and spoon
export function IconFood3D({ size = 90 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <Badge bg="#FDF1E3">
        <g fill="none" stroke="#C9740F" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="50" cy="53" r="16" />
          <circle cx="50" cy="53" r="9.5" />
          <path d="M30 30v14M26 30v9c0 3 1.8 5 4 5s4-2 4-5v-9" />
          <path d="M73 30c-3.4 0-6 3-6 8s2.6 9 6 9v18" />
        </g>
      </Badge>
    </svg>
  );
}

// 7. TAMS (Teacher Attendance) - clipboard with a checklist + clock
export function IconTams3D({ size = 90 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <Badge bg="#EAF0FE">
        <g fill="none" stroke="#3C64C9" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
          <rect x="32" y="26" width="30" height="40" rx="4" />
          <rect x="41" y="22" width="12" height="7" rx="2" fill="#EAF0FE" />
          <path d="M38 40l2.4 2.4L44 38" />
          <line x1="48" y1="40" x2="56" y2="40" />
          <path d="M38 50l2.4 2.4L44 48" />
          <line x1="48" y1="50" x2="56" y2="50" />
          <circle cx="70" cy="66" r="10" fill="#EAF0FE" />
          <circle cx="70" cy="66" r="10" />
          <path d="M70 60.5v6l4 2.5" />
        </g>
      </Badge>
    </svg>
  );
}

// 9. Analytics Dashboard - bar chart with an upward trend line
export function IconAnalytics3D({ size = 90 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <Badge bg="#E7F3F6">
        <g fill="none" stroke="#0E7490" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
          <line x1="30" y1="70" x2="30" y2="30" />
          <line x1="30" y1="70" x2="72" y2="70" />
          <rect x="38" y="54" width="8" height="16" />
          <rect x="52" y="44" width="8" height="26" />
          <rect x="66" y="36" width="6" height="34" />
          <path d="M38 40l10-9 9 6 13-13" />
        </g>
      </Badge>
    </svg>
  );
}

// 10. Contributions Management - card + coin
export function IconContribution3D({ size = 90 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <Badge bg="#EAF7EF">
        <g fill="none" stroke="#2F9A55" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
          <rect x="24" y="36" width="34" height="23" rx="4" />
          <line x1="24" y1="43" x2="58" y2="43" />
          <circle cx="70" cy="60" r="11" />
          <path d="M70 55v10M66.5 58.5c0-1.8 1.6-3 3.5-3s3.5 1.2 3.5 3-1.6 3-3.5 3-3.5 1.2-3.5 3 1.6 3 3.5 3 3.5-1.2 3.5-3" />
        </g>
      </Badge>
    </svg>
  );
}

