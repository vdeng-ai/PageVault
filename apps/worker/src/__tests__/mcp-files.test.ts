import { describe, expect, it, vi } from "vitest";
import {
  downloadFile,
  readBoundedBytes,
  resolveFilename,
  validateDownloadUrl,
} from "../mcp/files.js";
import type { AppBindings } from "../bindings.js";

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
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
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
});
