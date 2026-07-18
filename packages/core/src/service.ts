import {
  DEFAULT_FILE_EXPIRE_DAYS,
  DEFAULT_MAX_UPLOAD_SIZE_MB,
  DEFAULT_URL_EXPIRE_DAYS,
} from "./constants.js";
import { AppError } from "./errors.js";
import {
  addDays,
  getDerivedStatus,
  isFileExpired,
  isUrlExpired,
} from "./expiry.js";
import {
  stripSupportedFileExtension,
  SUPPORTED_UPLOAD_EXTENSIONS,
  type SupportedUploadFileType,
  uploadFileTypeForFilename,
} from "./file-types.js";
import { randomHex, sha256Hex } from "./hash.js";
import type { MetadataRepository } from "./repository.js";
import { buildPublicSlug } from "./slug.js";
import type { StorageProvider, StoredObject } from "./storage.js";
import type {
  ApiKey,
  BatchInput,
  BatchResult,
  AccessCountInput,
  DashboardStats,
  CreatedApiKey,
  GcResult,
  PageVaultConfig,
  HtmlItem,
  ListItemsInput,
  ListItemsResult,
  PublicHtmlResult,
  PublicItemResult,
  UpdateItemInput,
  UploadHtmlInput,
  UploadResult,
  Visibility,
} from "./types.js";

const ID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const API_KEY_TOKEN_PREFIX = "pvk_";
const API_KEY_TOKEN_PATTERN = /^pvk_[0-9a-f]{64}$/;
const API_KEY_USAGE_WRITE_INTERVAL_MS = 60 * 60 * 1000;

function encodeTimePart(timeMs: number): string {
  let value = BigInt(timeMs);
  let output = "";
  for (let index = 0; index < 10; index += 1) {
    output = ID_ALPHABET[Number(value % 32n)] + output;
    value /= 32n;
  }
  return output;
}

function createId(now: Date): string {
  const random = new Uint8Array(10);
  crypto.getRandomValues(random);
  let randomPart = "";
  for (let index = 0; index < 16; index += 1) {
    const source = random[index % random.length] ?? 0;
    randomPart += ID_ALPHABET[source % ID_ALPHABET.length];
  }
  return `${encodeTimePart(now.getTime())}${randomPart}`;
}

function parsePositiveNumber(
  value: number | undefined,
  fallback: number,
): number {
  if (value === undefined) {
    return fallback;
  }
  if (!Number.isFinite(value) || value <= 0) {
    throw new AppError("Invalid expiry days", 400, "invalid_expiry_days");
  }
  return value;
}

function titleFromFilename(filename: string): string {
  const leaf = filename.split(/[\\/]/).pop() ?? filename;
  const title = stripSupportedFileExtension(leaf).trim();
  return title.length > 0 ? title : "HTML";
}

function assertSupportedFilename(filename: string): SupportedUploadFileType {
  const type = uploadFileTypeForFilename(filename);
  if (!type) {
    throw new AppError(
      `Only ${SUPPORTED_UPLOAD_EXTENSIONS.join(", ")} files are allowed`,
      400,
      "invalid_file_type",
    );
  }
  return type;
}

function assertVisibility(value: Visibility): void {
  if (value !== "public" && value !== "private") {
    throw new AppError("Invalid visibility", 400, "invalid_visibility");
  }
}

export class PageVaultService {
  constructor(
    private readonly repository: MetadataRepository,
    private readonly storage: StorageProvider,
    private readonly config: PageVaultConfig,
  ) {}

  async createApiKey(name: string, now = new Date()): Promise<CreatedApiKey> {
    const normalizedName = name.trim();
    if (normalizedName.length === 0 || normalizedName.length > 100) {
      throw new AppError(
        "API key name must be between 1 and 100 characters",
        400,
        "invalid_api_key_name",
      );
    }

    const token = `${API_KEY_TOKEN_PREFIX}${randomHex(32)}`;
    const apiKey: ApiKey = {
      id: createId(now),
      name: normalizedName,
      prefix: token.slice(0, 12),
      createdAt: now.toISOString(),
      lastUsedAt: null,
      revokedAt: null,
    };
    const created = await this.repository.createApiKey({
      apiKey,
      tokenHash: await sha256Hex(token),
    });
    await this.audit(
      null,
      "api_key_create",
      JSON.stringify({ id: created.id, name: created.name }),
      now,
    );
    return { apiKey: created, token };
  }

  async listApiKeys(): Promise<ApiKey[]> {
    return this.repository.listApiKeys();
  }

  async authenticateApiKey(
    token: string,
    now = new Date(),
  ): Promise<ApiKey | null> {
    const normalizedToken = token.trim();
    if (!API_KEY_TOKEN_PATTERN.test(normalizedToken)) {
      return null;
    }
    const apiKey = await this.repository.getActiveApiKeyByHash(
      await sha256Hex(normalizedToken),
    );
    if (!apiKey) {
      return null;
    }

    const lastUsedMs = apiKey.lastUsedAt ? Date.parse(apiKey.lastUsedAt) : 0;
    if (
      !Number.isFinite(lastUsedMs) ||
      now.getTime() - lastUsedMs >= API_KEY_USAGE_WRITE_INTERVAL_MS
    ) {
      await this.repository.updateApiKeyLastUsedAt(
        apiKey.id,
        now.toISOString(),
      );
      return { ...apiKey, lastUsedAt: now.toISOString() };
    }
    return apiKey;
  }

  async revokeApiKey(id: string, now = new Date()): Promise<void> {
    if (!(await this.repository.revokeApiKey(id, now.toISOString()))) {
      throw new AppError("API key not found", 404, "api_key_not_found");
    }
    await this.audit(null, "api_key_revoke", JSON.stringify({ id }), now);
  }

  async uploadHtml(input: UploadHtmlInput): Promise<UploadResult> {
    const fileType = assertSupportedFilename(input.filename);
    const maxBytes = this.config.maxUploadSizeMb * 1024 * 1024;
    if (input.body.byteLength > maxBytes) {
      throw new AppError(
        "Uploaded file is too large",
        413,
        "payload_too_large",
      );
    }

    const now = input.now ?? new Date();
    const id = createId(now);
    const shortId = randomHex(4);
    let slug = buildPublicSlug(input.filename, shortId);
    if (await this.repository.getItemBySlug(slug)) {
      slug = buildPublicSlug(input.filename, randomHex(4));
    }
    const objectKey = `objects/${id}/index${fileType.storageExtension}`;
    const visibility = input.visibility ?? "public";
    assertVisibility(visibility);
    const item: HtmlItem = {
      id,
      title: titleFromFilename(input.filename),
      originalFilename: input.filename,
      slug,
      objectKey,
      contentType: fileType.contentType,
      sizeBytes: input.body.byteLength,
      sha256: await sha256Hex(input.body),
      visibility,
      status: "active",
      urlExpiresAt: addDays(
        now,
        parsePositiveNumber(
          input.urlExpireDays,
          this.config.defaultUrlExpireDays,
        ),
      ).toISOString(),
      fileExpiresAt: addDays(
        now,
        parsePositiveNumber(
          input.fileExpireDays,
          this.config.defaultFileExpireDays,
        ),
      ).toISOString(),
      accessCount: 0,
      lastAccessedAt: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      deletedAt: null,
    };

    await this.storage.putObject(objectKey, input.body, fileType.contentType);
    const created = await this.repository.createItem({ item });
    await this.audit(
      created.id,
      "upload",
      `Uploaded ${created.originalFilename}`,
      now,
    );

    return {
      item: created,
      publicUrl: this.publicUrl(created.slug),
    };
  }

  async getPublicHtml(
    slug: string,
    now = new Date(),
  ): Promise<PublicHtmlResult> {
    const itemResult = await this.publicItemForSlug(slug, now);
    if (itemResult.kind !== "ok") {
      return itemResult;
    }
    const { item } = itemResult;
    const object = await this.getPublicObject(item, now);
    if (!object) return { kind: "not_found" };
    return { kind: "ok", item, object };
  }

  async getPublicObject(
    item: HtmlItem,
    now = new Date(),
  ): Promise<StoredObject | null> {
    const object = await this.storage.getObject(item.objectKey);
    if (!object) {
      await this.audit(item.id, "public_object_missing", item.objectKey, now);
      return null;
    }
    return object;
  }

  async getPublicItem(
    slug: string,
    now = new Date(),
  ): Promise<PublicItemResult> {
    return this.publicItemForSlug(slug, now);
  }

  private async publicItemForSlug(
    slug: string,
    now: Date,
  ): Promise<PublicItemResult> {
    const item = await this.repository.getItemBySlug(slug);
    if (!item) {
      return { kind: "not_found" };
    }
    if (item.status === "deleted") {
      return { kind: "not_found" };
    }
    if (item.status === "disabled") {
      return { kind: "disabled" };
    }
    if (item.visibility !== "public") {
      return { kind: "not_found" };
    }
    if (isFileExpired(item, now) || isUrlExpired(item, now)) {
      return { kind: "gone" };
    }
    return { kind: "ok", item };
  }

  async recordAccess(id: string, now = new Date()): Promise<void> {
    await this.recordAccessBatch([
      { id, count: 1, accessedAt: now.toISOString() },
    ]);
  }

  async recordAccessBatch(input: AccessCountInput[]): Promise<void> {
    const entries = input.filter(
      (entry) =>
        entry.id.length > 0 && Number.isInteger(entry.count) && entry.count > 0,
    );
    if (entries.length === 0) {
      return;
    }
    await this.repository.incrementAccessBatch(entries);
  }

  async listItems(input: ListItemsInput): Promise<ListItemsResult> {
    return this.repository.listItems(input);
  }

  async getItem(id: string): Promise<HtmlItem> {
    const item = await this.repository.getItemById(id);
    if (!item) {
      throw new AppError("Item not found", 404, "item_not_found");
    }
    return item;
  }

  async getItems(ids: string[]): Promise<HtmlItem[]> {
    const uniqueIds = Array.from(
      new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0)),
    );
    if (uniqueIds.length === 0) {
      return [];
    }
    return this.repository.getItemsByIds(uniqueIds);
  }

  async updateItem(
    id: string,
    patch: UpdateItemInput,
    now = new Date(),
  ): Promise<HtmlItem> {
    if (patch.visibility) {
      assertVisibility(patch.visibility);
    }
    const item = await this.repository.updateItem(id, {
      ...patch,
      updatedAt: now.toISOString(),
    });
    await this.audit(id, "update", JSON.stringify(patch), now);
    return item;
  }

  async updateExpiry(
    id: string,
    input: Pick<UpdateItemInput, "urlExpiresAt" | "fileExpiresAt">,
    now = new Date(),
  ): Promise<HtmlItem> {
    return this.updateItem(id, input, now);
  }

  async updateVisibility(
    id: string,
    visibility: Visibility,
    now = new Date(),
  ): Promise<HtmlItem> {
    return this.updateItem(id, { visibility }, now);
  }

  async disableItem(id: string, now = new Date()): Promise<HtmlItem> {
    return this.updateItem(id, { status: "disabled" }, now);
  }

  async deleteItem(id: string, now = new Date()): Promise<void> {
    const item = await this.getItem(id);
    if (item.status === "deleted") {
      return;
    }
    await this.storage.deleteObject(item.objectKey);
    await this.repository.markDeleted(id, now.toISOString());
    await this.audit(id, "delete", "Deleted object and metadata", now);
  }

  async batchUpdate(input: BatchInput): Promise<BatchResult> {
    const now = input.now ?? new Date();
    const failed: Array<{ id: string; error: string }> = [];
    let ok = 0;

    for (const id of input.ids) {
      try {
        await this.applyBatchAction(id, input, now);
        ok += 1;
      } catch (error) {
        failed.push({
          id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
    return { ok, failed };
  }

  async garbageCollectExpiredFiles(
    now = new Date(),
    limit = 100,
  ): Promise<GcResult> {
    const expired = await this.repository.findExpiredFiles(
      now.toISOString(),
      limit,
    );
    const failed: Array<{ id: string; error: string }> = [];
    const deletedSlugs: string[] = [];
    let deleted = 0;

    for (const item of expired) {
      try {
        await this.storage.deleteObject(item.objectKey);
        await this.repository.markDeleted(item.id, now.toISOString());
        await this.audit(item.id, "gc_delete", "File retention expired", now);
        deleted += 1;
        deletedSlugs.push(item.slug);
      } catch (error) {
        failed.push({
          id: item.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return {
      scanned: expired.length,
      deleted,
      deletedSlugs,
      failed,
    };
  }

  async getDashboardStats(now = new Date()): Promise<DashboardStats> {
    return this.repository.getDashboardStats(
      now.toISOString(),
      addDays(now, 7).toISOString(),
    );
  }

  publicUrl(slug: string): string {
    return `${this.config.publicBaseUrl.replace(/\/+$/g, "")}/p/${slug}`;
  }

  derivedStatus(item: HtmlItem, now = new Date()): string {
    return getDerivedStatus(item, now);
  }

  private async applyBatchAction(
    id: string,
    input: BatchInput,
    now: Date,
  ): Promise<void> {
    const item = await this.getItem(id);
    switch (input.action) {
      case "extend_url": {
        const days = parsePositiveNumber(input.days, DEFAULT_URL_EXPIRE_DAYS);
        const base =
          Date.parse(item.urlExpiresAt) > now.getTime()
            ? new Date(item.urlExpiresAt)
            : now;
        await this.updateItem(
          id,
          { urlExpiresAt: addDays(base, days).toISOString() },
          now,
        );
        return;
      }
      case "extend_file": {
        const days = parsePositiveNumber(input.days, DEFAULT_FILE_EXPIRE_DAYS);
        const base =
          Date.parse(item.fileExpiresAt) > now.getTime()
            ? new Date(item.fileExpiresAt)
            : now;
        await this.updateItem(
          id,
          { fileExpiresAt: addDays(base, days).toISOString() },
          now,
        );
        return;
      }
      case "set_url_expires_at":
        if (!input.urlExpiresAt) {
          throw new AppError("Missing URL expiry", 400, "missing_url_expiry");
        }
        await this.updateItem(id, { urlExpiresAt: input.urlExpiresAt }, now);
        return;
      case "set_file_expires_at":
        if (!input.fileExpiresAt) {
          throw new AppError("Missing file expiry", 400, "missing_file_expiry");
        }
        await this.updateItem(id, { fileExpiresAt: input.fileExpiresAt }, now);
        return;
      case "set_public":
        await this.updateItem(id, { visibility: "public" }, now);
        return;
      case "set_private":
        await this.updateItem(id, { visibility: "private" }, now);
        return;
      case "disable":
        await this.updateItem(id, { status: "disabled" }, now);
        return;
      case "restore":
        if (item.status === "deleted") {
          throw new AppError(
            "Deleted items cannot be restored",
            400,
            "cannot_restore_deleted",
          );
        }
        await this.updateItem(id, { status: "active" }, now);
        return;
      case "delete":
        await this.deleteItem(id, now);
        return;
      default:
        throw new AppError(
          "Unsupported batch action",
          400,
          "unsupported_batch_action",
        );
    }
  }

  private async audit(
    itemId: string | null,
    action: string,
    detail: string | null,
    now: Date,
  ): Promise<void> {
    await this.repository.writeAuditLog({
      id: createId(now),
      itemId,
      action,
      detail,
      createdAt: now.toISOString(),
    });
  }
}

export function createPageVaultConfig(
  input: Partial<PageVaultConfig> & { publicBaseUrl: string },
): PageVaultConfig {
  return {
    publicBaseUrl: input.publicBaseUrl,
    defaultUrlExpireDays: input.defaultUrlExpireDays ?? DEFAULT_URL_EXPIRE_DAYS,
    defaultFileExpireDays:
      input.defaultFileExpireDays ?? DEFAULT_FILE_EXPIRE_DAYS,
    maxUploadSizeMb: input.maxUploadSizeMb ?? DEFAULT_MAX_UPLOAD_SIZE_MB,
  };
}
