import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("wrangler static assets routing", () => {
  it("uses PageVault deployment resource names without a committed D1 UUID", async () => {
    const config = await readFile(
      new URL("../../wrangler.jsonc", import.meta.url),
      "utf8",
    );

    expect(config).toMatch(/^\s*"name"\s*:\s*"pagevault"/m);
    expect(config).toMatch(/"database_name"\s*:\s*"pagevault-db"/);
    expect(config).not.toMatch(/"database_id"\s*:/);
  });

  it("uses selective Worker-first routing so static assets can bypass Worker", async () => {
    const config = await readFile(
      new URL("../../wrangler.jsonc", import.meta.url),
      "utf8",
    );
    const assetsBlock = /"assets"\s*:\s*{(?<body>[\s\S]*?)^\s*},/m.exec(config)
      ?.groups?.body;

    expect(assetsBlock).toBeTruthy();
    expect(assetsBlock).toMatch(/"run_worker_first"\s*:\s*\[/);
    expect(assetsBlock).not.toMatch(/"\/"\s*,/);
    expect(assetsBlock).toMatch(/"\/\*"/);
    expect(assetsBlock).toMatch(/"!\/assets\/\*"/);
  });

  it("keeps only the Worker R2 binding used by the application", async () => {
    const config = await readFile(
      new URL("../../wrangler.jsonc", import.meta.url),
      "utf8",
    );
    const r2Block = /"r2_buckets"\s*:\s*\[(?<body>[\s\S]*?)^\s*\],/m.exec(
      config,
    )?.groups?.body;

    expect(r2Block).toBeTruthy();
    expect(
      r2Block?.match(/"bucket_name"\s*:\s*"pagevault-files"/g),
    ).toHaveLength(1);
    expect(r2Block?.match(/"binding"\s*:\s*"HTML_BUCKET"/g)).toHaveLength(1);
    expect(r2Block).not.toContain("pagevault_files");
  });

  it("samples Worker logs below full request volume by default", async () => {
    const config = await readFile(
      new URL("../../wrangler.jsonc", import.meta.url),
      "utf8",
    );

    expect(config).toMatch(/"head_sampling_rate"\s*:\s*0\.1/);
  });
});
