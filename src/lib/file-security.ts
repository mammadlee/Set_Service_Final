import crypto from 'crypto';
import path from 'path';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { Errors } from './errors';

const MIME_EXTENSION_MAP = {
  'image/jpeg': new Set(['.jpg', '.jpeg']),
  'image/png': new Set(['.png']),
  'image/webp': new Set(['.webp']),
  'application/pdf': new Set(['.pdf']),
} as const;

export type SupportedUploadMimeType = keyof typeof MIME_EXTENSION_MAP;

export type InspectedUpload = {
  detectedMimeType: SupportedUploadMimeType;
  extension: string;
  safeOriginalName: string;
  sha256: string;
  sizeBytes: number;
};

export type MalwareScanResult = {
  status: 'clean';
  scanner: string;
  scannedAt: string;
};

export type SanitizedImageUpload = {
  body: Buffer;
  inspection: InspectedUpload;
};

export async function inspectUpload(
  file: Express.Multer.File,
  allowedMimeTypes: ReadonlySet<string>
): Promise<InspectedUpload> {
  if (!Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    throw Errors.badRequest('Upload file is empty.', 'UPLOAD_FILE_EMPTY');
  }
  if (file.size !== file.buffer.length) {
    throw Errors.badRequest('Upload size metadata is invalid.', 'UPLOAD_SIZE_MISMATCH');
  }

  assertNoImmediatelyDangerousPayload(file.buffer);
  const detectedMimeType = detectMimeType(file.buffer);
  if (!detectedMimeType || !allowedMimeTypes.has(detectedMimeType)) {
    throw Errors.unsupportedMediaType(
      'The uploaded file content type is not allowed.',
      'UPLOAD_CONTENT_TYPE_NOT_ALLOWED',
      { allowed: [...allowedMimeTypes] }
    );
  }
  if (file.mimetype !== detectedMimeType) {
    throw Errors.unsupportedMediaType(
      'The declared MIME type does not match the uploaded file.',
      'UPLOAD_MIME_MISMATCH',
      { declared: file.mimetype, detected: detectedMimeType }
    );
  }

  const originalExtension = path.extname(file.originalname).toLowerCase();
  const allowedExtensions = MIME_EXTENSION_MAP[detectedMimeType];
  if (!originalExtension || !allowedExtensions.has(originalExtension as never)) {
    throw Errors.unsupportedMediaType(
      'The uploaded filename extension does not match the file content.',
      'UPLOAD_EXTENSION_MISMATCH',
      { detected: detectedMimeType, allowed_extensions: [...allowedExtensions] }
    );
  }

  if (detectedMimeType === 'application/pdf') {
    await validatePdf(file.buffer);
  } else {
    await validateImage(file.buffer, detectedMimeType);
  }

  const normalizedExtension = detectedMimeType === 'image/jpeg'
    ? '.jpg'
    : [...allowedExtensions][0];
  return {
    detectedMimeType,
    extension: normalizedExtension,
    safeOriginalName: sanitizeOriginalFileName(file.originalname, normalizedExtension),
    sha256: crypto.createHash('sha256').update(file.buffer).digest('hex'),
    sizeBytes: file.buffer.length,
  };
}

/**
 * Re-encodes public profile images before storage. Sharp strips EXIF/XMP/IPTC
 * metadata unless metadata preservation is explicitly requested, preventing
 * camera/GPS metadata from becoming public with the image.
 */
export async function sanitizePublicImageUpload(
  body: Buffer,
  inspection: InspectedUpload
): Promise<SanitizedImageUpload> {
  if (inspection.detectedMimeType === 'application/pdf') {
    throw Errors.unsupportedMediaType(
      'Only images can be sanitized for public storage.',
      'UPLOAD_CONTENT_TYPE_NOT_ALLOWED'
    );
  }

  try {
    const image = sharp(body, {
      failOn: 'error',
      limitInputPixels: 40_000_000,
      sequentialRead: true,
    }).rotate();

    const sanitizedBody = inspection.detectedMimeType === 'image/jpeg'
      ? await image.jpeg({ quality: 90, progressive: true }).toBuffer()
      : inspection.detectedMimeType === 'image/png'
        ? await image.png({ compressionLevel: 9 }).toBuffer()
        : await image.webp({ quality: 90 }).toBuffer();

    return {
      body: sanitizedBody,
      inspection: {
        ...inspection,
        sha256: crypto.createHash('sha256').update(sanitizedBody).digest('hex'),
        sizeBytes: sanitizedBody.length,
      },
    };
  } catch {
    throw Errors.unprocessable(
      'The uploaded image is corrupt or cannot be sanitized safely.',
      'UPLOAD_IMAGE_INVALID'
    );
  }
}

export async function scanUpload(
  body: Buffer,
  inspection: InspectedUpload,
  options: { sensitive: boolean }
): Promise<MalwareScanResult> {
  const provider = (process.env.MALWARE_SCANNER_PROVIDER ?? 'disabled').trim().toLowerCase();
  const required = parseBoolean(
    process.env.MALWARE_SCAN_REQUIRED,
    process.env.NODE_ENV === 'production' && options.sensitive
  );

  if (provider === 'disabled') {
    if (required) {
      throw Errors.unavailable(
        'Sensitive document scanning is not configured.',
        'MALWARE_SCANNER_UNAVAILABLE'
      );
    }
    return {
      status: 'clean',
      scanner: 'structural-validation-only',
      scannedAt: new Date().toISOString(),
    };
  }
  if (provider !== 'http') {
    throw Errors.unavailable('Malware scanner configuration is invalid.', 'MALWARE_SCANNER_UNAVAILABLE');
  }

  const scannerUrl = process.env.MALWARE_SCANNER_URL?.trim();
  if (!scannerUrl) {
    throw Errors.unavailable('Malware scanner is not configured.', 'MALWARE_SCANNER_UNAVAILABLE');
  }
  const timeoutMs = positiveInteger(process.env.MALWARE_SCANNER_TIMEOUT_MS, 10_000, 1_000, 60_000);
  const attempts = positiveInteger(process.env.MALWARE_SCANNER_MAX_ATTEMPTS, 2, 1, 3);
  let lastFailure: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(scannerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': inspection.detectedMimeType,
          'X-Content-SHA256': inspection.sha256,
          ...(process.env.MALWARE_SCANNER_API_KEY
            ? { Authorization: `Bearer ${process.env.MALWARE_SCANNER_API_KEY}` }
            : {}),
        },
        body,
        signal: controller.signal,
        redirect: 'error',
      });
      if (!response.ok) {
        throw new Error(`scanner_http_${response.status}`);
      }
      const result = await response.json() as { status?: unknown; scanner?: unknown };
      if (result.status === 'infected') {
        throw Errors.unprocessable(
          'The uploaded file did not pass malware scanning.',
          'UPLOAD_MALWARE_DETECTED'
        );
      }
      if (result.status !== 'clean') {
        throw new Error('scanner_invalid_response');
      }
      return {
        status: 'clean',
        scanner: typeof result.scanner === 'string' && result.scanner.trim()
          ? result.scanner.trim().slice(0, 80)
          : 'http-scanner',
        scannedAt: new Date().toISOString(),
      };
    } catch (error) {
      if (isUploadRejection(error)) throw error;
      lastFailure = error;
      if (attempt < attempts) await delay(200 * (2 ** (attempt - 1)));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw Errors.unavailable(
    'The upload scanner is temporarily unavailable.',
    'MALWARE_SCANNER_UNAVAILABLE',
    { reason: safeScannerFailure(lastFailure) }
  );
}

export function sanitizeOriginalFileName(originalName: string, extension: string): string {
  const base = path.basename(originalName)
    .replace(/\.[^.]+$/, '')
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^\.+/, '')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${base || 'upload'}${extension}`;
}

function detectMimeType(body: Buffer): SupportedUploadMimeType | null {
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) {
    return 'image/jpeg';
  }
  if (body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (
    body.length >= 12 &&
    body.subarray(0, 4).toString('ascii') === 'RIFF' &&
    body.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (body.length >= 8 && /^%PDF-1\.[0-7]/.test(body.subarray(0, 8).toString('ascii'))) {
    return 'application/pdf';
  }
  return null;
}

async function validateImage(body: Buffer, expectedMimeType: Exclude<SupportedUploadMimeType, 'application/pdf'>) {
  try {
    const metadata = await sharp(body, {
      failOn: 'error',
      limitInputPixels: 40_000_000,
      sequentialRead: true,
    }).metadata();
    const expectedFormat = expectedMimeType === 'image/jpeg'
      ? 'jpeg'
      : expectedMimeType.split('/')[1];
    if (
      metadata.format !== expectedFormat ||
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > 40_000_000
    ) {
      throw new Error('invalid_image_metadata');
    }
  } catch {
    throw Errors.unprocessable(
      'The uploaded image is corrupt or cannot be decoded safely.',
      'UPLOAD_IMAGE_INVALID'
    );
  }

  if (expectedMimeType === 'image/jpeg') {
    const end = body.lastIndexOf(Buffer.from([0xff, 0xd9]));
    assertNoTrailingPayload(body, end < 0 ? -1 : end + 2);
  } else if (expectedMimeType === 'image/png') {
    const iend = body.lastIndexOf(Buffer.from('IEND', 'ascii'));
    assertNoTrailingPayload(body, iend < 0 ? -1 : iend + 8);
  } else {
    const declaredLength = body.readUInt32LE(4) + 8;
    if (declaredLength !== body.length) {
      throw Errors.unprocessable('The WebP container length is invalid.', 'UPLOAD_IMAGE_INVALID');
    }
  }
}

async function validatePdf(body: Buffer): Promise<void> {
  const eof = body.lastIndexOf(Buffer.from('%%EOF', 'ascii'));
  assertNoTrailingPayload(body, eof < 0 ? -1 : eof + 5);
  const ascii = body.toString('latin1');
  if (/\/(JavaScript|JS|OpenAction|Launch|EmbeddedFile|RichMedia)\b/i.test(ascii)) {
    throw Errors.unprocessable(
      'Active or embedded PDF content is not allowed.',
      'UPLOAD_PDF_ACTIVE_CONTENT'
    );
  }
  try {
    const document = await PDFDocument.load(body, {
      ignoreEncryption: false,
      updateMetadata: false,
      throwOnInvalidObject: true,
    });
    if (document.getPageCount() < 1) throw new Error('empty_pdf');
  } catch {
    throw Errors.unprocessable(
      'The uploaded PDF is corrupt, encrypted, or structurally invalid.',
      'UPLOAD_PDF_INVALID'
    );
  }
}

function assertNoImmediatelyDangerousPayload(body: Buffer): void {
  const prefix = body.subarray(0, Math.min(body.length, 2048));
  if (
    (prefix[0] === 0x4d && prefix[1] === 0x5a) ||
    (prefix[0] === 0x7f && prefix.subarray(1, 4).toString('ascii') === 'ELF') ||
    prefix.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
  ) {
    throw Errors.unsupportedMediaType('Executable or archive uploads are not allowed.', 'UPLOAD_EXECUTABLE_BLOCKED');
  }

  const text = prefix.toString('utf8').replace(/\0/g, '').trimStart().toLowerCase();
  if (
    text.startsWith('<!doctype html') ||
    text.startsWith('<html') ||
    text.startsWith('<svg') ||
    text.startsWith('<?xml') ||
    text.includes('<script')
  ) {
    throw Errors.unsupportedMediaType('HTML, SVG, and script uploads are not allowed.', 'UPLOAD_ACTIVE_CONTENT_BLOCKED');
  }
}

function assertNoTrailingPayload(body: Buffer, contentEnd: number): void {
  if (contentEnd < 1) {
    throw Errors.unprocessable('The uploaded file terminator is missing.', 'UPLOAD_STRUCTURE_INVALID');
  }
  const trailing = body.subarray(contentEnd);
  if (trailing.length > 0 && !/^[\s\0]*$/.test(trailing.toString('latin1'))) {
    throw Errors.unprocessable('Trailing polyglot payload data is not allowed.', 'UPLOAD_POLYGLOT_BLOCKED');
  }
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw Errors.unavailable('Malware scanner configuration is invalid.', 'MALWARE_SCANNER_UNAVAILABLE');
}

function positiveInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function isUploadRejection(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'statusCode' in error && (error as { statusCode: number }).statusCode === 422);
}

function safeScannerFailure(error: unknown): string {
  if (error instanceof Error && error.name === 'AbortError') return 'timeout';
  if (error instanceof Error && /^scanner_[a-z0-9_]+$/i.test(error.message)) return error.message;
  return 'provider_error';
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
