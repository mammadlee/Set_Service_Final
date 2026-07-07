import { API_BASE_URL } from '../api/config';

export interface DisplayDocument {
  type: string;
  url: string;
  name?: string;
}

export function normalizeDocuments(value: unknown): DisplayDocument[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const type = typeof record.type === 'string' ? record.type : '';
    const url = typeof record.url === 'string' ? record.url : '';
    if (!type || !url) return [];
    return [{
      type,
      url: resolveAssetUrl(url),
      name: typeof record.name === 'string' ? record.name : undefined,
    }];
  });
}

export function resolveAssetUrl(value: string): string {
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  const apiRoot = API_BASE_URL.replace(/\/v1$/, '');
  return `${apiRoot}${value.startsWith('/') ? '' : '/'}${value}`;
}
