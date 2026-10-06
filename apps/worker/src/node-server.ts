import { serve } from "@hono/node-server";
import { createRequestHandler } from "./app.js";
import { createNodeRuntime, createStaticAssetFetcher } from "./node-runtime.js";

const runtime = createNodeRuntime();
await runtime.migrate();

const handleRequest = createRequestHandler({
  createService: () => runtime.service,
  fetchAsset: createStaticAssetFetcher(),
});

const maintenanceIntervalMs = 24 * 60 * 60 * 1000;
const maintenanceTimer = setInterval(() => {
  void runtime.service.runMaintenance().then(async (result) => {
    const reconciliation = result.reconciliation;
    const findings =
      result.gc.failed.length +
      reconciliation.missingObjects.length +
      reconciliation.sizeMismatches.length +
      reconciliation.orphanObjects.length +
      reconciliation.failed.length;
    await runtime.service.recordMaintenanceOutcome(
      findings > 0 ? "findings" : "ok",
      `GC ${result.gc.deleted} deleted; reconciliation ${findings} findings`,
    );
  }).catch((error: unknown) => {
    console.error(
      JSON.stringify({
        message: "node maintenance failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  });
}, maintenanceIntervalMs);
maintenanceTimer.unref();

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const server = serve({
  port,
  fetch: (request) => handleRequest(request, runtime.env),
});

let shuttingDown = false;
async function shutdown(signal: "SIGTERM" | "SIGINT"): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(maintenanceTimer);

  console.log(
    JSON.stringify({
      message: "pagevault node server shutting down",
      signal,
    }),
  );

  try {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    await runtime.shutdown();
    console.log(JSON.stringify({ message: "pagevault node server stopped" }));
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "pagevault node shutdown failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  }
}

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});
process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

console.log(JSON.stringify({ message: "pagevault node server listening", port }));
