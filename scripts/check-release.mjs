import { readFile } from "node:fs/promises";
import process from "node:process";
import { URL } from "node:url";

async function readJson(relativePath) {
  return JSON.parse(
    await readFile(new URL(relativePath, import.meta.url), "utf8"),
  );
}

function changelogSection(changelog, version) {
  const lines = changelog.split("\n");
  const headingPrefix = `## [${version}]`;
  const start = lines.findIndex((line) => line.startsWith(headingPrefix));
  if (start < 0) return null;
  const nextRelative = lines
    .slice(start + 1)
    .findIndex((line) => line.startsWith("## ["));
  const end = nextRelative < 0 ? lines.length : start + 1 + nextRelative;
  return {
    heading: lines[start],
    body: lines.slice(start + 1, end).join("\n").trim(),
  };
}

const root = await readJson("../package.json");
const packagePaths = [
  "../packages/core/package.json",
  "../apps/worker/package.json",
  "../apps/admin/package.json",
];

const version = root.version;
if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`Invalid root semantic version: ${String(version)}`);
}

for (const relativePath of packagePaths) {
  const pkg = await readJson(relativePath);
  if (pkg.version !== version) {
    throw new Error(
      `Version mismatch: ${relativePath} has ${String(pkg.version)}, expected ${version}`,
    );
  }
}

const changelog = await readFile(
  new URL("../CHANGELOG.md", import.meta.url),
  "utf8",
);
const section = changelogSection(changelog, version);
if (!section) {
  throw new Error(`CHANGELOG.md has no section for ${version}`);
}
if (!section.body) {
  throw new Error(`CHANGELOG.md section for ${version} is empty`);
}

const tag = process.argv[2];
if (tag && tag !== `v${version}`) {
  throw new Error(
    `Release tag ${tag} does not match package version v${version}`,
  );
}

process.stdout.write(
  JSON.stringify({ ok: true, version, tag: tag ?? null }) + "\n",
);
