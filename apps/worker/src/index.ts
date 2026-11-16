import { createRequestHandler } from "./app.js";
import type { AppBindings } from "./bindings.js";
import { maintenanceGcLimit, serviceFromCloudflareEnv } from "./runtime.js";
import { flushAccessCounts } from "./access-counter.js";
import { mcpStoreFromEnv } from "./adapters/cloudflare-mcp.js";

const handleRequest = createRequestHandler();
type WorkerEnv = Env & AppBindings;

async function runMaintenance(env: WorkerEnv): Promise<void> {
  const service = serviceFromCloudflareEnv(env);
  await flushAccessCounts(service);
  const result = await service.runMaintenance({ gcLimit: maintenanceGcLimit(env) });
  if (env.MCP_ENABLED === "true") await mcpStoreFromEnv(env).prune(Date.now());
  // Public reads check D1 state before cache, and TTL never exceeds expiry.
  // Expired objects need no per-file cache purge (which would exhaust Free subrequests).

  const reconciliation = result.reconciliation;
  const hasIssues =
    result.gc.failed.length > 0 ||
    reconciliation.missingObjects.length > 0 ||
    reconciliation.sizeMismatches.length > 0 ||
    reconciliation.orphanObjects.length > 0 ||
    reconciliation.failed.length > 0;

  const payload = {
    message: hasIssues
      ? "scheduled maintenance completed with findings"
      : "scheduled maintenance completed",
    gc: {
      scanned: result.gc.scanned,
      deleted: result.gc.deleted,
      idempotencyDeleted: result.gc.idempotencyDeleted,
      failed: result.gc.failed.length,
    },
    reconciliation: {
      dbScanned: reconciliation.dbScanned,
      storageScanned: reconciliation.storageScanned,
      missingObjects: reconciliation.missingObjects.length,
      sizeMismatches: reconciliation.sizeMismatches.length,
      orphanObjects: reconciliation.orphanObjects.length,
      deletedObjectsRemoved: reconciliation.deletedObjectsRemoved.length,
      failed: reconciliation.failed.length,
    },
  };
  await service.recordMaintenanceOutcome(
    hasIssues ? "findings" : "ok",
    `GC ${result.gc.deleted} deleted; reconciliation ${reconciliation.missingObjects.length + reconciliation.sizeMismatches.length + reconciliation.orphanObjects.length} findings`,
  );

  if (hasIssues) {
    console.error(JSON.stringify(payload));
  } else {
    console.log(JSON.stringify(payload));
  }
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    return handleRequest(request, env, ctx);
  },

  scheduled(_event, env, ctx): void {
    ctx.waitUntil(runMaintenance(env));
  },
} satisfies ExportedHandler<WorkerEnv>;
