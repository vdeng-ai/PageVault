import { Eye, FileClock, FileText, Globe2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { dashboard, type DashboardStats } from "../api/client.js";

const metricIcons = [FileText, Globe2, Eye, FileClock, Trash2];

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
    <section className="grid gap-5">
      <div>
        <h2 className="text-2xl font-semibold text-zinc-950">Dashboard</h2>
        <p className="text-sm text-zinc-500">{new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(new Date())}</p>
      </div>
      {error && <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {values.map(([label, value], index) => {
          const Icon = metricIcons[index] ?? FileText;
          return (
            <div key={label} className="rounded-lg border border-zinc-200 bg-white p-4">
              <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-md bg-zinc-100 text-zinc-700">
                <Icon className="h-5 w-5" aria-hidden />
              </div>
              <div className="text-3xl font-semibold text-zinc-950">{value}</div>
              <div className="mt-1 text-sm text-zinc-500">{label}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
