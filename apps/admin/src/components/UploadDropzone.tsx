import { SUPPORTED_UPLOAD_ACCEPT } from "@pagevault/core";
import { RefreshCw, UploadCloud, X } from "lucide-react";
import { useRef, useState } from "react";
import type { Visibility } from "../api/client.js";
import { formatFileSize } from "../format.js";
import { useSettings } from "../settings.js";
import { FileIcon } from "./FileIcon.js";

export function UploadDropzone({
  file,
  error,
  onFile,
  onClear,
  disabled = false,
  published,
}: {
  file: File | null;
  error?: string | null;
  onFile: (file: File) => void;
  onClear: () => void;
  disabled?: boolean;
  published?: Visibility | undefined;
}) {
  const { locale, t } = useSettings();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  function openPicker() {
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.click();
    }
  }
  const input = (
    <input
      ref={inputRef}
      className="sr-only"
      type="file"
      disabled={disabled}
      aria-label={t("upload.browse")}
      accept={SUPPORTED_UPLOAD_ACCEPT}
      onChange={(event) => {
        const next = event.target.files?.item(0);
        if (next) onFile(next);
      }}
    />
  );
  return (
    <section aria-label={t("upload.file")}>
      {input}
      {file ? (
        <div className="selected-file-card">
          <span className="file-icon">
            <FileIcon filename={file.name} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="selected-file-name">{file.name}</h2>
            <div className="selected-file-meta">
              <span>{formatFileSize(file.size, locale)}</span>
              <span aria-hidden>·</span>
              <strong>
                {published
                  ? t(
                      published === "public"
                        ? "dashboard.publicAccess"
                        : "upload.privateLabel",
                    )
                  : t("upload.selectedFile")}
              </strong>
            </div>
          </div>
          {!published && (
            <div className="selected-file-actions">
              <button
                className="btn btn-secondary"
                type="button"
                disabled={disabled}
                onClick={openPicker}
              >
                <RefreshCw size={18} aria-hidden />
                {t("upload.replace")}
              </button>
              <button
                className="icon-button"
                type="button"
                disabled={disabled}
                aria-label={t("upload.remove")}
                title={t("upload.remove")}
                onClick={onClear}
              >
                <X size={18} aria-hidden />
              </button>
            </div>
          )}
        </div>
      ) : (
        <button
          className={`dropzone ${dragging ? "dropzone-active" : ""} ${error ? "dropzone-error" : ""}`}
          type="button"
          disabled={disabled}
          onClick={openPicker}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(event) => {
            if (
              !event.currentTarget.contains(event.relatedTarget as Node | null)
            )
              setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const next = event.dataTransfer.files.item(0);
            if (next && !disabled) onFile(next);
          }}
        >
          <UploadCloud className="dropzone-icon" size={30} aria-hidden />
          <span className="dropzone-title">{t("upload.dropTitle")}</span>
          <span className="dropzone-hint">
            {t("upload.dropHint")} · {t("upload.acceptedTypes")}
          </span>
        </button>
      )}
      {error && (
        <p className="field-error mt-2" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
