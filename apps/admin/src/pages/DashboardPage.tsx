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
import { useSettings } from "../settings.js";

const emptyStats: DashboardStats = {
  total: 0,
  publicCount: 0,
  urlExpired: 0,
  fileDeletingSoon: 0,
  deleted: 0,
};

function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
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
  totalLabel,
  ariaLabel,
  locale,
}: {
  segments: Segment[];
  total: number;
  totalLabel: string;
  ariaLabel: string;
  locale: string;
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
        aria-label={ariaLabel}
      >
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="var(--chart-track)"
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
          <div className="text-3xl font-semibold tracking-normal text-primary">
            {formatNumber(total, locale)}
          </div>
          <div className="mt-1 text-xs font-semibold uppercase tracking-normal text-muted">
            {totalLabel}
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
        <div className="skeleton mb-4 h-10 w-10 rounded-md" />
        <div className="skeleton h-8 w-20 rounded" />
        <div className="skeleton-muted mt-3 h-4 w-28 rounded" />
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
          className="panel-row rounded-lg border p-3"
        >
          <div className="animate-pulse">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-1 items-center gap-3">
                <div className="skeleton h-3 w-3 rounded-sm" />
                <div className="grid flex-1 gap-2">
                  <div className="skeleton h-4 w-28 rounded" />
                  <div className="skeleton-muted h-3 w-36 rounded" />
                </div>
              </div>
              <div className="skeleton h-6 w-12 rounded" />
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
              <div className="skeleton h-4 w-28 rounded" />
              <div className="skeleton-muted h-3 w-40 rounded" />
            </div>
            <div className="skeleton h-4 w-14 rounded" />
          </div>
          <div className="progress-track h-3 overflow-hidden rounded-full">
            <div className="skeleton h-full w-1/3 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const { locale, t } = useSettings();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void dashboard()
      .then(setStats)
      .catch((nextError: unknown) =>
        setError(
          nextError instanceof Error ? nextError.message : t("common.loadFailed"),
        ),
      );
  }, [t]);

  const data = stats ?? emptyStats;
  const isLoading = stats === null && error === null;
  const privateCount = Math.max(data.total - data.publicCount, 0);
  const allRecords = data.total + data.deleted;
  const attentionCount = data.urlExpired + data.fileDeletingSoon;

  const metrics = [
    {
      label: t("dashboard.totalFiles"),
      value: data.total,
      detail: t("dashboard.totalFilesDetail"),
      icon: FileText,
      style: "metric-accent-teal",
      percentTotal: data.total,
    },
    {
      label: t("dashboard.publicFiles"),
      value: data.publicCount,
      detail: t("dashboard.publicFilesDetail", { percent: percent(data.publicCount, data.total) }),
      icon: Globe2,
      style: "metric-accent-sky",
      percentTotal: data.total,
    },
    {
      label: t("dashboard.urlExpired"),
      value: data.urlExpired,
      detail: t("dashboard.urlExpiredDetail", { percent: percent(data.urlExpired, data.total) }),
      icon: Eye,
      style: "metric-accent-indigo",
      percentTotal: data.total,
    },
    {
      label: t("dashboard.deletingSoon"),
      value: data.fileDeletingSoon,
      detail: t("dashboard.deletingSoonDetail"),
      icon: FileClock,
      style: "metric-accent-amber",
      percentTotal: data.total,
    },
    {
      label: t("dashboard.deleted"),
      value: data.deleted,
      detail: t("dashboard.deletedDetail", { percent: percent(data.deleted, allRecords) }),
      icon: Trash2,
      style: "metric-accent-rose",
      percentTotal: allRecords,
    },
  ];

  const distribution = [
    {
      label: t("dashboard.public"),
      value: data.publicCount,
      color: "#0284c7",
      description: t("dashboard.distributionPublicDetail", { percent: percent(data.publicCount, allRecords) }),
    },
    {
      label: t("dashboard.notPublic"),
      value: privateCount,
      color: "#0f766e",
      description: t("dashboard.distributionNotPublicDetail", { percent: percent(privateCount, allRecords) }),
    },
    {
      label: t("dashboard.deleted"),
      value: data.deleted,
      color: "#e11d48",
      description: t("dashboard.distributionDeletedDetail", { percent: percent(data.deleted, allRecords) }),
    },
  ];

  const signals = [
    {
      label: t("dashboard.publicAccess"),
      value: data.publicCount,
      total: data.total,
      color: "#0284c7",
      description: t("dashboard.publicAccessDetail"),
    },
    {
      label: t("dashboard.notPublic"),
      value: privateCount,
      total: data.total,
      color: "#0f766e",
      description: t("dashboard.notPublicSignalDetail"),
    },
    {
      label: t("dashboard.urlExpired"),
      value: data.urlExpired,
      total: data.total,
      color: "#4f46e5",
      description: t("dashboard.urlExpiredSignalDetail"),
    },
    {
      label: t("dashboard.deletingSoon"),
      value: data.fileDeletingSoon,
      total: data.total,
      color: "#d97706",
      description: t("dashboard.deletingSoonSignalDetail"),
    },
    {
      label: t("dashboard.deleted"),
      value: data.deleted,
      total: allRecords,
      color: "#e11d48",
      description: t("dashboard.deletedSignalDetail"),
    },
  ];

  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <h2 className="page-title">{t("dashboard.title")}</h2>
          <p className="page-subtitle">
            {new Intl.DateTimeFormat(locale, { dateStyle: "full" }).format(
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
                    <span className="chip rounded-md px-2 py-1 text-xs font-semibold">
                      {metric.value === 0
                        ? "0%"
                        : percent(metric.value, metric.percentTotal)}
                      %
                    </span>
                  </div>
                  <div className="mt-5 text-3xl font-semibold tracking-normal text-primary">
                    {formatNumber(metric.value, locale)}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-secondary">
                    {metric.label}
                  </div>
                  <div className="mt-2 min-h-5 text-sm text-muted">
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
              <h3 className="m-0 text-lg font-semibold tracking-normal text-primary">
                {t("dashboard.distributionTitle")}
              </h3>
              <p className="mt-1 text-sm text-muted">
                {t("dashboard.distributionSubtitle")}
              </p>
            </div>
            {isLoading ? (
              <div className="skeleton-muted h-9 w-36 animate-pulse rounded-md" />
            ) : (
              <div className="attention-chip rounded-md px-3 py-2 text-sm font-semibold ring-1">
                {t("dashboard.needAttention", { count: formatNumber(attentionCount, locale) })}
              </div>
            )}
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-center">
            {isLoading ? (
              <div className="skeleton-muted mx-auto h-56 w-56 animate-pulse rounded-full" />
            ) : (
              <DonutChart
                segments={distribution}
                total={allRecords}
                totalLabel={t("dashboard.allRecords")}
                ariaLabel={t("dashboard.chartAria")}
                locale={locale}
              />
            )}

            {isLoading ? (
              <ChartListSkeleton rows={3} />
            ) : (
              <div className="grid gap-3">
                {distribution.map((segment) => (
                  <div
                    key={segment.label}
                    className="panel-row rounded-lg border p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className="h-3 w-3 shrink-0 rounded-sm"
                          style={{ backgroundColor: segment.color }}
                        />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-secondary">
                            {segment.label}
                          </div>
                          <div className="mt-0.5 text-xs text-muted">
                            {segment.description}
                          </div>
                        </div>
                      </div>
                      <div className="text-right text-lg font-semibold tracking-normal text-primary">
                        {formatNumber(segment.value, locale)}
                      </div>
                    </div>
                  </div>
                ))}
                {allRecords === 0 && (
                  <div className="empty-state rounded-lg border border-dashed p-4 text-sm font-medium">
                    {t("dashboard.noRecords")}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="surface p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="m-0 text-lg font-semibold tracking-normal text-primary">
                {t("dashboard.signalsTitle")}
              </h3>
              <p className="mt-1 text-sm text-muted">
                {t("dashboard.signalsSubtitle")}
              </p>
            </div>
            <div className="quiet-icon grid h-10 w-10 place-items-center rounded-md ring-1">
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
                        <div className="truncate text-sm font-semibold text-secondary">
                          {signal.label}
                        </div>
                        <div className="mt-0.5 text-xs text-muted">
                          {signal.description}
                        </div>
                      </div>
                      <div className="text-right text-sm font-semibold text-secondary">
                        {formatNumber(signal.value, locale)}
                        <span className="ml-1 text-xs font-medium text-subtle">
                          ({percent(signal.value, signal.total)}%)
                        </span>
                      </div>
                    </div>
                    <div className="progress-track h-3 overflow-hidden rounded-full">
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
