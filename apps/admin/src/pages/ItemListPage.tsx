import { RefreshCcw, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  batchItems,
  deleteItem,
  listItems,
  updateItem,
  type BatchAction,
  type HtmlItem,
} from "../api/client.js";
import { BatchToolbar } from "../components/BatchToolbar.js";
import { ItemTable } from "../components/ItemTable.js";

export function ItemListPage({ onEdit }: { onEdit: (id: string) => void }) {
  const [items, setItems] = useState<HtmlItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState<number | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [visibility, setVisibility] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pageSize = 20;

  const load = useCallback(() => {
    setBusy(true);
    setError(null);
    void listItems({ page, pageSize, q, status, visibility })
      .then((result) => {
        setItems(result.items);
        setTotal(result.total);
        setHasNextPage(result.hasNextPage);
        setSelectedIds(new Set());
      })
      .catch((nextError: unknown) =>
        setError(
          nextError instanceof Error ? nextError.message : "Load failed",
        ),
      )
      .finally(() => setBusy(false));
  }, [page, q, status, visibility]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages =
    total === null ? null : Math.max(1, Math.ceil(total / pageSize));
  const recordSummary = total === null ? `Page ${page}` : `${total} records`;

  function selectedArray(): string[] {
    return Array.from(selectedIds);
  }

  function runBatch(action: BatchAction, days?: number): void {
    setBusy(true);
    setError(null);
    void batchItems({
      ids: selectedArray(),
      action,
      ...(days === undefined ? {} : { days }),
    })
      .then(load)
      .catch((nextError: unknown) =>
        setError(
          nextError instanceof Error ? nextError.message : "Batch failed",
        ),
      )
      .finally(() => setBusy(false));
  }

  return (
    <section className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-950">Files</h2>
          <p className="text-sm text-zinc-500">{recordSummary}</p>
        </div>
        <button
          className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
          type="button"
          onClick={load}
        >
          <RefreshCcw className="h-4 w-4" aria-hidden />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-3 rounded-lg border border-zinc-200 bg-white p-3">
        <label className="relative min-w-64 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
            aria-hidden
          />
          <input
            className="h-10 w-full rounded-md border border-zinc-300 pl-9 pr-3 text-sm"
            value={q}
            placeholder="Search"
            onChange={(event) => {
              setPage(1);
              setQ(event.target.value);
            }}
          />
        </label>
        <select
          className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm"
          value={status}
          onChange={(event) => {
            setPage(1);
            setStatus(event.target.value);
          }}
        >
          <option value="">All status</option>
          <option value="active">Active</option>
          <option value="private">Private</option>
          <option value="disabled">Disabled</option>
          <option value="url_expired">URL expired</option>
          <option value="file_expired">File expired</option>
          <option value="deleted">Deleted</option>
        </select>
        <select
          className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm"
          value={visibility}
          onChange={(event) => {
            setPage(1);
            setVisibility(event.target.value);
          }}
        >
          <option value="">All visibility</option>
          <option value="public">Public</option>
          <option value="private">Private</option>
        </select>
      </div>

      <BatchToolbar
        selectedCount={selectedIds.size}
        busy={busy}
        onAction={runBatch}
      />
      {error && (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}
      <ItemTable
        items={items}
        selectedIds={selectedIds}
        onSelect={(id, checked) => {
          const next = new Set(selectedIds);
          if (checked) {
            next.add(id);
          } else {
            next.delete(id);
          }
          setSelectedIds(next);
        }}
        onSelectAll={(checked) =>
          setSelectedIds(
            checked ? new Set(items.map((item) => item.id)) : new Set(),
          )
        }
        onCopy={(url) => {
          void navigator.clipboard.writeText(url);
        }}
        onEdit={onEdit}
        onVisibility={(item) => {
          void updateItem(item.id, {
            visibility: item.visibility === "public" ? "private" : "public",
          }).then(load);
        }}
        onDisable={(item) => {
          void updateItem(item.id, { status: "disabled" }).then(load);
        }}
        onRestore={(item) => {
          void updateItem(item.id, { status: "active" }).then(load);
        }}
        onDelete={(item) => {
          void deleteItem(item.id).then(load);
        }}
      />
      <div className="flex items-center justify-between text-sm text-zinc-600">
        <button
          className="h-9 rounded-md border border-zinc-300 px-3 font-medium disabled:opacity-40"
          type="button"
          disabled={page <= 1}
          onClick={() => setPage((value) => Math.max(1, value - 1))}
        >
          Previous
        </button>
        <span>
          {totalPages === null ? `Page ${page}` : `${page} / ${totalPages}`}
        </span>
        <button
          className="h-9 rounded-md border border-zinc-300 px-3 font-medium disabled:opacity-40"
          type="button"
          disabled={!hasNextPage}
          onClick={() => setPage((value) => value + 1)}
        >
          Next
        </button>
      </div>
    </section>
  );
}
