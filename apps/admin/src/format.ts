const FILE_SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

export function encodeShareUrl(value: string): string {
  try {
    return new URL(value).href;
  } catch {
    return encodeURI(value);
  }
}

export function formatFileSize(bytes: number, locale: string): string {
  const value = Math.max(0, bytes);
  const unitIndex =
    value === 0
      ? 0
      : Math.min(
          Math.floor(Math.log(value) / Math.log(1024)),
          FILE_SIZE_UNITS.length - 1,
        );
  const formatter = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
  });

  return `${formatter.format(value / 1024 ** unitIndex)} ${FILE_SIZE_UNITS[unitIndex]}`;
}
