import { readFile } from "node:fs/promises";

const root = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const packagePaths = [
  "../packages/core/package.json",
  "../apps/worker/package.json",
  "../apps/admin/package.json",
];

const version = root.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`Invalid root semantic version: ${version}`);
}

for (const relativePath of packagePaths) {
  const pkg = JSON.parse(
    await readFile(new URL(relativePath, import.meta.url), "utf8"),
  );
  if (pkg.version !== version) {
    throw new Error(
      `Version mismatch: ${relativePath} has ${pkg.version}, expected ${version}`,
    );
  }
}

const changelog = await readFile(
  new URL("../CHANGELOG.md", import.meta.url),
  "utf8",
);
if (!changelog.includes(`## [${version}]`)) {
  throw new Error(`CHANGELOG.md has no section for ${version}`);
}

const tag = process.argv[2];
if (tag && tag !== `v${version}`) {
  throw new Error(`Release tag ${tag} does not match package version v${version}`);
}

process.stdout.write(
  JSON.stringify({
    ok: true,
    version,
    tag: tag ?? null,
  }) + "\n",
);
