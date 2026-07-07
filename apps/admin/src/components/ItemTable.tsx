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
import { useSettings } from "../settings.js";
import { StatusBadge } from "./StatusBadge.js";

function formatDate(value: string | null, locale: string): string {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatSize(bytes: number, locale: string): string {
  const numberFormatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  if (bytes < 1024) {
    return `${numberFormatter.format(bytes)} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${numberFormatter.format(bytes / 1024)} KB`;
  }
  return `${numberFormatter.format(bytes / 1024 / 1024)} MB`;
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
  const { locale, t } = useSettings();
  const numberFormatter = new Intl.NumberFormat(locale);
  const allSelected =
    items.length > 0 && items.every((item) => selectedIds.has(item.id));

  return (
    <div className="surface overflow-x-auto">
      <table className="min-w-[1180px] text-left text-sm">
        <thead className="table-head border-b text-xs uppercase">
          <tr>
            <th className="w-10 px-3 py-3">
              <input
                aria-label={t("table.selectAll")}
                className="accent-teal-700"
                type="checkbox"
                checked={allSelected}
                onChange={(event) => onSelectAll(event.target.checked)}
              />
            </th>
            <th className="w-64 px-3 py-3">{t("table.actions")}</th>
            <th className="px-3 py-3">{t("common.title")}</th>
            <th className="px-3 py-3">{t("table.originalFile")}</th>
            <th className="w-56 px-3 py-3">{t("table.publicUrl")}</th>
            <th className="px-3 py-3">{t("table.status")}</th>
            <th className="px-3 py-3">{t("common.urlExpiry")}</th>
            <th className="px-3 py-3">{t("common.fileExpiry")}</th>
            <th className="px-3 py-3">{t("table.size")}</th>
            <th className="px-3 py-3">{t("table.access")}</th>
            <th className="px-3 py-3">{t("table.created")}</th>
          </tr>
        </thead>
        <tbody className="table-body divide-y">
          {items.map((item) => (
            <tr key={item.id} className="table-row align-top transition">
              <td className="px-3 py-3">
                <input
                  aria-label={t("table.selectItem", { title: item.title })}
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
                    title={t("table.copyUrl")}
                    type="button"
                    onClick={() => onCopy(item.publicUrl)}
                  >
                    <Copy className="h-4 w-4" aria-hidden />
                  </button>
                  <a
                    className="icon-button"
                    title={t("table.openPreview")}
                    href={item.publicUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden />
                  </a>
                  <button
                    className="icon-button"
                    title={t("table.edit")}
                    type="button"
                    onClick={() => onEdit(item.id)}
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    className="icon-button"
                    title={
                      item.visibility === "public"
                        ? t("table.setPrivate")
                        : t("table.setPublic")
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
                      title={t("table.restore")}
                      type="button"
                      onClick={() => onRestore(item)}
                    >
                      <RotateCcw className="h-4 w-4" aria-hidden />
                    </button>
                  ) : (
                    <button
                      className="icon-button"
                      title={t("table.disable")}
                      type="button"
                      onClick={() => onDisable(item)}
                    >
                      <Ban className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                  <button
                    className="icon-button icon-button-danger"
                    title={t("common.delete")}
                    type="button"
                    onClick={() => onDelete(item)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </td>
              <td className="max-w-48 px-3 py-3 font-semibold text-primary">
                <button
                  className="link-button text-left"
                  type="button"
                  onClick={() => onEdit(item.id)}
                >
                  {item.title}
                </button>
              </td>
              <td className="max-w-52 px-3 py-3 text-secondary">
                {item.originalFilename}
              </td>
              <td className="w-56 max-w-56 px-3 py-3">
                <div className="inline-code whitespace-normal break-all rounded-md px-2 py-1 font-mono text-xs leading-5">
                  {item.publicUrl}
                </div>
              </td>
              <td className="px-3 py-3">
                <StatusBadge status={item.derivedStatus} />
              </td>
              <td className="px-3 py-3 text-secondary">
                {formatDate(item.urlExpiresAt, locale)}
              </td>
              <td className="px-3 py-3 text-secondary">
                {formatDate(item.fileExpiresAt, locale)}
              </td>
              <td className="px-3 py-3 text-secondary">
                {formatSize(item.sizeBytes, locale)}
              </td>
              <td className="px-3 py-3 text-secondary">{numberFormatter.format(item.accessCount)}</td>
              <td className="px-3 py-3 text-secondary">
                {formatDate(item.createdAt, locale)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
