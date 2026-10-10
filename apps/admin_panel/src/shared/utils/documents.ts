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
      canDownload: record.available === true || (record.available === undefined && record.status === 'ready' && record.scan_status === 'clean'),
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
  if (document.status === 'legacy' && document.canDownload) return 'Açılarkən təhlükəsizlik yoxlaması aparılır';
  if (document.canDownload) return 'Yoxlamadan keçib';
  if (document.status === 'pending' || document.status === 'quarantined') return 'Təhlükəsizlik yoxlaması gözlənilir';
  return 'Yenidən yüklənməlidir';
}

// Reserve the tab during the user's tap (Safari blocks popups after an await).
// Never cache a signed URL: every tap must reauthorize and request a fresh link.
export async function openPrivateDocument(
  loadUrl: () => Promise<string>,
  browser: Pick<Window, 'open' | 'location'> = window,
): Promise<void> {
  const tab = browser.open('about:blank', '_blank');
  try {
    if (tab) {
      tab.opener = null;
      const policy = tab.document.createElement('meta');
      policy.name = 'referrer';
      policy.content = 'no-referrer';
      tab.document.head.append(policy);
    }
    const url = resolveSignedDocumentUrl(await loadUrl());
    if (tab && !tab.closed) tab.location.replace(url);
    else browser.location.assign(url);
  } catch (error) {
    tab?.close();
    throw error;
  }
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
