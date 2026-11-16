import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { URL } from "node:url";
import { execFileSync } from "node:child_process";
import process from "node:process";

const [originInput, clientId, method = "none"] = process.argv.slice(2);
if (
  !originInput ||
  !clientId ||
  !["none", "client_secret_basic", "client_secret_post"].includes(method)
) {
  throw new Error(
    "Usage: node scripts/package-chatgpt-plugin.mjs https://ADMIN_HOST CLIENT_ID [none|client_secret_basic|client_secret_post]",
  );
}
const origin = new URL(originInput);
if (
  origin.protocol !== "https:" ||
  origin.username ||
  origin.password ||
  origin.pathname !== "/" ||
  origin.search ||
  origin.hash
) {
  throw new Error(
    "Provide an HTTPS admin origin without credentials, a path, query, or fragment",
  );
}
const root = resolve(import.meta.dirname, "..");
const { version } = JSON.parse(
  await readFile(resolve(root, "package.json"), "utf8"),
);
const directory = resolve(root, "dist/chatgpt-plugin");
await mkdir(resolve(directory, "skills/upload"), { recursive: true });
const plugin = {
  $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  name: "pagevault",
  version,
  description:
    "Save or publish selected AI-generated files to your personal PageVault.",
  extensions: {
    "com.openai": {
      interface: {
        displayName: "PageVault",
        shortDescription:
          "Save generated files and create controlled share links.",
        developerName: "PageVault",
        category: "Productivity",
        capabilities: ["Write"],
        defaultPrompt: [
          "Save this file privately to PageVault.",
          "Publish this HTML to PageVault with a 15-day share link.",
        ],
      },
    },
  },
};
const mcp = {
  $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  mcpServers: {
    pagevault: {
      type: "streamable-http",
      url: `${origin.origin}/mcp`,
      extensions: {
        "com.openai": {
          auth: {
            type: "oauth",
            client: {
              mode: "provided",
              clientId,
              tokenEndpointAuthMethod: method,
            },
            authorizationUrl: `${origin.origin}/oauth/authorize`,
            tokenUrl: `${origin.origin}/oauth/token`,
            baseScopes: ["assets:upload"],
          },
        },
      },
    },
  },
};
await writeFile(
  resolve(directory, "plugin.json"),
  `${JSON.stringify(plugin, null, 2)}\n`,
);
await writeFile(
  resolve(directory, "mcp.json"),
  `${JSON.stringify(mcp, null, 2)}\n`,
);
await copyFile(
  resolve(root, "integrations/chatgpt/skills/upload/SKILL.md"),
  resolve(directory, "skills/upload/SKILL.md"),
);
const archive = resolve(root, "dist/pagevault-chatgpt.zip");
// Python's standard library writes a fresh ZIP without an npm dependency.
execFileSync(
  "python3",
  ["-m", "zipfile", "-c", archive, "plugin.json", "mcp.json", "skills"],
  { cwd: directory },
);
process.stdout.write(
  `${JSON.stringify({ directory, archive, endpoint: `${origin.origin}/mcp`, containsSecrets: false })}\n`,
);
