import { API_BASE_URL } from '../api/config';

export interface DisplayDocument {
  type?: string;
  url?: string;
  name?: string;
}

export function normalizeDocuments(value: unknown): DisplayDocument[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;

    return [{
      type: typeof record.type === 'string' ? record.type : undefined,
      url: typeof record.url === 'string' ? resolveAssetUrl(record.url) : undefined,
      name: typeof record.name === 'string' ? record.name : undefined,
    }];
  });
}

export function resolveAssetUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  const apiRoot = API_BASE_URL.replace(/\/v1$/, '');
  return `${apiRoot}${value.startsWith('/') ? '' : '/'}${value}`;
}
