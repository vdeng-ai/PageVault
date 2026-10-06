import { itemPreviewUrl } from "../format.js";
import {
  ArrowLeft,
  Database,
  ExternalLink,
  FileCog,
  Copy,
  Link2,
  ChevronDown,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  deleteItem,
  getItem,
  updateItem,
  type VaultItem,
  type Visibility,
} from "../api/client.js";
import { ExpiryEditor } from "../components/ExpiryEditor.js";
import { ConfirmDialog, useFeedback } from "../components/Feedback.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { WorkspaceHero } from "../components/WorkspaceHero.js";
import { GlassToolbar } from "../components/Glass.js";
import { formatFileSize } from "../format.js";
import { fileKind } from "../components/FileIcon.js";
import { useSettings } from "../settings.js";
import { copyText } from "../clipboard.js";

type EditableFields = {
  title: string;
  visibility: Visibility;
  urlExpiresAt: string;
  fileExpiresAt: string;
};

function fieldsFromItem(item: VaultItem): EditableFields {
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
  const { t, locale } = useSettings();
  const { notify } = useFeedback();
  const [item, setItem] = useState<VaultItem | null>(null);
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
    let cancelled = false;
    setItem(null);
    setInitial(null);
    setError(null);
    void getItem(id)
      .then((nextItem) => {
        if (cancelled) return;
        const nextFields = fieldsFromItem(nextItem);
        setItem(nextItem);
        setFields(nextFields);
        setInitial(nextFields);
      })
      .catch((nextError: unknown) => {
        if (cancelled) return;
        setError(
          nextError instanceof Error ? nextError.message : "load-failed",
        );
      });
    return () => {
      cancelled = true;
    };
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

  function copy(value: string): void {
    void copyText(value)
      .then(() => notify(t("detail.copied"), "success"))
      .catch(() => notify(t("common.copyFailed"), "error"));
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
          {t("upload.backToFiles")}
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
        {t("upload.backToFiles")}
      </button>

      <WorkspaceHero
        icon={FileCog}
        eyebrow={t("detail.eyebrow")}
        title={item.originalFilename}
        subtitle={t("detail.subtitle")}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={item.derivedStatus} />
            <span className="detail-slug">/{item.slug}</span>
            <span>{formatFileSize(item.sizeBytes, locale)}</span>
            {dirty && (
              <span className="unsaved-chip">{t("detail.unsaved")}</span>
            )}
          </div>
        }
        actions={
          <a
            className="btn btn-secondary"
            href={itemPreviewUrl(item)}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            {t("common.preview")}
          </a>
        }
      />

      <div className="detail-layout">
        <div className="surface detail-panel detail-settings-panel p-5 sm:p-6">
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
            <label className="field-label">
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
              <small className="field-hint">{t("detail.visibilityHint")}</small>
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
            <GlassToolbar
              material={dirty ? "elevated" : "thin"}
              className="detail-action-bar"
            >
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
            </GlassToolbar>
            {dirty && (
              <p className="field-hint m-0">{t("detail.saveBeforeLeaving")}</p>
            )}
          </div>
        </div>

        <aside className="detail-panel detail-metadata-panel">
          <div className="section-heading">
            <Link2 aria-hidden />
            <h2>{t("upload.shareLink")}</h2>
          </div>
          <div className="copy-field">
            <input
              aria-label={t("upload.shareLink")}
              value={item.publicUrl}
              readOnly
              onFocus={(event) => event.target.select()}
            />
            <button
              className="icon-button"
              type="button"
              aria-label={t("upload.copyUrl")}
              onClick={() => copy(item.publicUrl)}
            >
              <Copy size={20} aria-hidden />
            </button>
          </div>
          <p className="detail-share-meta">
            {t(
              item.visibility === "public"
                ? "dashboard.publicAccess"
                : "upload.privateLabel",
            )}{" "}
            · {fileKind(item.originalFilename)} ·{" "}
            {formatFileSize(item.sizeBytes, locale)}
          </p>
          <details className="metadata-section" open>
            <summary>
              <div className="section-heading">
                <Database aria-hidden />
                <h2>{t("detail.metadataTitle")}</h2>
              </div>
              <ChevronDown size={20} aria-hidden />
            </summary>
            <dl className="metadata-grid mt-6">
              {(
                [
                  ["detail.objectKey", item.objectKey],
                  ["detail.sha256", item.sha256],
                ] as const
              ).map(([key, value]) => (
                <div key={key}>
                  <dt>{t(key)}</dt>
                  <dd>
                    <div className="copy-field">
                      <code>{value}</code>
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={`${t("detail.copyValue")} ${t(key)}`}
                        onClick={() => copy(value)}
                      >
                        <Copy size={19} aria-hidden />
                      </button>
                    </div>
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        </aside>
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
