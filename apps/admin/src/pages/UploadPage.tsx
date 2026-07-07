import { Check, Clipboard, Upload } from "lucide-react";
import { useState } from "react";
import { uploadHtml, type Visibility } from "../api/client.js";
import { UploadDropzone } from "../components/UploadDropzone.js";

export function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [urlExpireDays, setUrlExpireDays] = useState(7);
  const [fileExpireDays, setFileExpireDays] = useState(180);
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [result, setResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <section className="page-stack max-w-3xl">
      <div className="page-header">
        <div>
          <h2 className="page-title">Upload</h2>
          <p className="page-subtitle">Ready for a new object</p>
        </div>
      </div>
      <div className="surface p-5">
        <UploadDropzone file={file} onFile={setFile} />
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <label className="field-label">
            URL days
            <input
              className="control px-3"
              type="number"
              min={1}
              value={urlExpireDays}
              onChange={(event) =>
                setUrlExpireDays(Number.parseInt(event.target.value, 10))
              }
            />
          </label>
          <label className="field-label">
            File days
            <input
              className="control px-3"
              type="number"
              min={1}
              value={fileExpireDays}
              onChange={(event) =>
                setFileExpireDays(Number.parseInt(event.target.value, 10))
              }
            />
          </label>
          <label className="field-label">
            Visibility
            <select
              className="control px-3"
              value={visibility}
              onChange={(event) =>
                setVisibility(event.target.value as Visibility)
              }
            >
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
          </label>
        </div>
        {error && (
          <div className="alert-error mt-4">
            {error}
          </div>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            className="btn btn-primary"
            type="button"
            disabled={!file || busy}
            onClick={() => {
              if (!file) {
                return;
              }
              setBusy(true);
              setError(null);
              setResult(null);
              void uploadHtml({
                file,
                urlExpireDays,
                fileExpireDays,
                visibility,
              })
                .then((response) => setResult(response.publicUrl))
                .catch((nextError: unknown) =>
                  setError(
                    nextError instanceof Error
                      ? nextError.message
                      : "Upload failed",
                  ),
                )
                .finally(() => setBusy(false));
            }}
          >
            <Upload className="h-4 w-4" aria-hidden />
            Upload
          </button>
          {result && (
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(result).then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1200);
                });
              }}
            >
              {copied ? (
                <Check className="h-4 w-4" aria-hidden />
              ) : (
                <Clipboard className="h-4 w-4" aria-hidden />
              )}
              Copy URL
            </button>
          )}
        </div>
        {result && (
          <div className="mt-4 break-all rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 font-mono text-sm text-emerald-800">
            {result}
          </div>
        )}
      </div>
    </section>
  );
}
