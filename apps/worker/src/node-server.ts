import { serve } from "@hono/node-server";
import { createRequestHandler } from "./app.js";
import { createNodeRuntime, createStaticAssetFetcher } from "./node-runtime.js";

const runtime = createNodeRuntime();
await runtime.migrate();

const handleRequest = createRequestHandler({
  createService: () => runtime.service,
  fetchAsset: createStaticAssetFetcher()
});

const maintenanceIntervalMs = 24 * 60 * 60 * 1000;
const maintenanceTimer = setInterval(() => {
  void runtime.service.runMaintenance().catch((error: unknown) => {
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
serve({
  port,
  fetch: (request) => handleRequest(request, runtime.env)
});

console.log(JSON.stringify({ message: "pagevault node server listening", port }));
