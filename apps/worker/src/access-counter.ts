import type { AccessCountInput, HtmlBedService } from "@htmlbed/core";
import type { AppBindings, WaitUntilContext } from "./bindings.js";

type AccessCountMode = "windowed" | "exact" | "off";

interface PendingAccessCount {
  count: number;
  accessedAt: string;
}

const DEFAULT_FLUSH_SECONDS = 300;
const pendingAccessCounts = new Map<string, PendingAccessCount>();
let lastFlushMs = Date.now();

function accessCountMode(value: string | undefined): AccessCountMode {
  if (value === "exact" || value === "off") {
    return value;
  }
  return "windowed";
}

function flushSeconds(env: AppBindings): number {
  const parsed = Number.parseInt(env.ACCESS_COUNT_FLUSH_SECONDS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_FLUSH_SECONDS;
}

function logAccessFailure(error: unknown, detail: Record<string, string | number>): void {
  console.error(
    JSON.stringify({
      message: "access counter failed",
      ...detail,
      error: error instanceof Error ? error.message : String(error)
    })
  );
}

function scheduleAccessWork(promise: Promise<void>, ctx: WaitUntilContext | undefined): void {
  if (ctx) {
    ctx.waitUntil(promise);
  } else {
    void promise;
  }
}

function mergePendingAccess(id: string, count: number, accessedAt: string): void {
  const current = pendingAccessCounts.get(id);
  if (!current) {
    pendingAccessCounts.set(id, { count, accessedAt });
    return;
  }
  pendingAccessCounts.set(id, {
    count: current.count + count,
    accessedAt: accessedAt > current.accessedAt ? accessedAt : current.accessedAt
  });
}

function drainPendingAccessCounts(): AccessCountInput[] {
  const entries = Array.from(pendingAccessCounts.entries()).map(([id, entry]) => ({
    id,
    count: entry.count,
    accessedAt: entry.accessedAt
  }));
  pendingAccessCounts.clear();
  return entries;
}

export async function flushAccessCounts(service: HtmlBedService): Promise<void> {
  const entries = drainPendingAccessCounts();
  if (entries.length === 0) {
    return;
  }
  try {
    await service.recordAccessBatch(entries);
  } catch (error) {
    for (const entry of entries) {
      mergePendingAccess(entry.id, entry.count, entry.accessedAt);
    }
    logAccessFailure(error, { batchedItems: entries.length });
  }
}

export function recordPublicAccess(
  service: HtmlBedService,
  env: AppBindings,
  ctx: WaitUntilContext | undefined,
  itemId: string,
  slug: string,
  now = new Date()
): void {
  const mode = accessCountMode(env.ACCESS_COUNT_MODE);
  if (mode === "off") {
    return;
  }
  if (mode === "exact") {
    scheduleAccessWork(
      service.recordAccess(itemId, now).catch((error: unknown) => {
        logAccessFailure(error, { slug });
      }),
      ctx
    );
    return;
  }

  mergePendingAccess(itemId, 1, now.toISOString());
  if (now.getTime() - lastFlushMs < flushSeconds(env) * 1000) {
    return;
  }

  lastFlushMs = now.getTime();
  scheduleAccessWork(flushAccessCounts(service), ctx);
}

export function resetAccessCounterForTests(now = Date.now()): void {
  pendingAccessCounts.clear();
  lastFlushMs = now;
}
