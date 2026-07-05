export interface StoredObject {
  body: ReadableStream | ArrayBuffer;
  contentType?: string;
  size?: number;
}

export interface StorageProvider {
  putObject(key: string, body: ArrayBuffer, contentType: string): Promise<void>;
  getObject(key: string): Promise<StoredObject | null>;
  deleteObject(key: string): Promise<void>;
}
