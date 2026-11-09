import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../utils/api";
import { THEME } from "../styles/theme";
import { useConfirm } from "../components/ConfirmDialog";
import { showSuccess } from "../components/SuccessModal";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { ChevronDownIcon, MegaphoneIcon, MessageIcon, SendIcon, PlusCircleIcon, TrashIcon, CheckIcon, CloseIcon, SpinnerIcon } from "../components/icons";

export default function Communications() {
  const { user } = useAuth();
  const { isMobile, isTablet } = useBreakpoint();
  const [tab, setTab] = useState("announcements");
  if (!user) return null; // guards the brief moment during a route/auth transition before `user` is populated

  return (
    <div style={{ padding: isMobile ? "16px 12px" : isTablet ? "24px 20px" : 40 }}>
      <h2 style={{ color: THEME.heading, fontSize: isMobile ? 16 : isTablet ? 18 : 20, marginBottom: 16 }}>Communications</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
        <TabBtn active={tab === "announcements"} isMobile={isMobile} onClick={() => setTab("announcements")}><MegaphoneIcon size={14} />Online Announcement</TabBtn>
        {(user.role === "admin" || user.role === "second_master") && (
          <TabBtn active={tab === "sms"} isMobile={isMobile} onClick={() => setTab("sms")}><MessageIcon size={14} />SMS Service</TabBtn>
        )}
      </div>
      {tab === "announcements" ? <AnnouncementsTab isMobile={isMobile} /> : <SmsTab isMobile={isMobile} isTablet={isTablet} />}
    </div>
  );
}

function TabBtn({ active, onClick, children, isMobile }) {
  return (
    <button onClick={onClick} style={{
      padding: isMobile ? "8px 14px" : "8px 20px", borderRadius: 4, border: `1px solid ${THEME.border}`,
      background: active ? THEME.navy : THEME.surface, color: active ? "#fff" : THEME.text,
      fontWeight: 600, fontSize: isMobile ? 12.5 : 13, cursor: "pointer", whiteSpace: "nowrap",
      display: "inline-flex", alignItems: "center", gap: 7,
    }}>{children}</button>
  );
}

// ══════════════════ ANNOUNCEMENTS ══════════════════
function AnnouncementsTab({ isMobile }) {
  const { token } = useAuth();
  const [list, setList] = useState([]);
  const [title, setTitle] = useState("");
  const [msg, setMsg] = useState("");
  // Deliberately starts EMPTY: the admin must consciously choose who the
  // announcement is for, so an internal notice can't reach parents by accident.
  const [audience, setAudience] = useState("");
  // How long it stays visible: a number of days, "date" (until a chosen day) or "never".
  const [duration, setDuration] = useState("3");
  const [endDate, setEndDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const { confirm, ConfirmDialogPortal } = useConfirm();

  const load = () => apiFetch("/communications/announcements", {}, token)
    .then((d) => { setList(d.announcements || []); setLoadError(""); })
    .catch((err) => setLoadError(err.message || "Failed to load announcements."));
  useEffect(() => { load(); }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !msg.trim()) return;
    if (!audience) { setLoadError("Please choose who this announcement is for (Staff, Parents & public, or Both)."); return; }
    if (duration === "date" && !endDate) { setLoadError("Please choose the date this announcement should end."); return; }
    const expiry = duration === "never" ? { expiry_type: "never" }
      : duration === "date" ? { expiry_type: "date", expiry_date: endDate }
      : { expiry_type: "days", expiry_days: Number(duration) };
    setBusy(true);
    try {
      await apiFetch("/communications/announcements", { method: "POST", body: JSON.stringify({ title, message: msg, audience, ...expiry }) }, token);
      showSuccess("Announcement", "Announcement Successfully Posted.");
      setTitle(""); setMsg(""); setAudience(""); setDuration("3"); setEndDate(""); setLoadError("");
      load();
    } catch (err) {
      setLoadError(err.message);
    } finally { setBusy(false); }
  };

  const remove = (id) => confirm("Are you sure you want to delete this announcement?", async () => {
    try {
      await apiFetch(`/communications/announcements/${id}`, { method: "DELETE" }, token);
      showSuccess("Announcement", "Announcement Successfully Deleted.");
      load();
    } catch (err) { setLoadError(err.message); }
  });

  return (
    <div>
      <form onSubmit={submit} style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, padding: isMobile ? 14 : 18, marginBottom: 24, maxWidth: isMobile ? "100%" : 520 }}>
        <input placeholder="Announcement title" value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
        <textarea placeholder="Message..." value={msg} onChange={(e) => setMsg(e.target.value)} rows={3} style={{ ...inputStyle, marginTop: 10, resize: "vertical" }} />

        <fieldset style={{ border: "none", padding: 0, margin: "14px 0 4px" }}>
          <legend style={{ fontSize: 12.5, fontWeight: 700, color: THEME.heading, padding: 0, marginBottom: 8 }}>Send to: <span style={{ color: THEME.danger }}>*</span></legend>
          <div style={{ display: "grid", gap: 8 }}>
            {AUDIENCE_OPTIONS.map((o) => (
              <label key={o.value} style={{
                display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 12px", cursor: "pointer", borderRadius: 4,
                border: `1.5px solid ${audience === o.value ? THEME.navy : THEME.border}`,
                background: audience === o.value ? "rgba(12,66,111,0.06)" : "transparent",
              }}>
                <input type="radio" name="announcement-audience" value={o.value} checked={audience === o.value} onChange={() => setAudience(o.value)} style={{ marginTop: 3 }} />
                <span>
                  <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: THEME.text }}>{o.label}</span>
                  <span style={{ display: "block", fontSize: 11.5, color: THEME.muted, marginTop: 1 }}>{o.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div style={{ margin: "14px 0 4px" }}>
          <label htmlFor="announcement-duration" style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: THEME.heading, marginBottom: 8 }}>Show this announcement for:</label>
          <select id="announcement-duration" value={duration} onChange={(e) => setDuration(e.target.value)} style={{ ...inputStyle, background: THEME.surface, color: THEME.text }}>
            {DURATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {duration === "date" && (
            <input type="date" aria-label="Announcement end date" value={endDate} min={todayInTz()} onChange={(e) => setEndDate(e.target.value)} style={{ ...inputStyle, marginTop: 8, background: THEME.surface, color: THEME.text }} />
          )}
          <p style={{ fontSize: 11.5, color: THEME.muted, marginTop: 6 }}>
            {duration === "never"
              ? "It stays visible until you delete it yourself."
              : duration === "date"
                ? "It stays visible until the end of the chosen day, then disappears automatically."
                : "It disappears automatically when this time is over. You can still delete it earlier."}
          </p>
        </div>

        <button disabled={busy} style={{ ...btnStyle, display: "inline-flex", alignItems: "center", gap: 7 }}>{busy ? <SpinnerIcon size={14} /> : <MegaphoneIcon size={14} />}{busy ? "Sending..." : "Post Announcement"}</button>
        <p style={{ fontSize: 11.5, color: THEME.muted, marginTop: 8 }}>It is shown only on the site(s) you choose above.</p>
      </form>

      <div style={{ display: "grid", gap: 10, maxWidth: isMobile ? "100%" : 640 }}>
        {loadError && (
          <div style={{ padding: 12, borderRadius: 4, fontSize: 13.5, background: THEME.dangerLight, color: THEME.danger }}>⚠ {loadError}</div>
        )}
        {list.map((a) => (
          <div key={a.id} style={{
            background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, padding: 14,
            opacity: isLive(a) ? 1 : 0.55,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
                <b style={{ fontSize: 14, overflowWrap: "anywhere" }}>{a.title}</b>
                <AudienceBadge audience={a.audience} />
              </span>
              <button onClick={() => remove(a.id)} style={{ background: "none", border: "none", color: THEME.danger, cursor: "pointer", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}><TrashIcon size={12} />Delete</button>
            </div>
            <p style={{ fontSize: 13, color: THEME.text, margin: "6px 0", overflowWrap: "anywhere" }}>{a.message}</p>
            <div style={{ fontSize: 11, color: THEME.muted }}>
              {a.created_at ? new Date(a.created_at).toLocaleString("en-GB", { timeZone: "Africa/Dar_es_Salaam" }) : ""} · {a.created_by_name}
            </div>
            <div style={{ fontSize: 11, marginTop: 3, fontWeight: 700, color: !a.expires_at ? "#166534" : isLive(a) ? THEME.muted : THEME.danger }}>
              {expiryText(a)}
            </div>
          </div>
        ))}
      </div>
      {ConfirmDialogPortal}
    </div>
  );
}

const DURATION_OPTIONS = [
  { value: "1", label: "1 day" },
  { value: "3", label: "3 days" },
  { value: "7", label: "1 week" },
  { value: "14", label: "2 weeks" },
  { value: "30", label: "1 month" },
  { value: "date", label: "Until a date I choose…" },
  { value: "never", label: "Forever – until I delete it" },
];
const TZ = "Africa/Dar_es_Salaam";
// Today's date as YYYY-MM-DD in Tanzania time (for the date picker's minimum).
const todayInTz = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });
// Visible right now? (no expiry date at all = never expires)
const isLive = (a) => a.is_active && (!a.expires_at || new Date(a.expires_at) > new Date());
const expiryText = (a) => {
  if (!a.expires_at) return "Never expires – stays until deleted";
  const when = new Date(a.expires_at).toLocaleString("en-GB", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" });
  return new Date(a.expires_at) > new Date() ? `Expires ${when}` : `Expired ${when}`;
};

const AUDIENCE_OPTIONS = [
  { value: "staff", label: "Staff only", hint: "Shown to teachers after they log in to the staff site." },
  { value: "public", label: "Parents & public", hint: "Shown on the public school website (news section)." },
  { value: "both", label: "Both", hint: "Shown to staff and on the public school website." },
];
const AUDIENCE_BADGE = {
  staff: { text: "Staff", bg: "#E0ECFF", color: "#1E40AF" },
  public: { text: "Parents & public", bg: "#FFEDD5", color: "#9A3412" },
  both: { text: "Staff + Parents", bg: "#DCFCE7", color: "#166534" },
};
function AudienceBadge({ audience }) {
  const b = AUDIENCE_BADGE[audience];
  if (!b) return null;
  return <span style={{ background: b.bg, color: b.color, fontSize: 10.5, fontWeight: 800, padding: "2px 9px", borderRadius: 4, whiteSpace: "nowrap" }}>{b.text}</span>;
}

// ══════════════════ SMS SERVICE (Admin / Second Master only) ══════════════════
// Matches the exact `form` values used on student records (Student
// Management), which is what parent contacts are auto-synced by.
const FORMS = ["Form I", "Form II", "Form III", "Form IV"];

const RECIPIENT_GROUPS = [
  { group: "Send to Everyone in a Group", options: [
    { value: "all_staff", label: "All Staff" },
    { value: "all_parents", label: "All Parents" },
    { value: "parents_by_class", label: "Parents of a Specific Class" },
  ] },
  { group: "Send to Selected People", options: [
    { value: "selected_staff", label: "Select Staff (one, several, or all)" },
    { value: "selected_parents", label: "Select Parents (one, several, or all)" },
    { value: "selected_individuals", label: "Select Individuals (one, several, or all)" },
  ] },
  { group: "Other", options: [
    { value: "individual", label: "One-off Phone Number (not saved)" },
  ] },
];

// A hand-built dropdown (not a native <select>/<optgroup>) - needed because
// long group + option labels like "Send to Everyone in a Group" render
// inconsistently (cramped, clipped, or oddly wrapped) inside a native select
// on mobile/tablet browsers, where the OS - not our CSS - controls that
// popup. Building it ourselves guarantees the same clean, readable layout
// on every screen size.
function RecipientSelect({ value, onChange, isMobile }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const current = RECIPIENT_GROUPS.flatMap((g) => g.options).find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("touchstart", onOutside);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("touchstart", onOutside);
    };
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{
        ...inputStyle, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
        background: THEME.surface, cursor: "pointer", textAlign: "left", color: THEME.text,
      }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{current ? current.label : "Select recipients…"}</span>
        <ChevronDownIcon size={14} style={{ flexShrink: 0, color: THEME.muted, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>
      {open && (
        <div style={{
          position: "absolute", left: 0, right: 0, top: "calc(100% + 4px)", background: THEME.surface,
          border: `1px solid ${THEME.border}`, borderRadius: 4, boxShadow: "0 10px 26px rgba(0,0,0,0.16)",
          zIndex: 30, maxHeight: 320, overflowY: "auto",
        }}>
          {RECIPIENT_GROUPS.map((g, gi) => (
            <div key={g.group} style={{ borderTop: gi > 0 ? `1px solid ${THEME.border}` : "none" }}>
              <div style={{ padding: "8px 12px 4px", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: THEME.muted }}>{g.group}</div>
              {g.options.map((o) => (
                <button type="button" key={o.value} onClick={() => { onChange(o.value); setOpen(false); }} style={{
                  display: "block", width: "100%", textAlign: "left", padding: isMobile ? "10px 12px" : "9px 12px",
                  fontSize: isMobile ? 12.5 : 13, lineHeight: 1.4, whiteSpace: "normal", wordBreak: "break-word",
                  background: o.value === value ? THEME.bg : "transparent", border: "none", cursor: "pointer", color: THEME.text,
                }}>{o.label}</button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SmsTab({ isMobile, isTablet }) {
  const { token } = useAuth();
  const [category, setCategory] = useState("all_staff");
  const [message, setMessage] = useState("");
  const [className, setClassName] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyError, setHistoryError] = useState("");

  // Staff/Parent names are never typed here - they're synced automatically
  // (Staff from User Accounts, Parents from Student Management). This list
  // is what makes those names visible, and is what "Select Staff"/"Select
  // Parents" pick from. Individuals are the one exception: people who
  // aren't staff or a student's parent (e.g. a board member, a supplier) -
  // registered right here, once, then reused for any future send instead of
  // retyping their number every time.
  const [staffContacts, setStaffContacts] = useState([]);
  const [parentContacts, setParentContacts] = useState([]);
  const [individualContacts, setIndividualContacts] = useState([]);
  const [contactsError, setContactsError] = useState("");
  const [selectedStaffIds, setSelectedStaffIds] = useState([]);
  const [selectedParentIds, setSelectedParentIds] = useState([]);
  const [selectedIndividualIds, setSelectedIndividualIds] = useState([]);
  const [clearingFailed, setClearingFailed] = useState(false);

  const loadHistory = () => apiFetch("/communications/sms/history?limit=20", {}, token)
    .then((d) => { setHistory(d.logs || []); setHistoryError(""); })
    .catch((err) => setHistoryError(err.message || "Failed to load message history."));

  const loadContacts = () => Promise.all([
    apiFetch("/communications/sms/contacts/staff", {}, token),
    apiFetch("/communications/sms/contacts/parents", {}, token),
    apiFetch("/communications/sms/contacts/individuals", {}, token),
  ]).then(([s, p, i]) => {
    setStaffContacts(s.contacts || []);
    setParentContacts(p.contacts || []);
    setIndividualContacts(i.contacts || []);
    setContactsError("");
  }).catch((err) => setContactsError(err.message || "Failed to load contacts."));

  useEffect(() => { loadHistory(); loadContacts(); }, [token]);

  const toggleStaff = (id) => setSelectedStaffIds((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  const toggleParent = (id) => setSelectedParentIds((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  const toggleIndividual = (id) => setSelectedIndividualIds((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

  const clearFailed = async () => {
    setClearingFailed(true);
    try {
      const data = await apiFetch("/communications/sms/history/failed", { method: "DELETE" }, token);
      showSuccess("Message History", data.message || "Failed messages removed.");
      loadHistory();
    } catch (err) {
      setHistoryError(err.message || "Failed to remove failed messages.");
    } finally { setClearingFailed(false); }
  };

  const send = async (e) => {
    e.preventDefault();
    setBusy(true); setStatus(null);
    try {
      const body = { category, message };
      if (category === "parents_by_class") body.class_name = className;
      if (category === "individual") body.phone = phone;
      if (category === "selected_staff") body.staff_ids = selectedStaffIds;
      if (category === "selected_parents") body.parent_ids = selectedParentIds;
      if (category === "selected_individuals") body.individual_ids = selectedIndividualIds;
      const data = await apiFetch("/communications/sms/send", { method: "POST", body: JSON.stringify(body) }, token);
      setStatus({ ok: true, text: data.message });
      showSuccess("Message", data.message || "Message Successfully Sent.");
      setMessage("");
      if (category === "selected_staff") setSelectedStaffIds([]);
      if (category === "selected_parents") setSelectedParentIds([]);
      if (category === "selected_individuals") setSelectedIndividualIds([]);
      loadHistory();
    } catch (err) {
      setStatus({ ok: false, text: err.message });
    } finally { setBusy(false); }
  };

  const needsSelection = category === "selected_staff" || category === "selected_parents" || category === "selected_individuals";
  const selectionCount = category === "selected_staff" ? selectedStaffIds.length
    : category === "selected_parents" ? selectedParentIds.length
    : category === "selected_individuals" ? selectedIndividualIds.length : 0;
  const canSend = !busy && message.trim()
    && (!needsSelection || selectionCount > 0)
    && (category !== "parents_by_class" || className)
    && (category !== "individual" || phone.trim());

  return (
    <div>
      <form onSubmit={send} style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, padding: isMobile ? 14 : 18, marginBottom: 24, maxWidth: isMobile ? "100%" : 560 }}>
        <label style={labelStyle}>Recipients</label>
        <RecipientSelect value={category} onChange={setCategory} isMobile={isMobile} />

        {category === "parents_by_class" && (
          <select value={className} onChange={(e) => setClassName(e.target.value)} style={{ ...inputStyle, marginTop: 10 }}>
            <option value="">Select a class...</option>
            {FORMS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        )}
        {category === "individual" && (
          <input placeholder="Phone number, e.g. 0754xxxxxx" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ ...inputStyle, marginTop: 10 }} />
        )}
        {category === "selected_individuals" && (
          <>
            <IndividualContactForm token={token} onAdded={loadContacts} isMobile={isMobile} />
            <ContactPicker
              contacts={individualContacts} selectedIds={selectedIndividualIds} onToggle={toggleIndividual}
              onSelectAll={() => setSelectedIndividualIds(individualContacts.map((c) => c.id))}
              onClear={() => setSelectedIndividualIds([])}
              error={contactsError}
              nameKey="name"
              renderLine={() => null}
              emptyText="No individual contacts yet - register one above."
              isMobile={isMobile}
              onDelete={async (id) => {
                await apiFetch(`/communications/sms/contacts/individuals/${id}`, { method: "DELETE" }, token);
                setSelectedIndividualIds((ids) => ids.filter((x) => x !== id));
                loadContacts();
              }}
            />
          </>
        )}
        {category === "selected_staff" && (
          <ContactPicker
            contacts={staffContacts} selectedIds={selectedStaffIds} onToggle={toggleStaff}
            onSelectAll={() => setSelectedStaffIds(staffContacts.map((c) => c.id))}
            onClear={() => setSelectedStaffIds([])}
            error={contactsError}
            nameKey="name"
            renderLine={(c) => c.position}
            emptyText="No staff phone numbers yet - add a phone number when creating or editing an account in User Accounts."
            isMobile={isMobile}
          />
        )}
        {category === "selected_parents" && (
          <ContactPicker
            contacts={parentContacts} selectedIds={selectedParentIds} onToggle={toggleParent}
            onSelectAll={() => setSelectedParentIds(parentContacts.map((c) => c.id))}
            onClear={() => setSelectedParentIds([])}
            error={contactsError}
            nameKey="parent_name"
            renderLine={(c) => `${c.student_name} · ${c.class_name}`}
            emptyText="No parent contacts yet - they're added automatically when a student is registered in Student Management."
            isMobile={isMobile}
          />
        )}

        <label style={labelStyle}>Message</label>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} style={{ ...inputStyle, resize: "vertical" }} />

        {status && (
          <div style={{ marginTop: 10, fontSize: 13, color: status.ok ? THEME.success : THEME.danger }}>{status.text}</div>
        )}
        <button disabled={!canSend} style={{ ...btnStyle, opacity: canSend ? 1 : 0.55, cursor: canSend ? "pointer" : "not-allowed", display: "inline-flex", alignItems: "center", gap: 7 }}>
          <SendIcon size={14} />{busy ? "Sending..." : "Send SMS"}
        </button>
      </form>

      <ContactsDirectory staffContacts={staffContacts} parentContacts={parentContacts} error={contactsError} isMobile={isMobile} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
        <h3 style={{ fontSize: 14, margin: 0 }}>Message History</h3>
        {history.some((h) => h.status === "failed") && (
          <button type="button" onClick={clearFailed} disabled={clearingFailed} style={{ ...linkBtnStyle, color: THEME.danger, opacity: clearingFailed ? 0.6 : 1, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <TrashIcon size={12} />{clearingFailed ? "Removing…" : "Delete failed messages"}
          </button>
        )}
      </div>
      {historyError && (
        <div style={{ marginBottom: 10, padding: 12, borderRadius: 4, fontSize: 13.5, background: THEME.dangerLight, color: THEME.danger, maxWidth: isMobile ? "100%" : 640 }}>⚠ {historyError}</div>
      )}
      <div style={{ display: "grid", gap: 6, maxWidth: isMobile ? "100%" : 640 }}>
        {history.map((h) => (
          <div key={h.id} style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, padding: "10px 14px", fontSize: 12.5 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <b>{h.recipients}</b>
              <span style={{ color: h.status === "sent" ? THEME.success : h.status === "partial" ? THEME.warning : THEME.danger, fontWeight: 600 }}>{h.status}</span>
            </div>
            <div style={{ color: THEME.muted, marginTop: 2, overflowWrap: "anywhere" }}>{h.message}</div>
            {h.recipient_numbers && (
              <details style={{ marginTop: 4 }}>
                <summary style={{ cursor: "pointer", fontSize: 11, color: THEME.muted }}>Sent to which numbers?</summary>
                <div style={{ marginTop: 4, fontSize: 11, color: THEME.muted, fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}>{h.recipient_numbers}</div>
              </details>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// A checkbox picker used for "Select Staff" / "Select Parents" - the names
// shown here come straight from User Accounts / Student Management and
// can't be typed or added from this screen.
function ContactPicker({ contacts, selectedIds, onToggle, onSelectAll, onClear, error, nameKey, renderLine, emptyText, isMobile, onDelete }) {
  const nameSize = isMobile ? 12 : 12.5;
  const lineSize = isMobile ? 10.5 : 11;
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: isMobile ? 11 : 11.5, color: THEME.muted }}>{selectedIds.length} of {contacts.length} selected</span>
        <div style={{ display: "flex", gap: 12 }}>
          <button type="button" onClick={onSelectAll} style={{ ...linkBtnStyle, display: "inline-flex", alignItems: "center", gap: 4 }}><CheckIcon size={11} />Select all</button>
          <button type="button" onClick={onClear} style={{ ...linkBtnStyle, display: "inline-flex", alignItems: "center", gap: 4 }}><CloseIcon size={11} />Clear</button>
        </div>
      </div>
      {error && <div style={{ fontSize: 12, color: THEME.danger, marginBottom: 6 }}>⚠ {error}</div>}
      <div style={{ maxHeight: 220, overflowY: "auto", border: `1px solid ${THEME.border}`, borderRadius: 4 }}>
        {contacts.length === 0 && !error && (
          <div style={{ padding: 14, fontSize: 12, color: THEME.muted }}>{emptyText}</div>
        )}
        {contacts.map((c) => {
          const line = renderLine(c);
          return (
            <label key={c.id} style={{
              display: "flex", alignItems: "flex-start", gap: isMobile ? 8 : 10,
              padding: isMobile ? "9px 10px" : "9px 12px", borderBottom: `1px solid ${THEME.border}`, cursor: "pointer",
            }}>
              <input type="checkbox" checked={selectedIds.includes(c.id)} onChange={() => onToggle(c.id)} style={{ marginTop: 3, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, display: "grid", gap: 2 }}>
                <b style={{ fontSize: nameSize, lineHeight: 1.3, overflowWrap: "anywhere" }}>{c[nameKey]}</b>
                {line && <span style={{ color: THEME.muted, fontSize: lineSize, lineHeight: 1.4, overflowWrap: "anywhere" }}>{line}</span>}
                <span style={{ color: THEME.muted, fontSize: lineSize, lineHeight: 1.4, fontVariantNumeric: "tabular-nums" }}>{c.phone}</span>
              </span>
              {onDelete && (
                <button type="button" onClick={(e) => { e.preventDefault(); onDelete(c.id); }} style={{ ...linkBtnStyle, color: THEME.danger, flexShrink: 0, marginTop: 2, display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <TrashIcon size={11} />Remove
                </button>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

// Lets a Head Master / Second Master register a person who isn't staff and
// isn't a student's parent (a board member, a supplier, a guest speaker…) -
// saved once here, then reusable from the "Select Individuals" picker for
// any future message instead of retyping the number every time.
function IndividualContactForm({ token, onAdded, isMobile }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const add = async (e) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    setBusy(true); setErr("");
    try {
      await apiFetch("/communications/sms/contacts/individuals", { method: "POST", body: JSON.stringify({ name: name.trim(), phone: phone.trim() }) }, token);
      setName(""); setPhone("");
      onAdded();
    } catch (e2) {
      setErr(e2.message || "Failed to add contact.");
    } finally { setBusy(false); }
  };

  return (
    <div style={{ marginTop: 10, padding: isMobile ? 10 : 12, background: THEME.bg, border: `1px solid ${THEME.border}`, borderRadius: 4 }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 8 }}>Register a new individual contact</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, flex: "1 1 160px" }} />
        <input placeholder="Phone, e.g. 0754xxxxxx" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ ...inputStyle, flex: "1 1 160px" }} />
        <button type="button" onClick={add} disabled={busy || !name.trim() || !phone.trim()} style={{ ...btnStyle, marginTop: 0, padding: "10px 16px", opacity: busy ? 0.6 : 1, display: "inline-flex", alignItems: "center", gap: 6 }}>
          {busy ? <SpinnerIcon size={14} /> : <PlusCircleIcon size={14} />}{busy ? "Adding…" : "Add"}
        </button>
      </div>
      {err && <div style={{ fontSize: 11.5, color: THEME.danger, marginTop: 6 }}>⚠ {err}</div>}
    </div>
  );
}

// Read-only view so the Head Master / Second Master can always see who's on
// each list - names shown here can never be typed or added here; a Staff
// contact only appears once it's registered with a phone number in User
// Accounts, and a Parent contact only appears once the student is
// registered in Student Management.
function ContactsDirectory({ staffContacts, parentContacts, error, isMobile }) {
  const [tab, setTab] = useState("staff");
  const list = tab === "staff" ? staffContacts : parentContacts;
  return (
    <div style={{ marginBottom: 24, maxWidth: isMobile ? "100%" : 640 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <TabBtn active={tab === "staff"} isMobile={isMobile} onClick={() => setTab("staff")}>Staff Directory ({staffContacts.length})</TabBtn>
        <TabBtn active={tab === "parents"} isMobile={isMobile} onClick={() => setTab("parents")}>Parents Directory ({parentContacts.length})</TabBtn>
      </div>
      <p style={{ fontSize: 11.5, color: THEME.muted, margin: "0 0 8px" }}>
        {tab === "staff"
          ? "Synced automatically from User Accounts - add or edit a phone number there to change this list."
          : "Synced automatically from Student Management - register or edit the student there to change this list."}
      </p>
      {error && <div style={{ fontSize: 12, color: THEME.danger, marginBottom: 8 }}>⚠ {error}</div>}
      <div style={{ maxHeight: 260, overflowY: "auto", background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4 }}>
        {list.length === 0 && <div style={{ padding: 14, fontSize: 12.5, color: THEME.muted }}>No contacts yet.</div>}
        {list.map((c, i) => (
          <div key={c.id} style={{
            padding: "9px 14px", borderTop: i > 0 ? `1px solid ${THEME.border}` : "none", fontSize: 12.5,
            display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap",
          }}>
            <b style={{ overflowWrap: "anywhere" }}>{tab === "staff" ? c.name : c.parent_name}</b>
            <span style={{ color: THEME.muted, overflowWrap: "anywhere" }}>{tab === "staff" ? c.position : `${c.student_name} · ${c.class_name}`}</span>
            <span style={{ color: THEME.muted, whiteSpace: "nowrap" }}>{c.phone}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const inputStyle = { width: "100%", padding: "10px 12px", border: `1px solid ${THEME.border}`, borderRadius: 4, fontSize: 13.5 };
const labelStyle = { display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6, marginTop: 10 };
const btnStyle = { marginTop: 14, padding: "10px 22px", background: THEME.navy, color: "#fff", border: "none", borderRadius: 4, fontWeight: 600, fontSize: 13, cursor: "pointer" };
const linkBtnStyle = { background: "none", border: "none", color: THEME.heading, fontSize: 11.5, fontWeight: 600, cursor: "pointer", padding: 0 };
