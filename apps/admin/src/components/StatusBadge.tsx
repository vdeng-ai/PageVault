import type { DerivedStatus } from "../api/client.js";
import { useSettings, type TranslationKey } from "../settings.js";

const labels: Record<DerivedStatus, TranslationKey> = {
  active: "status.active",
  private: "status.private",
  disabled: "status.disabled",
  deleted: "status.deleted",
  url_expired: "status.urlExpired",
  file_expired: "status.fileExpired"
};

const styles: Record<DerivedStatus, string> = {
  active: "status-active",
  private: "status-private",
  disabled: "status-disabled",
  deleted: "status-deleted",
  url_expired: "status-url-expired",
  file_expired: "status-file-expired"
};

export function StatusBadge({ status }: { status: DerivedStatus }) {
  const { t } = useSettings();

  return (
    <span className={`status-badge inline-flex h-6 items-center rounded-md border px-2 text-xs font-semibold ${styles[status]}`}>
      {t(labels[status])}
    </span>
  );
}
