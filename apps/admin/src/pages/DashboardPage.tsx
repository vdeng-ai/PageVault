import { Eye, FileClock, FileText, Globe2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { dashboard, type DashboardStats } from "../api/client.js";

const metricIcons = [FileText, Globe2, Eye, FileClock, Trash2];
const metricStyles = [
  "bg-teal-50 text-teal-700 ring-teal-100",
  "bg-sky-50 text-sky-700 ring-sky-100",
  "bg-indigo-50 text-indigo-700 ring-indigo-100",
  "bg-amber-50 text-amber-700 ring-amber-100",
  "bg-rose-50 text-rose-700 ring-rose-100"
];

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void dashboard()
      .then(setStats)
      .catch((nextError: unknown) => setError(nextError instanceof Error ? nextError.message : "Load failed"));
  }, []);

  const values = [
    ["Total files", stats?.total ?? 0],
    ["Public files", stats?.publicCount ?? 0],
    ["URL expired", stats?.urlExpired ?? 0],
    ["Deleting soon", stats?.fileDeletingSoon ?? 0],
    ["Deleted", stats?.deleted ?? 0]
  ] as const;

  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <h2 className="page-title">Dashboard</h2>
          <p className="page-subtitle">{new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(new Date())}</p>
        </div>
      </div>
      {error && <div className="alert-error">{error}</div>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {values.map(([label, value], index) => {
          const Icon = metricIcons[index] ?? FileText;
          return (
            <div key={label} className="surface p-4">
              <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-md ring-1 ${metricStyles[index] ?? metricStyles[0]}`}>
                <Icon className="h-5 w-5" aria-hidden />
              </div>
              <div className="text-3xl font-semibold tracking-normal text-slate-950">{value}</div>
              <div className="mt-1 text-sm font-medium text-slate-500">{label}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
