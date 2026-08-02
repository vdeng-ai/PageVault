import { FileCode2, FileImage, RefreshCw, UploadCloud, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatFileSize } from "../format.js";
import { useSettings } from "../settings.js";

function fileExtension(filename: string): string {
  const extension = filename.split(".").pop();
  return extension ? extension.toUpperCase() : "FILE";
}

export function UploadDropzone({
  file,
  error,
  onFile,
  onClear,
}: {
  file: File | null;
  error?: string | null;
  onFile: (file: File) => void;
  onClear: () => void;
}) {
  const { locale, t } = useSettings();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file?.type.startsWith("image/")) {
      setPreviewUrl(null);
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    setPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  function openPicker(): void {
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
      accept=".html,.htm,.md,.markdown,.jpg,.jpeg,.png,.webp,text/html,text/markdown,image/jpeg,image/png,image/webp"
      onChange={(event) => {
        const nextFile = event.target.files?.item(0);
        if (nextFile) {
          onFile(nextFile);
        }
      }}
    />
  );

  if (file) {
    const FileIcon = file.type.startsWith("image/") ? FileImage : FileCode2;
    return (
      <div className="selected-file-card">
        {input}
        <div className="selected-file-preview">
          {previewUrl ? (
            <img src={previewUrl} alt="" />
          ) : (
            <FileIcon className="h-8 w-8" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 text-xs font-bold uppercase text-accent">
            {t("upload.selectedFile")}
          </div>
          <div
            className="truncate text-base font-bold text-primary"
            title={file.name}
          >
            {file.name}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-muted">
            <span className="file-type-chip">{fileExtension(file.name)}</span>
            <span>{formatFileSize(file.size, locale)}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            className="btn btn-secondary btn-sm"
            type="button"
            onClick={openPicker}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            {t("upload.replace")}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={onClear}
          >
            <X className="h-4 w-4" aria-hidden />
            {t("upload.remove")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {input}
      <button
        className={`dropzone ${dragging ? "dropzone-active" : ""} ${error ? "dropzone-error" : ""}`}
        type="button"
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
          ) {
            setDragging(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const nextFile = event.dataTransfer.files.item(0);
          if (nextFile) {
            onFile(nextFile);
          }
        }}
      >
        <span className="dropzone-icon">
          <UploadCloud className="h-7 w-7" aria-hidden />
        </span>
        <span className="mt-5 text-lg font-bold text-primary">
          {t("upload.dropTitle")}
        </span>
        <span className="mt-1 text-sm font-medium text-muted">
          {t("upload.dropHint")}
        </span>
        <span className="btn btn-secondary mt-5" aria-hidden>
          {t("upload.browse")}
        </span>
        <span className="mt-4 text-xs font-semibold text-subtle">
          {t("upload.acceptedTypes")}
        </span>
      </button>
      {error && <div className="field-error mt-2">{error}</div>}
    </>
  );
}
