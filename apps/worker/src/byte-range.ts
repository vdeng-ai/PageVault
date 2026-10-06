export interface ByteRange {
  start: number;
  end: number;
  length: number;
}

export type ByteRangeResult =
  | { kind: "ok"; range: ByteRange }
  | { kind: "unsatisfiable" };

function parseByteNumber(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function parseSingleByteRange(
  value: string,
  totalSize: number,
): ByteRangeResult {
  if (!Number.isSafeInteger(totalSize) || totalSize <= 0) {
    return { kind: "unsatisfiable" };
  }

  const match = /^bytes\s*=\s*(.+)$/i.exec(value.trim());
  const spec = match?.[1]?.trim();
  if (!spec || spec.includes(",")) {
    return { kind: "unsatisfiable" };
  }

  const range = /^(\d*)-(\d*)$/.exec(spec);
  if (!range) {
    return { kind: "unsatisfiable" };
  }

  const startValue = range[1] ?? "";
  const endValue = range[2] ?? "";
  if (startValue.length === 0 && endValue.length === 0) {
    return { kind: "unsatisfiable" };
  }

  if (startValue.length === 0) {
    const suffixLength = parseByteNumber(endValue);
    if (suffixLength === null || suffixLength <= 0) {
      return { kind: "unsatisfiable" };
    }
    const length = Math.min(suffixLength, totalSize);
    const start = totalSize - length;
    return {
      kind: "ok",
      range: { start, end: totalSize - 1, length },
    };
  }

  const start = parseByteNumber(startValue);
  if (start === null || start >= totalSize) {
    return { kind: "unsatisfiable" };
  }

  let end = totalSize - 1;
  if (endValue.length > 0) {
    const requestedEnd = parseByteNumber(endValue);
    if (requestedEnd === null || requestedEnd < start) {
      return { kind: "unsatisfiable" };
    }
    end = Math.min(requestedEnd, totalSize - 1);
  }

  return {
    kind: "ok",
    range: { start, end, length: end - start + 1 },
  };
}

export function ifRangeAllowsPartial(
  value: string | null,
  etag: string | null,
  lastModified: string | null,
): boolean {
  if (!value) {
    return true;
  }

  const normalized = value.trim();
  if (normalized.startsWith('"') || normalized.startsWith('W/"')) {
    return etag !== null && normalized === etag;
  }

  const requestedAt = Date.parse(normalized);
  const modifiedAt = lastModified ? Date.parse(lastModified) : Number.NaN;
  return (
    Number.isFinite(requestedAt) &&
    Number.isFinite(modifiedAt) &&
    modifiedAt <= requestedAt
  );
}
