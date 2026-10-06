import type {
  PageVaultService,
  VaultItem,
  ListItemsInput,
  UpdateItemInput,
  Visibility,
} from "@pagevault/core";
import { getDerivedStatus, HTML_CONTENT_TYPE } from "@pagevault/core";
import type { Context, Hono } from "hono";
import { z } from "zod";
import type { HonoRuntime, ServiceFactory } from "../bindings.js";
import { parseSingleByteRange } from "../byte-range.js";
import {
  requireAdmin,
  requireAdminWrite,
  requireAdminWriteOrApiKey,
} from "../middleware/admin-auth.js";
import { purgePublicContentCache } from "../public-cache.js";
import {
  adminPreviewContentHeaders,
  isPdfContentType,
  publicErrorPage,
} from "../middleware/security-headers.js";
import {
  isMarkdownContentType,
  renderPublicMarkdownDocument,
} from "../public-markdown.js";

const isoDate = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid ISO date");

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  visibility: z.enum(["public", "private"]).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  urlExpiresAt: isoDate.optional(),
  fileExpiresAt: isoDate.optional(),
});

const batchSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  action: z.enum([
    "extend_url",
    "extend_file",
    "set_url_expires_at",
    "set_file_expires_at",
    "set_public",
    "set_private",
    "disable",
    "restore",
    "delete",
  ]),
  days: z.number().positive().optional(),
  urlExpiresAt: isoDate.optional(),
  fileExpiresAt: isoDate.optional(),
});

const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(100),
});

function service(
  c: Context<HonoRuntime>,
  createService: ServiceFactory,
): PageVaultService {
  return createService(c.env);
}

async function readJson(c: Context<HonoRuntime>): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

function numberFromQuery(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function itemDto(api: PageVaultService, item: VaultItem) {
  return {
    ...item,
    publicUrl: api.publicUrl(item.slug),
    derivedStatus: getDerivedStatus(item),
  };
}

async function existingItemSlugs(
  api: PageVaultService,
  ids: string[],
): Promise<string[]> {
  return Array.from(
    new Set((await api.getItems(ids)).map((item) => item.slug)),
  );
}

function purgeSlugs(c: Context<HonoRuntime>, slugs: string[]): void {
  // Node has no Worker Cache API or ExecutionContext. Accessing Hono's
  // executionCtx there would throw after a successful database write.
  if (typeof caches === "undefined") return;
  for (const slug of slugs) {
    purgePublicContentCache(c.env, c.executionCtx, slug);
  }
}

function listInput(c: Context<HonoRuntime>): ListItemsInput {
  const status = (c.req.query("status") ?? "") as Exclude<
    ListItemsInput["status"],
    undefined
  >;
  const visibility = (c.req.query("visibility") ?? "") as Visibility | "";
  return {
    page: numberFromQuery(c.req.query("page"), 1),
    pageSize: numberFromQuery(c.req.query("pageSize"), 20),
    q: c.req.query("q") ?? "",
    status,
    visibility,
    includeDeleted: status === "deleted",
    includeTotal: c.req.query("includeTotal") === "true",
  };
}

function formNumber(value: FormDataEntryValue | null): number | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function formVisibility(
  value: FormDataEntryValue | null,
): Visibility | undefined {
  return value === "public" || value === "private" ? value : undefined;
}

function maxUploadBytes(c: Context<HonoRuntime>): number {
  const parsed = Number.parseInt(c.env.MAX_UPLOAD_SIZE_MB ?? "10", 10);
  const mb = Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
  return mb * 1024 * 1024;
}

export function registerAdminRoutes(
  app: Hono<HonoRuntime>,
  createService: ServiceFactory,
): void {
  app.get("/api/admin/dashboard", requireAdmin, async (c) => {
    return c.json(await service(c, createService).getDashboardStats());
  });

  app.get("/api/admin/api-keys", requireAdmin, async (c) => {
    return c.json({ apiKeys: await service(c, createService).listApiKeys() });
  });

  app.post("/api/admin/api-keys", requireAdminWrite, async (c) => {
    const parsed = createApiKeySchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return c.json({ error: "Invalid API key name" }, 400);
    }
    return c.json(
      await service(c, createService).createApiKey(parsed.data.name),
      201,
    );
  });

  app.delete("/api/admin/api-keys/:id", requireAdminWrite, async (c) => {
    await service(c, createService).revokeApiKey(c.req.param("id"));
    return c.json({ ok: true });
  });

  app.get("/api/admin/items", requireAdmin, async (c) => {
    const api = service(c, createService);
    const result = await api.listItems(listInput(c));
    return c.json({
      ...result,
      items: result.items.map((item) => itemDto(api, item)),
    });
  });

  app.post(
    "/api/admin/items",
    requireAdminWriteOrApiKey(createService),
    async (c) => {
      const body = await c.req.formData();
      const file = body.get("file");
      if (!(file instanceof File)) {
        return c.json({ error: "File is required" }, 400);
      }
      if (file.size > maxUploadBytes(c)) {
        return c.json({ error: "Uploaded file is too large" }, 413);
      }

      const api = service(c, createService);
      const urlExpireDays = formNumber(body.get("urlExpireDays"));
      const fileExpireDays = formNumber(body.get("fileExpireDays"));
      const nextVisibility = formVisibility(body.get("visibility"));
      const uploadInput = {
        filename: file.name,
        body: await file.arrayBuffer(),
        ...(urlExpireDays === undefined ? {} : { urlExpireDays }),
        ...(fileExpireDays === undefined ? {} : { fileExpireDays }),
        ...(nextVisibility === undefined ? {} : { visibility: nextVisibility }),
      };
      const apiKey = c.get("apiKey");
      const idempotencyKey = c.req.header("Idempotency-Key");
      const result =
        apiKey && idempotencyKey
          ? await api.uploadFileIdempotent(
              apiKey.id,
              idempotencyKey,
              uploadInput,
            )
          : { ...(await api.uploadFile(uploadInput)), replayed: false };

      if (apiKey && idempotencyKey) {
        c.header("Idempotency-Replayed", result.replayed ? "true" : "false");
      }
      return c.json({
        id: result.item.id,
        title: result.item.title,
        slug: result.item.slug,
        publicUrl: result.publicUrl,
        urlExpiresAt: result.item.urlExpiresAt,
        fileExpiresAt: result.item.fileExpiresAt,
      });
    },
  );

  app.get("/api/admin/items/:id", requireAdmin, async (c) => {
    const api = service(c, createService);
    return c.json(itemDto(api, await api.getItem(c.req.param("id"))));
  });

  app.get("/api/admin/items/:id/preview", requireAdmin, async (c) => {
    const api = service(c, createService);
    const item = await api.getItem(c.req.param("id"));
    if (item.status === "deleted") return publicErrorPage(404);
    const now = new Date();
    if (Date.parse(item.fileExpiresAt) <= now.getTime()) {
      return publicErrorPage(410);
    }

    const itemContentType = item.contentType ?? HTML_CONTENT_TYPE;
    const rangeHeader = c.req.header("Range");
    if (rangeHeader && isPdfContentType(itemContentType)) {
      const headers = new Headers({
        "Content-Type": itemContentType,
        "Cache-Control": "no-store",
        "Accept-Ranges": "bytes",
        ...adminPreviewContentHeaders(itemContentType),
      });
      const parsed = parseSingleByteRange(rangeHeader, item.sizeBytes);
      if (parsed.kind === "unsatisfiable") {
        headers.set("Content-Range", `bytes */${item.sizeBytes}`);
        headers.set("Content-Length", "0");
        return new Response(null, { status: 416, headers });
      }

      const partial = await api.getObjectRange(
        item,
        parsed.range.start,
        parsed.range.length,
        now,
      );
      if (!partial) return publicErrorPage(404);
      if (partial.length <= 0) {
        headers.set("Content-Range", `bytes */${partial.totalSize}`);
        headers.set("Content-Length", "0");
        return new Response(null, { status: 416, headers });
      }
      headers.set(
        "Content-Range",
        `bytes ${partial.offset}-${partial.offset + partial.length - 1}/${partial.totalSize}`,
      );
      headers.set("Content-Length", String(partial.length));
      headers.set("Content-Type", partial.contentType ?? itemContentType);
      return new Response(partial.body, { status: 206, headers });
    }

    const object = await api.getPublicObject(item, now);
    if (!object) return publicErrorPage(404);
    const contentType =
      object.contentType ?? item.contentType ?? HTML_CONTENT_TYPE;
    const markdown = isMarkdownContentType(contentType);
    const body = markdown
      ? await renderPublicMarkdownDocument({ item, object })
      : object.body;
    const responseContentType = markdown ? HTML_CONTENT_TYPE : contentType;
    return new Response(body, {
      headers: {
        "Content-Type": responseContentType,
        "Cache-Control": "no-store",
        ...(isPdfContentType(responseContentType)
          ? {
              "Accept-Ranges": "bytes",
              "Content-Length": String(item.sizeBytes),
            }
          : {}),
        ...adminPreviewContentHeaders(responseContentType),
      },
    });
  });

  app.patch("/api/admin/items/:id", requireAdminWrite, async (c) => {
    const parsed = updateSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return c.json({ error: "Invalid item update" }, 400);
    }
    const api = service(c, createService);
    const patch: UpdateItemInput = {};
    if (parsed.data.title !== undefined) patch.title = parsed.data.title;
    if (parsed.data.visibility !== undefined)
      patch.visibility = parsed.data.visibility;
    if (parsed.data.status !== undefined) patch.status = parsed.data.status;
    if (parsed.data.urlExpiresAt !== undefined)
      patch.urlExpiresAt = parsed.data.urlExpiresAt;
    if (parsed.data.fileExpiresAt !== undefined)
      patch.fileExpiresAt = parsed.data.fileExpiresAt;
    const updated = await api.updateItem(c.req.param("id"), patch);
    purgeSlugs(c, [updated.slug]);
    return c.json(itemDto(api, updated));
  });

  app.delete("/api/admin/items/:id", requireAdminWrite, async (c) => {
    const api = service(c, createService);
    const item = await api.getItem(c.req.param("id"));
    await api.deleteItem(item.id);
    purgeSlugs(c, [item.slug]);
    return c.json({ ok: true });
  });

  app.post("/api/admin/items/batch", requireAdminWrite, async (c) => {
    const parsed = batchSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return c.json({ error: "Invalid batch request" }, 400);
    }
    const api = service(c, createService);
    const slugs = await existingItemSlugs(api, parsed.data.ids);
    const result = await api.batchUpdate({
      ids: parsed.data.ids,
      action: parsed.data.action,
      ...(parsed.data.days === undefined ? {} : { days: parsed.data.days }),
      ...(parsed.data.urlExpiresAt === undefined
        ? {}
        : { urlExpiresAt: parsed.data.urlExpiresAt }),
      ...(parsed.data.fileExpiresAt === undefined
        ? {}
        : { fileExpiresAt: parsed.data.fileExpiresAt }),
    });
    purgeSlugs(c, slugs);
    return c.json(result);
  });

  app.post("/api/admin/gc", requireAdminWrite, async (c) => {
    const result = await service(c, createService).garbageCollectExpiredFiles();
    purgeSlugs(c, result.deletedSlugs);
    return c.json(result);
  });
}
