import {
  HTML_CONTENT_TYPE,
  type PageVaultService,
  type VaultItem,
} from "@pagevault/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppBindings } from "../bindings.js";
import { handlePublicRequest } from "../routes/public.js";

function item(): VaultItem {
  const now = "2026-10-07T00:00:00.000Z";
  return {
    id: "item-1",
    title: "Cached",
    originalFilename: "cached.html",
    slug: "cached-a1b2c3d4",
    objectKey: "objects/item-1/index.html",
    contentType: HTML_CONTENT_TYPE,
    sizeBytes: 16,
    sha256: "hash",
    visibility: "public",
    status: "active",
    urlExpiresAt: "2026-11-07T00:00:00.000Z",
    fileExpiresAt: "2027-01-07T00:00:00.000Z",
    accessCount: 0,
    lastAccessedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

function env(): AppBindings {
  return {
    ADMIN_EMAIL: "admin@example.com",
    ADMIN_PASSWORD_HASH: "unused",
    SESSION_SECRET: "unused",
    ADMIN_BASE_URL: "https://admin.test",
    PUBLIC_BASE_URL: "https://public.test",
    PUBLIC_HTML_CACHE_SECONDS: "3600",
    ACCESS_COUNT_MODE: "exact",
  };
}

function cachedResponse(): Response {
  return new Response("<html>stale cache</html>", {
    status: 200,
    headers: {
      "Content-Type": HTML_CONTENT_TYPE,
      "Cache-Control": "public, max-age=0, s-maxage=3600",
      "X-PageVault-Cache-Item-Id": "item-1",
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("public route cache state", () => {
  it("checks current visibility/status before returning a cache hit", async () => {
    const match = vi.fn().mockResolvedValue(cachedResponse());
    vi.stubGlobal("caches", {
      default: {
        match,
        put: vi.fn(),
        delete: vi.fn(),
      },
    });

    const service = {
      getPublicItem: vi.fn().mockResolvedValue({ kind: "disabled" }),
    } as unknown as PageVaultService;

    const response = await handlePublicRequest(
      new Request("https://public.test/p/cached-a1b2c3d4"),
      env(),
      undefined,
      service,
    );

    expect(response.status).toBe(403);
    expect(match).not.toHaveBeenCalled();
  });

  it("serves a valid cache hit after the state check without counting HEAD", async () => {
    const current = item();
    const match = vi.fn().mockResolvedValue(cachedResponse());
    vi.stubGlobal("caches", {
      default: {
        match,
        put: vi.fn(),
        delete: vi.fn(),
      },
    });
    const recordAccess = vi.fn().mockResolvedValue(undefined);
    const service = {
      getPublicItem: vi.fn().mockResolvedValue({ kind: "ok", item: current }),
      recordAccess,
    } as unknown as PageVaultService;

    const response = await handlePublicRequest(
      new Request("https://public.test/p/cached-a1b2c3d4", { method: "HEAD" }),
      env(),
      undefined,
      service,
    );

    expect(response.status).toBe(200);
    expect(match).toHaveBeenCalledTimes(1);
    expect(recordAccess).not.toHaveBeenCalled();
  });
});
