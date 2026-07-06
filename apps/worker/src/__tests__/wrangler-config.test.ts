import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("wrangler static assets routing", () => {
  it("runs the Worker before assets so the public host cannot serve the admin SPA", async () => {
    const config = await readFile(
      new URL("../../wrangler.jsonc", import.meta.url),
      "utf8",
    );
    const assetsBlock = /"assets"\s*:\s*{(?<body>[\s\S]*?)^\s*},/m.exec(
      config,
    )?.groups?.body;

    expect(assetsBlock).toBeTruthy();
    expect(assetsBlock).toMatch(/"run_worker_first"\s*:\s*true/);
  });
});
