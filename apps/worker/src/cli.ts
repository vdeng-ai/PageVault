import { createNodeRuntime } from "./node-runtime.js";
import { maintenanceGcLimit } from "./runtime.js";

const command = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
const runtime = createNodeRuntime();
await runtime.migrate();

if (command === "gc") {
  const result = await runtime.service.garbageCollectExpiredFiles();
  console.log(JSON.stringify(result));
} else if (command === "reconcile") {
  const result = await runtime.service.reconcileStorage({ dryRun });
  console.log(JSON.stringify(result));
} else if (command === "maintenance") {
  const result = await runtime.service.runMaintenance({ dryRun, gcLimit: maintenanceGcLimit(runtime.env) });
  if (!dryRun && runtime.env.MCP_ENABLED === "true") await runtime.mcpStore.prune(Date.now());
  console.log(JSON.stringify(result));
} else if (command === "migrate") {
  console.log(
    JSON.stringify({
      ok: true,
      migrations: [
        "0001_initial",
        "0002_api_keys",
        "0003_api_upload_lock",
        "0004_api_upload_idempotency",
        "0005_maintenance_state",
        "0006_admin_list_indexes",
        "0007_share_description",
        "0008_mcp_oauth",
        "0009_gc_active_expiry",
      ],
    }),
  );
} else {
  console.error(
    "Usage: node apps/worker/dist/cli.js gc|reconcile|maintenance|migrate [--dry-run]",
  );
  process.exitCode = 1;
}
