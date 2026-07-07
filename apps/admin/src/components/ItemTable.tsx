import {
  Ban,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react";
import type { HtmlItem } from "../api/client.js";
import { StatusBadge } from "./StatusBadge.js";

function formatDate(value: string | null): string {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ItemTable({
  items,
  selectedIds,
  onSelect,
  onSelectAll,
  onCopy,
  onEdit,
  onVisibility,
  onDisable,
  onRestore,
  onDelete,
}: {
  items: HtmlItem[];
  selectedIds: Set<string>;
  onSelect: (id: string, checked: boolean) => void;
  onSelectAll: (checked: boolean) => void;
  onCopy: (url: string) => void;
  onEdit: (id: string) => void;
  onVisibility: (item: HtmlItem) => void;
  onDisable: (item: HtmlItem) => void;
  onRestore: (item: HtmlItem) => void;
  onDelete: (item: HtmlItem) => void;
}) {
  const allSelected =
    items.length > 0 && items.every((item) => selectedIds.has(item.id));

  return (
    <div className="surface overflow-x-auto">
      <table className="min-w-[1180px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="w-10 px-3 py-3">
              <input
                aria-label="Select all"
                className="accent-teal-700"
                type="checkbox"
                checked={allSelected}
                onChange={(event) => onSelectAll(event.target.checked)}
              />
            </th>
            <th className="w-64 px-3 py-3">Actions</th>
            <th className="px-3 py-3">Title</th>
            <th className="px-3 py-3">Original file</th>
            <th className="w-56 px-3 py-3">Public URL</th>
            <th className="px-3 py-3">Status</th>
            <th className="px-3 py-3">URL expiry</th>
            <th className="px-3 py-3">File expiry</th>
            <th className="px-3 py-3">Size</th>
            <th className="px-3 py-3">Access</th>
            <th className="px-3 py-3">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {items.map((item) => (
            <tr key={item.id} className="align-top transition hover:bg-slate-50">
              <td className="px-3 py-3">
                <input
                  aria-label={`Select ${item.title}`}
                  className="accent-teal-700"
                  type="checkbox"
                  checked={selectedIds.has(item.id)}
                  onChange={(event) => onSelect(item.id, event.target.checked)}
                />
              </td>
              <td className="px-3 py-3">
                <div className="flex items-center gap-1">
                  <button
                    className="icon-button"
                    title="Copy URL"
                    type="button"
                    onClick={() => onCopy(item.publicUrl)}
                  >
                    <Copy className="h-4 w-4" aria-hidden />
                  </button>
                  <a
                    className="icon-button"
                    title="Open preview"
                    href={item.publicUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden />
                  </a>
                  <button
                    className="icon-button"
                    title="Edit"
                    type="button"
                    onClick={() => onEdit(item.id)}
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    className="icon-button"
                    title={
                      item.visibility === "public"
                        ? "Set private"
                        : "Set public"
                    }
                    type="button"
                    onClick={() => onVisibility(item)}
                  >
                    {item.visibility === "public" ? (
                      <EyeOff className="h-4 w-4" aria-hidden />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden />
                    )}
                  </button>
                  {item.status === "disabled" ? (
                    <button
                      className="icon-button"
                      title="Restore"
                      type="button"
                      onClick={() => onRestore(item)}
                    >
                      <RotateCcw className="h-4 w-4" aria-hidden />
                    </button>
                  ) : (
                    <button
                      className="icon-button"
                      title="Disable"
                      type="button"
                      onClick={() => onDisable(item)}
                    >
                      <Ban className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                  <button
                    className="icon-button text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                    title="Delete"
                    type="button"
                    onClick={() => onDelete(item)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </td>
              <td className="max-w-48 px-3 py-3 font-semibold text-slate-950">
                <button
                  className="text-left hover:text-teal-700"
                  type="button"
                  onClick={() => onEdit(item.id)}
                >
                  {item.title}
                </button>
              </td>
              <td className="max-w-52 px-3 py-3 text-slate-600">
                {item.originalFilename}
              </td>
              <td className="w-56 max-w-56 px-3 py-3">
                <div className="whitespace-normal break-all rounded-md bg-slate-50 px-2 py-1 font-mono text-xs leading-5 text-slate-600">
                  {item.publicUrl}
                </div>
              </td>
              <td className="px-3 py-3">
                <StatusBadge status={item.derivedStatus} />
              </td>
              <td className="px-3 py-3 text-slate-600">
                {formatDate(item.urlExpiresAt)}
              </td>
              <td className="px-3 py-3 text-slate-600">
                {formatDate(item.fileExpiresAt)}
              </td>
              <td className="px-3 py-3 text-slate-600">
                {formatSize(item.sizeBytes)}
              </td>
              <td className="px-3 py-3 text-slate-600">{item.accessCount}</td>
              <td className="px-3 py-3 text-slate-600">
                {formatDate(item.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
