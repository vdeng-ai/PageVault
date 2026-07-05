import {
  DEFAULT_FILE_EXPIRE_DAYS,
  DEFAULT_URL_EXPIRE_DAYS
} from "./constants.js";
import type { DerivedStatus, HtmlItem } from "./types.js";

export function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function defaultUrlExpiresAt(now = new Date()): string {
  return addDays(now, DEFAULT_URL_EXPIRE_DAYS).toISOString();
}

export function defaultFileExpiresAt(now = new Date()): string {
  return addDays(now, DEFAULT_FILE_EXPIRE_DAYS).toISOString();
}

export function isExpired(expiresAt: string, now = new Date()): boolean {
  return now.getTime() >= Date.parse(expiresAt);
}

export function isUrlExpired(item: Pick<HtmlItem, "urlExpiresAt">, now = new Date()): boolean {
  return isExpired(item.urlExpiresAt, now);
}

export function isFileExpired(item: Pick<HtmlItem, "fileExpiresAt">, now = new Date()): boolean {
  return isExpired(item.fileExpiresAt, now);
}

export function getDerivedStatus(item: HtmlItem, now = new Date()): DerivedStatus {
  if (item.status === "deleted") {
    return "deleted";
  }
  if (item.status === "disabled") {
    return "disabled";
  }
  if (item.visibility === "private") {
    return "private";
  }
  if (isFileExpired(item, now)) {
    return "file_expired";
  }
  if (isUrlExpired(item, now)) {
    return "url_expired";
  }
  return "active";
}
