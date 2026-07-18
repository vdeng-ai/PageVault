import { createNodeRuntime } from "./node-runtime.js";

const command = process.argv[2];
const runtime = createNodeRuntime();
await runtime.migrate();

if (command === "gc") {
  const result = await runtime.service.garbageCollectExpiredFiles();
  console.log(JSON.stringify(result));
} else if (command === "migrate") {
  console.log(
    JSON.stringify({
      ok: true,
      migrations: ["0001_initial", "0002_api_keys", "0003_api_upload_lock"],
    }),
  );
} else {
  console.error("Usage: node apps/worker/dist/cli.js gc|migrate");
  process.exitCode = 1;
}
