import {
  BarChart3,
  Clock3,
  FileText,
  Globe,
  HardDrive,
  Info,
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
  const privateCount = data ? Math.max(data.total - data.publicCount, 0) : 0;
  const allRecords = data ? data.total + data.deleted : 0;
  const percent =
    data && data.total > 0
      ? Math.round((data.publicCount / data.total) * 100)
      : 0;
  const metrics = [
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
      warning: true,
    },
    {
      label: t("dashboard.deletingSoon"),
      value: data ? number(data.fileDeletingSoon) : null,
      detail: t("dashboard.deletingSoonDetail"),
      icon: Clock3,
      warning: true,
    },
    {
      label: t("dashboard.deleted"),
      value: data ? number(data.deleted) : null,
      icon: Trash2,
    },
  ];
  const distribution = [
    {
      label: t("dashboard.public"),
      value: data?.publicCount ?? 0,
      description: t("dashboard.distributionPublic"),
    },
    {
      label: t("dashboard.notPublic"),
      value: privateCount,
      description: t("dashboard.distributionPrivate"),
    },
    {
      label: t("dashboard.deleted"),
      value: data?.deleted ?? 0,
      description: t("dashboard.distributionDeleted"),
    },
  ];
  const signals = [
    {
      label: t("dashboard.publicAccess"),
      value: data?.publicCount ?? 0,
      description: t("dashboard.publicAccessDetail"),
    },
    {
      label: t("dashboard.notPublic"),
      value: privateCount,
      description: t("dashboard.notPublicSignalDetail"),
    },
    {
      label: t("dashboard.urlExpired"),
      value: data?.urlExpired ?? 0,
      description: t("dashboard.urlExpiredSignalDetail"),
    },
    {
      label: t("dashboard.deletingSoon"),
      value: data?.fileDeletingSoon ?? 0,
      description: t("dashboard.deletingSoonSignalDetail"),
    },
    {
      label: t("dashboard.deleted"),
      value: data?.deleted ?? 0,
      description: t("dashboard.deletedSignalDetail"),
    },
  ];
  const renderMetric = (metric: (typeof metrics)[number]) => {
    const Icon = metric.icon;
    return (
      <div
        key={metric.label}
        className={`dashboard-metric-card ${metric.warning ? "metric-warning" : ""}`}
      >
        <Icon aria-hidden />
        <div>
          <div className="metric-label">{metric.label}</div>
          <div className="metric-value">
            {metric.value ?? (
              <span className="skeleton block h-12 w-24 rounded" aria-hidden />
            )}
          </div>
          {metric.detail && (
            <div className="metric-detail">{metric.detail}</div>
          )}
        </div>
      </div>
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
      {data && (
        <div className="dashboard-panels">
          <section className="dashboard-panel">
            <h2>{t("dashboard.distributionTitle")}</h2>
            <p>
              {number(allRecords)} · {t("dashboard.recordCount")}
            </p>
            <table className="distribution-table">
              <thead>
                <tr>
                  <th scope="col">{t("dashboard.type")}</th>
                  <th scope="col">{t("dashboard.count")}</th>
                  <th scope="col">{t("dashboard.description")}</th>
                </tr>
              </thead>
              <tbody>
                {distribution.map((segment, index) => (
                  <tr key={segment.label}>
                    <td>
                      <span className="distribution-label">
                        <span
                          className={`distribution-dot ${index > 0 ? "distribution-dot-muted" : ""}`}
                          aria-hidden
                        />
                        {segment.label}
                      </span>
                    </td>
                    <td>{number(segment.value)}</td>
                    <td>{segment.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {allRecords === 0 && (
              <p className="mt-4">{t("dashboard.noRecords")}</p>
            )}
            <div className="dashboard-note">
              <Info size={18} aria-hidden />
              {t("dashboard.sourceNote")}
            </div>
          </section>
          <section className="dashboard-panel dashboard-signals-panel">
            <h2>{t("dashboard.signalsTitle")}</h2>
            <p>{t("dashboard.signalsSubtitle")}</p>
            {signals.map((signal) => (
              <div className="dashboard-signal-row" key={signal.label}>
                <div>
                  <strong>{signal.label}</strong>
                  <small>{signal.description}</small>
                </div>
                <strong>{number(signal.value)}</strong>
              </div>
            ))}
          </section>
        </div>
      )}
    </section>
  );
}
