import {
  Ban,
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Trash2
} from "lucide-react";
import type { HtmlItem } from "../api/client.js";
import { StatusBadge } from "./StatusBadge.js";

function formatDate(value: string | null): string {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
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
  onDelete
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
  const allSelected = items.length > 0 && items.every((item) => selectedIds.has(item.id));

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
      <table className="min-w-[1180px] text-left text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
          <tr>
            <th className="w-10 px-3 py-3">
              <input
                aria-label="Select all"
                type="checkbox"
                checked={allSelected}
                onChange={(event) => onSelectAll(event.target.checked)}
              />
            </th>
            <th className="px-3 py-3">Title</th>
            <th className="px-3 py-3">Original file</th>
            <th className="px-3 py-3">Public URL</th>
            <th className="px-3 py-3">Status</th>
            <th className="px-3 py-3">URL expiry</th>
            <th className="px-3 py-3">File expiry</th>
            <th className="px-3 py-3">Size</th>
            <th className="px-3 py-3">Access</th>
            <th className="px-3 py-3">Created</th>
            <th className="px-3 py-3">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {items.map((item) => (
            <tr key={item.id} className="align-top hover:bg-zinc-50">
              <td className="px-3 py-3">
                <input
                  aria-label={`Select ${item.title}`}
                  type="checkbox"
                  checked={selectedIds.has(item.id)}
                  onChange={(event) => onSelect(item.id, event.target.checked)}
                />
              </td>
              <td className="max-w-48 px-3 py-3 font-medium text-zinc-950">
                <button className="text-left hover:text-blue-700" type="button" onClick={() => onEdit(item.id)}>
                  {item.title}
                </button>
              </td>
              <td className="max-w-52 px-3 py-3 text-zinc-600">{item.originalFilename}</td>
              <td className="max-w-64 px-3 py-3">
                <div className="truncate font-mono text-xs text-zinc-600">{item.publicUrl}</div>
              </td>
              <td className="px-3 py-3">
                <StatusBadge status={item.derivedStatus} />
              </td>
              <td className="px-3 py-3 text-zinc-600">{formatDate(item.urlExpiresAt)}</td>
              <td className="px-3 py-3 text-zinc-600">{formatDate(item.fileExpiresAt)}</td>
              <td className="px-3 py-3 text-zinc-600">{formatSize(item.sizeBytes)}</td>
              <td className="px-3 py-3 text-zinc-600">{item.accessCount}</td>
              <td className="px-3 py-3 text-zinc-600">{formatDate(item.createdAt)}</td>
              <td className="px-3 py-3">
                <div className="flex items-center gap-1">
                  <button className="icon-button hover:bg-zinc-100" title="Copy URL" type="button" onClick={() => onCopy(item.publicUrl)}>
                    <Copy className="h-4 w-4" aria-hidden />
                  </button>
                  <a className="icon-button hover:bg-zinc-100" title="Open preview" href={item.publicUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" aria-hidden />
                  </a>
                  <button className="icon-button hover:bg-zinc-100" title="Edit" type="button" onClick={() => onEdit(item.id)}>
                    <Pencil className="h-4 w-4" aria-hidden />
                  </button>
                  <button className="icon-button hover:bg-zinc-100" title={item.visibility === "public" ? "Set private" : "Set public"} type="button" onClick={() => onVisibility(item)}>
                    {item.visibility === "public" ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                  </button>
                  {item.status === "disabled" ? (
                    <button className="icon-button hover:bg-zinc-100" title="Restore" type="button" onClick={() => onRestore(item)}>
                      <RotateCcw className="h-4 w-4" aria-hidden />
                    </button>
                  ) : (
                    <button className="icon-button hover:bg-zinc-100" title="Disable" type="button" onClick={() => onDisable(item)}>
                      <Ban className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                  <button className="icon-button text-rose-700 hover:bg-rose-50" title="Delete" type="button" onClick={() => onDelete(item)}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                  <MoreHorizontal className="h-4 w-4 text-zinc-300" aria-hidden />
                  <Check className="hidden h-4 w-4" aria-hidden />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
