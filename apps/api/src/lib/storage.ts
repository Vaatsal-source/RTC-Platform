import { createReadStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { config } from './env.js';

// File bytes live either on local disk (default) or in any S3-compatible bucket
// (AWS S3, Cloudflare R2, Backblaze B2, MinIO…) — chosen by S3_BUCKET. File *metadata* is always in MongoDB.
// Uploads are first received by multer into UPLOAD_DIR; `put` then moves them to their final home.

export interface Storage {
  readonly kind: 'local' | 's3';
  /** Move/copy the multer temp file at `localPath` into storage under `key`. */
  put(localPath: string, key: string, mimeType: string, size: number): Promise<void>;
  open(key: string): Promise<Readable>;
  remove(key: string): Promise<void>;
}

export const uploadDir = (): string => path.resolve(config.UPLOAD_DIR);

class LocalStorage implements Storage {
  readonly kind = 'local' as const;
  async put(): Promise<void> {
    /* multer already wrote the file where it belongs */
  }
  async open(key: string): Promise<Readable> {
    return createReadStream(path.join(uploadDir(), key));
  }
  async remove(key: string): Promise<void> {
    await unlink(path.join(uploadDir(), key)).catch(() => undefined);
  }
}

class S3Storage implements Storage {
  readonly kind = 's3' as const;
  private client = new S3Client({
    region: config.S3_REGION,
    endpoint: config.S3_ENDPOINT || undefined,
    forcePathStyle: config.S3_FORCE_PATH_STYLE === 'true',
    credentials: config.S3_ACCESS_KEY_ID ? { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY } : undefined,
  });

  async put(localPath: string, key: string, mimeType: string, size: number): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: config.S3_BUCKET, Key: key, Body: createReadStream(localPath), ContentLength: size, ContentType: mimeType }));
    await unlink(localPath).catch(() => undefined); // the bucket is the source of truth now
  }
  async open(key: string): Promise<Readable> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: key }));
    return res.Body as Readable;
  }
  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: key })).catch(() => undefined);
  }
}

export const storage: Storage = config.S3_BUCKET ? new S3Storage() : new LocalStorage();
