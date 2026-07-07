import { ArrowLeft, ExternalLink, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { deleteItem, getItem, updateItem, type HtmlItem, type Visibility } from "../api/client.js";
import { ExpiryEditor } from "../components/ExpiryEditor.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { useSettings } from "../settings.js";

export function ItemDetailPage({ id, onBack }: { id: string; onBack: () => void }) {
  const { t } = useSettings();
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
      .catch((nextError: unknown) => setError(nextError instanceof Error ? nextError.message : t("common.loadFailed")));
  }, [id, t]);

  if (!item) {
    return (
      <section className="page-stack">
        <button className="btn btn-secondary btn-sm w-fit" type="button" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t("common.back")}
        </button>
        <div className="surface p-5 text-sm text-muted">{error ?? t("app.loading")}</div>
      </section>
    );
  }

  return (
    <section className="page-stack max-w-4xl">
      <div className="page-header">
        <div>
          <button className="btn btn-secondary btn-sm mb-3" type="button" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {t("common.back")}
          </button>
          <h2 className="page-title">{item.title}</h2>
          <div className="mt-2 flex items-center gap-2">
            <StatusBadge status={item.derivedStatus} />
            <span className="chip rounded-md px-2 py-1 font-mono text-xs">{item.slug}</span>
          </div>
        </div>
        <a
          className="btn btn-secondary"
          href={item.publicUrl}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink className="h-4 w-4" aria-hidden />
          {t("common.preview")}
        </a>
      </div>

      <div className="surface p-5">
        <div className="grid gap-4">
          <label className="field-label">
            {t("common.title")}
            <input
              className="control px-3"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="field-label sm:max-w-xs">
            {t("common.visibility")}
            <select
              className="control px-3"
              value={visibility}
              onChange={(event) => setVisibility(event.target.value as Visibility)}
            >
              <option value="public">{t("common.public")}</option>
              <option value="private">{t("common.private")}</option>
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
                  .catch((nextError: unknown) => setError(nextError instanceof Error ? nextError.message : t("common.saveFailed")))
                  .finally(() => setBusy(false));
              }}
            >
              <Save className="h-4 w-4" aria-hidden />
              {t("common.save")}
            </button>
            <button
              className="btn btn-danger"
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void deleteItem(item.id)
                  .then(onBack)
                  .catch((nextError: unknown) => setError(nextError instanceof Error ? nextError.message : t("common.deleteFailed")))
                  .finally(() => setBusy(false));
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              {t("common.delete")}
            </button>
          </div>
        </div>
      </div>
      <dl className="surface grid gap-3 p-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-semibold text-muted">{t("detail.sha256")}</dt>
          <dd className="break-all font-mono text-secondary">{item.sha256}</dd>
        </div>
        <div>
          <dt className="font-semibold text-muted">{t("detail.objectKey")}</dt>
          <dd className="break-all font-mono text-secondary">{item.objectKey}</dd>
        </div>
      </dl>
    </section>
  );
}
