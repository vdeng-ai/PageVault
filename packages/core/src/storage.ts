export interface StoredObjectMetadata {
  contentType?: string;
  size: number;
}

export interface StoredObject extends StoredObjectMetadata {
  body: ReadableStream | ArrayBuffer;
}

export interface StoredObjectRange {
  body: ReadableStream | ArrayBuffer;
  contentType?: string;
  offset: number;
  length: number;
  totalSize: number;
}

export interface StorageProvider {
  putObject(key: string, body: ArrayBuffer, contentType: string): Promise<void>;
  headObject(key: string): Promise<StoredObjectMetadata | null>;
  getObject(key: string): Promise<StoredObject | null>;
  getObjectRange(
    key: string,
    offset: number,
    length: number,
  ): Promise<StoredObjectRange | null>;
  deleteObject(key: string): Promise<void>;
}
