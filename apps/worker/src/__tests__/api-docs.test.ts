import type { PageVaultService } from "@pagevault/core";
import { describe, expect, it, vi } from "vitest";
import { createRequestHandler } from "../app.js";
import type { AppBindings } from "../bindings.js";

const env: AppBindings = {
  ADMIN_EMAIL: "admin@example.com",
  ADMIN_PASSWORD_HASH: "unused",
  SESSION_SECRET: "unused",
  APP_ENV: "production",
  ADMIN_BASE_URL: "https://admin.test",
  PUBLIC_BASE_URL: "https://public.test",
};

describe("static API documentation", () => {
  it.each([
    ["/llms.txt", "text/plain; charset=utf-8"],
    ["/upload-api.md", "text/markdown; charset=utf-8"],
  ])(
    "serves %s without authentication or service access",
    async (path, type) => {
      const createService = vi.fn(() => {
        throw new Error("Documentation must not initialize storage");
      });
      const fetchAsset = vi.fn(
        async () =>
          new Response("# PageVault", {
            headers: {
              "Content-Type": "text/html",
              "Cache-Control": "public, max-age=31536000, immutable",
            },
          }),
      );
      const handle = createRequestHandler({ createService, fetchAsset });
      for (const method of ["GET", "HEAD"]) {
        const response = await handle(
          new Request(`https://admin.test${path}`, { method }),
          env,
        );
        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toBe(type);
        expect(response.headers.get("Cache-Control")).toBe(
          "public, max-age=0, must-revalidate",
        );
        expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
        expect(await response.text()).toBe(
          method === "GET" ? "# PageVault" : "",
        );
      }
      expect(createService).not.toHaveBeenCalled();
      expect(fetchAsset).toHaveBeenCalledTimes(2);
    },
  );

  it("keeps documentation off the public and unrelated hostnames", async () => {
    const fetchAsset = vi.fn(async () => new Response("# PageVault"));
    const handle = createRequestHandler({
      createService: () => ({}) as PageVaultService,
      fetchAsset,
    });
    for (const hostname of ["public.test", "unrelated.test"]) {
      for (const path of ["/llms.txt", "/upload-api.md"]) {
        const response = await handle(
          new Request(`https://${hostname}${path}`),
          env,
        );
        expect(response.status).toBe(404);
      }
    }
    expect(fetchAsset).not.toHaveBeenCalled();
  });

  it("preserves asset errors", async () => {
    const handle = createRequestHandler({
      fetchAsset: async () => new Response("Unavailable", { status: 503 }),
    });
    const response = await handle(
      new Request("https://admin.test/llms.txt"),
      env,
    );
    expect(response.status).toBe(503);
    expect(await response.text()).toBe("Unavailable");
  });
});
