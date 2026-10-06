import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { Readable } from "node:stream";
import type {
  StorageProvider,
  StoredObject,
  StoredObjectMetadata,
  StoredObjectRange,
} from "@pagevault/core";

export class LocalFileStorage implements StorageProvider {
  constructor(private readonly rootDir: string) {}

  async putObject(
    key: string,
    body: ArrayBuffer,
    contentType: string,
  ): Promise<void> {
    const path = this.resolveKey(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, Buffer.from(body));
    await writeFile(`${path}.meta.json`, JSON.stringify({ contentType }));
  }

  async headObject(key: string): Promise<StoredObjectMetadata | null> {
    const path = this.resolveKey(key);
    try {
      const [info, metadata] = await Promise.all([
        stat(path),
        this.readMetadata(path),
      ]);
      return {
        size: info.size,
        ...(metadata.contentType ? { contentType: metadata.contentType } : {}),
      };
    } catch (error) {
      if (this.isMissing(error)) {
        return null;
      }
      throw error;
    }
  }

  async getObject(key: string): Promise<StoredObject | null> {
    const path = this.resolveKey(key);
    try {
      const [info, metadata] = await Promise.all([
        stat(path),
        this.readMetadata(path),
      ]);
      return {
        body: this.fileStream(path),
        size: info.size,
        ...(metadata.contentType ? { contentType: metadata.contentType } : {}),
      };
    } catch (error) {
      if (this.isMissing(error)) {
        return null;
      }
      throw error;
    }
  }

  async getObjectRange(
    key: string,
    offset: number,
    length: number,
  ): Promise<StoredObjectRange | null> {
    const path = this.resolveKey(key);
    try {
      const [info, metadata] = await Promise.all([
        stat(path),
        this.readMetadata(path),
      ]);
      const actualLength = Math.min(
        length,
        Math.max(0, info.size - offset),
      );
      return {
        body:
          actualLength > 0
            ? this.fileStream(path, offset, offset + actualLength - 1)
            : new ArrayBuffer(0),
        offset,
        length: actualLength,
        totalSize: info.size,
        ...(metadata.contentType ? { contentType: metadata.contentType } : {}),
      };
    } catch (error) {
      if (this.isMissing(error)) {
        return null;
      }
      throw error;
    }
  }

  async deleteObject(key: string): Promise<void> {
    const path = this.resolveKey(key);
    await Promise.all([
      rm(path, { force: true }),
      rm(`${path}.meta.json`, { force: true }),
    ]);
  }

  private async readMetadata(
    path: string,
  ): Promise<{ contentType?: string }> {
    const metadata = await readFile(`${path}.meta.json`, "utf8").catch(
      () => "{}",
    );
    return JSON.parse(metadata) as { contentType?: string };
  }

  private fileStream(
    path: string,
    start?: number,
    end?: number,
  ): ReadableStream {
    const stream = createReadStream(path, {
      ...(start === undefined ? {} : { start }),
      ...(end === undefined ? {} : { end }),
    });
    return Readable.toWeb(stream) as unknown as ReadableStream;
  }

  private isMissing(error: unknown): boolean {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
  }

  private resolveKey(key: string): string {
    const normalized = normalize(key).replace(/^(\.\.(\/|\\|$))+/, "");
    return join(this.rootDir, normalized);
  }
}
