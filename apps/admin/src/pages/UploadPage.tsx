import {
  ArrowRight,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  Link2,
  LockKeyhole,
  Plus,
  Settings,
} from "lucide-react";
import { useState } from "react";
import {
  uploadHtml,
  type UploadResult,
  type Visibility,
} from "../api/client.js";
import { useFeedback } from "../components/Feedback.js";
import { itemPreviewUrl, encodeShareUrl } from "../format.js";
import { UploadDropzone } from "../components/UploadDropzone.js";
import { ContentPreview } from "../components/ContentPreview.js";
import { useSettings } from "../settings.js";
import { copyText } from "../clipboard.js";

const supportedExtensions = new Set([
  "html",
  "htm",
  "md",
  "markdown",
  "jpg",
  "jpeg",
  "png",
  "webp",
]);
function positiveInteger(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function DurationField({
  label,
  value,
  onChange,
  hint,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint: string;
  disabled: boolean;
}) {
  const { t } = useSettings();
  const [custom, setCustom] = useState(false);
  return (
    <div className="field-label">
      <label>
        {label}
        <select
          className="control mt-2"
          value={custom ? "custom" : value}
          disabled={disabled}
          onChange={(event) => {
            const next = event.target.value;
            setCustom(next === "custom");
            if (next !== "custom") onChange(next);
          }}
        >
          {[7, 15, 30, 90, 365].map((days) => (
            <option key={days} value={days}>
              {days} {t("upload.days")}
            </option>
          ))}
          <option value="custom">{t("upload.customDays")}</option>
        </select>
      </label>
      {custom && (
        <input
          className="control expiry-custom"
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          aria-label={`${label} (${t("upload.customDays")})`}
          value={value}
          disabled={disabled}
          aria-invalid={positiveInteger(value) === null}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      <small className="field-hint">{hint}</small>
    </div>
  );
}

export function UploadPage({
  onViewItem,
  onBack,
}: {
  onViewItem: (id: string) => void;
  onBack?: () => void;
}) {
  const { t, locale } = useSettings();
  const { notify } = useFeedback();
  const [file, setFile] = useState<File | null>(null);
  const [urlExpireDays, setUrlExpireDays] = useState("15");
  const [fileExpireDays, setFileExpireDays] = useState("30");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [result, setResult] = useState<UploadResult | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const parsedUrlDays = positiveInteger(urlExpireDays);
  const parsedFileDays = positiveInteger(fileExpireDays);
  const expiryValid = parsedUrlDays !== null && parsedFileDays !== null;
  function clear() {
    setFile(null);
    setFileError(null);
    setResult(null);
    setError(null);
  }
  function chooseFile(nextFile: File) {
    setResult(null);
    setError(null);
    if (
      !supportedExtensions.has(
        nextFile.name.split(".").pop()?.toLowerCase() ?? "",
      )
    ) {
      setFile(null);
      setFileError(t("upload.invalidType"));
      return;
    }
    setFile(nextFile);
    setFileError(null);
  }
  function copyUrl(encoded = false) {
    if (!result) return;
    void copyText(encoded ? encodeShareUrl(result.publicUrl) : result.publicUrl)
      .then(() =>
        notify(
          t(encoded ? "common.encodedCopied" : "common.copied"),
          "success",
        ),
      )
      .catch(() => notify(t("common.copyFailed"), "error"));
  }
  function submit() {
    if (!file || busy) return;
    if (parsedUrlDays === null || parsedFileDays === null) {
      setError(t("upload.invalidDays"));
      return;
    }
    setBusy(true);
    setError(null);
    void uploadHtml({
      file,
      urlExpireDays: parsedUrlDays,
      fileExpireDays: parsedFileDays,
      visibility,
    })
      .then(setResult)
      .catch((nextError: unknown) =>
        setError(
          nextError instanceof Error
            ? nextError.message
            : t("common.uploadFailed"),
        ),
      )
      .finally(() => setBusy(false));
  }
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  return (
    <section className="page-stack upload-page">
      <header className="page-header">
        <div>
          <div className={result ? "success-heading" : ""}>
            {result && <CheckCircle2 aria-hidden />}
            <h1 className="page-title">
              {t(result ? "upload.successTitle" : "upload.title")}
            </h1>
          </div>
          <p className="page-subtitle" role={result ? "status" : undefined}>
            {t(
              result
                ? visibility === "private"
                  ? "upload.privateSuccess"
                  : "upload.successSubtitle"
                : "upload.subtitle",
            )}
          </p>
        </div>
      </header>
      <UploadDropzone
        file={file}
        error={fileError}
        onFile={chooseFile}
        onClear={clear}
        disabled={busy}
        published={result ? visibility : undefined}
      />
      <div className="upload-preview-layout">
        <ContentPreview file={file} published={result !== null} />
        <section
          className="upload-settings-column"
          aria-labelledby="upload-settings-heading"
        >
          <header className="section-heading">
            {result ? <Link2 aria-hidden /> : <Settings aria-hidden />}
            <h2 id="upload-settings-heading">
              {t(result ? "upload.shareLink" : "upload.publishSettings")}
            </h2>
          </header>
          {result ? (
            <div className="share-controls">
              <div className="copy-field">
                <input
                  aria-label={t("upload.shareLink")}
                  readOnly
                  value={result.publicUrl}
                  onFocus={(event) => event.target.select()}
                />
                <button
                  className="icon-button"
                  type="button"
                  aria-label={t("upload.copyUrl")}
                  onClick={() => copyUrl()}
                >
                  <Copy size={21} aria-hidden />
                </button>
              </div>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => copyUrl()}
              >
                <Copy aria-hidden />
                {t("upload.copyUrl")}
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => copyUrl(true)}
              >
                <Copy aria-hidden />
                {t("upload.copyEncodedUrl")}
              </button>
              <p className="field-hint m-0">{t("upload.encodedHint")}</p>
              <div className="share-secondary-actions">
                <a
                  className="btn btn-secondary"
                  href={itemPreviewUrl({ ...result, visibility })}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink aria-hidden />
                  {t("upload.openPreview")}
                </a>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => onViewItem(result.id)}
                >
                  <FileText aria-hidden />
                  {t("upload.viewDetails")}
                </button>
              </div>
              <dl className="share-expiry">
                <div>
                  <dt>{t("common.urlExpiry")}</dt>
                  <dd>{date(result.urlExpiresAt)}</dd>
                </div>
                <div>
                  <dt>{t("common.fileExpiry")}</dt>
                  <dd>{date(result.fileExpiresAt)}</dd>
                </div>
              </dl>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={clear}
              >
                <Plus aria-hidden />
                {t("upload.uploadAnother")}
              </button>
              <p className="field-hint m-0 mt-1">{t("upload.manageHint")}</p>
            </div>
          ) : (
            <>
              <fieldset
                className="visibility-selector"
                disabled={busy}
                aria-label={t("common.visibility")}
              >
                {(["public", "private"] as const).map((value) => (
                  <label
                    key={value}
                    className={`visibility-option ${visibility === value ? "visibility-option-active" : ""}`}
                  >
                    <input
                      type="radio"
                      name="visibility"
                      value={value}
                      checked={visibility === value}
                      onChange={() => setVisibility(value)}
                    />
                    {value === "public" ? (
                      <Globe aria-hidden />
                    ) : (
                      <LockKeyhole aria-hidden />
                    )}
                    <span>
                      <strong>
                        {t(
                          value === "public"
                            ? "upload.publicLabel"
                            : "upload.privateLabel",
                        )}
                      </strong>
                      <small>
                        {t(
                          value === "public"
                            ? "upload.publicHint"
                            : "upload.privateHint",
                        )}
                      </small>
                    </span>
                  </label>
                ))}
              </fieldset>
              <div
                className="expiry-fields"
                role="group"
                aria-label={t("upload.expirySettings")}
              >
                <DurationField
                  label={t("upload.urlDays")}
                  value={urlExpireDays}
                  onChange={setUrlExpireDays}
                  hint={t("upload.urlDaysHint")}
                  disabled={busy}
                />
                <DurationField
                  label={t("upload.fileDays")}
                  value={fileExpireDays}
                  onChange={setFileExpireDays}
                  hint={t("upload.fileDaysHint")}
                  disabled={busy}
                />
              </div>
              <div className="upload-submit-bar">
                {!expiryValid && (
                  <div className="field-error" role="alert">
                    {t("upload.invalidDays")}
                  </div>
                )}
                {error && (
                  <div className="alert-error" role="alert">
                    {error}
                  </div>
                )}
                <button
                  className="btn btn-primary btn-lg"
                  type="button"
                  disabled={!file || !expiryValid || busy}
                  aria-busy={busy}
                  onClick={submit}
                >
                  {busy && <span className="spinner" aria-hidden />}
                  {t(busy ? "upload.uploading" : "upload.action")}
                  {!busy && <ArrowRight aria-hidden />}
                </button>
                <button
                  className="back-link upload-back"
                  type="button"
                  onClick={
                    onBack ??
                    (() => {
                      window.location.hash = "/items";
                    })
                  }
                >
                  {t("upload.backToFiles")}
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </section>
  );
}
