import type {
  ListStoredObjectsInput,
  ListStoredObjectsResult,
  StorageProvider,
  StoredObject,
  StoredObjectMetadata,
  StoredObjectRange,
} from "@pagevault/core";

export class CloudflareR2Storage implements StorageProvider {
  constructor(private readonly bucket: R2Bucket) {}

  async putObject(
    key: string,
    body: ArrayBuffer,
    contentType: string,
  ): Promise<void> {
    await this.bucket.put(key, body, {
      httpMetadata: {
        contentType,
      },
    });
  }

  async headObject(key: string): Promise<StoredObjectMetadata | null> {
    const object = await this.bucket.head(key);
    if (!object) {
      return null;
    }
    return {
      size: object.size,
      ...(object.httpMetadata?.contentType
        ? { contentType: object.httpMetadata.contentType }
        : {}),
    };
  }

  async getObject(key: string): Promise<StoredObject | null> {
    const object = await this.bucket.get(key);
    if (!object || !("body" in object)) {
      return null;
    }
    return {
      body: object.body,
      size: object.size,
      ...(object.httpMetadata?.contentType
        ? { contentType: object.httpMetadata.contentType }
        : {}),
    };
  }

  async getObjectRange(
    key: string,
    offset: number,
    length: number,
  ): Promise<StoredObjectRange | null> {
    const object = await this.bucket.get(key, {
      range: { offset, length },
    });
    if (!object || !("body" in object)) {
      return null;
    }
    const actualLength = Math.min(
      length,
      Math.max(0, object.size - offset),
    );
    return {
      body: object.body,
      offset,
      length: actualLength,
      totalSize: object.size,
      ...(object.httpMetadata?.contentType
        ? { contentType: object.httpMetadata.contentType }
        : {}),
    };
  }

  async deleteObject(key: string): Promise<void> {
    await this.bucket.delete(key);
  }

  async listObjects(
    input: ListStoredObjectsInput,
  ): Promise<ListStoredObjectsResult> {
    const limit = Math.min(1_000, Math.max(1, input.limit));
    const listed = await this.bucket.list({
      prefix: input.prefix,
      limit,
      include: [],
      ...(input.cursor ? { cursor: input.cursor } : {}),
    });
    return {
      objects: listed.objects.map((object) => ({
        key: object.key,
        size: object.size,
        uploadedAt: object.uploaded.toISOString(),
      })),
      nextCursor: listed.truncated ? (listed.cursor ?? null) : null,
    };
  }
}
