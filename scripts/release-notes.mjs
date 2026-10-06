import { readFile } from "node:fs/promises";
import process from "node:process";
import { URL } from "node:url";

const tag = process.argv[2];
if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) {
  throw new Error("Usage: node scripts/release-notes.mjs vX.Y.Z");
}

const version = tag.slice(1);
const changelog = await readFile(
  new URL("../CHANGELOG.md", import.meta.url),
  "utf8",
);
const lines = changelog.split("\n");
const headingPrefix = `## [${version}]`;
const start = lines.findIndex((line) => line.startsWith(headingPrefix));
if (start < 0) {
  throw new Error(`No changelog section found for ${version}`);
}
const nextRelative = lines
  .slice(start + 1)
  .findIndex((line) => line.startsWith("## ["));
const end = nextRelative < 0 ? lines.length : start + 1 + nextRelative;
const body = lines.slice(start + 1, end).join("\n").trim();
if (!body) {
  throw new Error(`Changelog section for ${version} is empty`);
}

process.stdout.write(`${lines[start]}\n\n${body}\n`);
