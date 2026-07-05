import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import type { StorageProvider, StoredObject } from "@htmlbed/core";

export class LocalFileStorage implements StorageProvider {
  constructor(private readonly rootDir: string) {}

  async putObject(key: string, body: ArrayBuffer, contentType: string): Promise<void> {
    const path = this.resolveKey(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, Buffer.from(body));
    await writeFile(`${path}.meta.json`, JSON.stringify({ contentType }));
  }

  async getObject(key: string): Promise<StoredObject | null> {
    const path = this.resolveKey(key);
    try {
      const [body, metadata] = await Promise.all([
        readFile(path),
        readFile(`${path}.meta.json`, "utf8").catch(() => "{}")
      ]);
      const parsed = JSON.parse(metadata) as { contentType?: string };
      return {
        body: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
        size: body.byteLength,
        ...(parsed.contentType ? { contentType: parsed.contentType } : {})
      };
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async deleteObject(key: string): Promise<void> {
    const path = this.resolveKey(key);
    await Promise.all([
      rm(path, { force: true }),
      rm(`${path}.meta.json`, { force: true })
    ]);
  }

  private resolveKey(key: string): string {
    const normalized = normalize(key).replace(/^(\.\.(\/|\\|$))+/, "");
    return join(this.rootDir, normalized);
  }
}
