import type { PageVaultService } from "@pagevault/core";
import { describe, expect, it, vi } from "vitest";
import { createRequestHandler } from "../app.js";
import type { AppBindings } from "../bindings.js";

const baseEnv: AppBindings = {
  ADMIN_EMAIL: "admin@example.com",
  ADMIN_PASSWORD_HASH: "unused",
  SESSION_SECRET: "unused",
  APP_ENV: "production",
  ADMIN_BASE_URL: "https://203.0.113.10:8443",
  PUBLIC_BASE_URL: "https://203.0.113.10:8444",
};

describe("host and port routing", () => {
  it.each(["203.0.113.10", "[2001:db8::10]", "pagevault.test"])(
    "separates admin and public requests on %s by port",
    async (hostname) => {
      const env = {
        ...baseEnv,
        ADMIN_BASE_URL: `https://${hostname}:8443`,
        PUBLIC_BASE_URL: `https://${hostname}:8444`,
      };
      const fetchAsset = vi.fn(async () => new Response("admin app"));
      const getPublicItem = vi.fn().mockResolvedValue({ kind: "disabled" });
      const handle = createRequestHandler({
        fetchAsset,
        createService: () => ({ getPublicItem }) as unknown as PageVaultService,
      });

      const admin = await handle(new Request(`${env.ADMIN_BASE_URL}/`), env);
      expect(admin.status).toBe(200);
      expect(await admin.text()).toBe("admin app");
      fetchAsset.mockClear();

      for (const path of ["/", "/api/auth/me", "/items", "/llms.txt"]) {
        const response = await handle(
          new Request(`${env.PUBLIC_BASE_URL}${path}`),
          env,
        );
        expect(response.status).toBe(404);
      }
      for (const path of ["/p/example-a1b2c3d4", "/raw/example-a1b2c3d4"]) {
        const response = await handle(
          new Request(`${env.PUBLIC_BASE_URL}${path}`),
          env,
        );
        expect(response.status).toBe(403);
      }
      expect(getPublicItem).toHaveBeenCalledTimes(2);
      expect(fetchAsset).not.toHaveBeenCalled();

      for (const baseUrl of [env.ADMIN_BASE_URL, env.PUBLIC_BASE_URL]) {
        const response = await handle(
          new Request(`${baseUrl}/assets/markdown-diagrams.js`),
          env,
        );
        expect(response.status).toBe(200);
        expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      }
    },
  );

  it("rejects unconfigured ports, including assets and health checks", async () => {
    const fetchAsset = vi.fn();
    const createService = vi.fn();
    const handle = createRequestHandler({ fetchAsset, createService });
    for (const port of [443, 8445]) {
      for (const path of [
        "/",
        "/api/auth/me",
        "/assets/app.js",
        "/healthz",
        "/readyz",
      ]) {
        const response = await handle(
          new Request(`https://203.0.113.10:${port}${path}`),
          baseEnv,
        );
        expect(response.status).toBe(404);
      }
    }
    expect(fetchAsset).not.toHaveBeenCalled();
    expect(createService).not.toHaveBeenCalled();
  });

  it("keeps health checks available on the admin port and loopback", async () => {
    const readinessCheck = vi.fn().mockResolvedValue(undefined);
    const handle = createRequestHandler({
      createService: () => ({ readinessCheck }) as unknown as PageVaultService,
    });
    for (const baseUrl of [baseEnv.ADMIN_BASE_URL, "http://127.0.0.1:3000"]) {
      for (const path of ["/healthz", "/readyz"]) {
        expect(
          (await handle(new Request(`${baseUrl}${path}`), baseEnv)).status,
        ).toBe(200);
      }
    }
    expect(readinessCheck).toHaveBeenCalledTimes(2);
    for (const path of ["/healthz", "/readyz"]) {
      expect(
        (
          await handle(
            new Request(`${baseEnv.PUBLIC_BASE_URL}${path}`),
            baseEnv,
          )
        ).status,
      ).toBe(404);
    }
  });

  it.each([
    ["https://admin.test", "https://admin.test:443/"],
    ["https://admin.test:443", "https://admin.test/"],
    ["http://admin.test", "http://admin.test:80/"],
  ])("normalizes default ports for %s", async (adminBaseUrl, requestUrl) => {
    const handle = createRequestHandler({
      fetchAsset: async () => new Response("admin app"),
    });
    const response = await handle(new Request(requestUrl), {
      ...baseEnv,
      ADMIN_BASE_URL: adminBaseUrl,
      PUBLIC_BASE_URL: "https://public.test",
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("admin app");
  });
});
