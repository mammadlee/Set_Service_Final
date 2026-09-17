import { API_BASE_URL } from '../api/config';

export interface DisplayDocument {
  type: 'health_certificate' | 'criminal_record' | 'cv';
  name?: string;
  status: string;
  canDownload: boolean;
}

export function normalizeDocuments(value: unknown): DisplayDocument[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    if (!isWorkerDocumentType(record.type)) return [];
    if (record.status === 'deleted' || record.status === 'rejected' || record.deleted_at) return [];

    return [{
      type: record.type,
      name: typeof record.name === 'string' ? record.name : undefined,
      status: typeof record.status === 'string' ? record.status : 'legacy',
      canDownload: record.status === 'ready' && record.scan_status === 'clean',
    }];
  });
}

export function isWorkerDocumentType(value: unknown): value is DisplayDocument['type'] {
  return value === 'health_certificate' || value === 'criminal_record' || value === 'cv';
}

export function documentLabel(type: DisplayDocument['type']): string {
  return { health_certificate: 'Sağlamlıq arayışı', criminal_record: 'Məhkumluq arayışı', cv: 'CV' }[type];
}

export function documentStatusLabel(document: DisplayDocument): string {
  if (document.canDownload) return 'Yoxlamadan keçib';
  if (document.status === 'pending' || document.status === 'quarantined') return 'Təhlükəsizlik yoxlaması gözlənilir';
  return 'Yenidən yüklənməlidir';
}

export function resolveSignedDocumentUrl(value: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Sənəd üçün etibarlı keçid alınmadı.');
  const resolved = new URL(value, `${API_BASE_URL.replace(/\/v1$/, '')}/`);
  if (!['http:', 'https:'].includes(resolved.protocol) || resolved.username || resolved.password) {
    throw new Error('Sənəd üçün etibarlı keçid alınmadı.');
  }
  if (new URL(API_BASE_URL).protocol === 'https:' && resolved.protocol !== 'https:') {
    throw new Error('Sənəd üçün təhlükəsiz keçid alınmadı.');
  }
  return resolved.toString();
}

export function resolveAssetUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  const apiRoot = API_BASE_URL.replace(/\/v1$/, '');
  return `${apiRoot}${value.startsWith('/') ? '' : '/'}${value}`;
}
