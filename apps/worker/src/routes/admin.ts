import type { HtmlBedService, HtmlItem, ListItemsInput, UpdateItemInput, Visibility } from "@htmlbed/core";
import { getDerivedStatus } from "@htmlbed/core";
import type { Context, Hono } from "hono";
import { z } from "zod";
import type { HonoRuntime, ServiceFactory } from "../bindings.js";
import { requireAdmin, requireAdminWrite } from "../middleware/admin-auth.js";

const isoDate = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid ISO date");

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  visibility: z.enum(["public", "private"]).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  urlExpiresAt: isoDate.optional(),
  fileExpiresAt: isoDate.optional()
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
    "delete"
  ]),
  days: z.number().positive().optional(),
  urlExpiresAt: isoDate.optional(),
  fileExpiresAt: isoDate.optional()
});

function service(c: Context<HonoRuntime>, createService: ServiceFactory): HtmlBedService {
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

function itemDto(api: HtmlBedService, item: HtmlItem) {
  return {
    ...item,
    publicUrl: api.publicUrl(item.slug),
    derivedStatus: getDerivedStatus(item)
  };
}

function listInput(c: Context<HonoRuntime>): ListItemsInput {
  const status = (c.req.query("status") ?? "") as Exclude<ListItemsInput["status"], undefined>;
  const visibility = (c.req.query("visibility") ?? "") as Visibility | "";
  return {
    page: numberFromQuery(c.req.query("page"), 1),
    pageSize: numberFromQuery(c.req.query("pageSize"), 20),
    q: c.req.query("q") ?? "",
    status,
    visibility,
    includeDeleted: status === "deleted"
  };
}

function formNumber(value: FormDataEntryValue | null): number | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function formVisibility(value: FormDataEntryValue | null): Visibility | undefined {
  return value === "public" || value === "private" ? value : undefined;
}

function maxUploadBytes(c: Context<HonoRuntime>): number {
  const parsed = Number.parseInt(c.env.MAX_UPLOAD_SIZE_MB ?? "10", 10);
  const mb = Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
  return mb * 1024 * 1024;
}

export function registerAdminRoutes(app: Hono<HonoRuntime>, createService: ServiceFactory): void {
  app.get("/api/admin/dashboard", requireAdmin, async (c) => {
    return c.json(await service(c, createService).getDashboardStats());
  });

  app.get("/api/admin/items", requireAdmin, async (c) => {
    const api = service(c, createService);
    const result = await api.listItems(listInput(c));
    return c.json({
      ...result,
      items: result.items.map((item) => itemDto(api, item))
    });
  });

  app.post("/api/admin/items", requireAdminWrite, async (c) => {
    const body = await c.req.formData();
    const file = body.get("file");
    if (!(file instanceof File)) {
      return c.json({ error: "HTML file is required" }, 400);
    }
    if (file.size > maxUploadBytes(c)) {
      return c.json({ error: "Uploaded file is too large" }, 413);
    }

    const api = service(c, createService);
    const urlExpireDays = formNumber(body.get("urlExpireDays"));
    const fileExpireDays = formNumber(body.get("fileExpireDays"));
    const nextVisibility = formVisibility(body.get("visibility"));
    const result = await api.uploadHtml({
      filename: file.name,
      body: await file.arrayBuffer(),
      ...(urlExpireDays === undefined ? {} : { urlExpireDays }),
      ...(fileExpireDays === undefined ? {} : { fileExpireDays }),
      ...(nextVisibility === undefined ? {} : { visibility: nextVisibility })
    });

    return c.json({
      id: result.item.id,
      title: result.item.title,
      slug: result.item.slug,
      publicUrl: result.publicUrl,
      urlExpiresAt: result.item.urlExpiresAt,
      fileExpiresAt: result.item.fileExpiresAt
    });
  });

  app.get("/api/admin/items/:id", requireAdmin, async (c) => {
    const api = service(c, createService);
    return c.json(itemDto(api, await api.getItem(c.req.param("id"))));
  });

  app.patch("/api/admin/items/:id", requireAdminWrite, async (c) => {
    const parsed = updateSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return c.json({ error: "Invalid item update" }, 400);
    }
    const api = service(c, createService);
    const patch: UpdateItemInput = {};
    if (parsed.data.title !== undefined) patch.title = parsed.data.title;
    if (parsed.data.visibility !== undefined) patch.visibility = parsed.data.visibility;
    if (parsed.data.status !== undefined) patch.status = parsed.data.status;
    if (parsed.data.urlExpiresAt !== undefined) patch.urlExpiresAt = parsed.data.urlExpiresAt;
    if (parsed.data.fileExpiresAt !== undefined) patch.fileExpiresAt = parsed.data.fileExpiresAt;
    return c.json(itemDto(api, await api.updateItem(c.req.param("id"), patch)));
  });

  app.delete("/api/admin/items/:id", requireAdminWrite, async (c) => {
    await service(c, createService).deleteItem(c.req.param("id"));
    return c.json({ ok: true });
  });

  app.post("/api/admin/items/batch", requireAdminWrite, async (c) => {
    const parsed = batchSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return c.json({ error: "Invalid batch request" }, 400);
    }
    return c.json(
      await service(c, createService).batchUpdate({
        ids: parsed.data.ids,
        action: parsed.data.action,
        ...(parsed.data.days === undefined ? {} : { days: parsed.data.days }),
        ...(parsed.data.urlExpiresAt === undefined ? {} : { urlExpiresAt: parsed.data.urlExpiresAt }),
        ...(parsed.data.fileExpiresAt === undefined ? {} : { fileExpiresAt: parsed.data.fileExpiresAt })
      })
    );
  });

  app.post("/api/admin/gc", requireAdminWrite, async (c) => {
    return c.json(await service(c, createService).garbageCollectExpiredFiles());
  });
}
