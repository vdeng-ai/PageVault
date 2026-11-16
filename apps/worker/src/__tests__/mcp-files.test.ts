import { afterEach, describe, expect, it, vi } from "vitest";
import {
  allowedFileHosts,
  downloadFile,
  readBoundedBytes,
  resolveFilename,
  validateDownloadUrl,
} from "../mcp/files.js";
import type { AppBindings } from "../bindings.js";

afterEach(() => vi.restoreAllMocks());

describe("MCP file transfer", () => {
  it.each([
    "sandbox:/mnt/data/a.png",
    "http://files.oaiusercontent.com/a",
    "https://127.0.0.1/a",
    "https://[::1]/a",
    "https://localhost/a",
    "https://files.oaiusercontent.com.evil.example/a",
    "https://files.oaiusercontent.com@evil.example/a",
    "https://user:pass@files.oaiusercontent.com/a",
    "https://files.oaiusercontent.com:8443/a",
    "https://169.254.169.254/latest/meta-data",
  ])("rejects untrusted download target %s", (url) => {
    expect(() => validateDownloadUrl(url, [".oaiusercontent.com"])).toThrow();
  });
  it("checks redirect targets and never forwards credentials", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: "https://127.0.0.1/private" },
      }),
    );
    await expect(
      downloadFile(
        { file_id: "x", download_url: "https://files.oaiusercontent.com/x" },
        {} as AppBindings,
        100,
        request,
      ),
    ).rejects.toMatchObject({ code: "file_host_not_allowed" });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" });
    expect(request.mock.calls[0]?.[1]).not.toHaveProperty("headers");
  });
  it("rejects oversize advertised and chunked bodies", async () => {
    await expect(
      readBoundedBytes(
        new Response("abc", { headers: { "Content-Length": "1000" } }),
        3,
      ),
    ).rejects.toMatchObject({ code: "payload_too_large" });
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(3));
          controller.enqueue(new Uint8Array(3));
          controller.close();
        },
      }),
    );
    await expect(readBoundedBytes(response, 5)).rejects.toMatchObject({
      code: "payload_too_large",
    });
  });
  it("handles optional file metadata without inventing unsupported extensions", async () => {
    const file = {
      file_id: "file_x",
      download_url: "https://files.oaiusercontent.com/x",
      mime_type: "application/pdf",
    };
    expect(await resolveFilename(file)).toMatch(/^asset-[a-f0-9]+\.pdf$/);
    await expect(
      resolveFilename({ ...file, mime_type: "application/octet-stream" }),
    ).rejects.toMatchObject({ code: "filename_required" });
    await expect(
      resolveFilename(file, "/mnt/data/a.pdf"),
    ).rejects.toMatchObject({ code: "invalid_filename" });
  });
  it("does not expose signed URLs in download errors", async () => {
    const url = "https://files.oaiusercontent.com/x?signature=SECRET";
    const request = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error(`fetch failed: ${url}`));
    await expect(
      downloadFile(
        { file_id: "x", download_url: url },
        {} as AppBindings,
        100,
        request,
      ),
    ).rejects.toMatchObject({
      message: "File download failed or timed out; attach the file again",
    });
  });

  it.each([
    ["sandbox:/mnt/data/PRIVATE.jpg?sig=SECRET", "https_required", "sandbox:"],
    ["/mnt/data/PRIVATE.jpg", "invalid_url", null],
    ["file:///PRIVATE.jpg?sig=SECRET", "https_required", "file:"],
    ["data:image/jpeg;base64,SECRET", "https_required", "data:"],
    ["sandbox://SECRET/PRIVATE.jpg", "https_required", "sandbox:"],
    ["secret-scheme:PRIVATE.jpg", "https_required", "other"],
  ])(
    "distinguishes a non-downloadable reference without echoing it: %s",
    async (value, reason, protocol) => {
      const fetchFile = vi.fn<typeof fetch>();
      const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
      await expect(
        downloadFile(
          { file_id: "FILE_ID_SECRET", download_url: value },
          { MCP_FILE_DIAGNOSTICS: "true" } as AppBindings,
          100,
          fetchFile,
          "test-request",
        ),
      ).rejects.toMatchObject({
        code: "invalid_file_url",
        diagnostic: {
          stage: "initial",
          hop: 0,
          hostname: null,
          protocol,
          allowlistMatched: false,
          reason,
        },
      });
      expect(fetchFile).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(log.mock.calls)).not.toMatch(
        /PRIVATE|SECRET|mnt|secret-scheme/,
      );
    },
  );

  it("returns the rejected hostname but never auto-allowlists an unknown provider", async () => {
    const fetchFile = vi.fn<typeof fetch>();
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await expect(
      downloadFile(
        {
          file_id: "FILE_ID_SECRET",
          download_url:
            "https://uploads.example.com/PRIVATE.jpg?signature=SECRET",
        },
        {} as AppBindings,
        100,
        fetchFile,
      ),
    ).rejects.toMatchObject({
      code: "file_host_not_allowed",
      diagnostic: {
        stage: "initial",
        hop: 0,
        protocol: "https:",
        hostname: "uploads.example.com",
        sourceHostname: null,
        allowlistMatched: false,
        reason: "host_not_allowlisted",
      },
    });
    expect(fetchFile).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(allowedFileHosts({} as AppBindings)).toEqual([
      ".oaiusercontent.com",
      "oaisdmntprwestus3.blob.core.windows.net",
    ]);
  });

  it("allows the observed attachment host without granting access to other Azure accounts", () => {
    const hosts = allowedFileHosts({} as AppBindings);
    const report = vi.fn();
    const url = validateDownloadUrl(
      "https://oaisdmntprwestus3.blob.core.windows.net/files/example?sig=SECRET",
      hosts,
      { report },
    );
    expect(url.hostname).toBe("oaisdmntprwestus3.blob.core.windows.net");
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: "initial",
        allowlistMatched: true,
        reason: "allowed",
      }),
    );
    expect(JSON.stringify(report.mock.calls)).not.toContain("SECRET");
    for (const host of [
      "unrelated.blob.core.windows.net",
      "oaisdmntpreastus2.blob.core.windows.net",
      "child.oaisdmntprwestus3.blob.core.windows.net",
      "oaisdmntprwestus3.blob.core.windows.net.evil.example",
    ]) {
      expect(() => validateDownloadUrl(`https://${host}/file`, hosts)).toThrow(
        "File download host is not allowlisted",
      );
    }
  });

  it("keeps explicit allowlists authoritative instead of silently expanding them", () => {
    const hosts = allowedFileHosts({
      MCP_FILE_ALLOWED_HOSTS: ".oaiusercontent.com",
    } as AppBindings);
    expect(hosts).toEqual([".oaiusercontent.com"]);
    expect(() =>
      validateDownloadUrl(
        "https://oaisdmntprwestus3.blob.core.windows.net/file",
        hosts,
      ),
    ).toThrow("File download host is not allowlisted");
  });

  it("allows a redirect to the observed host but still rejects its onward redirect to another account", async () => {
    const fetchFile = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: {
            Location:
              "https://oaisdmntprwestus3.blob.core.windows.net/files/x?sig=SECRET",
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 307,
          headers: {
            Location:
              "https://unrelated.blob.core.windows.net/files/x?sig=SECRET",
          },
        }),
      );
    await expect(
      downloadFile(
        {
          file_id: "file-x",
          download_url: "https://files.oaiusercontent.com/file-x",
        },
        {} as AppBindings,
        100,
        fetchFile,
      ),
    ).rejects.toMatchObject({
      code: "file_host_not_allowed",
      diagnostic: {
        stage: "redirect",
        hop: 2,
        sourceHostname: "oaisdmntprwestus3.blob.core.windows.net",
        hostname: "unrelated.blob.core.windows.net",
        allowlistMatched: false,
      },
    });
    expect(fetchFile).toHaveBeenCalledTimes(2);
    for (const [, options] of fetchFile.mock.calls) {
      expect(options?.redirect).toBe("manual");
      expect(options).not.toHaveProperty("headers");
    }
  });

  it("logs only safe fields for the initial host and rejected redirect", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const fetchFile = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: {
          Location: "https://uploads.example.com/PRIVATE.jpg?signature=SECRET",
        },
      }),
    );
    await expect(
      downloadFile(
        {
          file_id: "FILE_ID_SECRET",
          download_url:
            "https://files.oaiusercontent.com/PRIVATE.jpg?sig=SECRET",
        },
        { MCP_FILE_DIAGNOSTICS: "true" } as AppBindings,
        100,
        fetchFile,
        "test-request",
      ),
    ).rejects.toMatchObject({
      code: "file_host_not_allowed",
      diagnostic: {
        stage: "redirect",
        hop: 1,
        hostname: "uploads.example.com",
        sourceHostname: "files.oaiusercontent.com",
        allowlistMatched: false,
      },
    });
    const logs = log.mock.calls.map(
      ([entry]) => JSON.parse(String(entry)) as Record<string, unknown>,
    );
    expect(logs).toEqual([
      {
        event: "mcp_file_url_check",
        requestId: "test-request",
        stage: "initial",
        hop: 0,
        protocol: "https:",
        hostname: "files.oaiusercontent.com",
        sourceHostname: null,
        allowlistMatched: true,
        reason: "allowed",
      },
      {
        event: "mcp_file_url_check",
        requestId: "test-request",
        stage: "redirect",
        hop: 1,
        protocol: "https:",
        hostname: "uploads.example.com",
        sourceHostname: "files.oaiusercontent.com",
        allowlistMatched: false,
        reason: "host_not_allowlisted",
      },
    ]);
    expect(JSON.stringify(logs)).not.toMatch(
      /SECRET|PRIVATE|signature|download_url|file_id|https:\/\//,
    );
    expect(fetchFile).toHaveBeenCalledTimes(1);
  });

  it("keeps malformed redirect diagnostics sanitized", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const fetchFile = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: "https://[INVALID/PRIVATE?sig=SECRET" },
      }),
    );
    await expect(
      downloadFile(
        {
          file_id: "FILE_ID_SECRET",
          download_url: "https://files.oaiusercontent.com/PRIVATE?sig=SECRET",
        },
        { MCP_FILE_DIAGNOSTICS: "true" } as AppBindings,
        100,
        fetchFile,
      ),
    ).rejects.toMatchObject({
      code: "invalid_file_url",
      diagnostic: {
        stage: "redirect",
        hop: 1,
        hostname: null,
        sourceHostname: "files.oaiusercontent.com",
        reason: "invalid_url",
      },
    });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(
      /INVALID|PRIVATE|SECRET/,
    );
  });

  it("accepts a specifically configured provider and relative redirects, not its siblings", async () => {
    const bytes = new Uint8Array([255, 216, 255, 224, 255, 217]);
    const env = {
      MCP_FILE_ALLOWED_HOSTS: ".oaiusercontent.com, uploads.example.com",
    } as AppBindings;
    const fetchFile = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: "https://uploads.example.com/start?sig=SECRET" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 307,
          headers: { Location: "/final?sig=SECRET" },
        }),
      )
      .mockResolvedValueOnce(new Response(bytes));
    const body = await downloadFile(
      { file_id: "x", download_url: "https://files.oaiusercontent.com/start" },
      env,
      100,
      fetchFile,
    );
    expect(new Uint8Array(body)).toEqual(bytes);
    expect(fetchFile).toHaveBeenCalledTimes(3);
    expect(() =>
      validateDownloadUrl("https://other.example.com/a", allowedFileHosts(env)),
    ).toThrow();
    expect(() =>
      validateDownloadUrl(
        "https://uploads.example.com.evil.example/a",
        allowedFileHosts(env),
      ),
    ).toThrow();
    for (const [, options] of fetchFile.mock.calls) {
      expect(options?.redirect).toBe("manual");
      expect(options).not.toHaveProperty("headers");
    }
  });

  it.each([
    [
      "https://USER:SECRET@files.oaiusercontent.com/a",
      "credentials_not_allowed",
    ],
    ["https://files.oaiusercontent.com:8443/a", "port_not_allowed"],
    ["https://files.oaiusercontent.com/a#SECRET", "fragment_not_allowed"],
    ["http://files.oaiusercontent.com/a", "https_required"],
  ])(
    "does not mislabel a matching host rejected for another reason: %s",
    (url, reason) => {
      try {
        validateDownloadUrl(url, [".oaiusercontent.com"]);
        expect.unreachable();
      } catch (error) {
        expect(error).toMatchObject({
          code: "invalid_file_url",
          diagnostic: {
            hostname: "files.oaiusercontent.com",
            allowlistMatched: true,
            reason,
          },
        });
        expect(JSON.stringify(error)).not.toMatch(/SECRET|USER/);
      }
    },
  );

  it("never permits an explicitly configured local/IP target", () => {
    for (const host of [
      "127.0.0.1",
      "169.254.169.254",
      "[::1]",
      "localhost",
      "service.local",
    ]) {
      expect(() => validateDownloadUrl(`https://${host}/x`, [host])).toThrow();
    }
  });
});
