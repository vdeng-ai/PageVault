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
  type HtmlItem,
} from "../api/client.js";
import { BatchToolbar } from "../components/BatchToolbar.js";
import { ConfirmDialog, useFeedback } from "../components/Feedback.js";
import { ItemTable } from "../components/ItemTable.js";
import { useSettings } from "../settings.js";

const SEARCH_DEBOUNCE_MS = 400;

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

type PendingConfirmation =
  | { kind: "delete-item"; item: HtmlItem }
  | { kind: "disable-item"; item: HtmlItem }
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
  const [items, setItems] = useState<HtmlItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState<number | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [visibility, setVisibility] = useState("");
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
      void listItems({ page, pageSize, q, status, visibility }, init)
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
    [page, q, status, visibility],
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
  const hasFilters = q.length > 0 || status.length > 0 || visibility.length > 0;

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
    item: HtmlItem,
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

  function removeItem(item: HtmlItem): void {
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
      <div className="page-header page-header-hero workspace-hero library-hero">
        <div className="workspace-hero-copy">
          <div className="page-eyebrow">
            <FileStack className="h-4 w-4" aria-hidden />
            {recordSummary}
          </div>
          <h1 className="page-title">{t("files.title")}</h1>
          <p className="page-subtitle">{t("files.subtitle")}</p>
        </div>
        <div className="workspace-hero-actions library-hero-actions">
          <div className="hero-visual hero-visual-library" aria-hidden>
            <span />
            <span />
            <span />
            <FolderOpen className="hero-visual-icon" />
          </div>
          <div className="flex gap-2">
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
        </div>
      </div>

      <div className="surface filter-bar library-filter-bar">
        <label className="relative min-w-0 flex-1 sm:min-w-64">
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
        {hasFilters && (
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => {
              setQ("");
              setStatus("");
              setVisibility("");
              setPage(1);
            }}
          >
            {t("files.clearFilters")}
          </button>
        )}
      </div>

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
            void navigator.clipboard
              .writeText(url)
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
