import { createNodeRuntime } from "../apps/worker/src/node-runtime.js";

const runtime = createNodeRuntime();
await runtime.migrate();
console.log(JSON.stringify(await runtime.service.garbageCollectExpiredFiles()));
