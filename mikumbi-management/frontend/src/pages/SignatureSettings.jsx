import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../utils/api";
import { THEME } from "../styles/theme";
import { useConfirm } from "../components/ConfirmDialog";
import { showSuccess } from "../components/SuccessModal";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { removePaperBackground } from "../utils/signatureBackground";
import { ArrowUpCircleIcon, TrashIcon, SpinnerIcon, InfoIcon } from "../components/icons";
import ImageCropModal from "../components/ImageCropModal";

const ADMIN_TIER = ["admin", "second_master", "academic"];
const FORMS = ["Form I", "Form II", "Form III", "Form IV"];

// A checkerboard backdrop behind every preview - the standard way image
// editors show a transparent PNG, so it's obvious at a glance that the
// paper background was actually removed (not just "this looks white").
const CHECKER_BG = {
  backgroundImage:
    "linear-gradient(45deg, #E2E8F0 25%, transparent 25%), linear-gradient(-45deg, #E2E8F0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #E2E8F0 75%), linear-gradient(-45deg, transparent 75%, #E2E8F0 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
};

export default function SignatureSettings() {
  const { user, token } = useAuth();
  const { isMobile } = useBreakpoint();
  const { confirm, ConfirmDialogPortal } = useConfirm();
  const [brand, setBrand] = useState({ headmaster_signature_url: null, school_stamp_url: null });
  const [ctSigs, setCtSigs] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const myRoles = user?.roles?.length ? user.roles : [user?.role];
  const isAdminTier = myRoles.some((r) => ADMIN_TIER.includes(r));
  const isClassTeacher = myRoles.includes("class_teacher");

  const load = () => {
    setLoading(true);
    setError("");
    Promise.all([
      apiFetch("/settings/branding", {}, token),
      apiFetch("/settings/class-teacher-signatures", {}, token),
    ])
      .then(([b, c]) => { setBrand(b.data); setCtSigs(c.data); })
      .catch((err) => setError(err.message || "Could not load the current signature/stamp."))
      .finally(() => setLoading(false));
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return null;

  if (!isAdminTier && !isClassTeacher) {
    return (
      <div style={{ padding: 40, maxWidth: 560 }}>
        <h2 style={{ color: THEME.heading, fontSize: 20, marginBottom: 8 }}>Signature &amp; Stamp</h2>
        <p style={{ color: THEME.muted, fontSize: 13.5 }}>This page is only available to Admin, Second Master, Academic, and Class Teacher accounts.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: isMobile ? "16px 12px 32px" : "24px 16px 40px", maxWidth: 900, margin: "0 auto" }}>
      <h2 style={{ color: THEME.heading, fontSize: isMobile ? 17 : 20, marginBottom: 4 }}>Signature &amp; Stamp</h2>
      <p style={{ color: THEME.muted, fontSize: 13.5, marginBottom: 4, maxWidth: 640 }}>
        These images are stamped automatically onto every Parent Report PDF - no manual step needed each time it's generated.
      </p>
      <p style={{ color: THEME.muted, fontSize: 12.5, marginBottom: 24, maxWidth: 640, display: "flex", gap: 6, alignItems: "flex-start" }}>
        <span style={{ marginTop: 1, flexShrink: 0 }}><InfoIcon size={13} /></span>
        Take a clear photo of the signature or stamp on a plain sheet of paper. The white paper background is removed automatically, so it prints as if signed directly on the report.
      </p>

      {error && <div style={{ background: THEME.dangerLight, color: THEME.danger, padding: "10px 14px", borderRadius: 4, fontSize: 13, marginBottom: 18 }}>{error}</div>}
      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: THEME.muted, fontSize: 13.5 }}><SpinnerIcon size={16} /> Loading…</div>
      ) : (
        <>
          {isAdminTier && (
            <Section title="Head Master's Signature &amp; School Stamp" subtitle="The School Stamp appears on every Parent Report (&quot;MHURI YA MKUU WA SHULE&quot; line). The Head Master's Signature is used on the Student Identity Card only — per policy, it is never printed on Parent Reports.">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
                <ImageSlot
                  label="Head Master's Signature"
                  imageUrl={brand.headmaster_signature_url}
                  token={token}
                  uploadPath="/settings/branding/signature"
                  deletePath="/settings/branding/signature"
                  onDone={load}
                  confirm={confirm}
                />
                <ImageSlot
                  label="School Stamp"
                  imageUrl={brand.school_stamp_url}
                  token={token}
                  uploadPath="/settings/branding/stamp"
                  deletePath="/settings/branding/stamp"
                  onDone={load}
                  confirm={confirm}
                />
              </div>
            </Section>
          )}

          <Section
            title="Class Teacher Signature"
            subtitle={
              isAdminTier
                ? "Used on the \u201cSahihi\u201d line under the Class Teacher's comment. Choose a Form to upload or replace that class's Class Teacher's signature on their behalf."
                : "Used on the \u201cSahihi\u201d line under your comment on your class's Parent Reports."
            }
          >
            <ClassTeacherSection
              isAdminTier={isAdminTier}
              user={user}
              ctSigs={ctSigs}
              token={token}
              onDone={load}
              confirm={confirm}
            />
          </Section>

        </>
      )}

      {ConfirmDialogPortal}
    </div>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, padding: "18px 18px 22px", marginBottom: 20 }}>
      <h3 style={{ fontSize: 14.5, color: THEME.heading, margin: "0 0 4px", fontWeight: 700 }} dangerouslySetInnerHTML={{ __html: title }} />
      {subtitle && <p style={{ fontSize: 12.5, color: THEME.muted, margin: "0 0 16px", maxWidth: 560 }} dangerouslySetInnerHTML={{ __html: subtitle }} />}
      {children}
    </div>
  );
}

function ClassTeacherSection({ isAdminTier, user, ctSigs, token, onDone, confirm }) {
  const [selectedForm, setSelectedForm] = useState(user.class_teacher_of || FORMS[0]);

  if (isAdminTier) {
    return (
      <div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: THEME.text, marginBottom: 6 }}>Form</label>
          <select
            value={selectedForm}
            onChange={(e) => setSelectedForm(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 4, border: `1px solid ${THEME.border}`, fontSize: 13.5, background: THEME.surface, color: THEME.text, minWidth: 160 }}
          >
            {FORMS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div style={{ maxWidth: 260 }}>
          <ImageSlot
            key={selectedForm}
            label={`${selectedForm} Class Teacher's Signature`}
            imageUrl={ctSigs[selectedForm]}
            token={token}
            uploadPath="/settings/class-teacher-signature"
            deletePath="/settings/class-teacher-signature"
            extraFormField={selectedForm}
            onDone={onDone}
            confirm={confirm}
          />
        </div>
      </div>
    );
  }

  if (!user.class_teacher_of) {
    return <p style={{ fontSize: 13, color: THEME.muted }}>You are not currently assigned as a Class Teacher of any Form, so there is no signature slot for you yet. Ask an Admin, Second Master, or Academic to assign you to a class.</p>;
  }

  return (
    <div style={{ maxWidth: 260 }}>
      <ImageSlot
        label={`Your Signature (${user.class_teacher_of} Class Teacher)`}
        imageUrl={ctSigs[user.class_teacher_of]}
        token={token}
        uploadPath="/settings/class-teacher-signature"
        deletePath="/settings/class-teacher-signature"
        extraFormField={user.class_teacher_of}
        onDone={onDone}
        confirm={confirm}
      />
    </div>
  );
}

// One upload slot: preview + Upload + Remove. Shared by all three image
// types (Head Master signature, school stamp, a Form's Class Teacher
// signature) - they differ only in which endpoint they talk to.
function ImageSlot({ label, imageUrl, token, uploadPath, deletePath, extraFormField, onDone, confirm }) {
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [err, setErr] = useState("");
  // A live "before -> after" preview built entirely in THIS browser, the
  // moment a file is picked - shown before/independent of the upload
  // finishing. This exists so background-removal problems can be seen and
  // reported precisely (pixel dimensions included) instead of only being
  // visible several steps later on a downloaded PDF, which mixes together
  // whatever happened client-side with whatever happens when the report is
  // generated - this isolates the client-side step on its own.
  const [checkResult, setCheckResult] = useState(null); // { beforeUrl, afterUrl, beforeSize, afterSize, processed }
  const [pendingFile, setPendingFile] = useState(null); // file waiting in the crop modal
  const inputRef = useRef(null);

  // Step 1: a file was picked (camera photo or gallery) - don't touch it
  // yet, just open the crop tool so the person can trim out everything
  // except the signature/stamp ink (table edge, extra paper, fingers,
  // shadows) before background-removal ever runs on it.
  const handleFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file next time
    if (!file) return;
    setErr("");
    setCheckResult(null);
    setPendingFile(file);
  };

  // Step 2: the person confirmed a crop in the modal - run the existing
  // background-removal + upload pipeline on the CROPPED image instead of
  // the original photo.
  const handleCropConfirm = async (croppedFile) => {
    setPendingFile(null);
    setBusy(true);
    try {
      const file = croppedFile;
      const beforeUrl = URL.createObjectURL(file);
      const beforeSize = await readImageSize(beforeUrl);

      setBusyLabel("Removing background…");
      const { file: processed, processed: bgRemoved } = await removePaperBackground(file);
      const afterUrl = URL.createObjectURL(processed);
      const afterSize = await readImageSize(afterUrl);
      setCheckResult({ beforeUrl, afterUrl, beforeSize, afterSize, processed: bgRemoved });

      setBusyLabel("Uploading…");
      const fd = new FormData();
      fd.append("image", processed);
      if (extraFormField) fd.append("form", extraFormField);
      await apiFetch(uploadPath, { method: "POST", body: fd }, token);
      if (bgRemoved) {
        showSuccess("Uploaded", `${label} has been saved.`);
      } else {
        // Never block the upload over this - but be honest that the photo
        // went up AS-IS, so it's clear why it won't look "cut out" on the
        // report, instead of a silent mismatch between what was expected
        // and what actually got saved.
        setErr("Uploaded, but the background couldn't be automatically removed from this photo - it was saved as-is. Try a clearer, evenly-lit photo with plain paper around the ink, or a different photo file.");
      }
      onDone();
    } catch (error) {
      setErr(error.message || "Upload failed. Please try again.");
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  };

  const handleRemove = () => {
    confirm(`Remove ${label.toLowerCase()}?`, async () => {
      setBusy(true);
      setBusyLabel("Removing…");
      setErr("");
      try {
        const qs = extraFormField ? `?form=${encodeURIComponent(extraFormField)}` : "";
        await apiFetch(`${deletePath}${qs}`, { method: "DELETE" }, token);
        setCheckResult(null);
        onDone();
      } catch (error) {
        setErr(error.message || "Could not remove. Please try again.");
      } finally {
        setBusy(false);
        setBusyLabel("");
      }
    });
  };

  return (
    <div style={{ border: `1px solid ${THEME.border}`, borderRadius: 4, padding: 12, background: THEME.bg }}>
      {pendingFile && (
        <ImageCropModal
          file={pendingFile}
          onCancel={() => setPendingFile(null)}
          onConfirm={handleCropConfirm}
        />
      )}
      <p style={{ fontSize: 12.5, fontWeight: 600, color: THEME.text, margin: "0 0 8px" }}>{label}</p>
      <div style={{ ...CHECKER_BG, borderRadius: 4, border: `1px solid ${THEME.border}`, height: 100, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10, overflow: "hidden" }}>
        {busy ? (
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: THEME.muted, background: THEME.surface, padding: "4px 10px", borderRadius: 4 }}>
            <SpinnerIcon size={14} /> {busyLabel}
          </span>
        ) : imageUrl ? (
          <img src={imageUrl} alt={label} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
        ) : (
          <span style={{ fontSize: 11.5, color: THEME.muted }}>Not uploaded yet</span>
        )}
      </div>
      {err && <p style={{ fontSize: 11.5, color: THEME.danger, margin: "0 0 8px" }}>{err}</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} disabled={busy} />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 4, border: `1px solid ${THEME.navy}`, background: THEME.navy, color: "#fff", fontSize: 12, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}
        >
          <ArrowUpCircleIcon size={13} /> {imageUrl ? "Replace" : "Upload"}
        </button>
        {imageUrl && !busy && (
          <button
            onClick={handleRemove}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 4, border: `1px solid ${THEME.border}`, background: THEME.surface, color: THEME.danger, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            <TrashIcon size={13} /> Remove
          </button>
        )}
      </div>

      {checkResult && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px dashed ${THEME.border}` }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: THEME.heading, margin: "0 0 6px" }}>
            Background check: {checkResult.processed ? "removed successfully" : "NOT removed (see message above)"}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <p style={{ fontSize: 10, color: THEME.muted, margin: "0 0 4px" }}>Before ({checkResult.beforeSize})</p>
              <div style={{ border: `1px solid ${THEME.border}`, borderRadius: 4, height: 70, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", overflow: "hidden" }}>
                <img src={checkResult.beforeUrl} alt="before" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
              </div>
            </div>
            <div>
              <p style={{ fontSize: 10, color: THEME.muted, margin: "0 0 4px" }}>After ({checkResult.afterSize})</p>
              <div style={{ ...CHECKER_BG, border: `1px solid ${THEME.border}`, borderRadius: 4, height: 70, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                <img src={checkResult.afterUrl} alt="after" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function readImageSize(objectUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(`${img.naturalWidth}\u00d7${img.naturalHeight}px`);
    img.onerror = () => resolve("unknown size");
    img.src = objectUrl;
  });
}
