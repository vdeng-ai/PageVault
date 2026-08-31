import { Ban, Clock3, Eye, EyeOff, RefreshCcw, Trash2 } from "lucide-react";
import type { BatchAction } from "../api/client.js";
import { useSettings } from "../settings.js";
import { GlassToolbar } from "./Glass.js";

const actions: Array<{
  action: BatchAction;
  icon: typeof Clock3;
  labelKey: "url" | "file" | "public" | "private" | "disable" | "delete";
  days?: number;
}> = [
  { action: "extend_url", labelKey: "url", icon: Clock3, days: 15 },
  { action: "extend_url", labelKey: "url", icon: Clock3, days: 30 },
  { action: "extend_file", labelKey: "file", icon: RefreshCcw, days: 30 },
  { action: "set_public", labelKey: "public", icon: Eye },
  { action: "set_private", labelKey: "private", icon: EyeOff },
  { action: "disable", labelKey: "disable", icon: Ban },
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

  if (selectedCount === 0) {
    return null;
  }

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
    return t("common.delete");
  }

  return (
    <GlassToolbar material="elevated" className="surface batch-toolbar">
      <div className="batch-count">
        {t("batch.selected", { count: selectedCount })}
      </div>
      {actions.map((item) => {
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
            disabled={busy || selectedCount === 0}
            onClick={() => onAction(item.action, item.days)}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {actionLabel(item)}
          </button>
        );
      })}
    </GlassToolbar>
  );
}
