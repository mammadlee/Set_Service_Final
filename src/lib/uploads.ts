import fs from 'fs/promises';
import path from 'path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export type StorageProviderName = 'local' | 's3' | 'r2';

export interface UploadObjectInput {
  key: string;
  contentType: string;
  body: Buffer;
}

export interface UploadObjectResult {
  key: string;
  url: string;
}

export interface UploadService {
  provider: StorageProviderName;
  putObject(input: UploadObjectInput): Promise<UploadObjectResult>;
  getPublicUrl(key: string): string;
}

class LocalUploadService implements UploadService {
  provider: StorageProviderName = 'local';

  async putObject(input: UploadObjectInput): Promise<UploadObjectResult> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Local upload storage is not allowed in production. Configure STORAGE_PROVIDER=s3 or r2.');
    }

    const root = path.resolve(process.env.LOCAL_UPLOAD_DIR ?? 'uploads');
    const safeKey = normalizeUploadKey(input.key);
    const absolutePath = path.resolve(root, safeKey);
    assertWithinRoot(root, absolutePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, input.body);
    return { key: safeKey, url: this.getPublicUrl(safeKey) };
  }

  getPublicUrl(key: string): string {
    const baseUrl = process.env.STORAGE_PUBLIC_BASE_URL ?? '/uploads';
    return `${baseUrl.replace(/\/+$/, '')}/${normalizeUploadKey(key)}`;
  }
}

class ObjectStorageUploadService implements UploadService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(public provider: StorageProviderName) {
    this.bucket = requireEnv('S3_BUCKET');
    this.client = new S3Client({
      region: process.env.S3_REGION ?? 'auto',
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: provider === 'r2' || Boolean(process.env.S3_ENDPOINT),
      credentials: {
        accessKeyId: requireEnv('S3_ACCESS_KEY_ID'),
        secretAccessKey: requireEnv('S3_SECRET_ACCESS_KEY'),
      },
    });
  }

  async putObject(input: UploadObjectInput): Promise<UploadObjectResult> {
    const key = normalizeUploadKey(input.key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: input.body,
        ContentType: input.contentType,
      })
    );
    return { key, url: this.getPublicUrl(key) };
  }

  getPublicUrl(key: string): string {
    const baseUrl = process.env.STORAGE_PUBLIC_BASE_URL;
    if (!baseUrl) throw new Error('STORAGE_PUBLIC_BASE_URL is required for object storage public URLs.');
    return `${baseUrl.replace(/\/+$/, '')}/${normalizeUploadKey(key)}`;
  }
}

function requireEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} is required for object storage uploads.`);
  return value;
}

export function createUploadService(): UploadService {
  const provider = (process.env.STORAGE_PROVIDER ?? 'local') as StorageProviderName;
  if (provider === 'local') return new LocalUploadService();
  if (provider === 's3' || provider === 'r2') return new ObjectStorageUploadService(provider);
  throw new Error(`Unsupported STORAGE_PROVIDER: ${provider}`);
}

function normalizeUploadKey(key: string): string {
  let decoded = key.trim();
  if (!decoded) throw new Error('Unsafe upload key.');

  for (let i = 0; i < 2; i += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      throw new Error('Unsafe upload key.');
    }
  }

  const normalized = decoded.replace(/\\/g, '/');
  if (
    normalized.includes('\0') ||
    normalized.startsWith('/') ||
    normalized.startsWith('//') ||
    /^[a-zA-Z]:/.test(normalized) ||
    path.isAbsolute(normalized)
  ) {
    throw new Error('Unsafe upload key.');
  }

  const parts = normalized.split('/').filter(Boolean);
  if (!parts.length || parts.some((part) => part === '.' || part === '..' || hasUnsafeCharacters(part))) {
    throw new Error('Unsafe upload key.');
  }

  return parts.join('/');
}

function hasUnsafeCharacters(part: string): boolean {
  return /[\x00-\x1f\x7f<>:"|?*]/.test(part);
}

function assertWithinRoot(root: string, target: string): void {
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Unsafe upload key.');
  }
}
