import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Clipboard,
  ExternalLink,
  Eye,
  LockKeyhole,
  RotateCcw,
  Rocket,
  UploadCloud,
} from "lucide-react";
import { useState } from "react";
import {
  uploadHtml,
  type UploadResult,
  type Visibility,
} from "../api/client.js";
import { useFeedback } from "../components/Feedback.js";
import { UploadDropzone } from "../components/UploadDropzone.js";
import { WorkspaceHero } from "../components/WorkspaceHero.js";
import { useSettings } from "../settings.js";

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

function isSupportedFile(file: File): boolean {
  const extension = file.name.split(".").pop()?.toLowerCase();
  return extension !== undefined && supportedExtensions.has(extension);
}

function positiveInteger(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return parsed > 0 ? parsed : null;
}

export function UploadPage({
  onViewItem,
}: {
  onViewItem: (id: string) => void;
}) {
  const { t } = useSettings();
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

  function chooseFile(nextFile: File): void {
    setResult(null);
    setError(null);
    if (!isSupportedFile(nextFile)) {
      setFile(null);
      setFileError(t("upload.invalidType"));
      return;
    }
    setFile(nextFile);
    setFileError(null);
  }

  function copyUrl(): void {
    if (!result) {
      return;
    }
    void navigator.clipboard
      .writeText(result.publicUrl)
      .then(() => notify(t("common.copied"), "success"))
      .catch(() => notify(t("common.copyFailed"), "error"));
  }

  function submit(): void {
    if (!file) {
      setFileError(t("upload.chooseFile"));
      return;
    }
    if (parsedUrlDays === null || parsedFileDays === null) {
      setError(t("upload.invalidDays"));
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
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

  return (
    <section className="page-stack upload-page upload-workspace">
      <WorkspaceHero
        icon={Rocket}
        eyebrow={t("upload.eyebrow")}
        title={t("upload.title")}
        subtitle={t("upload.subtitle")}
      />

      <div className="upload-layout">
        <section
          className="upload-step upload-step-file"
          aria-labelledby="upload-file-heading"
        >
          <header className="upload-step-header">
            <div className="section-heading">
              <span className="section-step" aria-hidden>
                1
              </span>
              <div>
                <h2 id="upload-file-heading">{t("upload.file")}</h2>
                <p>{t("upload.acceptedTypes")}</p>
              </div>
            </div>
          </header>
          <div className="upload-step-body">
            <UploadDropzone
              file={file}
              error={fileError}
              onFile={chooseFile}
              onClear={() => {
                setFile(null);
                setFileError(null);
                setResult(null);
              }}
            />
          </div>
        </section>

        <section
          className="upload-step upload-step-settings"
          aria-labelledby="upload-settings-heading"
        >
          <header className="upload-step-header">
            <div className="section-heading">
              <span className="section-step" aria-hidden>
                2
              </span>
              <div>
                <h2 id="upload-settings-heading">
                  {t("upload.publishSettings")}
                </h2>
                <p>{t("upload.publishHint")}</p>
              </div>
            </div>
          </header>

          <div className="upload-step-body">
            <div className="upload-settings-grid">
              <div
                className="settings-subpanel settings-subpanel-access"
                role="group"
                aria-labelledby="upload-visibility-heading"
              >
                <div className="settings-subpanel-heading">
                  <span className="settings-subpanel-icon" aria-hidden>
                    <Eye className="h-5 w-5" />
                  </span>
                  <h3 id="upload-visibility-heading">
                    {t("common.visibility")}
                  </h3>
                </div>
                <div className="visibility-selector">
                  <button
                    className={`visibility-option ${visibility === "public" ? "visibility-option-active" : ""}`}
                    type="button"
                    aria-pressed={visibility === "public"}
                    onClick={() => setVisibility("public")}
                  >
                    <span className="visibility-icon">
                      <Eye className="h-5 w-5" aria-hidden />
                    </span>
                    <span>
                      <strong>{t("common.public")}</strong>
                      <small>{t("upload.publicHint")}</small>
                    </span>
                  </button>
                  <button
                    className={`visibility-option ${visibility === "private" ? "visibility-option-active" : ""}`}
                    type="button"
                    aria-pressed={visibility === "private"}
                    onClick={() => setVisibility("private")}
                  >
                    <span className="visibility-icon">
                      <LockKeyhole className="h-5 w-5" aria-hidden />
                    </span>
                    <span>
                      <strong>{t("common.private")}</strong>
                      <small>{t("upload.privateHint")}</small>
                    </span>
                  </button>
                </div>
              </div>

              <div
                className="settings-subpanel settings-subpanel-expiry"
                role="group"
                aria-labelledby="upload-expiry-heading"
              >
                <div className="settings-subpanel-heading">
                  <span className="settings-subpanel-icon" aria-hidden>
                    <Clock3 className="h-5 w-5" />
                  </span>
                  <h3 id="upload-expiry-heading">
                    {t("upload.expirySettings")}
                  </h3>
                </div>
                <div className="expiry-fields">
                  <label className="field-label">
                    <span>{t("upload.urlDays")}</span>
                    <span className="number-control">
                      <input
                        className="control"
                        type="number"
                        min={1}
                        inputMode="numeric"
                        value={urlExpireDays}
                        aria-invalid={positiveInteger(urlExpireDays) === null}
                        onChange={(event) =>
                          setUrlExpireDays(event.target.value)
                        }
                      />
                      <span>{t("upload.urlDays")}</span>
                    </span>
                    <small className="field-hint">
                      {t("upload.urlDaysHint")}
                    </small>
                  </label>
                  <label className="field-label">
                    <span>{t("upload.fileDays")}</span>
                    <span className="number-control">
                      <input
                        className="control"
                        type="number"
                        min={1}
                        inputMode="numeric"
                        value={fileExpireDays}
                        aria-invalid={positiveInteger(fileExpireDays) === null}
                        onChange={(event) =>
                          setFileExpireDays(event.target.value)
                        }
                      />
                      <span>{t("upload.fileDays")}</span>
                    </span>
                    <small className="field-hint">
                      {t("upload.fileDaysHint")}
                    </small>
                  </label>
                </div>
              </div>
            </div>

            <div className="upload-submit-bar">
              <div className="upload-feedback" aria-live="polite">
                {!expiryValid && (
                  <div className="field-error">{t("upload.invalidDays")}</div>
                )}
                {error && <div className="alert-error">{error}</div>}
              </div>
              <button
                className="btn btn-primary btn-lg upload-submit-button"
                type="button"
                disabled={!file || !expiryValid || busy}
                aria-busy={busy}
                onClick={submit}
              >
                {busy ? (
                  <span className="spinner" aria-hidden />
                ) : (
                  <UploadCloud className="h-5 w-5" aria-hidden />
                )}
                {busy ? t("upload.uploading") : t("upload.action")}
                {!busy && (
                  <ArrowRight className="ml-auto h-5 w-5" aria-hidden />
                )}
              </button>
            </div>
          </div>
        </section>
      </div>

      {result && (
        <div className="success-panel" role="status">
          <div className="success-icon">
            <CheckCircle2 className="h-7 w-7" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2>{t("upload.successTitle")}</h2>
            <p>{t("upload.successSubtitle")}</p>
            <button
              className="success-url"
              type="button"
              onClick={copyUrl}
              title={result.publicUrl}
            >
              <span>{result.publicUrl}</span>
              <Clipboard className="h-4 w-4 shrink-0" aria-hidden />
            </button>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="btn btn-primary"
                type="button"
                onClick={copyUrl}
              >
                <Clipboard className="h-4 w-4" aria-hidden />
                {t("upload.copyUrl")}
              </button>
              <a
                className="btn btn-secondary"
                href={result.publicUrl}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
                {t("upload.openPreview")}
              </a>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => onViewItem(result.id)}
              >
                {t("upload.viewDetails")}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => {
                  setFile(null);
                  setResult(null);
                  setError(null);
                  setFileError(null);
                }}
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
                {t("upload.uploadAnother")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
