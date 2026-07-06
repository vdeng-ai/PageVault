import { createRequestHandler } from "./app.js";
import type { AppBindings } from "./bindings.js";
import { serviceFromCloudflareEnv } from "./runtime.js";
import { flushAccessCounts } from "./access-counter.js";
import { deletePublicHtmlCache } from "./public-cache.js";

const handleRequest = createRequestHandler();
type WorkerEnv = Env & AppBindings;

async function runGarbageCollect(env: WorkerEnv): Promise<void> {
  const service = serviceFromCloudflareEnv(env);
  await flushAccessCounts(service);
  const result = await service.garbageCollectExpiredFiles();
  await Promise.all(result.deletedSlugs.map((slug) => deletePublicHtmlCache(env, slug)));
  if (result.failed.length > 0) {
    console.error(
      JSON.stringify({
        message: "scheduled gc completed with failures",
        failed: result.failed.length
      })
    );
  }
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    return handleRequest(request, env, ctx);
  },

  scheduled(_event, env, ctx): void {
    ctx.waitUntil(runGarbageCollect(env));
  }
} satisfies ExportedHandler<WorkerEnv>;
