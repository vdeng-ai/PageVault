import { afterEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { mcpFixture } from "./mcp-fixture.js";

type Fixture = Awaited<ReturnType<typeof mcpFixture>>;
const fixtures: Fixture[] = [];
async function fixture(fetchFile?: typeof fetch) {
  const value = await mcpFixture(fetchFile);
  fixtures.push(value);
  return value;
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const value of fixtures.splice(0)) await value.close();
});

interface ToolResult {
  isError?: boolean;
  structuredContent: Record<string, unknown>;
}
async function tool(
  f: Fixture,
  name: string,
  args: Record<string, unknown>,
  token?: string,
) {
  const { response, data } = await f.rpc(
    "tools/call",
    { name, arguments: args },
    token,
  );
  expect(response.status).toBe(200);
  return data.result as ToolResult;
}

describe("MCP upload adapter", () => {
  it("is disabled by default and never exposed on the public host", async () => {
    const f = await fixture();
    f.env.MCP_ENABLED = "false";
    expect((await f.call("/mcp")).status).toBe(404);
    f.env.MCP_ENABLED = "true";
    for (const path of [
      "/mcp",
      "/oauth/authorize",
      "/.well-known/oauth-protected-resource/mcp",
    ]) {
      expect(
        (
          await f.handler(
            new Request(`https://public.example.com${path}`),
            f.env,
          )
        ).status,
      ).toBe(404);
    }
  });

  it("requires bearer credentials, rejects browser cross-origin calls and does not grant admin access", async () => {
    const f = await fixture();
    const denied = await f.call("/mcp");
    expect(denied.status).toBe(401);
    expect(denied.headers.get("WWW-Authenticate")).toContain(
      "oauth-protected-resource/mcp",
    );
    expect(
      (await f.call("/mcp", { headers: { Cookie: f.cookie } })).status,
    ).toBe(401);
    expect(
      (
        await f.call("/mcp", {
          headers: {
            Authorization: `Bearer ${f.key.token}`,
            Origin: "https://evil.example",
          },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await f.call("/api/admin/items", {
          headers: { Authorization: `Bearer ${f.key.token}` },
        })
      ).status,
    ).toBe(401);
    await f.service.revokeApiKey(f.key.apiKey.id);
    expect((await f.rpc("tools/list")).response.status).toBe(401);
  });

  it("advertises exactly three tools and the complete OpenAI file parameter schema", async () => {
    const f = await fixture();
    const { data } = await f.rpc("tools/list");
    const tools = (
      data.result as {
        tools: Array<{
          name: string;
          inputSchema: {
            properties: {
              file?: { properties: object; required: string[] };
              visibility?: { default: string };
            };
          };
          _meta: Record<string, unknown>;
          annotations: Record<string, boolean>;
        }>;
      }
    ).tools;
    expect(tools.map((entry) => entry.name).sort()).toEqual([
      "get_upload_policy",
      "publish_text",
      "upload_asset",
    ]);
    const upload = tools.find((entry) => entry.name === "upload_asset")!;
    expect(upload._meta["openai/fileParams"]).toEqual(["file"]);
    expect(
      Object.keys(upload.inputSchema.properties.file!.properties).sort(),
    ).toEqual(["download_url", "file_id", "file_name", "mime_type"]);
    expect(upload.inputSchema.properties.file!.required.sort()).toEqual([
      "download_url",
      "file_id",
    ]);
    expect(upload.annotations.readOnlyHint).toBe(false);
    for (const name of ["upload_asset", "publish_text"]) {
      expect(
        tools.find((entry) => entry.name === name)!.inputSchema.properties
          .visibility?.default,
      ).toBe("public");
    }
    const policy = await tool(f, "get_upload_policy", {});
    expect(policy.structuredContent).toMatchObject({
      maxUploadSizeBytes: 10 * 1024 * 1024,
      defaultVisibility: "public",
      defaultUrlExpireDays: 15,
      defaultFileExpireDays: 30,
      maxTextSizeBytes: 256 * 1024,
      allowedDownloadHosts: [
        ".oaiusercontent.com",
        "oaisdmntprwestus3.blob.core.windows.net",
      ],
    });
  });

  it("works with the official MCP client transport", async () => {
    const f = await fixture();
    const client = new Client({ name: "integration-test", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(
      new URL("https://admin.example.com/mcp"),
      {
        requestInit: { headers: { Authorization: `Bearer ${f.key.token}` } },
        fetch: (input, init) => f.handler(new Request(input, init), f.env),
      },
    );
    try {
      await client.connect(transport);
      expect((await client.listTools()).tools).toHaveLength(3);
      const response = await client.callTool({
        name: "get_upload_policy",
        arguments: {},
      });
      expect(response.isError).not.toBe(true);
    } finally {
      await client.close();
    }
  });

  it.each(["publish_text", "upload_asset"])(
    "%s defaults to public with a 15-day link and 30-day retention",
    async (name) => {
      const source = "# Public default\n\nOriginal bytes.";
      const f = await fixture(async () => new Response(source));
      const args =
        name === "publish_text"
          ? { filename: "default.md", text: source }
          : {
              file: {
                file_id: "default-file",
                file_name: "default.md",
                download_url: "https://files.oaiusercontent.com/default.md",
              },
            };
      const first = await tool(f, name, args);
      expect(first.isError).not.toBe(true);
      expect(first.structuredContent).toMatchObject({
        visibility: "public",
        publicAvailable: true,
        replayed: false,
      });
      const item = await f.service.getItem(
        first.structuredContent.id as string,
      );
      const created = Date.parse(item.createdAt);
      expect(Date.parse(item.urlExpiresAt) - created).toBe(15 * 86_400_000);
      expect(Date.parse(item.fileExpiresAt) - created).toBe(30 * 86_400_000);
      const raw = await f.handler(
        new Request(first.structuredContent.rawUrl as string),
        f.env,
      );
      expect(raw.status).toBe(200);
      expect(await raw.text()).toBe(source);
      expect(
        (
          await f.handler(
            new Request(first.structuredContent.publicUrl as string),
            f.env,
          )
        ).status,
      ).toBe(200);
      const replay = await tool(f, name, args);
      expect(replay.structuredContent).toMatchObject({
        id: item.id,
        replayed: true,
        urlExpiresAt: item.urlExpiresAt,
        fileExpiresAt: item.fileExpiresAt,
      });
    },
  );

  it("honors instance expiry settings without changing the public visibility default", async () => {
    const f = await fixture();
    f.env.DEFAULT_URL_EXPIRE_DAYS = "7";
    f.env.DEFAULT_FILE_EXPIRE_DAYS = "60";
    expect(
      (await tool(f, "get_upload_policy", {})).structuredContent,
    ).toMatchObject({
      defaultVisibility: "public",
      defaultUrlExpireDays: 7,
      defaultFileExpireDays: 60,
    });
    const saved = await tool(f, "publish_text", {
      filename: "configured.md",
      text: "# Configured",
    });
    const item = await f.service.getItem(saved.structuredContent.id as string);
    expect(Date.parse(item.urlExpiresAt) - Date.parse(item.createdAt)).toBe(
      7 * 86_400_000,
    );
    expect(Date.parse(item.fileExpiresAt) - Date.parse(item.createdAt)).toBe(
      60 * 86_400_000,
    );
  });

  it("saves explicitly private text, returns no public URL, and replays retries", async () => {
    const f = await fixture();
    const args = {
      filename: "report.html",
      text: "<!doctype html><title>Report</title><p>Hello</p>",
      visibility: "private",
    };
    const first = await tool(f, "publish_text", args);
    expect(first.isError).not.toBe(true);
    expect(first.structuredContent).toMatchObject({
      visibility: "private",
      publicAvailable: false,
      publicUrl: null,
      rawUrl: null,
      replayed: false,
    });
    const second = await tool(f, "publish_text", args);
    expect(second.structuredContent).toMatchObject({
      id: first.structuredContent.id,
      replayed: true,
    });
    const stored = await f.service.getItem(
      first.structuredContent.id as string,
    );
    const bytes = await f.storage.getObject(stored.objectKey);
    expect(await new Response(bytes!.body).text()).toBe(args.text);
    expect(
      (
        await f.handler(
          new Request(`https://public.example.com/p/${stored.slug}`),
          f.env,
        )
      ).status,
    ).not.toBe(200);
  });

  it("honors explicit public visibility and custom expiry periods", async () => {
    const f = await fixture();
    const response = await tool(f, "publish_text", {
      filename: "hello.md",
      text: "# Hello\n\nWorld",
      visibility: "public",
      url_expire_days: 2,
      file_expire_days: 5,
    });
    expect(response.structuredContent).toMatchObject({
      visibility: "public",
      publicAvailable: true,
    });
    const item = await f.service.getItem(
      response.structuredContent.id as string,
    );
    expect(Date.parse(item.urlExpiresAt) - Date.parse(item.createdAt)).toBe(
      2 * 86_400_000,
    );
    expect(Date.parse(item.fileExpiresAt) - Date.parse(item.createdAt)).toBe(
      5 * 86_400_000,
    );
    const raw = await f.handler(
      new Request(response.structuredContent.rawUrl as string),
      f.env,
    );
    expect(raw.status).toBe(200);
    expect(await raw.text()).toBe("# Hello\n\nWorld");
    expect(
      (
        await f.handler(
          new Request(response.structuredContent.publicUrl as string),
          f.env,
        )
      ).status,
    ).toBe(200);
  });

  it("imports binary bytes unchanged and ignores temporary URL changes during retries", async () => {
    const bytes = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF");
    const fetchFile = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response(bytes));
    const f = await fixture(fetchFile);
    const args = {
      file: {
        file_id: "file_1",
        file_name: "report.pdf",
        download_url: "https://files.oaiusercontent.com/report?sig=one",
      },
    };
    const first = await tool(f, "upload_asset", args);
    expect(first.isError).not.toBe(true);
    const item = await f.service.getItem(first.structuredContent.id as string);
    const stored = await f.storage.getObject(item.objectKey);
    expect(Buffer.from(await new Response(stored!.body).arrayBuffer())).toEqual(
      bytes,
    );
    const replay = await tool(f, "upload_asset", {
      file: {
        ...args.file,
        download_url: "https://files.oaiusercontent.com/report?sig=two",
      },
    });
    expect(replay.structuredContent).toMatchObject({
      id: first.structuredContent.id,
      replayed: true,
    });
    expect(fetchFile.mock.calls[0]?.[1]).not.toHaveProperty("headers");
  });

  it("imports an explicitly private JPEG from the observed attachment host, preserving bytes and retry identity", async () => {
    // Existing repository image; no external provider call or signed production URL.
    const bytes = await readFile(
      new URL(
        "../../../../docs/assets/pagevault-upload-en.jpg",
        import.meta.url,
      ),
    );
    const fetchFile = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response(bytes));
    const f = await fixture(fetchFile);
    const args = {
      visibility: "private",
      file: {
        file_id: "observed-host-jpeg",
        file_name: "ok.jpg",
        mime_type: "image/jpeg",
        download_url:
          "https://oaisdmntprwestus3.blob.core.windows.net/files/test?sig=FIRST_SECRET",
      },
    };
    const first = await tool(f, "upload_asset", args);
    expect(first.isError).not.toBe(true);
    expect(first.structuredContent).toMatchObject({
      filename: "ok.jpg",
      contentType: "image/jpeg",
      visibility: "private",
      publicAvailable: false,
      publicUrl: null,
      rawUrl: null,
      replayed: false,
    });
    const item = await f.service.getItem(first.structuredContent.id as string);
    const stored = await f.storage.getObject(item.objectKey);
    expect(Buffer.from(await new Response(stored!.body).arrayBuffer())).toEqual(
      bytes,
    );
    const retried = await tool(f, "upload_asset", {
      visibility: "private",
      file: {
        ...args.file,
        download_url: args.file.download_url.replace(
          "FIRST_SECRET",
          "SECOND_SECRET",
        ),
      },
    });
    expect(retried.structuredContent).toMatchObject({
      id: first.structuredContent.id,
      replayed: true,
    });
    expect(JSON.stringify([first, retried])).not.toMatch(/SECRET|download_url/);
    expect(fetchFile).toHaveBeenCalledTimes(2);
    for (const [, options] of fetchFile.mock.calls) {
      expect(options).not.toHaveProperty("headers");
    }
  });

  it("does not change an existing private asset when a retry omits visibility", async () => {
    const f = await fixture();
    const args = {
      filename: "retained-private.md",
      text: "# Private",
      idempotency_key: "existing-private",
    };
    const first = await tool(f, "publish_text", {
      ...args,
      visibility: "private",
    });
    const retry = await tool(f, "publish_text", args);
    expect(retry.structuredContent.code).toBe("idempotency_conflict");
    const item = await f.service.getItem(first.structuredContent.id as string);
    expect(item.visibility).toBe("private");
    expect(item.urlExpiresAt).toBe(first.structuredContent.urlExpiresAt);
    expect(item.fileExpiresAt).toBe(first.structuredContent.fileExpiresAt);
  });

  it("returns correlated safe diagnostics for rejected attachment hosts without persisting an item", async () => {
    const fetchFile = vi.fn<typeof fetch>();
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const f = await fixture(fetchFile);
    f.env.MCP_FILE_DIAGNOSTICS = "true";
    const { response, data } = await f.rpc("tools/call", {
      name: "upload_asset",
      arguments: {
        file: {
          file_id: "FILE_ID_SECRET",
          file_name: "PRIVATE.jpg",
          download_url: "https://uploads.example.com/PRIVATE.jpg?sig=SECRET",
        },
      },
    });
    const returned = data.result as ToolResult;
    expect(returned.isError).toBe(true);
    expect(response.headers.get("X-Request-Id")).toMatch(/^[a-f0-9]{24}$/);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(returned.structuredContent).toMatchObject({
      code: "file_host_not_allowed",
      requestId: response.headers.get("X-Request-Id"),
      diagnostic: {
        stage: "initial",
        hostname: "uploads.example.com",
        allowlistMatched: false,
        reason: "host_not_allowlisted",
      },
    });
    expect(JSON.stringify(returned)).not.toMatch(
      /SECRET|PRIVATE|download_url|file_id/,
    );
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/SECRET|PRIVATE/);
    expect(fetchFile).not.toHaveBeenCalled();
    expect(
      (await f.repository.listItems({ page: 1, pageSize: 10 })).items,
    ).toEqual([]);
    const path = await tool(f, "upload_asset", {
      filename: "ok.jpg",
      file: { file_id: "x", download_url: "sandbox:/mnt/data/ok.jpg" },
    });
    expect(path.structuredContent).toMatchObject({
      code: "invalid_file_url",
      diagnostic: {
        protocol: "sandbox:",
        hostname: null,
        reason: "https_required",
      },
    });
  });

  it("rejects invalid bytes, conflicting keys, unsupported formats and byte-sized oversized text", async () => {
    const f = await fixture(async () => new Response("not a PNG"));
    expect(
      (
        await tool(f, "upload_asset", {
          file: {
            file_id: "x",
            file_name: "bad.png",
            download_url: "https://files.oaiusercontent.com/x",
          },
        })
      ).isError,
    ).toBe(true);
    const args = { filename: "a.md", text: "one", idempotency_key: "same" };
    await tool(f, "publish_text", args);
    expect(
      (await tool(f, "publish_text", { ...args, text: "two" }))
        .structuredContent.code,
    ).toBe("idempotency_conflict");
    expect(
      (await tool(f, "publish_text", { filename: "a.pdf", text: "not binary" }))
        .isError,
    ).toBe(true);
    expect(
      (
        await tool(f, "publish_text", {
          filename: "a.md",
          text: "中".repeat(100_000),
        })
      ).structuredContent.code,
    ).toBe("payload_too_large");
  });
});
