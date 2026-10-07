import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function rootFile(path: string): Promise<string> {
  return readFile(new URL("../../../../" + path, import.meta.url), "utf8");
}

function packageVersion(contents: string): string {
  const parsed: unknown = JSON.parse(contents);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("version" in parsed) ||
    typeof parsed.version !== "string"
  ) {
    throw new Error("Package metadata is missing a string version");
  }
  return parsed.version;
}

describe("deployment hardening contract", () => {
  it("keeps the Cloudflare architecture inside the lightweight boundary", async () => {
    const config = await readFile(
      new URL("../../wrangler.jsonc", import.meta.url),
      "utf8",
    );

    const cronBlock = /"crons"\s*:\s*\[(?<body>[\s\S]*?)\]/m.exec(config)
      ?.groups?.body;

    expect(cronBlock?.match(/"[^"]+"/g)).toHaveLength(1);
    expect(config.match(/"binding"\s*:\s*"DB"/g)).toHaveLength(1);
    expect(config.match(/"binding"\s*:\s*"HTML_BUCKET"/g)).toHaveLength(1);
    expect(config).not.toMatch(/"durable_objects"\s*:/);
    expect(config).not.toMatch(/"queues"\s*:/);
    expect(config).not.toMatch(/"workflows"\s*:/);
  });

  it("keeps Docker non-root, health-checked, and migration failures unsuppressed", async () => {
    const [dockerfile, entrypoint, compose] = await Promise.all([
      rootFile("docker/Dockerfile"),
      rootFile("docker/entrypoint.sh"),
      rootFile("docker/docker-compose.example.yml"),
    ]);

    expect(dockerfile).toContain("USER 10001:10001");
    expect(dockerfile).toContain("HEALTHCHECK");
    expect(dockerfile).toContain("/readyz");
    expect(entrypoint).not.toContain("|| true");
    expect(compose).toContain("stop_grace_period: 15s");
  });

  it("keeps shared tuning defaults aligned between Cloudflare and Docker", async () => {
    const [config, compose] = await Promise.all([
      readFile(new URL("../../wrangler.jsonc", import.meta.url), "utf8"),
      rootFile("docker/docker-compose.example.yml"),
    ]);

    for (const [name, value] of [
      ["PUBLIC_HTML_CACHE_SECONDS", "3600"],
      ["ACCESS_COUNT_FLUSH_SECONDS", "300"],
      ["ACCESS_COUNT_MODE", "windowed"],
    ]) {
      expect(config).toContain(`"${name}": "${value}"`);
      expect(compose).toContain(`${name}: ${value === "windowed" ? value : `"${value}"`}`);
    }

    for (const name of [
      "APP_ENV",
      "PUBLIC_BASE_URL",
      "ADMIN_BASE_URL",
      "DEFAULT_URL_EXPIRE_DAYS",
      "DEFAULT_FILE_EXPIRE_DAYS",
      "MAX_UPLOAD_SIZE_MB",
      "ADMIN_EMAIL",
      "ADMIN_PASSWORD_HASH",
      "SESSION_SECRET",
    ]) {
      expect(config).toContain(`"${name}"`);
      expect(compose).toContain(`${name}:`);
    }
  });

  it("gates main deployment on checks, browser tests, migrations, and readiness", async () => {
    const [ciWorkflow, e2eWorkflow, deployWorkflow] = await Promise.all([
      rootFile(".github/workflows/ci.yml"),
      rootFile(".github/workflows/e2e.yml"),
      rootFile(".github/workflows/deploy.yml"),
    ]);

    expect(ciWorkflow).not.toContain("branches:\n      - main");
    expect(e2eWorkflow).not.toContain("branches:\n      - main");
    expect(deployWorkflow).toContain("needs: [verify, playwright]");
    expect(deployWorkflow).toContain("pnpm run lint");
    expect(deployWorkflow).toContain(
      "d1 migrations list pagevault-db --remote",
    );
    expect(deployWorkflow).toContain(
      "d1 migrations apply pagevault-db --remote",
    );
    expect(deployWorkflow).toContain("$admin_base/readyz");
    expect(deployWorkflow).toContain("$public_base/share-card.png");
  });

  it("keeps v1 release metadata aligned and tag automation present", async () => {
    const [rootPackage, corePackage, workerPackage, adminPackage, changelog, releaseWorkflow] =
      await Promise.all([
        rootFile("package.json"),
        rootFile("packages/core/package.json"),
        rootFile("apps/worker/package.json"),
        rootFile("apps/admin/package.json"),
        rootFile("CHANGELOG.md"),
        rootFile(".github/workflows/release.yml"),
      ]);

    const versions = [
      packageVersion(rootPackage),
      packageVersion(corePackage),
      packageVersion(workerPackage),
      packageVersion(adminPackage),
    ];
    expect(new Set(versions)).toEqual(new Set(["1.0.0"]));
    expect(changelog).toContain("## [1.0.0]");
    expect(releaseWorkflow).toContain('"v*.*.*"');
    expect(releaseWorkflow).toContain("scripts/check-release.mjs");
    expect(releaseWorkflow).toContain("gh release create");
  });

});
