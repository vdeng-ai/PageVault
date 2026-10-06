import {
  FileStack,
  FolderOpen,
  RefreshCcw,
  Search,
  SearchX,
  SlidersHorizontal,
  UploadCloud,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  batchItems,
  deleteItem,
  listItems,
  updateItem,
  type BatchAction,
  type FileKind,
  type ListItemsParams,
  type VaultItem,
} from "../api/client.js";
import { BatchToolbar } from "../components/BatchToolbar.js";
import { ConfirmDialog, useFeedback } from "../components/Feedback.js";
import { ItemTable } from "../components/ItemTable.js";
import { GlassToolbar } from "../components/Glass.js";
import { WorkspaceHero } from "../components/WorkspaceHero.js";
import { useSettings } from "../settings.js";
import { copyText } from "../clipboard.js";

const SEARCH_DEBOUNCE_MS = 400;
const MIB = 1024 * 1024;

type CreatedWindow = "" | "7" | "30" | "90";
type ExpiryWindow = "" | "url-7" | "url-30" | "file-7" | "file-30";
type SizeRange = "" | "small" | "medium" | "large";

function listFilterParams(input: {
  fileKind: FileKind | "";
  createdWindow: CreatedWindow;
  expiryWindow: ExpiryWindow;
  sizeRange: SizeRange;
  now?: Date;
}): Pick<
  ListItemsParams,
  | "fileKind"
  | "createdAfter"
  | "urlExpiresAfter"
  | "urlExpiresBefore"
  | "fileExpiresAfter"
  | "fileExpiresBefore"
  | "minSizeBytes"
  | "maxSizeBytes"
> {
  const now = input.now ?? new Date();
  const params: ReturnType<typeof listFilterParams> = {
    fileKind: input.fileKind,
  };

  if (input.createdWindow) {
    params.createdAfter = new Date(
      now.getTime() - Number(input.createdWindow) * 24 * 60 * 60 * 1000,
    ).toISOString();
  }

  if (input.expiryWindow) {
    const [target, daysText] = input.expiryWindow.split("-") as [
      "url" | "file",
      string,
    ];
    const before = new Date(
      now.getTime() + Number(daysText) * 24 * 60 * 60 * 1000,
    ).toISOString();
    if (target === "url") {
      params.urlExpiresAfter = now.toISOString();
      params.urlExpiresBefore = before;
    } else {
      params.fileExpiresAfter = now.toISOString();
      params.fileExpiresBefore = before;
    }
  }

  if (input.sizeRange === "small") {
    params.maxSizeBytes = MIB - 1;
  } else if (input.sizeRange === "medium") {
    params.minSizeBytes = MIB;
    params.maxSizeBytes = 10 * MIB;
  } else if (input.sizeRange === "large") {
    params.minSizeBytes = 10 * MIB + 1;
  }

  return params;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

type PendingConfirmation =
  | { kind: "delete-item"; item: VaultItem }
  | { kind: "disable-item"; item: VaultItem }
  | { kind: "batch-delete"; count: number }
  | { kind: "batch-disable"; count: number };

export function ItemListPage({
  onEdit,
  onUpload,
}: {
  onEdit: (id: string) => void;
  onUpload: () => void;
}) {
  const { t } = useSettings();
  const { notify } = useFeedback();
  const tRef = useRef(t);
  const [items, setItems] = useState<VaultItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState<number | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [visibility, setVisibility] = useState("");
  const [fileKind, setFileKind] = useState<FileKind | "">("");
  const [createdWindow, setCreatedWindow] = useState<CreatedWindow>("");
  const [expiryWindow, setExpiryWindow] = useState<ExpiryWindow>("");
  const [sizeRange, setSizeRange] = useState<SizeRange>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(
    null,
  );
  const pageSize = 20;
  const requestSeq = useRef(0);
  const firstLoad = useRef(true);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const load = useCallback(
    (signal?: AbortSignal) => {
      const requestId = requestSeq.current + 1;
      requestSeq.current = requestId;
      setLoading(true);
      setError(null);
      const init = signal ? { signal } : {};
      void listItems(
        {
          page,
          pageSize,
          q,
          status,
          visibility,
          ...listFilterParams({
            fileKind,
            createdWindow,
            expiryWindow,
            sizeRange,
          }),
        },
        init,
      )
        .then((result) => {
          if (requestId !== requestSeq.current) {
            return;
          }
          setItems(result.items);
          setTotal(result.total);
          setHasNextPage(result.hasNextPage);
          setSelectedIds(new Set());
        })
        .catch((nextError: unknown) => {
          if (requestId !== requestSeq.current || isAbortError(nextError)) {
            return;
          }
          setError(
            nextError instanceof Error
              ? nextError.message
              : tRef.current("common.loadFailed"),
          );
        })
        .finally(() => {
          if (requestId === requestSeq.current) {
            setLoading(false);
          }
        });
    },
    [
      page,
      q,
      status,
      visibility,
      fileKind,
      createdWindow,
      expiryWindow,
      sizeRange,
    ],
  );

  useEffect(() => {
    const controller = new AbortController();
    const delay = firstLoad.current ? 0 : SEARCH_DEBOUNCE_MS;
    firstLoad.current = false;
    const timeoutId = window.setTimeout(() => load(controller.signal), delay);
    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [load]);

  const totalPages =
    total === null ? null : Math.max(1, Math.ceil(total / pageSize));
  const recordSummary =
    total === null
      ? t("files.pageSummary", { page })
      : t("files.recordSummary", { total });
  const hasFilters =
    q.length > 0 ||
    status.length > 0 ||
    visibility.length > 0 ||
    fileKind.length > 0 ||
    createdWindow.length > 0 ||
    expiryWindow.length > 0 ||
    sizeRange.length > 0;

  function selectedArray(): string[] {
    return Array.from(selectedIds);
  }

  function executeBatch(action: BatchAction, days?: number): void {
    setBatchBusy(true);
    setError(null);
    void batchItems({
      ids: selectedArray(),
      action,
      ...(days === undefined ? {} : { days }),
    })
      .then((result) => {
        notify(
          t("common.batchUpdated", { count: result.ok }),
          result.failed.length ? "info" : "success",
        );
        if (result.failed.length > 0) {
          setError(t("common.batchFailed"));
        }
        load();
      })
      .catch((nextError: unknown) => {
        setError(
          nextError instanceof Error
            ? nextError.message
            : t("common.batchFailed"),
        );
      })
      .finally(() => setBatchBusy(false));
  }

  function requestBatch(action: BatchAction, days?: number): void {
    if (action === "delete") {
      setConfirmation({ kind: "batch-delete", count: selectedIds.size });
      return;
    }
    if (action === "disable") {
      setConfirmation({ kind: "batch-disable", count: selectedIds.size });
      return;
    }
    executeBatch(action, days);
  }

  function patchItem(
    item: VaultItem,
    patch: Parameters<typeof updateItem>[1],
  ): void {
    setBusyId(item.id);
    setError(null);
    void updateItem(item.id, patch)
      .then((updated) => {
        setItems((current) =>
          current.map((candidate) =>
            candidate.id === updated.id ? updated : candidate,
          ),
        );
        notify(t("common.updated"), "success");
      })
      .catch((nextError: unknown) => {
        setError(
          nextError instanceof Error
            ? nextError.message
            : t("common.saveFailed"),
        );
      })
      .finally(() => setBusyId(null));
  }

  function removeItem(item: VaultItem): void {
    setBusyId(item.id);
    setError(null);
    void deleteItem(item.id)
      .then(() => {
        notify(t("common.deleted"), "success");
        setSelectedIds((current) => {
          const next = new Set(current);
          next.delete(item.id);
          return next;
        });
        if (items.length === 1 && page > 1) {
          setPage((value) => value - 1);
        } else {
          setItems((current) =>
            current.filter((candidate) => candidate.id !== item.id),
          );
        }
      })
      .catch((nextError: unknown) => {
        setError(
          nextError instanceof Error
            ? nextError.message
            : t("common.deleteFailed"),
        );
      })
      .finally(() => setBusyId(null));
  }

  const confirmTitle = confirmation
    ? confirmation.kind === "delete-item"
      ? t("confirm.deleteItem", { title: confirmation.item.title })
      : confirmation.kind === "disable-item"
        ? t("confirm.disableItem", { title: confirmation.item.title })
        : confirmation.kind === "batch-delete"
          ? t("confirm.batchDelete", { count: confirmation.count })
          : t("confirm.batchDisable", { count: confirmation.count })
    : "";
  const confirmDescription = confirmation
    ? confirmation.kind === "delete-item"
      ? t("confirm.deleteItemBody")
      : confirmation.kind === "disable-item"
        ? t("confirm.disableItemBody")
        : confirmation.kind === "batch-delete"
          ? t("confirm.batchDeleteBody")
          : t("confirm.batchDisableBody")
    : "";
  const confirmDanger =
    confirmation?.kind === "delete-item" ||
    confirmation?.kind === "batch-delete";

  return (
    <section className="page-stack library-workspace">
      <WorkspaceHero
        icon={FileStack}
        eyebrow={recordSummary}
        title={t("files.title")}
        subtitle={t("files.subtitle")}
        actions={
          <div className="workspace-action-row">
            <button
              className="btn btn-secondary"
              type="button"
              disabled={loading}
              onClick={() => load()}
            >
              <RefreshCcw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                aria-hidden
              />
              {t("common.refresh")}
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={onUpload}
            >
              <UploadCloud className="h-4 w-4" aria-hidden />
              {t("files.newUpload")}
            </button>
          </div>
        }
      />

      <GlassToolbar
        material="standard"
        className="surface filter-bar library-filter-bar"
      >
        <label className="filter-search relative min-w-0 flex-1 sm:min-w-64">
          <span className="sr-only">{t("common.search")}</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
            aria-hidden
          />
          <input
            className="control w-full pl-9 pr-3"
            value={q}
            placeholder={t("files.searchPlaceholder")}
            onChange={(event) => {
              setPage(1);
              setQ(event.target.value);
            }}
          />
        </label>
        <div className="filter-select-wrap">
          <SlidersHorizontal className="h-4 w-4 text-subtle" aria-hidden />
          <select
            className="control"
            value={status}
            aria-label={t("files.allStatus")}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value);
            }}
          >
            <option value="">{t("files.allStatus")}</option>
            <option value="active">{t("status.active")}</option>
            <option value="private">{t("status.private")}</option>
            <option value="disabled">{t("status.disabled")}</option>
            <option value="url_expired">{t("status.urlExpired")}</option>
            <option value="file_expired">{t("status.fileExpired")}</option>
            <option value="deleted">{t("status.deleted")}</option>
          </select>
        </div>
        <select
          className="control min-w-40 px-3"
          value={visibility}
          aria-label={t("files.allVisibility")}
          onChange={(event) => {
            setPage(1);
            setVisibility(event.target.value);
          }}
        >
          <option value="">{t("files.allVisibility")}</option>
          <option value="public">{t("common.public")}</option>
          <option value="private">{t("common.private")}</option>
        </select>
        <select
          className="control min-w-36 px-3"
          value={fileKind}
          aria-label={t("files.allTypes")}
          onChange={(event) => {
            setPage(1);
            setFileKind(event.target.value as FileKind | "");
          }}
        >
          <option value="">{t("files.allTypes")}</option>
          <option value="html">HTML</option>
          <option value="markdown">Markdown</option>
          <option value="pdf">PDF</option>
          <option value="svg">SVG</option>
          <option value="png">PNG</option>
          <option value="jpeg">JPEG</option>
          <option value="webp">WebP</option>
        </select>
        <select
          className="control min-w-36 px-3"
          value={createdWindow}
          aria-label={t("files.created")}
          onChange={(event) => {
            setPage(1);
            setCreatedWindow(event.target.value as CreatedWindow);
          }}
        >
          <option value="">{t("files.createdAny")}</option>
          <option value="7">{t("files.createdDays", { days: 7 })}</option>
          <option value="30">{t("files.createdDays", { days: 30 })}</option>
          <option value="90">{t("files.createdDays", { days: 90 })}</option>
        </select>
        <select
          className="control min-w-44 px-3"
          value={expiryWindow}
          aria-label={t("files.expiry")}
          onChange={(event) => {
            setPage(1);
            setExpiryWindow(event.target.value as ExpiryWindow);
          }}
        >
          <option value="">{t("files.expiryAny")}</option>
          <option value="url-7">{t("files.urlExpiresDays", { days: 7 })}</option>
          <option value="url-30">{t("files.urlExpiresDays", { days: 30 })}</option>
          <option value="file-7">{t("files.fileExpiresDays", { days: 7 })}</option>
          <option value="file-30">{t("files.fileExpiresDays", { days: 30 })}</option>
        </select>
        <select
          className="control min-w-36 px-3"
          value={sizeRange}
          aria-label={t("files.size")}
          onChange={(event) => {
            setPage(1);
            setSizeRange(event.target.value as SizeRange);
          }}
        >
          <option value="">{t("files.sizeAny")}</option>
          <option value="small">{t("files.sizeSmall")}</option>
          <option value="medium">{t("files.sizeMedium")}</option>
          <option value="large">{t("files.sizeLarge")}</option>
        </select>
        {
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => {
              setQ("");
              setStatus("");
              setVisibility("");
              setFileKind("");
              setCreatedWindow("");
              setExpiryWindow("");
              setSizeRange("");
              setPage(1);
            }}
          >
            {t("files.clearFilters")}
          </button>
        }
      </GlassToolbar>

      <BatchToolbar
        selectedCount={selectedIds.size}
        busy={batchBusy}
        onAction={requestBatch}
      />
      {error && (
        <div className="alert-error" role="alert">
          {error}
        </div>
      )}

      {loading && items.length === 0 ? (
        <div
          className="grid gap-3"
          role="status"
          aria-label={t("files.loading")}
        >
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="surface h-20 animate-pulse p-4">
              <div className="skeleton h-4 w-2/5 rounded" />
              <div className="skeleton-muted mt-3 h-3 w-3/5 rounded" />
            </div>
          ))}
        </div>
      ) : items.length > 0 ? (
        <ItemTable
          items={items}
          selectedIds={selectedIds}
          busyId={busyId}
          onSelect={(id, checked) => {
            const next = new Set(selectedIds);
            if (checked) next.add(id);
            else next.delete(id);
            setSelectedIds(next);
          }}
          onSelectAll={(checked) =>
            setSelectedIds(
              checked ? new Set(items.map((item) => item.id)) : new Set(),
            )
          }
          onCopy={(url) => {
            void copyText(url)
              .then(() => notify(t("common.copied"), "success"))
              .catch(() => notify(t("common.copyFailed"), "error"));
          }}
          onEdit={onEdit}
          onVisibility={(item) =>
            patchItem(item, {
              visibility: item.visibility === "public" ? "private" : "public",
            })
          }
          onDisable={(item) => setConfirmation({ kind: "disable-item", item })}
          onRestore={(item) => patchItem(item, { status: "active" })}
          onDelete={(item) => setConfirmation({ kind: "delete-item", item })}
        />
      ) : (
        <div className="surface empty-library">
          <div className="empty-library-icon">
            {hasFilters ? (
              <SearchX className="h-7 w-7" aria-hidden />
            ) : (
              <FolderOpen className="h-7 w-7" aria-hidden />
            )}
          </div>
          <h2>
            {hasFilters ? t("files.noResultsTitle") : t("files.emptyTitle")}
          </h2>
          <p>
            {hasFilters ? t("files.noResultsDetail") : t("files.emptyDetail")}
          </p>
          <button
            className="btn btn-primary mt-5"
            type="button"
            onClick={
              hasFilters
                ? () => {
                    setQ("");
                    setStatus("");
                    setVisibility("");
                    setPage(1);
                  }
                : onUpload
            }
          >
            {hasFilters ? (
              <RefreshCcw className="h-4 w-4" aria-hidden />
            ) : (
              <UploadCloud className="h-4 w-4" aria-hidden />
            )}
            {hasFilters ? t("files.clearFilters") : t("files.newUpload")}
          </button>
        </div>
      )}

      {(items.length > 0 || page > 1) && (
        <div className="pagination-bar">
          <span className="record-summary">{recordSummary}</span>
          <button
            className="btn btn-secondary btn-sm"
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            {t("common.previous")}
          </button>
          <span>
            {totalPages === null
              ? t("files.pageSummary", { page })
              : t("files.pagination", { page, totalPages })}
          </span>
          <button
            className="btn btn-secondary btn-sm"
            type="button"
            disabled={!hasNextPage || loading}
            onClick={() => setPage((value) => value + 1)}
          >
            {t("common.next")}
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmation !== null}
        title={confirmTitle}
        description={confirmDescription}
        confirmLabel={confirmDanger ? t("common.delete") : t("common.disable")}
        cancelLabel={t("common.cancel")}
        danger={confirmDanger}
        onClose={() => setConfirmation(null)}
        onConfirm={() => {
          const next = confirmation;
          setConfirmation(null);
          if (!next) return;
          if (next.kind === "delete-item") removeItem(next.item);
          else if (next.kind === "disable-item")
            patchItem(next.item, { status: "disabled" });
          else if (next.kind === "batch-delete") executeBatch("delete");
          else executeBatch("disable");
        }}
      />
    </section>
  );
}
