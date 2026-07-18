import {
  ArrowLeft,
  Database,
  ExternalLink,
  FileCog,
  Hash,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  deleteItem,
  getItem,
  updateItem,
  type HtmlItem,
  type Visibility,
} from "../api/client.js";
import { ExpiryEditor } from "../components/ExpiryEditor.js";
import { ConfirmDialog, useFeedback } from "../components/Feedback.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { useSettings } from "../settings.js";

type EditableFields = {
  title: string;
  visibility: Visibility;
  urlExpiresAt: string;
  fileExpiresAt: string;
};

function fieldsFromItem(item: HtmlItem): EditableFields {
  return {
    title: item.title,
    visibility: item.visibility,
    urlExpiresAt: item.urlExpiresAt,
    fileExpiresAt: item.fileExpiresAt,
  };
}

function validDate(value: string): boolean {
  return value.length > 0 && !Number.isNaN(Date.parse(value));
}

export function ItemDetailPage({
  id,
  onBack,
}: {
  id: string;
  onBack: () => void;
}) {
  const { t } = useSettings();
  const { notify } = useFeedback();
  const [item, setItem] = useState<HtmlItem | null>(null);
  const [initial, setInitial] = useState<EditableFields | null>(null);
  const [fields, setFields] = useState<EditableFields>({
    title: "",
    visibility: "public",
    urlExpiresAt: "",
    fileExpiresAt: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<"delete" | "discard" | null>(
    null,
  );

  useEffect(() => {
    setItem(null);
    setInitial(null);
    setError(null);
    void getItem(id)
      .then((nextItem) => {
        const nextFields = fieldsFromItem(nextItem);
        setItem(nextItem);
        setFields(nextFields);
        setInitial(nextFields);
      })
      .catch((nextError: unknown) =>
        setError(
          nextError instanceof Error ? nextError.message : "load-failed",
        ),
      );
  }, [id]);

  const dirty =
    initial !== null &&
    (fields.title !== initial.title ||
      fields.visibility !== initial.visibility ||
      fields.urlExpiresAt !== initial.urlExpiresAt ||
      fields.fileExpiresAt !== initial.fileExpiresAt);
  const valid =
    fields.title.trim().length > 0 &&
    validDate(fields.urlExpiresAt) &&
    validDate(fields.fileExpiresAt);

  function save(): void {
    if (!item || !dirty || !valid) {
      return;
    }
    setBusy(true);
    setError(null);
    void updateItem(item.id, {
      title: fields.title.trim(),
      visibility: fields.visibility,
      urlExpiresAt: fields.urlExpiresAt,
      fileExpiresAt: fields.fileExpiresAt,
    })
      .then((nextItem) => {
        const nextFields = fieldsFromItem(nextItem);
        setItem(nextItem);
        setFields(nextFields);
        setInitial(nextFields);
        notify(t("common.saved"), "success");
      })
      .catch((nextError: unknown) =>
        setError(
          nextError instanceof Error
            ? nextError.message
            : t("common.saveFailed"),
        ),
      )
      .finally(() => setBusy(false));
  }

  function remove(): void {
    if (!item) {
      return;
    }
    setConfirmation(null);
    setBusy(true);
    setError(null);
    void deleteItem(item.id)
      .then(() => {
        notify(t("common.deleted"), "success");
        onBack();
      })
      .catch((nextError: unknown) =>
        setError(
          nextError instanceof Error
            ? nextError.message
            : t("common.deleteFailed"),
        ),
      )
      .finally(() => setBusy(false));
  }

  function requestBack(): void {
    if (dirty) {
      setConfirmation("discard");
    } else {
      onBack();
    }
  }

  if (!item) {
    return (
      <section className="page-stack detail-workspace">
        <button
          className="btn btn-secondary btn-sm w-fit"
          type="button"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t("common.back")}
        </button>
        <div className="surface p-6 text-sm text-muted" role="status">
          {error
            ? error === "load-failed"
              ? t("common.loadFailed")
              : error
            : t("app.loading")}
        </div>
      </section>
    );
  }

  return (
    <section className="page-stack detail-workspace">
      <button className="back-link" type="button" onClick={requestBack}>
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t("common.back")}
      </button>

      <div className="page-header page-header-hero workspace-hero detail-hero">
        <div className="workspace-hero-copy min-w-0">
          <div className="page-eyebrow">
            <FileCog className="h-4 w-4" aria-hidden />
            {t("detail.eyebrow")}
          </div>
          <h1 className="page-title truncate">{item.title}</h1>
          <p className="page-subtitle">{t("detail.subtitle")}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge status={item.derivedStatus} />
            <span className="chip rounded-lg px-2.5 py-1 font-mono text-xs">
              /{item.slug}
            </span>
            {dirty && (
              <span className="unsaved-chip">{t("detail.unsaved")}</span>
            )}
          </div>
        </div>
        <div className="workspace-hero-actions">
          <div className="hero-visual hero-visual-detail" aria-hidden>
            <span className="hero-detail-line hero-detail-line-one" />
            <span className="hero-detail-line hero-detail-line-two" />
            <FileCog className="hero-visual-icon" />
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
      </div>

      <div className="detail-layout">
        <div className="surface feature-surface detail-panel detail-settings-panel p-5 sm:p-6">
          <div className="section-heading">
            <span className="section-icon">
              <FileCog className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h2>{t("detail.settingsTitle")}</h2>
              <p>{t("detail.settingsSubtitle")}</p>
            </div>
          </div>
          <div className="mt-6 grid gap-5">
            <label className="field-label">
              {t("common.title")}
              <input
                className="control px-3"
                value={fields.title}
                maxLength={200}
                aria-invalid={fields.title.trim().length === 0}
                onChange={(event) =>
                  setFields((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field-label sm:max-w-sm">
              {t("common.visibility")}
              <select
                className="control px-3"
                value={fields.visibility}
                onChange={(event) =>
                  setFields((current) => ({
                    ...current,
                    visibility: event.target.value as Visibility,
                  }))
                }
              >
                <option value="public">{t("common.public")}</option>
                <option value="private">{t("common.private")}</option>
              </select>
            </label>
            <ExpiryEditor
              urlExpiresAt={fields.urlExpiresAt}
              fileExpiresAt={fields.fileExpiresAt}
              onUrlChange={(value) =>
                setFields((current) => ({ ...current, urlExpiresAt: value }))
              }
              onFileChange={(value) =>
                setFields((current) => ({ ...current, fileExpiresAt: value }))
              }
            />
            {error && (
              <div className="alert-error" role="alert">
                {error}
              </div>
            )}
            <div className="detail-action-bar">
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={busy || !dirty || !valid}
                  onClick={save}
                >
                  {busy ? (
                    <span className="spinner" aria-hidden />
                  ) : (
                    <Save className="h-4 w-4" aria-hidden />
                  )}
                  {t("common.save")}
                </button>
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={busy || !dirty || !initial}
                  onClick={() => initial && setFields(initial)}
                >
                  <RotateCcw className="h-4 w-4" aria-hidden />
                  {t("common.reset")}
                </button>
              </div>
              <button
                className="btn btn-danger"
                type="button"
                disabled={busy}
                onClick={() => setConfirmation("delete")}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                {t("common.delete")}
              </button>
            </div>
          </div>
        </div>

        <div className="surface feature-surface detail-panel detail-metadata-panel p-5 sm:p-6">
          <div className="section-heading">
            <span className="section-icon">
              <Database className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h2>{t("detail.metadataTitle")}</h2>
              <p>{t("detail.metadataSubtitle")}</p>
            </div>
          </div>
          <dl className="metadata-grid mt-6">
            <div>
              <dt>
                <Hash className="h-4 w-4" aria-hidden />
                {t("detail.sha256")}
              </dt>
              <dd>{item.sha256}</dd>
            </div>
            <div>
              <dt>
                <Database className="h-4 w-4" aria-hidden />
                {t("detail.objectKey")}
              </dt>
              <dd>{item.objectKey}</dd>
            </div>
          </dl>
        </div>
      </div>

      <ConfirmDialog
        open={confirmation !== null}
        title={
          confirmation === "delete"
            ? t("confirm.deleteItem", { title: item.title })
            : t("confirm.discardTitle")
        }
        description={
          confirmation === "delete"
            ? t("confirm.deleteItemBody")
            : t("confirm.discardBody")
        }
        confirmLabel={
          confirmation === "delete" ? t("common.delete") : t("common.confirm")
        }
        cancelLabel={t("common.cancel")}
        danger={confirmation === "delete"}
        busy={busy}
        onClose={() => setConfirmation(null)}
        onConfirm={() => {
          if (confirmation === "delete") remove();
          else {
            setConfirmation(null);
            onBack();
          }
        }}
      />
    </section>
  );
}
