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
    <section className="grid max-w-3xl gap-5">
      <div>
        <h2 className="text-2xl font-semibold text-zinc-950">Upload</h2>
        <p className="text-sm text-zinc-500">Single file object</p>
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white p-5">
        <UploadDropzone file={file} onFile={setFile} />
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <label className="grid gap-1 text-sm font-medium text-zinc-700">
            URL days
            <input
              className="h-10 rounded-md border border-zinc-300 px-3"
              type="number"
              min={1}
              value={urlExpireDays}
              onChange={(event) =>
                setUrlExpireDays(Number.parseInt(event.target.value, 10))
              }
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-zinc-700">
            File days
            <input
              className="h-10 rounded-md border border-zinc-300 px-3"
              type="number"
              min={1}
              value={fileExpireDays}
              onChange={(event) =>
                setFileExpireDays(Number.parseInt(event.target.value, 10))
              }
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-zinc-700">
            Visibility
            <select
              className="h-10 rounded-md border border-zinc-300 bg-white px-3"
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
          <div className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
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
              className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
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
          <div className="mt-4 break-all rounded-md bg-emerald-50 px-3 py-2 font-mono text-sm text-emerald-800">
            {result}
          </div>
        )}
      </div>
    </section>
  );
}
