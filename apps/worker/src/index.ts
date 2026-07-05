import { createRequestHandler } from "./app.js";
import type { AppBindings } from "./bindings.js";
import { serviceFromCloudflareEnv } from "./runtime.js";

const handleRequest = createRequestHandler();
type WorkerEnv = Env & AppBindings;

async function runGarbageCollect(env: WorkerEnv): Promise<void> {
  const result = await serviceFromCloudflareEnv(env).garbageCollectExpiredFiles();
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
