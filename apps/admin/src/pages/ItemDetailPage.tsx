import { Save, Trash2 } from "lucide-react";
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
      <section className="grid gap-4">
        <button className="w-fit text-sm font-medium text-blue-700" type="button" onClick={onBack}>
          Back
        </button>
        <div className="rounded-md bg-white p-5 text-sm text-zinc-500">{error ?? "Loading"}</div>
      </section>
    );
  }

  return (
    <section className="grid max-w-4xl gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button className="mb-2 text-sm font-medium text-blue-700" type="button" onClick={onBack}>
            Back
          </button>
          <h2 className="text-2xl font-semibold text-zinc-950">{item.title}</h2>
          <div className="mt-2 flex items-center gap-2">
            <StatusBadge status={item.derivedStatus} />
            <span className="font-mono text-xs text-zinc-500">{item.slug}</span>
          </div>
        </div>
        <a
          className="inline-flex h-10 items-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
          href={item.publicUrl}
          target="_blank"
          rel="noreferrer"
        >
          Preview
        </a>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="grid gap-4">
          <label className="grid gap-1 text-sm font-medium text-zinc-700">
            Title
            <input
              className="h-10 rounded-md border border-zinc-300 px-3"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-zinc-700 sm:max-w-xs">
            Visibility
            <select
              className="h-10 rounded-md border border-zinc-300 bg-white px-3"
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
          {error && <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
          <div className="flex flex-wrap gap-3">
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
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
              className="inline-flex h-10 items-center gap-2 rounded-md border border-rose-300 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50"
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
      <dl className="grid gap-3 rounded-lg border border-zinc-200 bg-white p-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium text-zinc-500">SHA-256</dt>
          <dd className="break-all font-mono text-zinc-800">{item.sha256}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Object key</dt>
          <dd className="break-all font-mono text-zinc-800">{item.objectKey}</dd>
        </div>
      </dl>
    </section>
  );
}
