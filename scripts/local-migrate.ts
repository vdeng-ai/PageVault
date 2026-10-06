import { createNodeRuntime } from "../apps/worker/src/node-runtime.js";

const runtime = createNodeRuntime();
await runtime.migrate();
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
    ],
  }),
);
