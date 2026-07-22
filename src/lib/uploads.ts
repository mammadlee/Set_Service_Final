import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
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

export type ObjectVisibility = 'public' | 'private';

export interface UploadService {
  provider: StorageProviderName;
  putObject(input: UploadObjectInput): Promise<UploadObjectResult>;
  putPrivateObject(input: UploadObjectInput): Promise<PrivateUploadObjectResult>;
  promotePrivateObject(sourceKey: string, targetKey: string): Promise<PrivateUploadObjectResult>;
  createSignedDownloadUrl(key: string, expiresInSeconds: number, downloadName?: string): Promise<string>;
  deleteObject(key: string, visibility: ObjectVisibility): Promise<void>;
  getPublicUrl(key: string): string;
}

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
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;

  constructor(public provider: StorageProviderName) {
    this.bucket = requireEnv('S3_BUCKET');
    this.region = process.env.S3_REGION ?? 'auto';
    this.endpoint = process.env.S3_ENDPOINT?.trim() || undefined;
    this.accessKeyId = requireRuntimeCredential('S3_ACCESS_KEY_ID');
    this.secretAccessKey = requireRuntimeCredential('S3_SECRET_ACCESS_KEY');
    this.client = new S3Client({
      region: this.region,
      endpoint: this.endpoint,
      forcePathStyle: provider === 'r2' || Boolean(this.endpoint),
      credentials: {
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey,
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
    _downloadName?: string
  ): Promise<string> {
    return createS3SignedGetUrl({
      bucket: this.bucket,
      key: normalizeUploadKey(key),
      region: this.region,
      endpoint: this.endpoint,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      expiresInSeconds: normalizeSignedUrlExpiry(expiresInSeconds),
    });
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

function createS3SignedGetUrl(input: {
  bucket: string;
  key: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  expiresInSeconds: number;
}): string {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${input.region}/s3/aws4_request`;
  const endpoint = input.endpoint ? new URL(input.endpoint) : null;
  const requestUrl = endpoint
    ? new URL(endpoint.toString())
    : new URL(`https://${input.bucket}.s3.${input.region}.amazonaws.com`);

  const endpointPath = endpoint?.pathname.replace(/\/$/, '') ?? '';
  const objectPath = encodePath(input.key);
  requestUrl.pathname = endpoint
    ? `${endpointPath}/${rfc3986Encode(input.bucket)}/${objectPath}`
    : `/${objectPath}`;

  const query: Array<[string, string]> = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${input.accessKeyId}/${credentialScope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(input.expiresInSeconds)],
    ['X-Amz-SignedHeaders', 'host'],
  ];
  const canonicalQuery = query
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${rfc3986Encode(key)}=${rfc3986Encode(value)}`)
    .join('&');
  const canonicalHeaders = `host:${requestUrl.host}\n`;
  const canonicalRequest = [
    'GET',
    requestUrl.pathname,
    canonicalQuery,
    canonicalHeaders,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, dateStamp), input.region), 's3'),
    'aws4_request'
  );
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  return `${requestUrl.origin}${requestUrl.pathname}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

function hmac(key: crypto.BinaryLike, value: string): Buffer {
  return crypto.createHmac('sha256', key).update(value).digest();
}

function encodePath(value: string): string {
  return value.split('/').map(rfc3986Encode).join('/');
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
