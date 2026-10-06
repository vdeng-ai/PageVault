import { readFile } from "node:fs/promises";

const tag = process.argv[2];
if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) {
  throw new Error("Usage: node scripts/release-notes.mjs vX.Y.Z");
}

const version = tag.slice(1);
const changelog = await readFile(
  new URL("../CHANGELOG.md", import.meta.url),
  "utf8",
);
const heading = `## [${version}]`;
const start = changelog.indexOf(heading);
if (start < 0) {
  throw new Error(`No changelog section found for ${version}`);
}
const rest = changelog.slice(start + heading.length);
const next = rest.search(/\n## \[/);
const body = (next >= 0 ? rest.slice(0, next) : rest).trim();
if (!body) {
  throw new Error(`Changelog section for ${version} is empty`);
}
process.stdout.write(`${heading}\n\n${body}\n`);
