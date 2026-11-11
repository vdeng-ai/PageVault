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

describe("browser diagram assets", () => {
  it.each(["admin.test", "public.test"])(
    "serves modules on %s without storage access, including opaque previews",
    async (hostname) => {
      const createService = vi.fn(() => {
        throw new Error("Static assets must not initialize storage");
      });
      const handle = createRequestHandler({
        createService,
        fetchAsset: async () =>
          new Response("export {};", {
            headers: {
              "Content-Type": "text/javascript",
              "Cache-Control": "public, max-age=31536000, immutable",
            },
          }),
      });
      for (const method of ["GET", "HEAD"]) {
        for (const path of [
          "/assets/markdown-diagrams.js",
          "/assets/mermaid-hash.js",
        ]) {
          const response = await handle(
            new Request(`https://${hostname}${path}`, {
              method,
              headers: { Origin: "null" },
            }),
            env,
          );
          expect(response.status).toBe(200);
          expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
          expect(response.headers.get("Content-Type")).toBe("text/javascript");
          expect(response.headers.get("Cache-Control")).toContain(
            path.endsWith("markdown-diagrams.js")
              ? "must-revalidate"
              : "immutable",
          );
          expect(await response.text()).toBe(
            method === "HEAD" ? "" : "export {};",
          );
        }
      }
      expect(createService).not.toHaveBeenCalled();
    },
  );

  it("keeps assets off unrelated hostnames", async () => {
    const fetchAsset = vi.fn();
    const handle = createRequestHandler({ fetchAsset });
    expect(
      (
        await handle(
          new Request("https://unrelated.test/assets/markdown-diagrams.js"),
          env,
        )
      ).status,
    ).toBe(404);
    expect(fetchAsset).not.toHaveBeenCalled();
  });
});
