import { useEffect, useRef, useState } from "react";
import { useLang } from "../i18n";
import { formLabel } from "../i18n/display";
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
  const { t } = useLang();
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
        <h2 style={{ color: THEME.heading, fontSize: 20, marginBottom: 8 }}>{t("set.signature")}</h2>
        <p style={{ color: THEME.muted, fontSize: 13.5 }}>{t("sig.onlyRoles")}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: isMobile ? "16px 12px 32px" : "24px 16px 40px", maxWidth: 900, margin: "0 auto" }}>
      <h2 style={{ color: THEME.heading, fontSize: isMobile ? 17 : 20, marginBottom: 4 }}>{t("set.signature")}</h2>
      <p style={{ color: THEME.muted, fontSize: 13.5, marginBottom: 4, maxWidth: 640 }}>
        {t("sig.intro")}
      </p>
      <p style={{ color: THEME.muted, fontSize: 12.5, marginBottom: 24, maxWidth: 640, display: "flex", gap: 6, alignItems: "flex-start" }}>
        <span style={{ marginTop: 1, flexShrink: 0 }}><InfoIcon size={13} /></span>
        {t("sig.photoTip")}
      </p>

      {error && <div style={{ background: THEME.dangerLight, color: THEME.danger, padding: "10px 14px", borderRadius: 4, fontSize: 13, marginBottom: 18 }}>{error}</div>}
      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: THEME.muted, fontSize: 13.5 }}><SpinnerIcon size={16} /> {t("common.loading")}</div>
      ) : (
        <>
          {isAdminTier && (
            <Section title={t("sig.hmTitle")} subtitle={t("sig.hmSub")}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
                <ImageSlot
                  label={t("sig.hmSignature")}
                  imageUrl={brand.headmaster_signature_url}
                  token={token}
                  uploadPath="/settings/branding/signature"
                  deletePath="/settings/branding/signature"
                  onDone={load}
                  confirm={confirm}
                />
                <ImageSlot
                  label={t("sig.stamp")}
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
            title={t("sig.ctTitle")}
            subtitle={isAdminTier ? t("sig.ctSubAdmin") : t("sig.ctSubOwn")}
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
      <h3 style={{ fontSize: 14.5, color: THEME.heading, margin: "0 0 4px", fontWeight: 700 }}>{title}</h3>
      {subtitle && <p style={{ fontSize: 12.5, color: THEME.muted, margin: "0 0 16px", maxWidth: 560 }}>{subtitle}</p>}
      {children}
    </div>
  );
}

function ClassTeacherSection({ isAdminTier, user, ctSigs, token, onDone, confirm }) {
  const { t, lang } = useLang();
  const [selectedForm, setSelectedForm] = useState(user.class_teacher_of || FORMS[0]);

  if (isAdminTier) {
    return (
      <div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: THEME.text, marginBottom: 6 }}>{t("sig.form")}</label>
          <select
            value={selectedForm}
            onChange={(e) => setSelectedForm(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 4, border: `1px solid ${THEME.border}`, fontSize: 13.5, background: THEME.surface, color: THEME.text, minWidth: 160 }}
          >
            {FORMS.map((f) => <option key={f} value={f}>{formLabel(lang, f)}</option>)}
          </select>
        </div>
        <div style={{ maxWidth: 260 }}>
          <ImageSlot
            key={selectedForm}
            label={t("sig.ctSignatureOf", { form: formLabel(lang, selectedForm) })}
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
    return <p style={{ fontSize: 13, color: THEME.muted }}>{t("sig.notCt")}</p>;
  }

  return (
    <div style={{ maxWidth: 260 }}>
      <ImageSlot
        label={t("sig.yourSignature", { form: formLabel(lang, user.class_teacher_of) })}
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
  const { t } = useLang();
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

      setBusyLabel(t("sig.removingBg"));
      const { file: processed, processed: bgRemoved } = await removePaperBackground(file);
      const afterUrl = URL.createObjectURL(processed);
      const afterSize = await readImageSize(afterUrl);
      setCheckResult({ beforeUrl, afterUrl, beforeSize, afterSize, processed: bgRemoved });

      setBusyLabel(t("acct.uploading"));
      const fd = new FormData();
      fd.append("image", processed);
      if (extraFormField) fd.append("form", extraFormField);
      await apiFetch(uploadPath, { method: "POST", body: fd }, token);
      if (bgRemoved) {
        showSuccess(t("sig.uploadedTitle"), t("sig.saved", { label }));
      } else {
        // Never block the upload over this - but be honest that the photo
        // went up AS-IS, so it's clear why it won't look "cut out" on the
        // report, instead of a silent mismatch between what was expected
        // and what actually got saved.
        setErr(t("sig.bgNotRemoved"));
      }
      onDone();
    } catch (error) {
      setErr(error.message || t("sig.uploadFailed"));
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  };

  const handleRemove = () => {
    confirm(t("sig.removeConfirm", { label }), async () => {
      setBusy(true);
      setBusyLabel(t("acct.removing"));
      setErr("");
      try {
        const qs = extraFormField ? `?form=${encodeURIComponent(extraFormField)}` : "";
        await apiFetch(`${deletePath}${qs}`, { method: "DELETE" }, token);
        setCheckResult(null);
        onDone();
      } catch (error) {
        setErr(error.message || t("sig.removeFailed"));
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
          <span style={{ fontSize: 11.5, color: THEME.muted }}>{t("sig.notUploaded")}</span>
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
          <ArrowUpCircleIcon size={13} /> {imageUrl ? t("sig.replace") : t("sig.upload")}
        </button>
        {imageUrl && !busy && (
          <button
            onClick={handleRemove}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 4, border: `1px solid ${THEME.border}`, background: THEME.surface, color: THEME.danger, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            <TrashIcon size={13} /> {t("sig.remove")}
          </button>
        )}
      </div>

      {checkResult && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px dashed ${THEME.border}` }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: THEME.heading, margin: "0 0 6px" }}>
            {checkResult.processed ? t("sig.bgOk") : t("sig.bgFail")}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <p style={{ fontSize: 10, color: THEME.muted, margin: "0 0 4px" }}>{t("sig.before", { size: checkResult.beforeSize })}</p>
              <div style={{ border: `1px solid ${THEME.border}`, borderRadius: 4, height: 70, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", overflow: "hidden" }}>
                <img src={checkResult.beforeUrl} alt={t("sig.before", { size: "" })} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
              </div>
            </div>
            <div>
              <p style={{ fontSize: 10, color: THEME.muted, margin: "0 0 4px" }}>{t("sig.after", { size: checkResult.afterSize })}</p>
              <div style={{ ...CHECKER_BG, border: `1px solid ${THEME.border}`, borderRadius: 4, height: 70, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                <img src={checkResult.afterUrl} alt={t("sig.after", { size: "" })} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
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
