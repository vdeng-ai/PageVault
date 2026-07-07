import type { DerivedStatus } from "../api/client.js";

const labels: Record<DerivedStatus, string> = {
  active: "Active",
  private: "Private",
  disabled: "Disabled",
  deleted: "Deleted",
  url_expired: "URL Expired",
  file_expired: "File Expired"
};

const styles: Record<DerivedStatus, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  private: "border-sky-200 bg-sky-50 text-sky-700",
  disabled: "border-amber-200 bg-amber-50 text-amber-800",
  deleted: "border-rose-200 bg-rose-50 text-rose-700",
  url_expired: "border-slate-300 bg-slate-100 text-slate-700",
  file_expired: "border-violet-200 bg-violet-50 text-violet-700"
};

export function StatusBadge({ status }: { status: DerivedStatus }) {
  return (
    <span className={`inline-flex h-6 items-center rounded-md border px-2 text-xs font-semibold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
