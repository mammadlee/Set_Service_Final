import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { credentialReferenceIssue } from './check-env';

export type StorageProviderName = 'local' | 's3' | 'r2';

export interface UploadObjectInput {
  key: string;
  contentType: string;
  body: Buffer;
  downloadName?: string;
}

export interface UploadObjectResult {
  key: string;
  url: string;
}

export interface PrivateUploadObjectResult {
  key: string;
}

export interface PublicUploadObject {
  body: Buffer;
  contentType: string;
  etag?: string;
}

export class UploadObjectNotFoundError extends Error {
  constructor() {
    super('Upload object not found.');
    this.name = 'UploadObjectNotFoundError';
  }
}

export class UploadObjectTooLargeError extends Error {
  constructor() {
    super('Public profile photo exceeds the maximum supported size.');
    this.name = 'UploadObjectTooLargeError';
  }
}

export class PrivateDocumentTooLargeError extends Error {
  constructor() {
    super('Private document exceeds the maximum supported size.');
    this.name = 'PrivateDocumentTooLargeError';
  }
}

export class UploadStorageUnavailableError extends Error {
  constructor() {
    super('Private document storage is unavailable.');
    this.name = 'UploadStorageUnavailableError';
  }
}

export const MAX_PRIVATE_DOCUMENT_BYTES = 5 * 1024 * 1024;

export type ObjectVisibility = 'public' | 'private';

export interface UploadService {
  provider: StorageProviderName;
  putObject(input: UploadObjectInput): Promise<UploadObjectResult>;
  putPrivateObject(input: UploadObjectInput): Promise<PrivateUploadObjectResult>;
  promotePrivateObject(sourceKey: string, targetKey: string): Promise<PrivateUploadObjectResult>;
  createSignedDownloadUrl(key: string, expiresInSeconds: number, downloadName?: string): Promise<string>;
  getPrivateObject(key: string): Promise<PublicUploadObject>;
  getPublicObject(key: string): Promise<PublicUploadObject>;
  deleteObject(key: string, visibility: ObjectVisibility): Promise<void>;
  getPublicUrl(key: string): string;
}

const MAX_PUBLIC_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;

class LocalUploadService implements UploadService {
  provider: StorageProviderName = 'local';

  async putObject(input: UploadObjectInput): Promise<UploadObjectResult> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Local upload storage is not allowed in production. Configure STORAGE_PROVIDER=s3 or r2.');
    }

    const safeKey = await writeLocalObject(publicUploadRoot(), input);
    return { key: safeKey, url: this.getPublicUrl(safeKey) };
  }

  async putPrivateObject(input: UploadObjectInput): Promise<PrivateUploadObjectResult> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Local upload storage is not allowed in production. Configure STORAGE_PROVIDER=s3 or r2.');
    }

    const key = await writeLocalObject(privateUploadRoot(), input);
    return { key };
  }

  async createSignedDownloadUrl(
    key: string,
    expiresInSeconds: number,
    downloadName?: string
  ): Promise<string> {
    const safeKey = normalizeUploadKey(key);
    const expiresAt = Math.floor(Date.now() / 1000) + normalizeSignedUrlExpiry(expiresInSeconds);
    const payload = Buffer.from(JSON.stringify({
      key: safeKey,
      expires_at: expiresAt,
      ...(downloadName ? { download_name: safeDownloadName(downloadName) } : {}),
    }), 'utf8').toString('base64url');
    const signature = crypto.createHmac('sha256', localDownloadSigningSecret()).update(payload).digest('base64url');
    return `/v1/private-worker-documents/${payload}.${signature}`;
  }

  async getPrivateObject(key: string): Promise<PublicUploadObject> {
    const filePath = resolveWithinRoot(privateUploadRoot(), key);
    try {
      const stat = await fs.stat(filePath);
      if (stat.size > MAX_PRIVATE_DOCUMENT_BYTES) throw new PrivateDocumentTooLargeError();
      const body = await fs.readFile(filePath);
      if (body.length > MAX_PRIVATE_DOCUMENT_BYTES) throw new PrivateDocumentTooLargeError();
      return { body, contentType: documentContentType(key) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new UploadObjectNotFoundError();
      throw error;
    }
  }

  async promotePrivateObject(sourceKey: string, targetKey: string): Promise<PrivateUploadObjectResult> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Local upload storage is not allowed in production. Configure STORAGE_PROVIDER=s3 or r2.');
    }
    const sourcePath = resolveWithinRoot(privateUploadRoot(), sourceKey);
    const safeTargetKey = normalizeUploadKey(targetKey);
    const targetPath = resolveWithinRoot(privateUploadRoot(), safeTargetKey);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    try {
      await fs.rename(sourcePath, targetPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
      await fs.copyFile(sourcePath, targetPath);
      await fs.rm(sourcePath, { force: true });
    }
    return { key: safeTargetKey };
  }

  async getPublicObject(key: string): Promise<PublicUploadObject> {
    const safeKey = normalizeUploadKey(key);
    try {
      const body = await fs.readFile(resolveWithinRoot(publicUploadRoot(), safeKey));
      ensurePublicObjectSize(body.length);
      return {
        body,
        contentType: publicImageContentType(safeKey),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new UploadObjectNotFoundError();
      }
      throw error;
    }
  }

  async deleteObject(key: string, visibility: ObjectVisibility): Promise<void> {
    const root = visibility === 'private' ? privateUploadRoot() : publicUploadRoot();
    const absolutePath = resolveWithinRoot(root, key);
    await fs.rm(absolutePath, { force: true });
  }

  getPublicUrl(key: string): string {
    const baseUrl = process.env.STORAGE_PUBLIC_BASE_URL ?? '/uploads';
    return `${baseUrl.replace(/\/+$/, '')}/${normalizeUploadKey(key)}`;
  }
}

class ObjectStorageUploadService implements UploadService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly region: string;
  private readonly endpoint?: string;

  constructor(public provider: StorageProviderName) {
    this.bucket = requireEnv('S3_BUCKET');
    this.region = provider === 'r2' ? 'auto' : (process.env.S3_REGION ?? 'auto');
    this.endpoint = process.env.S3_ENDPOINT?.trim() || undefined;
    const accessKeyId = requireRuntimeCredential('S3_ACCESS_KEY_ID');
    const secretAccessKey = requireRuntimeCredential('S3_SECRET_ACCESS_KEY');
    if (provider === 'r2') {
      if (!this.endpoint) throw new UploadStorageUnavailableError();
      const endpoint = new URL(this.endpoint);
      if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password
        || endpoint.port || endpoint.pathname !== '/' || endpoint.search || endpoint.hash
        || !/^[a-z0-9-]+(?:\.(?:eu|fedramp))?\.r2\.cloudflarestorage\.com$/i.test(endpoint.hostname)) {
        // R2 signing uses the S3 API account endpoint, never a public custom
        // domain, r2.dev URL or an endpoint that already includes the bucket.
        throw new UploadStorageUnavailableError();
      }
    }
    this.client = new S3Client({
      region: this.region,
      endpoint: this.endpoint,
      forcePathStyle: provider === 'r2' || Boolean(this.endpoint),
      credentials: {
        accessKeyId,
        secretAccessKey,
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

  async putPrivateObject(input: UploadObjectInput): Promise<PrivateUploadObjectResult> {
    const key = normalizeUploadKey(input.key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: input.body,
        ContentType: input.contentType,
        CacheControl: 'private, no-store, max-age=0',
        ContentDisposition: attachmentContentDisposition(input.downloadName),
      })
    );
    return { key };
  }

  async promotePrivateObject(sourceKey: string, targetKey: string): Promise<PrivateUploadObjectResult> {
    const safeSourceKey = normalizeUploadKey(sourceKey);
    const safeTargetKey = normalizeUploadKey(targetKey);
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: encodeCopySource(this.bucket, safeSourceKey),
        Key: safeTargetKey,
        MetadataDirective: 'COPY',
      })
    );
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: safeSourceKey }));
    } catch (error) {
      try {
        await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: safeTargetKey }));
      } catch {
        // Preserve the original cleanup error; orphan reconciliation can remove either object later.
      }
      throw error;
    }
    return { key: safeTargetKey };
  }

  async createSignedDownloadUrl(
    key: string,
    expiresInSeconds: number,
    downloadName?: string
  ): Promise<string> {
    const safeKey = normalizeUploadKey(key);
    const expiresIn = normalizeSignedUrlExpiry(expiresInSeconds);
    try {
      // Signing itself makes no storage request. Check read permission and the
      // object first so a missing file/denied GetObject is an API error, not an
      // AccessDenied page opened in the user's browser.
      const object = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: safeKey }));
      if ((object.ContentLength ?? 0) > MAX_PRIVATE_DOCUMENT_BYTES) throw new PrivateDocumentTooLargeError();
      return await getSignedUrl(this.client, new GetObjectCommand({
        Bucket: this.bucket,
        Key: safeKey,
        ResponseContentDisposition: attachmentContentDisposition(downloadName),
        ResponseCacheControl: 'private, no-store, max-age=0',
        ResponseContentType: documentContentType(safeKey),
      }), { expiresIn });
    } catch (error) {
      throw privateReadError(error);
    }
  }

  async getPrivateObject(key: string): Promise<PublicUploadObject> {
    const safeKey = normalizeUploadKey(key);
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: safeKey }));
      if (!result.Body) throw new UploadObjectNotFoundError();
      const stream = result.Body as AsyncIterable<Uint8Array> & { destroy?: () => void };
      try {
        if ((result.ContentLength ?? 0) > MAX_PRIVATE_DOCUMENT_BYTES) throw new PrivateDocumentTooLargeError();
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of stream) {
          size += chunk.length;
          if (size > MAX_PRIVATE_DOCUMENT_BYTES) throw new PrivateDocumentTooLargeError();
          chunks.push(Buffer.from(chunk));
        }
        return { body: Buffer.concat(chunks, size), contentType: result.ContentType ?? documentContentType(safeKey) };
      } finally {
        stream.destroy?.();
      }
    } catch (error) {
      throw privateReadError(error);
    }
  }

  async getPublicObject(key: string): Promise<PublicUploadObject> {
    const safeKey = normalizeUploadKey(key);
    try {
      const result = await this.client.send(new GetObjectCommand({
        Bucket: this.bucket,
        Key: safeKey,
      }));
      if (!result.Body) throw new UploadObjectNotFoundError();
      const responseBody = result.Body as typeof result.Body & { destroy?: () => void };
      if (
        result.ContentLength !== undefined
        && result.ContentLength > MAX_PUBLIC_PROFILE_PHOTO_BYTES
      ) {
        responseBody.destroy?.();
        throw new UploadObjectTooLargeError();
      }
      let body: Buffer;
      try {
        body = Buffer.from(await responseBody.transformToByteArray());
        ensurePublicObjectSize(body.length);
      } finally {
        responseBody.destroy?.();
      }
      return {
        body,
        contentType: result.ContentType ?? publicImageContentType(safeKey),
        ...(result.ETag ? { etag: result.ETag } : {}),
      };
    } catch (error) {
      if (isMissingObjectError(error)) throw new UploadObjectNotFoundError();
      throw error;
    }
  }

  async deleteObject(key: string, _visibility: ObjectVisibility): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: normalizeUploadKey(key) }));
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

function requireRuntimeCredential(key: string): string {
  const value = requireEnv(key);
  const issue = credentialReferenceIssue(value);
  if (issue) throw new Error(`${key} ${issue}.`);
  return value;
}

function ensurePublicObjectSize(size: number | undefined): void {
  if (size !== undefined && size > MAX_PUBLIC_PROFILE_PHOTO_BYTES) {
    throw new UploadObjectTooLargeError();
  }
}

function publicImageContentType(key: string): string {
  const extension = path.extname(key).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.webp') return 'image/webp';
  return 'image/jpeg';
}

function isMissingObjectError(error: unknown): boolean {
  if (error instanceof UploadObjectNotFoundError) return true;
  if (!error || typeof error !== 'object') return false;
  const candidate = error as {
    name?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return candidate.name === 'NoSuchKey'
    || candidate.Code === 'NoSuchKey'
    || candidate.$metadata?.httpStatusCode === 404;
}

export function createUploadService(): UploadService {
  const provider = (process.env.STORAGE_PROVIDER ?? 'local') as StorageProviderName;
  if (provider === 'local') return new LocalUploadService();
  if (provider === 's3' || provider === 'r2') return new ObjectStorageUploadService(provider);
  throw new Error(`Unsupported STORAGE_PROVIDER: ${provider}`);
}

/**
 * Delete a stored object through the configured provider. Object deletion is
 * idempotent for the supported providers, so this is safe to retry from the
 * transactional outbox worker after a process or provider failure.
 */
export async function deleteStoredObject(
  key: string,
  visibility: ObjectVisibility,
): Promise<void> {
  await createUploadService().deleteObject(key, visibility);
}

export function resolveLocalPrivateDownloadToken(token: string): string | null {
  return resolveLocalPrivateDownload(token)?.filePath ?? null;
}

export function resolveLocalPrivateDownload(
  token: string
): { filePath: string; downloadName: string } | null {
  if ((process.env.STORAGE_PROVIDER ?? 'local') !== 'local') return null;

  const separator = token.lastIndexOf('.');
  if (separator <= 0 || separator === token.length - 1) return null;
  const payload = token.slice(0, separator);
  const suppliedSignature = token.slice(separator + 1);
  const expectedSignature = crypto
    .createHmac('sha256', localDownloadSigningSecret())
    .update(payload)
    .digest('base64url');

  const suppliedBuffer = Buffer.from(suppliedSignature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  if (suppliedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      key?: unknown;
      expires_at?: unknown;
      download_name?: unknown;
    };
    if (
      typeof decoded.key !== 'string' ||
      typeof decoded.expires_at !== 'number' ||
      decoded.expires_at <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return {
      filePath: resolveWithinRoot(privateUploadRoot(), decoded.key),
      downloadName: typeof decoded.download_name === 'string'
        ? safeDownloadName(decoded.download_name)
        : path.basename(decoded.key),
    };
  } catch {
    return null;
  }
}

async function writeLocalObject(root: string, input: UploadObjectInput): Promise<string> {
  const safeKey = normalizeUploadKey(input.key);
  const absolutePath = resolveWithinRoot(root, safeKey);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, input.body);
  return safeKey;
}

function publicUploadRoot(): string {
  return path.resolve(process.env.LOCAL_UPLOAD_DIR ?? 'uploads');
}

function privateUploadRoot(): string {
  return path.resolve(process.env.LOCAL_PRIVATE_UPLOAD_DIR ?? 'private-uploads');
}

function localDownloadSigningSecret(): string {
  const secret =
    process.env.PRIVATE_DOWNLOAD_SIGNING_SECRET ??
    (process.env.NODE_ENV !== 'production' ? process.env.QR_HMAC_SECRET : undefined);
  if (!secret) {
    throw new Error('PRIVATE_DOWNLOAD_SIGNING_SECRET is required for local private download URLs.');
  }
  return secret;
}

function normalizeSignedUrlExpiry(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 900) {
    throw new Error('Private download URL expiry must be between 1 and 900 seconds.');
  }
  return value;
}

function privateReadError(error: unknown): Error {
  if (isMissingObjectError(error)) return new UploadObjectNotFoundError();
  if (error instanceof PrivateDocumentTooLargeError) return error;
  // Do not propagate provider error messages, endpoints or signed request data.
  return new UploadStorageUnavailableError();
}

function documentContentType(key: string): string {
  if (path.extname(key).toLowerCase() === '.pdf') return 'application/pdf';
  return publicImageContentType(key);
}

function rfc3986Encode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function encodeCopySource(bucket: string, key: string): string {
  return `${rfc3986Encode(bucket)}/${key.split('/').map(rfc3986Encode).join('/')}`;
}

function attachmentContentDisposition(downloadName?: string): string {
  if (!downloadName) return 'attachment';
  return `attachment; filename*=UTF-8''${rfc3986Encode(safeDownloadName(downloadName))}`;
}

function safeDownloadName(value: string): string {
  const name = path.basename(value)
    .replace(/[\x00-\x1f\x7f"\\/:<>|?*]+/g, '-')
    .replace(/^\.+/, '')
    .slice(0, 120);
  return name || 'download';
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

function resolveWithinRoot(root: string, key: string): string {
  const safeKey = normalizeUploadKey(key);
  const absolutePath = path.resolve(root, safeKey);
  assertWithinRoot(root, absolutePath);
  return absolutePath;
}
