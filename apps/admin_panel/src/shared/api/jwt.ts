import type { Role } from './types';

interface AccessTokenPayload {
  sub?: string;
  role?: Role;
  exp?: number;
}

export function readAccessTokenPayload(token: string | null): AccessTokenPayload | null {
  if (!token) return null;

  const [, payload] = token.split('.');
  if (!payload) return null;

  try {
    return JSON.parse(decodeBase64Url(payload)) as AccessTokenPayload;
  } catch {
    return null;
  }
}

export function isAccessTokenExpired(payload: AccessTokenPayload | null): boolean {
  if (!payload?.exp) return true;
  return payload.exp <= Math.floor(Date.now() / 1000);
}

function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = window.atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
