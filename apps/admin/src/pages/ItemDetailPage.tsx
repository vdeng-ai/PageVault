import { ArrowLeft, ExternalLink, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { deleteItem, getItem, updateItem, type HtmlItem, type Visibility } from "../api/client.js";
import { ExpiryEditor } from "../components/ExpiryEditor.js";
import { StatusBadge } from "../components/StatusBadge.js";

export function ItemDetailPage({ id, onBack }: { id: string; onBack: () => void }) {
  const [item, setItem] = useState<HtmlItem | null>(null);
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [urlExpiresAt, setUrlExpiresAt] = useState("");
  const [fileExpiresAt, setFileExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getItem(id)
      .then((nextItem) => {
        setItem(nextItem);
        setTitle(nextItem.title);
        setVisibility(nextItem.visibility);
        setUrlExpiresAt(nextItem.urlExpiresAt);
        setFileExpiresAt(nextItem.fileExpiresAt);
      })
      .catch((nextError: unknown) => setError(nextError instanceof Error ? nextError.message : "Load failed"));
  }, [id]);

  if (!item) {
    return (
      <section className="page-stack">
        <button className="btn btn-secondary btn-sm w-fit" type="button" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back
        </button>
        <div className="surface p-5 text-sm text-slate-500">{error ?? "Loading"}</div>
      </section>
    );
  }

  return (
    <section className="page-stack max-w-4xl">
      <div className="page-header">
        <div>
          <button className="btn btn-secondary btn-sm mb-3" type="button" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back
          </button>
          <h2 className="page-title">{item.title}</h2>
          <div className="mt-2 flex items-center gap-2">
            <StatusBadge status={item.derivedStatus} />
            <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600">{item.slug}</span>
          </div>
        </div>
        <a
          className="btn btn-secondary"
          href={item.publicUrl}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink className="h-4 w-4" aria-hidden />
          Preview
        </a>
      </div>

      <div className="surface p-5">
        <div className="grid gap-4">
          <label className="field-label">
            Title
            <input
              className="control px-3"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="field-label sm:max-w-xs">
            Visibility
            <select
              className="control px-3"
              value={visibility}
              onChange={(event) => setVisibility(event.target.value as Visibility)}
            >
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
          </label>
          <ExpiryEditor
            urlExpiresAt={urlExpiresAt}
            fileExpiresAt={fileExpiresAt}
            onUrlChange={setUrlExpiresAt}
            onFileChange={setFileExpiresAt}
          />
          {error && <div className="alert-error">{error}</div>}
          <div className="flex flex-wrap gap-3">
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError(null);
                void updateItem(item.id, { title, visibility, urlExpiresAt, fileExpiresAt })
                  .then((nextItem) => setItem(nextItem))
                  .catch((nextError: unknown) => setError(nextError instanceof Error ? nextError.message : "Save failed"))
                  .finally(() => setBusy(false));
              }}
            >
              <Save className="h-4 w-4" aria-hidden />
              Save
            </button>
            <button
              className="btn btn-danger"
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void deleteItem(item.id)
                  .then(onBack)
                  .catch((nextError: unknown) => setError(nextError instanceof Error ? nextError.message : "Delete failed"))
                  .finally(() => setBusy(false));
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              Delete
            </button>
          </div>
        </div>
      </div>
      <dl className="surface grid gap-3 p-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-semibold text-slate-500">SHA-256</dt>
          <dd className="break-all font-mono text-slate-800">{item.sha256}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-500">Object key</dt>
          <dd className="break-all font-mono text-slate-800">{item.objectKey}</dd>
        </div>
      </dl>
    </section>
  );
}
