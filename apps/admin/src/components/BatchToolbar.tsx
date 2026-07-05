import { Ban, Clock3, Eye, EyeOff, RefreshCcw, Trash2 } from "lucide-react";
import type { BatchAction } from "../api/client.js";

const actions: Array<{ action: BatchAction; label: string; icon: typeof Clock3; days?: number }> = [
  { action: "extend_url", label: "URL +7d", icon: Clock3, days: 7 },
  { action: "extend_url", label: "URL +30d", icon: Clock3, days: 30 },
  { action: "extend_file", label: "File +180d", icon: RefreshCcw, days: 180 },
  { action: "set_public", label: "Public", icon: Eye },
  { action: "set_private", label: "Private", icon: EyeOff },
  { action: "disable", label: "Disable", icon: Ban },
  { action: "delete", label: "Delete", icon: Trash2 }
];

export function BatchToolbar({
  selectedCount,
  busy,
  onAction
}: {
  selectedCount: number;
  busy: boolean;
  onAction: (action: BatchAction, days?: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white p-2">
      <div className="mr-2 min-w-20 text-sm font-medium text-zinc-700">{selectedCount} selected</div>
      {actions.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={`${item.action}-${item.days ?? "none"}`}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            type="button"
            disabled={busy || selectedCount === 0}
            onClick={() => onAction(item.action, item.days)}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
