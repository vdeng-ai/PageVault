import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("wrangler static assets routing", () => {
  it("uses selective Worker-first routing so static assets can bypass Worker", async () => {
    const config = await readFile(
      new URL("../../wrangler.jsonc", import.meta.url),
      "utf8",
    );
    const assetsBlock = /"assets"\s*:\s*{(?<body>[\s\S]*?)^\s*},/m.exec(
      config,
    )?.groups?.body;

    expect(assetsBlock).toBeTruthy();
    expect(assetsBlock).toMatch(/"run_worker_first"\s*:\s*\[/);
    expect(assetsBlock).not.toMatch(/"\/"\s*,/);
    expect(assetsBlock).toMatch(/"\/\*"/);
    expect(assetsBlock).toMatch(/"!\/assets\/\*"/);
  });
});
