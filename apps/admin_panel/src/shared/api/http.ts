import { API_BASE_URL } from './config';
import { isAccessTokenExpired, isAccessTokenPayload, readAccessTokenPayload } from './jwt';
import { tokenStore } from './tokenStore';
import type { ApiError, ApiErrorBody, AuthUser, TokenResponse } from './types';
import { isAdminRole } from '../auth/permissions';
import { apiErrorMessage, appStrings } from '../i18n/appStrings';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  auth?: boolean;
  retry?: boolean;
}

let onUnauthorized: (() => void) | undefined;
let refreshPromise: Promise<AuthUser | null> | null = null;

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await send(path, options);

  if (response.status === 401 && options.auth !== false && options.retry !== false) {
    const refreshed = await refreshSession();
    if (refreshed) {
      const retryResponse = await send(path, { ...options, retry: false });
      return parseResponse<T>(retryResponse);
    }

    tokenStore.clear();
    onUnauthorized?.();
  }

  return parseResponse<T>(response);
}

async function send(path: string, options: RequestOptions) {
  const url = new URL(`${API_BASE_URL}${path}`);
  Object.entries(options.query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  const headers = new Headers({ accept: 'application/json' });
  if (options.body !== undefined) headers.set('content-type', 'application/json');

  const token = tokenStore.getAccessToken();
  if (options.auth !== false && token) headers.set('authorization', `Bearer ${token}`);

  return fetch(url, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: 'no-store',
    credentials: 'include',
    referrerPolicy: 'no-referrer',
  });
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const data = parseJson(text);

  if (!response.ok) {
    const body = (data ?? {}) as Partial<ApiErrorBody>;
    const error = new Error(body.error || `Request failed with HTTP ${response.status}`) as ApiError;
    error.status = response.status;
    error.code = body.code;
    error.details = body.details;
    throw error;
  }

  return data as T;
}

function parseJson(text: string) {
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: appStrings.unexpectedResponse } satisfies ApiErrorBody;
  }
}

export async function refreshSession() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = performRefresh().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

async function performRefresh() {
  try {
    const response = await send('/auth/admin/web-refresh', {
      method: 'POST',
      auth: false,
    });
    const data = await parseResponse<TokenResponse>(response);
    const tokenPayload = readAccessTokenPayload(data.access_token);
    if (
      !isAdminRole(data.user.role) ||
      !isAdminRole(tokenPayload?.role) ||
      !isAccessTokenPayload(tokenPayload) ||
      isAccessTokenExpired(tokenPayload)
    ) {
      tokenStore.clear();
      onUnauthorized?.();
      return null;
    }

    tokenStore.setAccessToken(data.access_token);
    return data.user;
  } catch {
    return null;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof Error && 'status' in error;
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) return apiErrorMessage(error);
  return appStrings.unknownError;
}
