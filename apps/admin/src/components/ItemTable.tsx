import {
  Ban,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import type { HtmlItem } from "../api/client.js";
import { formatFileSize } from "../format.js";
import { useSettings } from "../settings.js";
import { useExitPresence } from "../hooks/useExitPresence.js";
import { StatusBadge } from "./StatusBadge.js";
import { GlassPopover } from "./Glass.js";

function formatDate(value: string | null, locale: string): string {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function ItemActionMenu({
  item,
  disabled,
  onCopy,
  onEdit,
  onVisibility,
  onDisable,
  onRestore,
  onDelete,
}: {
  item: HtmlItem;
  disabled: boolean;
  onCopy: (url: string) => void;
  onEdit: (id: string) => void;
  onVisibility: (item: HtmlItem) => void;
  onDisable: (item: HtmlItem) => void;
  onRestore: (item: HtmlItem) => void;
  onDelete: (item: HtmlItem) => void;
}) {
  const { t } = useSettings();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState({
    top: 0,
    right: 0,
    transformOrigin: "top right",
  });
  const menuPresence = useExitPresence(open, 160);

  useEffect(() => {
    if (!open) {
      return;
    }
    const close = (event: PointerEvent) => {
      if (
        !rootRef.current?.contains(event.target as Node) &&
        !menuRef.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const closeOnViewportChange = () => setOpen(false);
    document.addEventListener("pointerdown", close);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !menuPresence.present) return;
    menuRef.current
      ?.querySelector<HTMLElement>('[role="menuitem"]')
      ?.focus();
  }, [menuPresence.present, open]);

  function toggleMenu(): void {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const estimatedHeight = 292;
      const opensUp =
        window.innerHeight - rect.bottom < estimatedHeight &&
        rect.top > estimatedHeight;
      setMenuPosition({
        top: opensUp
          ? Math.max(8, rect.top - estimatedHeight - 6)
          : rect.bottom + 6,
        right: Math.max(8, window.innerWidth - rect.right),
        transformOrigin: opensUp ? "bottom right" : "top right",
      });
    }
    setOpen(true);
  }

  function run(action: () => void): void {
    setOpen(false);
    buttonRef.current?.focus();
    action();
  }

  function handleMenuKey(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      return;
    }
    const menuItems = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    if (menuItems.length === 0) return;
    event.preventDefault();
    const currentIndex = menuItems.indexOf(document.activeElement as HTMLElement);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? menuItems.length - 1
          : event.key === "ArrowUp"
            ? (currentIndex - 1 + menuItems.length) % menuItems.length
            : (currentIndex + 1) % menuItems.length;
    menuItems[nextIndex]?.focus();
  }

  return (
    <div ref={rootRef} className="action-menu-root">
      <button
        ref={buttonRef}
        className="icon-button"
        type="button"
        title={t("table.moreActions")}
        aria-label={t("table.moreActions")}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={toggleMenu}
      >
        {disabled ? (
          <span className="spinner spinner-sm" aria-hidden />
        ) : (
          <MoreHorizontal className="h-5 w-5" aria-hidden />
        )}
      </button>
      {menuPresence.present &&
        createPortal(
          <GlassPopover
            ref={menuRef}
            className="action-menu action-menu-portal"
            role="menu"
            data-state={menuPresence.state}
            aria-hidden={!open}
            style={menuPosition}
            onKeyDown={handleMenuKey}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => run(() => onEdit(item.id))}
            >
              <Pencil className="h-4 w-4" aria-hidden />
              {t("table.edit")}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => run(() => onCopy(item.publicUrl))}
            >
              <Copy className="h-4 w-4" aria-hidden />
              {t("table.copyUrl")}
            </button>
            <a
              href={item.publicUrl}
              target="_blank"
              rel="noreferrer"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
              {t("table.openPreview")}
            </a>
            <div className="action-menu-separator" />
            <button
              type="button"
              role="menuitem"
              onClick={() => run(() => onVisibility(item))}
            >
              {item.visibility === "public" ? (
                <EyeOff className="h-4 w-4" aria-hidden />
              ) : (
                <Eye className="h-4 w-4" aria-hidden />
              )}
              {item.visibility === "public"
                ? t("table.setPrivate")
                : t("table.setPublic")}
            </button>
            {item.status === "disabled" ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => run(() => onRestore(item))}
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
                {t("table.restore")}
              </button>
            ) : (
              <button
                type="button"
                role="menuitem"
                onClick={() => run(() => onDisable(item))}
              >
                <Ban className="h-4 w-4" aria-hidden />
                {t("table.disable")}
              </button>
            )}
            <button
              className="action-menu-danger"
              type="button"
              role="menuitem"
              onClick={() => run(() => onDelete(item))}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              {t("common.delete")}
            </button>
          </GlassPopover>,
          document.body,
        )}
    </div>
  );
}

export function ItemTable({
  items,
  selectedIds,
  busyId,
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
  busyId: string | null;
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

  const actionProps = {
    onCopy,
    onEdit,
    onVisibility,
    onDisable,
    onRestore,
    onDelete,
  };

  return (
    <>
      <div className="surface item-table-desktop hidden xl:block">
        <table className="w-full min-w-[1040px] text-left text-sm">
          <thead className="table-head border-b text-xs uppercase">
            <tr>
              <th className="w-11 px-4 py-3.5">
                <input
                  aria-label={t("table.selectAll")}
                  className="brand-checkbox"
                  type="checkbox"
                  checked={allSelected}
                  onChange={(event) => onSelectAll(event.target.checked)}
                />
              </th>
              <th className="min-w-52 px-3 py-3.5">
                {t("table.originalFile")}
              </th>
              <th className="px-3 py-3.5">{t("table.status")}</th>
              <th className="w-56 px-3 py-3.5">{t("table.publicUrl")}</th>
              <th className="min-w-40 px-3 py-3.5">{t("common.urlExpiry")}</th>
              <th className="min-w-40 px-3 py-3.5">{t("common.fileExpiry")}</th>
              <th className="px-3 py-3.5">{t("table.size")}</th>
              <th className="px-3 py-3.5">{t("table.access")}</th>
              <th className="w-14 px-3 py-3.5 text-right">
                {t("table.actions")}
              </th>
            </tr>
          </thead>
          <tbody className="table-body divide-y">
            {items.map((item) => (
              <tr
                key={item.id}
                className="table-row align-middle transition"
                aria-busy={busyId === item.id}
              >
                <td className="px-4 py-4">
                  <input
                    aria-label={t("table.selectItem", { title: item.title })}
                    className="brand-checkbox"
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={(event) =>
                      onSelect(item.id, event.target.checked)
                    }
                  />
                </td>
                <td className="max-w-64 px-3 py-4">
                  <button
                    className="link-button block max-w-full truncate text-left font-bold"
                    type="button"
                    title={item.originalFilename}
                    onClick={() => onEdit(item.id)}
                  >
                    {item.originalFilename}
                  </button>
                  <div className="mt-1 truncate text-xs text-muted">
                    {formatDate(item.createdAt, locale)}
                  </div>
                </td>
                <td className="px-3 py-4">
                  <StatusBadge status={item.derivedStatus} />
                </td>
                <td className="w-56 max-w-56 px-3 py-4">
                  <button
                    className="inline-code block w-full truncate rounded-lg px-2 py-1.5 text-left font-mono text-xs"
                    type="button"
                    title={item.publicUrl}
                    onClick={() => onCopy(item.publicUrl)}
                  >
                    {item.publicUrl}
                  </button>
                </td>
                <td className="px-3 py-4 text-xs text-secondary">
                  {formatDate(item.urlExpiresAt, locale)}
                </td>
                <td className="px-3 py-4 text-xs text-secondary">
                  {formatDate(item.fileExpiresAt, locale)}
                </td>
                <td className="px-3 py-4 whitespace-nowrap text-secondary">
                  {formatFileSize(item.sizeBytes, locale)}
                </td>
                <td className="px-3 py-4 text-secondary">
                  {numberFormatter.format(item.accessCount)}
                </td>
                <td className="px-3 py-4 text-right">
                  <ItemActionMenu
                    item={item}
                    disabled={busyId === item.id}
                    {...actionProps}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="item-card-list grid gap-3 xl:hidden">
        {items.map((item) => (
          <article
            key={item.id}
            className="surface item-card"
            aria-busy={busyId === item.id}
          >
            <div className="flex items-start gap-3">
              <input
                aria-label={t("table.selectItem", { title: item.title })}
                className="brand-checkbox mt-1"
                type="checkbox"
                checked={selectedIds.has(item.id)}
                onChange={(event) => onSelect(item.id, event.target.checked)}
              />
              <div className="min-w-0 flex-1">
                <button
                  className="link-button item-card-file-name block w-full text-left text-base font-bold"
                  type="button"
                  onClick={() => onEdit(item.id)}
                >
                  {item.originalFilename}
                </button>
                <div className="mt-1 text-xs font-medium text-muted">
                  {formatDate(item.createdAt, locale)}
                </div>
              </div>
              <StatusBadge status={item.derivedStatus} />
            </div>

            <button
              className="inline-code item-card-url mt-4 block w-full truncate rounded-lg px-3 py-2 text-left font-mono text-xs"
              type="button"
              title={item.publicUrl}
              onClick={() => onCopy(item.publicUrl)}
            >
              {item.publicUrl}
            </button>

            <dl className="item-card-meta">
              <div>
                <dt>{t("common.urlExpiry")}</dt>
                <dd>{formatDate(item.urlExpiresAt, locale)}</dd>
              </div>
              <div>
                <dt>{t("common.fileExpiry")}</dt>
                <dd>{formatDate(item.fileExpiresAt, locale)}</dd>
              </div>
              <div>
                <dt>{t("table.size")}</dt>
                <dd>{formatFileSize(item.sizeBytes, locale)}</dd>
              </div>
              <div>
                <dt>{t("table.access")}</dt>
                <dd>{numberFormatter.format(item.accessCount)}</dd>
              </div>
            </dl>

            <div className="item-card-actions">
              <button
                className="btn btn-secondary btn-sm"
                type="button"
                onClick={() => onCopy(item.publicUrl)}
              >
                <Copy className="h-4 w-4" aria-hidden />
                {t("upload.copyUrl")}
              </button>
              <a
                className="btn btn-secondary btn-sm"
                href={item.publicUrl}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
                {t("common.preview")}
              </a>
              <button
                className="btn btn-secondary btn-sm"
                type="button"
                onClick={() => onEdit(item.id)}
              >
                <Pencil className="h-4 w-4" aria-hidden />
                {t("table.edit")}
              </button>
              <ItemActionMenu
                item={item}
                disabled={busyId === item.id}
                {...actionProps}
              />
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
