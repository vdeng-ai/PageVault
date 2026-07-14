import type { StorageProvider, StoredObject } from "@pagevault/core";

export class CloudflareR2Storage implements StorageProvider {
  constructor(private readonly bucket: R2Bucket) {}

  async putObject(key: string, body: ArrayBuffer, contentType: string): Promise<void> {
    await this.bucket.put(key, body, {
      httpMetadata: {
        contentType
      }
    });
  }

  async getObject(key: string): Promise<StoredObject | null> {
    const object = await this.bucket.get(key);
    if (!object) {
      return null;
    }
    return {
      body: object.body,
      size: object.size,
      ...(object.httpMetadata?.contentType ? { contentType: object.httpMetadata.contentType } : {})
    };
  }

  async deleteObject(key: string): Promise<void> {
    await this.bucket.delete(key);
  }
}
