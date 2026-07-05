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
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-sm font-medium text-zinc-700">
        URL expiry
        <input
          className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm"
          type="datetime-local"
          value={toLocalDateTime(urlExpiresAt)}
          onChange={(event) => onUrlChange(fromLocalDateTime(event.target.value))}
        />
      </label>
      <label className="grid gap-1 text-sm font-medium text-zinc-700">
        File expiry
        <input
          className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm"
          type="datetime-local"
          value={toLocalDateTime(fileExpiresAt)}
          onChange={(event) => onFileChange(fromLocalDateTime(event.target.value))}
        />
      </label>
    </div>
  );
}
