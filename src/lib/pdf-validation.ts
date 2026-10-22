import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { Errors } from './errors';

const MAX_VALIDATION_MS = 10_000;
const MAX_CONCURRENT_VALIDATIONS = 2;
const MAX_QUEUED_VALIDATIONS = 4;
let activeValidations = 0;
const waiting: Array<() => void> = [];

/**
 * A PDF parser can consume excessive CPU on compressed or recursive input.
 * Keep parsing off the API event loop with a deadline and V8 heap/stack limits.
 * The heap limit is not a total RSS/ArrayBuffer limit; retain process/container
 * memory limits and the upload byte limit as additional resource boundaries.
 */
export async function validatePdfContent(
  body: Buffer,
  options: { timeoutMs?: number } = {},
): Promise<void> {
  await acquireValidationSlot();
  try {
    const valid = await runValidationWorker(body, Math.max(1, Math.min(
      MAX_VALIDATION_MS, options.timeoutMs ?? MAX_VALIDATION_MS,
    )));
    if (valid === 'active') {
      throw Errors.unprocessable(
        'Active or embedded PDF content is not allowed.', 'UPLOAD_PDF_ACTIVE_CONTENT'
      );
    }
    if (valid !== 'valid') {
      throw Errors.unprocessable(
        'The uploaded PDF is corrupt, encrypted, or too complex to inspect safely.',
        'UPLOAD_PDF_INVALID'
      );
    }
  } finally {
    const next = waiting.shift();
    if (next) next();
    else activeValidations -= 1;
  }
}

async function acquireValidationSlot(): Promise<void> {
  if (activeValidations < MAX_CONCURRENT_VALIDATIONS) {
    activeValidations += 1;
    return;
  }
  if (waiting.length >= MAX_QUEUED_VALIDATIONS) {
    throw Errors.unavailable(
      'Document validation is temporarily busy. Please try again.',
      'UPLOAD_VALIDATOR_UNAVAILABLE'
    );
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
}

function runValidationWorker(body: Buffer, timeoutMs: number): Promise<'valid' | 'active' | 'invalid'> {
  return new Promise((resolve) => {
    const sourceRuntime = __filename.endsWith('.ts');
    const bytes = Uint8Array.from(body).buffer;
    const worker = new Worker(path.join(__dirname, `pdf-document-validation.${sourceRuntime ? 'ts' : 'js'}`), {
      workerData: { kind: 'private-pdf-validation', bytes },
      transferList: [bytes],
      execArgv: sourceRuntime ? ['-r', require.resolve('ts-node/register/transpile-only')] : [],
      resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 },
      // A third-party parser must not write user-controlled document content or
      // error details to application logs. Only a fixed result leaves the worker.
      stdout: true,
      stderr: true,
    });
    worker.stdout?.resume();
    worker.stderr?.resume();
    let completed = false;
    const finish = (result: 'valid' | 'active' | 'invalid') => {
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      // Wait for termination before releasing the bounded concurrency slot.
      void worker.terminate().then(() => resolve(result), () => resolve('invalid'));
    };
    const timer = setTimeout(() => finish('invalid'), timeoutMs);
    worker.once('message', (result: { valid?: unknown; active?: unknown } | null) => {
      finish(result?.valid === true ? 'valid' : result?.active === true ? 'active' : 'invalid');
    });
    worker.once('error', () => finish('invalid'));
    worker.once('exit', () => finish('invalid'));
  });
}
