import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../utils/api";
import { THEME } from "../styles/theme";
import { useConfirm } from "../components/ConfirmDialog";
import { showSuccess } from "../components/SuccessModal";
import { showError } from "../components/ErrorModal";
import { SpinnerIcon, DotsVerticalIcon, EditIcon, TrashIcon, EyeIcon } from "../components/icons";

// Communications → "Parent Videos" (Head Master / Second Master).
// The file goes straight from this browser to Cloudinary (signed by our
// server), so even big videos never pass through the small Render server.
const fmtSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const fmtDur = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "");
const inputStyle = { width: "100%", padding: "9px 12px", borderRadius: 4, border: `1px solid ${THEME.border}`, fontSize: 13.5, boxSizing: "border-box", background: THEME.surface, color: THEME.text };
const label = { display: "block", fontSize: 12.5, fontWeight: 600, color: THEME.text, marginBottom: 5 };

export default function ParentVideosTab({ isMobile }) {
  const { token } = useAuth();
  const { confirm, ConfirmDialogPortal } = useConfirm();
  const [videos, setVideos] = useState(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(null); // null | 0..100
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  const xhrRef = useRef(null);
  const [menuFor, setMenuFor] = useState(null);   // id of the video whose ⋮ menu is open
  const [editing, setEditing] = useState(null);   // { id, title, description }
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState("");

  useEffect(() => {
    if (menuFor === null) return undefined;
    const close = (e) => { if (!e.target.closest?.("[data-video-menu]")) setMenuFor(null); };
    const esc = (e) => { if (e.key === "Escape") setMenuFor(null); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [menuFor]);

  const saveEdit = async () => {
    if (!editing.title.trim()) return setEditError("Title cannot be empty.");
    setEditBusy(true); setEditError("");
    try {
      await apiFetch(`/videos/${editing.id}`, { method: "PATCH", body: JSON.stringify({ title: editing.title, description: editing.description }) }, token);
      setEditing(null); showSuccess("Parent Videos", "Video details updated."); load();
    } catch (e) { setEditError(e.message); } finally { setEditBusy(false); }
  };

  const load = useCallback(() => {
    apiFetch("/videos", {}, token).then((d) => setVideos(d.videos || [])).catch((e) => { setVideos([]); setError(e.message); });
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const upload = async () => {
    setError("");
    if (!title.trim()) return setError("Please enter a title for the video.");
    if (!file) return setError("Please choose a video file.");
    if (!file.type.startsWith("video/")) return setError("The chosen file is not a video.");
    let sig;
    try { sig = await apiFetch("/videos/upload-signature", {}, token); } catch (e) { return setError(e.message); }
    if (file.size > sig.max_bytes) return setError(`This video is ${fmtSize(file.size)}. The maximum is ${fmtSize(sig.max_bytes)} - please compress it first.`);

    const form = new FormData();
    form.append("file", file);
    form.append("api_key", sig.api_key);
    form.append("timestamp", sig.timestamp);
    form.append("folder", sig.folder);
    form.append("eager", sig.eager);
    form.append("eager_async", sig.eager_async);
    form.append("signature", sig.signature);

    setProgress(0);
    const uploaded = await new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      xhr.open("POST", sig.upload_url);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100)); };
      xhr.onload = () => {
        try { const j = JSON.parse(xhr.responseText); resolve(xhr.status < 300 ? j : { error: j.error?.message || "Upload failed." }); }
        catch { resolve({ error: "Upload failed." }); }
      };
      xhr.onerror = () => resolve({ error: "Upload failed - check your internet connection and try again." });
      xhr.onabort = () => resolve({ error: "Upload cancelled." });
      xhr.send(form);
    });
    xhrRef.current = null;
    setProgress(null);
    if (uploaded.error) return setError(uploaded.error);

    setSaving(true);
    try {
      await apiFetch("/videos", { method: "POST", body: JSON.stringify({ public_id: uploaded.public_id, title, description }) }, token);
      showSuccess("Parent Videos", "The video is now on the parents' website.");
      setTitle(""); setDescription(""); setFile(null); if (fileRef.current) fileRef.current.value = "";
      load();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  const toggle = async (v) => {
    try { await apiFetch(`/videos/${v.id}`, { method: "PATCH", body: JSON.stringify({ is_active: !v.is_active }) }, token); load(); }
    catch (e) { showError(e.message); }
  };
  const remove = (v) => confirm(`Delete "${v.title}"? Parents will no longer see it.`, async () => {
    try { await apiFetch(`/videos/${v.id}`, { method: "DELETE" }, token); load(); } catch (e) { showError(e.message); }
  });

  const busy = progress !== null || saving;
  return (
    <div style={{ maxWidth: 820 }}>
      {ConfirmDialogPortal}
      <p style={{ color: THEME.muted, fontSize: 13.5, marginBottom: 16, lineHeight: 1.6 }}>
        Videos added here appear on the parents' website under "Ujumbe kwa Mzazi/Mlezi", where parents can watch or download them. Maximum 100 MB per video.
      </p>

      <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, padding: isMobile ? 14 : 18, marginBottom: 22 }}>
        <div style={{ display: "grid", gap: 12 }}>
          <div><label style={label}>Title *</label><input value={title} maxLength={150} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Jinsi ya kuangalia matokeo ya mwanao" style={inputStyle} disabled={busy} /></div>
          <div><label style={label}>Short description</label><textarea value={description} maxLength={1000} rows={2} onChange={(e) => setDescription(e.target.value)} placeholder="What parents will learn from this video" style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} disabled={busy} /></div>
          <div><label style={label}>Video file *</label><input ref={fileRef} type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] || null)} disabled={busy} style={{ fontSize: 13 }} />
            {file && <div style={{ fontSize: 12, color: THEME.muted, marginTop: 4 }}>{file.name} · {fmtSize(file.size)}</div>}</div>
        </div>
        {progress !== null && (
          <div style={{ marginTop: 14 }} aria-live="polite">
            <div style={{ height: 10, background: THEME.bg, borderRadius: 4, overflow: "hidden", border: `1px solid ${THEME.border}` }}>
              <div style={{ width: `${progress}%`, height: "100%", background: THEME.navy, transition: "width .2s" }} />
            </div>
            <div style={{ fontSize: 12.5, color: THEME.muted, marginTop: 4 }}>Uploading… {progress}% (keep this page open)</div>
          </div>
        )}
        {error && <div style={{ color: THEME.danger, fontSize: 13, marginTop: 10 }}>{error}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <button type="button" onClick={upload} disabled={busy} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 4, border: "none", background: THEME.navy, color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: busy ? "default" : "pointer", opacity: busy ? 0.75 : 1 }}>
            {busy && <SpinnerIcon size={14} />}{progress !== null ? "Uploading…" : saving ? "Saving…" : "Upload video"}
          </button>
          {progress !== null && <button type="button" onClick={() => xhrRef.current?.abort()} style={{ padding: "10px 16px", borderRadius: 4, border: `1px solid ${THEME.border}`, background: THEME.surface, color: THEME.text, fontSize: 13.5, cursor: "pointer" }}>Cancel</button>}
        </div>
      </div>

      <h3 style={{ fontSize: 15, color: THEME.heading, marginBottom: 10 }}>Videos ({videos ? videos.length : "…"})</h3>
      {!videos ? <div style={{ fontSize: 13, color: THEME.muted }}>Loading…</div>
        : videos.length === 0 ? <div style={{ fontSize: 13, color: THEME.muted }}>No videos yet.</div>
        : (
          <div style={{ display: "grid", gap: 10 }}>
            {videos.map((v) => (
              <div key={v.id} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, padding: 10, opacity: v.is_active ? 1 : 0.6 }}>
                <img src={v.poster} alt="" width="120" height="68" style={{ width: 120, height: 68, objectFit: "cover", borderRadius: 4, background: "#0f172a" }} onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: THEME.text }}>{v.title}</div>
                  {v.description && <div style={{ fontSize: 12.5, color: THEME.text, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{v.description}</div>}
                  <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>{[fmtDur(v.duration), v.bytes ? fmtSize(v.bytes) : "", v.is_active ? "Visible to parents" : "Hidden"].filter(Boolean).join(" · ")}</div>
                </div>
                <div data-video-menu style={{ position: "relative" }}>
                  <button type="button" aria-label={`Actions for ${v.title}`} aria-haspopup="menu" aria-expanded={menuFor === v.id}
                    onClick={() => setMenuFor(menuFor === v.id ? null : v.id)}
                    style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 4, border: `1px solid ${THEME.border}`, background: THEME.surface, color: THEME.text, cursor: "pointer" }}>
                    <DotsVerticalIcon size={16} />
                  </button>
                  {menuFor === v.id && (
                    <div role="menu" style={{ position: "absolute", right: 0, top: 38, zIndex: 50, minWidth: 170, background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, boxShadow: "0 8px 24px rgba(0,0,0,0.14)", overflow: "hidden" }}>
                      {[
                        { label: "Edit", icon: <EditIcon size={14} />, on: () => { setEditError(""); setEditing({ id: v.id, title: v.title, description: v.description || "" }); } },
                        { label: v.is_active ? "Hide from parents" : "Show to parents", icon: <EyeIcon size={14} />, on: () => toggle(v) },
                        { label: "Delete", icon: <TrashIcon size={14} />, on: () => remove(v), danger: true },
                      ].map((it) => (
                        <button key={it.label} role="menuitem" type="button" onClick={() => { setMenuFor(null); it.on(); }}
                          style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "10px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: it.danger ? THEME.danger : THEME.text }}>
                          {it.icon}{it.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      {editing && (
        <div onMouseDown={(e) => { if (e.target === e.currentTarget && !editBusy) setEditing(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div role="dialog" aria-modal="true" aria-label="Edit video" style={{ width: "100%", maxWidth: 480, background: THEME.surface, borderRadius: 4, padding: 18, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 16, color: THEME.heading }}>Edit video</h3>
            <label style={label}>Title *</label>
            <input value={editing.title} maxLength={150} autoFocus onChange={(e) => setEditing((x) => ({ ...x, title: e.target.value }))} style={{ ...inputStyle, marginBottom: 12 }} />
            <label style={label}>Short description</label>
            <textarea value={editing.description} maxLength={1000} rows={3} onChange={(e) => setEditing((x) => ({ ...x, description: e.target.value }))} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
            {editError && <div style={{ color: THEME.danger, fontSize: 13, marginTop: 8 }}>{editError}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
              <button type="button" onClick={() => setEditing(null)} disabled={editBusy} style={{ padding: "9px 16px", borderRadius: 4, border: `1px solid ${THEME.border}`, background: THEME.surface, color: THEME.text, fontSize: 13.5, cursor: "pointer" }}>Cancel</button>
              <button type="button" onClick={saveEdit} disabled={editBusy} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: 4, border: "none", background: THEME.navy, color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>
                {editBusy && <SpinnerIcon size={14} />}{editBusy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
