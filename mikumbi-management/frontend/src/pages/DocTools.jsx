import { useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { API_BASE } from "../utils/api";
import { THEME } from "../styles/theme";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { showSuccess } from "../components/SuccessModal";
import { showError } from "../components/ErrorModal";
import { FileConvertIcon, SpinnerIcon, TrashIcon, CheckCircleIcon, ChevronDownIcon } from "../components/icons";

const baseNameOf = (name) => name.replace(/\.[^.]+$/, "");

// Each conversion type fully determines: what the file picker accepts,
// whether multiple files are allowed (scans = multi-page), the output
// format, and the label shown while a file is picked. No auto-detection —
// the person picks the direction first, same as any converter app.
const CONVERSION_TYPES = [
  { key: "pdf-to-word", label: "PDF to Word", accept: ".pdf", multiple: false, target: "docx", pickerHint: "Choose a PDF file" },
  { key: "word-to-pdf", label: "Word to PDF", accept: ".doc,.docx", multiple: false, target: "pdf", pickerHint: "Choose a Word file" },
  { key: "scan-to-pdf", label: "Scan to PDF", accept: ".jpg,.jpeg,.png,.webp", multiple: true, target: "pdf", pickerHint: "Choose scanned page image(s)" },
  { key: "scan-to-word", label: "Scan to Word", accept: ".jpg,.jpeg,.png,.webp", multiple: true, target: "docx", pickerHint: "Choose scanned page image(s)" },
];

// fetch -> blob -> temporary <a download>, same pattern as Joining
// Instructions' PDF downloads, with a FormData body instead of JSON.
async function convertAndSave({ files, target, addQrCode, token, downloadName }) {
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  fd.append("target", target);
  fd.append("addQrCode", addQrCode ? "true" : "false");

  const res = await fetch(`${API_BASE}/doctools/convert`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || "Conversion failed.");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = downloadName;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export default function DocTools() {
  const { token } = useAuth();
  const { isMobile } = useBreakpoint();
  const fileInputRef = useRef(null);

  const [type, setType] = useState(null);       // one of CONVERSION_TYPES.key
  const [files, setFiles] = useState([]);       // File[]
  const [busy, setBusy] = useState(false);
  const [qrPromptOpen, setQrPromptOpen] = useState(false);

  const conv = CONVERSION_TYPES.find((c) => c.key === type) || null;

  const chooseType = (key) => {
    setType(key);
    setFiles([]);
  };

  const backToTypes = () => {
    setType(null);
    setFiles([]);
  };

  const pickFiles = () => fileInputRef.current?.click();

  const handleFilesChosen = (e) => {
    const chosen = Array.from(e.target.files || []);
    e.target.value = ""; // allow re-picking the same file(s) later
    if (!chosen.length) return;
    setFiles(conv.multiple ? chosen : [chosen[0]]);
  };

  const removeFile = (idx) => setFiles(files.filter((_, i) => i !== idx));

  const startConvert = () => {
    if (!files.length) return;
    setQrPromptOpen(true);
  };

  const doConvert = async (addQrCode) => {
    setQrPromptOpen(false);
    setBusy(true);
    try {
      const downloadName = `${baseNameOf(files[0].name)}${files.length > 1 ? "-scan" : ""}.${conv.target}`;
      await convertAndSave({ files, target: conv.target, addQrCode, token, downloadName });
      showSuccess("Doc Tools", "Your document has been converted and downloaded.");
      setFiles([]);
    } catch (err) {
      showError("Conversion Failed", err.message);
    } finally {
      setBusy(false);
    }
  };

  const canConvert = files.length > 0 && !busy;

  return (
    <div style={{ padding: isMobile ? 16 : 32, maxWidth: 760 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span style={{ display: "flex", color: THEME.heading }}><FileConvertIcon size={22} /></span>
        <h2 style={{ color: THEME.heading, fontSize: 20, margin: 0 }}>Doc Tools</h2>
      </div>
      <p style={{ color: THEME.muted, fontSize: 13.5, lineHeight: 1.6, marginTop: 0, marginBottom: 22 }}>
        Convert PDF to Word, or Word to PDF — without losing layout, fonts, colors, tables, charts, or images.
        You can also upload photos of scanned documents (Camera, CamScanner, etc.) and convert them to PDF or
        Word, keeping the exact same look as the original.
      </p>

      {/* Step 1: pick a conversion type */}
      {!conv && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12 }}>
          {CONVERSION_TYPES.map((c) => (
            <button
              key={c.key} type="button" onClick={() => chooseType(c.key)}
              style={{
                padding: "20px 12px", borderRadius: 12, cursor: "pointer",
                border: `1.5px solid ${THEME.border}`, background: THEME.surface,
                display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
              }}
            >
              <span style={{ display: "flex", color: THEME.navy }}><FileConvertIcon size={24} /></span>
              <span style={{ fontSize: 13, fontWeight: 700, color: THEME.heading, textAlign: "center" }}>{c.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Step 2: pick file(s) for the chosen type */}
      {conv && (
        <>
          <button
            type="button" onClick={backToTypes} disabled={busy}
            style={{
              display: "flex", alignItems: "center", gap: 6, background: "none", border: "none",
              color: THEME.muted, fontSize: 12.5, cursor: busy ? "default" : "pointer", padding: 0, marginBottom: 14,
            }}
          >
            <span style={{ transform: "rotate(90deg)", display: "flex" }}><ChevronDownIcon size={12} /></span>
            Change conversion type
          </button>

          <div style={{ fontSize: 12.5, fontWeight: 700, color: THEME.heading, marginBottom: 10 }}>{conv.label}</div>

          <input
            ref={fileInputRef}
            type="file"
            multiple={conv.multiple}
            accept={conv.accept}
            onChange={handleFilesChosen}
            style={{ display: "none" }}
          />

          <button
            type="button"
            onClick={pickFiles}
            disabled={busy}
            style={{
              width: "100%", padding: "28px 18px", borderRadius: 12, cursor: busy ? "default" : "pointer",
              border: `2px dashed ${THEME.border}`, background: THEME.surface, color: THEME.muted,
              display: "flex", flexDirection: "column", alignItems: "center", gap: 8, fontSize: 13.5,
            }}
          >
            <span style={{ display: "flex", color: THEME.heading, opacity: 0.75 }}><FileConvertIcon size={28} /></span>
            <span style={{ fontWeight: 700, color: THEME.heading }}>{conv.pickerHint}</span>
            {conv.multiple && <span>You can select multiple pages at once</span>}
          </button>

          {files.length > 0 && (
            <div style={{ marginTop: 16, background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 10, overflow: "hidden" }}>
              {files.map((f, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                  borderTop: i > 0 ? `1px solid ${THEME.border}` : "none",
                }}>
                  <span style={{ display: "flex", color: THEME.muted, flexShrink: 0 }}><CheckCircleIcon size={16} /></span>
                  <span style={{ flex: 1, fontSize: 13, color: THEME.text, wordBreak: "break-word" }}>
                    {conv.multiple ? `Page ${i + 1}: ${f.name}` : f.name}
                  </span>
                  <button
                    type="button" onClick={() => removeFile(i)} disabled={busy}
                    aria-label="Remove file" title="Remove"
                    style={{ display: "flex", background: "none", border: "none", color: THEME.muted, cursor: busy ? "default" : "pointer", padding: 4 }}
                  >
                    <TrashIcon size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
            <button
              type="button" onClick={startConvert} disabled={!canConvert}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "11px 24px", borderRadius: 9,
                border: "none", background: canConvert ? THEME.navy : THEME.border, color: "#fff",
                fontSize: 14, fontWeight: 700, cursor: canConvert ? "pointer" : "default",
              }}
            >
              {busy && <SpinnerIcon size={16} />}
              {busy ? "Converting..." : "Convert"}
            </button>
            {files.length > 0 && !busy && (
              <button
                type="button" onClick={() => setFiles([])}
                style={{ padding: "11px 18px", borderRadius: 9, border: `1px solid ${THEME.border}`, background: "none", color: THEME.muted, fontSize: 13.5, cursor: "pointer" }}
              >
                Clear
              </button>
            )}
          </div>
        </>
      )}

      {qrPromptOpen && (
        <div
          onMouseDown={(e) => { if (e.target === e.currentTarget) setQrPromptOpen(false); }}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10100, padding: 16 }}
        >
          <div style={{ background: THEME.surface, borderRadius: 14, padding: "26px 24px", maxWidth: 360, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 15.5, color: THEME.heading }}>Show a QR Code on the Document?</h3>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: THEME.muted, lineHeight: 1.55 }}>
              Do you want a small QR code (showing this was generated by the Mikumbi System) on your document?
              If you decline, no QR code will appear at all.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button" onClick={() => doConvert(false)}
                style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: `1px solid ${THEME.border}`, background: "none", color: THEME.text, fontWeight: 600, fontSize: 13.5, cursor: "pointer" }}
              >
                No
              </button>
              <button
                type="button" onClick={() => doConvert(true)}
                style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none", background: THEME.navy, color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}
              >
                Yes, Show It
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
