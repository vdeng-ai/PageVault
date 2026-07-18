import {
  Ban,
  Check,
  Copy,
  KeyRound,
  Plus,
  RefreshCcw,
  ShieldAlert,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  type ApiKey,
  type CreatedApiKey,
} from "../api/client.js";
import { ConfirmDialog, useFeedback } from "../components/Feedback.js";
import { useSettings } from "../settings.js";

function ApiKeyDialog({
  open,
  creating,
  created,
  onCreate,
  onClose,
}: {
  open: boolean;
  creating: boolean;
  created: CreatedApiKey | null;
  onCreate: (name: string) => void;
  onClose: () => void;
}) {
  const { t } = useSettings();
  const { notify } = useFeedback();
  const [name, setName] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setName("");
      return;
    }
    const previous = document.activeElement as HTMLElement | null;
    window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => previous?.focus();
  }, [open]);

  if (!open) {
    return null;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape" && !creating && !created) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const focusable = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled])",
      ) ?? [],
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    const normalized = name.trim();
    if (normalized) {
      onCreate(normalized);
    }
  }

  function copyToken(): void {
    if (!created) return;
    void navigator.clipboard
      .writeText(created.token)
      .then(() => notify(t("apiKeys.copied"), "success"))
      .catch(() => notify(t("apiKeys.copyFailed"), "error"));
  }

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !creating && !created) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        className="dialog-panel api-key-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="api-key-dialog-title"
        aria-describedby="api-key-dialog-description"
        onKeyDown={handleKeyDown}
      >
        <div className="api-key-dialog-heading">
          <div className="dialog-icon">
            {created ? (
              <Check className="h-5 w-5" aria-hidden />
            ) : (
              <KeyRound className="h-5 w-5" aria-hidden />
            )}
          </div>
          <button
            className="icon-button"
            type="button"
            disabled={creating}
            aria-label={t("common.close")}
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <h2 id="api-key-dialog-title" className="dialog-title">
          {created ? t("apiKeys.createdTitle") : t("apiKeys.createTitle")}
        </h2>
        <p id="api-key-dialog-description" className="dialog-description">
          {created
            ? t("apiKeys.createdWarning")
            : t("apiKeys.createDescription")}
        </p>

        {created ? (
          <div className="api-key-token-wrap">
            <code className="api-key-token">{created.token}</code>
            <button
              className="btn btn-primary"
              type="button"
              onClick={copyToken}
            >
              <Copy className="h-4 w-4" aria-hidden />
              {t("apiKeys.copy")}
            </button>
          </div>
        ) : (
          <form className="api-key-create-form" onSubmit={submit}>
            <label className="field-label">
              <span>{t("apiKeys.name")}</span>
              <input
                ref={inputRef}
                className="control px-3"
                value={name}
                maxLength={100}
                autoComplete="off"
                placeholder={t("apiKeys.namePlaceholder")}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <div className="api-key-dialog-actions">
              <button
                className="btn btn-secondary"
                type="button"
                disabled={creating}
                onClick={onClose}
              >
                {t("common.cancel")}
              </button>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={creating || name.trim().length === 0}
              >
                <Plus className="h-4 w-4" aria-hidden />
                {creating ? t("apiKeys.creating") : t("apiKeys.create")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export function ApiKeysPage() {
  const { locale, t } = useSettings();
  const { notify } = useFeedback();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);
  const [revoking, setRevoking] = useState(false);

  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [locale],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setApiKeys(await listApiKeys());
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : t("apiKeys.loadFailed"),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeCount = apiKeys.filter((apiKey) => !apiKey.revokedAt).length;

  function formatDate(value: string | null): string {
    return value ? formatter.format(new Date(value)) : t("apiKeys.never");
  }

  function create(name: string): void {
    setCreating(true);
    void createApiKey(name)
      .then((result) => {
        setCreated(result);
        setApiKeys((current) => [result.apiKey, ...current]);
      })
      .catch((nextError: unknown) =>
        notify(
          nextError instanceof Error
            ? nextError.message
            : t("apiKeys.createFailed"),
          "error",
        ),
      )
      .finally(() => setCreating(false));
  }

  function revoke(): void {
    const target = revokeTarget;
    if (!target) return;
    setRevoking(true);
    void revokeApiKey(target.id)
      .then(() => {
        setApiKeys((current) =>
          current.map((apiKey) =>
            apiKey.id === target.id
              ? { ...apiKey, revokedAt: new Date().toISOString() }
              : apiKey,
          ),
        );
        setRevokeTarget(null);
        notify(t("apiKeys.revokedNotice"), "success");
      })
      .catch((nextError: unknown) =>
        notify(
          nextError instanceof Error
            ? nextError.message
            : t("apiKeys.revokeFailed"),
          "error",
        ),
      )
      .finally(() => setRevoking(false));
  }

  return (
    <section className="page-stack api-keys-workspace">
      <div className="page-header page-header-hero">
        <div>
          <div className="page-eyebrow">
            <KeyRound className="h-4 w-4" aria-hidden />
            {t("apiKeys.activeSummary", { count: activeCount })}
          </div>
          <h1 className="page-title">{t("apiKeys.title")}</h1>
          <p className="page-subtitle">{t("apiKeys.subtitle")}</p>
        </div>
        <div className="api-key-header-actions">
          <button
            className="icon-button"
            type="button"
            title={t("common.refresh")}
            aria-label={t("common.refresh")}
            disabled={loading}
            onClick={() => void load()}
          >
            <RefreshCcw
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              aria-hidden
            />
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="h-4 w-4" aria-hidden />
            {t("apiKeys.new")}
          </button>
        </div>
      </div>

      {error ? (
        <div className="alert-error" role="alert">
          {error}
        </div>
      ) : null}

      {loading && apiKeys.length === 0 ? (
        <div className="surface api-key-loading" role="status">
          <div className="skeleton h-4 w-2/5 rounded" />
          <div className="skeleton-muted h-3 w-3/5 rounded" />
        </div>
      ) : apiKeys.length === 0 ? (
        <div className="surface api-key-empty">
          <div className="empty-library-icon">
            <KeyRound className="h-6 w-6" aria-hidden />
          </div>
          <h2>{t("apiKeys.emptyTitle")}</h2>
          <p>{t("apiKeys.emptyDetail")}</p>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="h-4 w-4" aria-hidden />
            {t("apiKeys.new")}
          </button>
        </div>
      ) : (
        <div className="surface api-key-table-wrap">
          <table className="api-key-table">
            <thead>
              <tr>
                <th>{t("apiKeys.name")}</th>
                <th>{t("apiKeys.key")}</th>
                <th>{t("apiKeys.scope")}</th>
                <th>{t("apiKeys.created")}</th>
                <th>{t("apiKeys.lastUsed")}</th>
                <th>{t("apiKeys.status")}</th>
                <th className="api-key-action-heading">
                  {t("apiKeys.actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {apiKeys.map((apiKey) => {
                const revoked = apiKey.revokedAt !== null;
                return (
                  <tr key={apiKey.id}>
                    <td>
                      <strong className="api-key-name">{apiKey.name}</strong>
                    </td>
                    <td>
                      <code className="api-key-prefix">{apiKey.prefix}...</code>
                    </td>
                    <td>{t("apiKeys.uploadScope")}</td>
                    <td>{formatDate(apiKey.createdAt)}</td>
                    <td>{formatDate(apiKey.lastUsedAt)}</td>
                    <td>
                      <span
                        className={`api-key-status ${revoked ? "api-key-status-revoked" : "api-key-status-active"}`}
                      >
                        {revoked ? t("apiKeys.revoked") : t("apiKeys.active")}
                      </span>
                    </td>
                    <td className="api-key-action-cell">
                      <button
                        className="icon-button api-key-revoke-button"
                        type="button"
                        title={t("apiKeys.revoke")}
                        aria-label={t("apiKeys.revokeNamed", {
                          name: apiKey.name,
                        })}
                        disabled={revoked}
                        onClick={() => setRevokeTarget(apiKey)}
                      >
                        <Ban className="h-4 w-4" aria-hidden />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ApiKeyDialog
        open={dialogOpen}
        creating={creating}
        created={created}
        onCreate={create}
        onClose={() => {
          setDialogOpen(false);
          setCreated(null);
        }}
      />

      <ConfirmDialog
        open={revokeTarget !== null}
        title={t("apiKeys.revokeTitle")}
        description={t("apiKeys.revokeBody", {
          name: revokeTarget?.name ?? "",
        })}
        confirmLabel={t("apiKeys.revoke")}
        cancelLabel={t("common.cancel")}
        busy={revoking}
        danger
        icon={<ShieldAlert className="h-6 w-6" aria-hidden />}
        onClose={() => setRevokeTarget(null)}
        onConfirm={revoke}
      />
    </section>
  );
}
