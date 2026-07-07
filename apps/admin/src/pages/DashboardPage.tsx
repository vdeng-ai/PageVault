import {
  Eye,
  FileClock,
  FileText,
  Globe2,
  LockKeyhole,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { dashboard, type DashboardStats } from "../api/client.js";

const emptyStats: DashboardStats = {
  total: 0,
  publicCount: 0,
  urlExpired: 0,
  fileDeletingSoon: 0,
  deleted: 0,
};

const numberFormatter = new Intl.NumberFormat();

function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

function percent(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function barWidth(value: number, total: number): string {
  if (value <= 0 || total <= 0) {
    return "0%";
  }
  return `${Math.max(3, Math.min(100, (value / total) * 100))}%`;
}

type Segment = {
  label: string;
  value: number;
  color: string;
  description: string;
};

function DonutChart({
  segments,
  total,
}: {
  segments: Segment[];
  total: number;
}) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="relative mx-auto grid h-56 w-56 shrink-0 place-items-center">
      <svg
        className="h-full w-full -rotate-90"
        viewBox="0 0 120 120"
        role="img"
        aria-label="Library distribution chart"
      >
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="#e5eaf0"
          strokeWidth="14"
        />
        {total > 0 &&
          segments
            .filter((segment) => segment.value > 0)
            .map((segment) => {
              const length = (segment.value / total) * circumference;
              const dashOffset = -offset;
              offset += length;
              return (
                <circle
                  key={segment.label}
                  cx="60"
                  cy="60"
                  r={radius}
                  fill="none"
                  stroke={segment.color}
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={dashOffset}
                  strokeLinecap={length >= circumference ? "round" : "butt"}
                  strokeWidth="14"
                />
              );
            })}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-3xl font-semibold tracking-normal text-slate-950">
            {formatNumber(total)}
          </div>
          <div className="mt-1 text-xs font-semibold uppercase tracking-normal text-slate-500">
            All records
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricSkeleton() {
  return (
    <div className="surface p-4">
      <div className="animate-pulse">
        <div className="mb-4 h-10 w-10 rounded-md bg-slate-200" />
        <div className="h-8 w-20 rounded bg-slate-200" />
        <div className="mt-3 h-4 w-28 rounded bg-slate-100" />
      </div>
    </div>
  );
}

function ChartListSkeleton({ rows }: { rows: number }) {
  return (
    <div className="grid gap-3">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="rounded-lg border border-slate-200 bg-white p-3"
        >
          <div className="animate-pulse">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-1 items-center gap-3">
                <div className="h-3 w-3 rounded-sm bg-slate-200" />
                <div className="grid flex-1 gap-2">
                  <div className="h-4 w-28 rounded bg-slate-200" />
                  <div className="h-3 w-36 rounded bg-slate-100" />
                </div>
              </div>
              <div className="h-6 w-12 rounded bg-slate-200" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SignalSkeleton() {
  return (
    <div className="grid gap-4">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="animate-pulse">
          <div className="mb-2 flex items-end justify-between gap-3">
            <div className="grid flex-1 gap-2">
              <div className="h-4 w-28 rounded bg-slate-200" />
              <div className="h-3 w-40 rounded bg-slate-100" />
            </div>
            <div className="h-4 w-14 rounded bg-slate-200" />
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full w-1/3 rounded-full bg-slate-200" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void dashboard()
      .then(setStats)
      .catch((nextError: unknown) =>
        setError(
          nextError instanceof Error ? nextError.message : "Load failed",
        ),
      );
  }, []);

  const data = stats ?? emptyStats;
  const isLoading = stats === null && error === null;
  const privateCount = Math.max(data.total - data.publicCount, 0);
  const allRecords = data.total + data.deleted;
  const attentionCount = data.urlExpired + data.fileDeletingSoon;

  const metrics = [
    {
      label: "Total files",
      value: data.total,
      detail: "Live files in service",
      icon: FileText,
      style: "bg-teal-50 text-teal-700 ring-teal-100",
    },
    {
      label: "Public files",
      value: data.publicCount,
      detail: `${percent(data.publicCount, data.total)}% of live files`,
      icon: Globe2,
      style: "bg-sky-50 text-sky-700 ring-sky-100",
    },
    {
      label: "URL expired",
      value: data.urlExpired,
      detail: `${percent(data.urlExpired, data.total)}% need URL review`,
      icon: Eye,
      style: "bg-indigo-50 text-indigo-700 ring-indigo-100",
    },
    {
      label: "Deleting soon",
      value: data.fileDeletingSoon,
      detail: "File retention ends in 7 days",
      icon: FileClock,
      style: "bg-amber-50 text-amber-700 ring-amber-100",
    },
    {
      label: "Deleted",
      value: data.deleted,
      detail: `${percent(data.deleted, allRecords)}% of all records`,
      icon: Trash2,
      style: "bg-rose-50 text-rose-700 ring-rose-100",
    },
  ];

  const distribution = [
    {
      label: "Public",
      value: data.publicCount,
      color: "#0284c7",
      description: `${percent(data.publicCount, allRecords)}% of all records`,
    },
    {
      label: "Not public",
      value: privateCount,
      color: "#0f766e",
      description: `${percent(privateCount, allRecords)}% private or restricted`,
    },
    {
      label: "Deleted",
      value: data.deleted,
      color: "#e11d48",
      description: `${percent(data.deleted, allRecords)}% removed`,
    },
  ];

  const signals = [
    {
      label: "Public access",
      value: data.publicCount,
      total: data.total,
      color: "#0284c7",
      description: "Shareable live files",
    },
    {
      label: "Not public",
      value: privateCount,
      total: data.total,
      color: "#0f766e",
      description: "Private or disabled live files",
    },
    {
      label: "URL expired",
      value: data.urlExpired,
      total: data.total,
      color: "#4f46e5",
      description: "Live files with expired links",
    },
    {
      label: "Deleting soon",
      value: data.fileDeletingSoon,
      total: data.total,
      color: "#d97706",
      description: "Retention ends in 7 days",
    },
    {
      label: "Deleted",
      value: data.deleted,
      total: allRecords,
      color: "#e11d48",
      description: "Removed records",
    },
  ];

  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <h2 className="page-title">Dashboard</h2>
          <p className="page-subtitle">
            {new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(
              new Date(),
            )}
          </p>
        </div>
      </div>
      {error && <div className="alert-error">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {isLoading
          ? Array.from({ length: 5 }, (_, index) => (
              <MetricSkeleton key={index} />
            ))
          : metrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <div key={metric.label} className="surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-md ring-1 ${metric.style}`}
                    >
                      <Icon className="h-5 w-5" aria-hidden />
                    </div>
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                      {metric.value === 0
                        ? "0%"
                        : percent(
                            metric.value,
                            metric.label === "Deleted"
                              ? allRecords
                              : data.total,
                          )}
                      %
                    </span>
                  </div>
                  <div className="mt-5 text-3xl font-semibold tracking-normal text-slate-950">
                    {formatNumber(metric.value)}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-700">
                    {metric.label}
                  </div>
                  <div className="mt-2 min-h-5 text-sm text-slate-500">
                    {metric.detail}
                  </div>
                </div>
              );
            })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)]">
        <div className="surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="m-0 text-lg font-semibold tracking-normal text-slate-950">
                Library distribution
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Public, restricted, and deleted records
              </p>
            </div>
            {isLoading ? (
              <div className="h-9 w-36 animate-pulse rounded-md bg-slate-100" />
            ) : (
              <div className="rounded-md bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 ring-1 ring-teal-100">
                {formatNumber(attentionCount)} need attention
              </div>
            )}
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-center">
            {isLoading ? (
              <div className="mx-auto h-56 w-56 animate-pulse rounded-full bg-slate-100" />
            ) : (
              <DonutChart segments={distribution} total={allRecords} />
            )}

            {isLoading ? (
              <ChartListSkeleton rows={3} />
            ) : (
              <div className="grid gap-3">
                {distribution.map((segment) => (
                  <div
                    key={segment.label}
                    className="rounded-lg border border-slate-200 bg-white p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className="h-3 w-3 shrink-0 rounded-sm"
                          style={{ backgroundColor: segment.color }}
                        />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-800">
                            {segment.label}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500">
                            {segment.description}
                          </div>
                        </div>
                      </div>
                      <div className="text-right text-lg font-semibold tracking-normal text-slate-950">
                        {formatNumber(segment.value)}
                      </div>
                    </div>
                  </div>
                ))}
                {allRecords === 0 && (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-medium text-slate-500">
                    Upload files to populate the dashboard charts.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="surface p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="m-0 text-lg font-semibold tracking-normal text-slate-950">
                Operational signals
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Current exposure and retention workload
              </p>
            </div>
            <div className="grid h-10 w-10 place-items-center rounded-md bg-slate-100 text-slate-600 ring-1 ring-slate-200">
              <LockKeyhole className="h-5 w-5" aria-hidden />
            </div>
          </div>

          <div className="mt-6">
            {isLoading ? (
              <SignalSkeleton />
            ) : (
              <div className="grid gap-4">
                {signals.map((signal) => (
                  <div key={signal.label}>
                    <div className="mb-2 flex items-end justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-800">
                          {signal.label}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {signal.description}
                        </div>
                      </div>
                      <div className="text-right text-sm font-semibold text-slate-700">
                        {formatNumber(signal.value)}
                        <span className="ml-1 text-xs font-medium text-slate-400">
                          ({percent(signal.value, signal.total)}%)
                        </span>
                      </div>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full transition-[width]"
                        style={{
                          width: barWidth(signal.value, signal.total),
                          backgroundColor: signal.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
