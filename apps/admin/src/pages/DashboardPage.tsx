import {
  BarChart3,
  Clock3,
  FileText,
  Globe,
  HardDrive,
  ArrowUpRight,
  type LucideIcon,
  Link2,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  dashboard,
  operations,
  type DashboardStats,
  type OperationsSummary,
} from "../api/client.js";
import { WorkspaceHero } from "../components/WorkspaceHero.js";
import { formatFileSize } from "../format.js";
import { useSettings } from "../settings.js";

type Metric = {
  label: string;
  value: string | null;
  detail?: string;
  icon: LucideIcon;
  warning?: boolean;
  href?: string;
};

export function DashboardPage({ onUpload }: { onUpload: () => void }) {
  const { locale, t } = useSettings();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [ops, setOps] = useState<OperationsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([dashboard(), operations()])
      .then(([data, operationsData]) => {
        if (!cancelled) {
          setStats(data);
          setOps(operationsData);
        }
      })
      .catch((nextError: unknown) => {
        if (!cancelled)
          setError(
            nextError instanceof Error ? nextError.message : "load-failed",
          );
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const data = stats;
  const percent =
    data && data.total > 0
      ? Math.round((data.publicCount / data.total) * 100)
      : 0;
  const metrics: Metric[] = [
    {
      label: t("dashboard.totalFiles"),
      value: data ? number(data.total) : null,
      detail: t("dashboard.totalFilesDetail"),
      icon: FileText,
    },
    {
      label: t("dashboard.totalSize"),
      value: data ? formatFileSize(data.totalSizeBytes, locale) : null,
      detail: t("dashboard.totalSizeDetail"),
      icon: HardDrive,
    },
    {
      label: t("dashboard.publicFiles"),
      value: data ? number(data.publicCount) : null,
      detail: t("dashboard.publicFilesDetail", { percent }),
      icon: Globe,
    },
    {
      label: t("dashboard.urlExpired"),
      value: data ? number(data.urlExpired) : null,
      icon: Link2,
      warning: Boolean(data && data.urlExpired > 0),
      href: "#/items?expiry=url-expired",
    },
    {
      label: t("dashboard.deletingSoon"),
      value: data ? number(data.fileDeletingSoon) : null,
      detail: t("dashboard.deletingSoonDetail"),
      icon: Clock3,
      warning: Boolean(data && data.fileDeletingSoon > 0),
      href: "#/items?expiry=file-7",
    },
    {
      label: t("dashboard.deleted"),
      value: data ? number(data.deleted) : null,
      icon: Trash2,
      href: "#/items?status=deleted",
    },
  ];
  const renderMetric = (metric: Metric) => {
    const Icon = metric.icon;
    const className = `dashboard-metric-card ${metric.warning ? "metric-warning" : ""} ${metric.href ? "metric-action" : ""}`;
    const content = (
      <>
        <Icon aria-hidden />
        <div className="metric-content">
          <div className="metric-label">{metric.label}</div>
          <div className="metric-value">
            {metric.value ?? (
              <span className="skeleton block h-12 w-24 rounded" aria-hidden />
            )}
          </div>
          {metric.detail && <div className="metric-detail">{metric.detail}</div>}
          {metric.href && (
            <span className="metric-action-label">
              {t("dashboard.viewFiles")} <ArrowUpRight size={14} aria-hidden />
            </span>
          )}
        </div>
      </>
    );
    return metric.href ? (
      <a key={metric.label} href={metric.href} className={className}>
        {content}
      </a>
    ) : (
      <div key={metric.label} className={className}>{content}</div>
    );
  };
  return (
    <section className="page-stack dashboard-workspace">
      <WorkspaceHero
        icon={BarChart3}
        eyebrow={t("app.controlCenter")}
        title={t("dashboard.title")}
        subtitle={new Intl.DateTimeFormat(locale, { dateStyle: "full" }).format(
          new Date(),
        )}
        actions={
          <button className="btn btn-primary" type="button" onClick={onUpload}>
            <Plus aria-hidden />
            {t("dashboard.uploadAction")}
          </button>
        }
      />
      {error && (
        <div className="alert-error" role="alert">
          {error === "load-failed" ? t("common.loadFailed") : error}
        </div>
      )}
      <div className="dashboard-metrics" aria-busy={!data && !error}>
        {metrics.slice(0, 3).map(renderMetric)}
      </div>
      <div
        className="dashboard-metrics dashboard-secondary-metrics"
        aria-busy={!data && !error}
      >
        {metrics.slice(3).map(renderMetric)}
      </div>
      {ops && (
        <section className="dashboard-panel">
          <h2>{t("dashboard.operationsTitle")}</h2>
          <p>{t("dashboard.operationsSubtitle")}</p>
          <div className="dashboard-signal-row">
            <div>
              <strong>{t("dashboard.lastMaintenance")}</strong>
              <small>
                {ops.lastMaintenanceSummary ?? t("dashboard.noMaintenance")}
              </small>
            </div>
            <strong>
              {ops.lastMaintenanceAt
                ? new Intl.DateTimeFormat(locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(ops.lastMaintenanceAt))
                : "—"}
            </strong>
          </div>
          <div className="dashboard-signal-row">
            <div>
              <strong>{t("dashboard.recentAudit")}</strong>
              <small>{t("dashboard.recentAuditDetail")}</small>
            </div>
            <strong>{number(ops.recentAuditEvents.length)}</strong>
          </div>
        </section>
      )}
    </section>
  );
}
