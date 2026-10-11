import {
  FileText,
  Globe,
  Link2,
  LockKeyhole,
  MoreHorizontal,
  PauseCircle,
  RotateCcw,
  Trash2,
} from "lucide-react";
import type { BatchAction } from "../api/client.js";
import { useSettings } from "../settings.js";
import { GlassToolbar } from "./Glass.js";

const actions: Array<{
  action: BatchAction;
  icon: typeof Link2;
  labelKey:
    "url" | "file" | "public" | "private" | "disable" | "restore" | "delete";
  days?: number;
}> = [
  { action: "extend_url", labelKey: "url", icon: Link2, days: 15 },
  { action: "extend_url", labelKey: "url", icon: Link2, days: 30 },
  { action: "extend_file", labelKey: "file", icon: FileText, days: 30 },
  { action: "set_public", labelKey: "public", icon: Globe },
  { action: "set_private", labelKey: "private", icon: LockKeyhole },
  { action: "disable", labelKey: "disable", icon: PauseCircle },
  { action: "restore", labelKey: "restore", icon: RotateCcw },
  { action: "delete", labelKey: "delete", icon: Trash2 },
];

export function BatchToolbar({
  selectedCount,
  busy,
  onAction,
}: {
  selectedCount: number;
  busy: boolean;
  onAction: (action: BatchAction, days?: number) => void;
}) {
  const { t } = useSettings();

  const disabled = busy || selectedCount === 0;
  const groups = [
    { key: "batch.extend", icon: Link2, actions: actions.slice(0, 3) },
    { key: "batch.access", icon: Globe, actions: actions.slice(3, 5) },
    { key: "batch.more", icon: MoreHorizontal, actions: actions.slice(5) },
  ] as const;

  function actionLabel(item: (typeof actions)[number]): string {
    if (item.labelKey === "url" && item.days !== undefined) {
      return t("batch.urlPlusDays", { days: item.days });
    }
    if (item.labelKey === "file" && item.days !== undefined) {
      return t("batch.filePlusDays", { days: item.days });
    }
    if (item.labelKey === "public") {
      return t("common.public");
    }
    if (item.labelKey === "private") {
      return t("common.private");
    }
    if (item.labelKey === "disable") {
      return t("table.disable");
    }
    if (item.labelKey === "restore") {
      return t("batch.restore");
    }
    return t("common.delete");
  }

  return (
    <GlassToolbar material="elevated" className="surface batch-toolbar">
      <div className="batch-count">
        {selectedCount
          ? t("batch.selected", { count: selectedCount })
          : t("batch.selectionHint")}
      </div>
      <div className="batch-groups">
        {groups.map((group) => (
          <details
            key={group.key}
            name="batch-action-group"
            className="batch-group"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.currentTarget.open = false;
                event.currentTarget.querySelector("summary")?.focus();
              }
            }}
          >
            <summary
              className="btn btn-secondary btn-sm"
              aria-disabled={disabled}
              tabIndex={disabled ? -1 : 0}
              onClick={(event) => {
                if (disabled) event.preventDefault();
              }}
              onKeyDown={(event) => {
                if (disabled) event.preventDefault();
              }}
            >
              <group.icon size={16} aria-hidden />
              {t(group.key)}
            </summary>
            <div className="surface batch-action-panel">
              {group.actions.map((item) => {
                const Icon = item.icon;
                const buttonClass =
                  item.action === "delete"
                    ? "btn btn-danger btn-sm"
                    : "btn btn-secondary btn-sm";
                return (
                  <button
                    key={`${item.action}-${item.days ?? "none"}`}
                    className={buttonClass}
                    type="button"
                    disabled={disabled}
                    onClick={(event) => {
                      const disclosure = event.currentTarget.closest("details");
                      if (disclosure) disclosure.open = false;
                      onAction(item.action, item.days);
                    }}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    {actionLabel(item)}
                  </button>
                );
              })}
            </div>
          </details>
        ))}
      </div>
    </GlassToolbar>
  );
}
