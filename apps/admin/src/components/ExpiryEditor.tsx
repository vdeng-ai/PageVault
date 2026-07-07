import { useSettings } from "../settings.js";

function toLocalDateTime(value: string): string {
  const date = new Date(value);
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromLocalDateTime(value: string): string {
  return new Date(value).toISOString();
}

export function ExpiryEditor({
  urlExpiresAt,
  fileExpiresAt,
  onUrlChange,
  onFileChange
}: {
  urlExpiresAt: string;
  fileExpiresAt: string;
  onUrlChange: (value: string) => void;
  onFileChange: (value: string) => void;
}) {
  const { t } = useSettings();

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="field-label">
        {t("common.urlExpiry")}
        <input
          className="control px-3"
          type="datetime-local"
          value={toLocalDateTime(urlExpiresAt)}
          onChange={(event) => onUrlChange(fromLocalDateTime(event.target.value))}
        />
      </label>
      <label className="field-label">
        {t("common.fileExpiry")}
        <input
          className="control px-3"
          type="datetime-local"
          value={toLocalDateTime(fileExpiresAt)}
          onChange={(event) => onFileChange(fromLocalDateTime(event.target.value))}
        />
      </label>
    </div>
  );
}
