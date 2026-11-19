export class ProviderDeliveryError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'ProviderDeliveryError';
  }
}

interface CircuitState {
  failures: number;
  openedAt?: number;
}

export interface ProviderRequestOptions {
  circuitKey: string;
  idempotencyKey: string;
  timeoutMs?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
  failureThreshold?: number;
  circuitResetMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (delayMs: number) => Promise<void>;
  returnErrorResponse?: boolean;
}

const circuits = new Map<string, CircuitState>();

export async function requestProvider(
  url: string,
  init: RequestInit,
  options: ProviderRequestOptions
): Promise<Response> {
  const state = circuits.get(options.circuitKey) ?? { failures: 0 };
  const now = Date.now();
  const failureThreshold = options.failureThreshold
    ?? intEnv('PROVIDER_CIRCUIT_FAILURE_THRESHOLD', 5);
  const circuitResetMs = options.circuitResetMs
    ?? intEnv('PROVIDER_CIRCUIT_RESET_MS', 60_000);

  if (state.openedAt && now - state.openedAt < circuitResetMs) {
    throw new ProviderDeliveryError('Provider circuit is open.', true);
  }
  if (state.openedAt) {
    state.openedAt = undefined;
    state.failures = 0;
  }

  const maxAttempts = options.maxAttempts ?? intEnv('PROVIDER_HTTP_MAX_ATTEMPTS', 2);
  const timeoutMs = options.timeoutMs ?? intEnv('PROVIDER_HTTP_TIMEOUT_MS', 8_000);
  const baseDelayMs = options.baseDelayMs ?? intEnv('PROVIDER_HTTP_RETRY_BASE_MS', 250);
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? wait;

  let lastError: ProviderDeliveryError | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(
        fetchImpl,
        url,
        withIdempotencyHeader(init, options.idempotencyKey),
        timeoutMs
      );
      if (response.ok) {
        circuits.set(options.circuitKey, { failures: 0 });
        return response;
      }

      if (options.returnErrorResponse) {
        registerFailure(options.circuitKey, state, failureThreshold);
        return response;
      }

      const retryable = isRetryableStatus(response.status);
      lastError = new ProviderDeliveryError(
        `Provider returned HTTP ${response.status}.`,
        retryable,
        response.status
      );
      if (!retryable) {
        registerFailure(options.circuitKey, state, failureThreshold);
        throw lastError;
      }
    } catch (error) {
      if (error instanceof ProviderDeliveryError && !error.retryable) throw error;
      lastError = normalizeProviderError(error);
    }

    if (attempt < maxAttempts) {
      await sleep(Math.min(5_000, baseDelayMs * 2 ** (attempt - 1)));
    }
  }

  registerFailure(options.circuitKey, state, failureThreshold);
  throw lastError ?? new ProviderDeliveryError('Provider request failed.', true);
}

export function isPermanentProviderError(error: unknown): boolean {
  return error instanceof ProviderDeliveryError && !error.retryable;
}

export function resetProviderCircuitState(): void {
  circuits.clear();
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ProviderDeliveryError('Provider request timed out.', true);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function withIdempotencyHeader(init: RequestInit, idempotencyKey: string): RequestInit {
  const headers = new Headers(init.headers);
  headers.set('idempotency-key', idempotencyKey);
  return { ...init, headers };
}

function normalizeProviderError(error: unknown): ProviderDeliveryError {
  if (error instanceof ProviderDeliveryError) return error;
  return new ProviderDeliveryError('Provider network request failed.', true);
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function registerFailure(
  key: string,
  state: CircuitState,
  failureThreshold: number
): void {
  state.failures += 1;
  if (state.failures >= failureThreshold) state.openedAt = Date.now();
  circuits.set(key, state);
}

function intEnv(key: string, fallback: number): number {
  const parsed = Number(process.env[key]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
