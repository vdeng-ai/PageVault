import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("wrangler static assets routing", () => {
  it("uses one PageVault D1 binding with its deployed database UUID", async () => {
    const config = await readFile(
      new URL("../../wrangler.jsonc", import.meta.url),
      "utf8",
    );
    const d1Block = /"d1_databases"\s*:\s*\[(?<body>[\s\S]*?)^\s*\],/m.exec(
      config,
    )?.groups?.body;

    expect(config).toMatch(/^\s*"name"\s*:\s*"pagevault"/m);
    expect(d1Block).toBeTruthy();
    expect(
      d1Block?.match(/"database_name"\s*:\s*"pagevault-db"/g),
    ).toHaveLength(1);
    expect(d1Block?.match(/"binding"\s*:\s*"DB"/g)).toHaveLength(1);
    expect(
      d1Block?.match(
        /"database_id"\s*:\s*"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"/g,
      ),
    ).toHaveLength(1);
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
