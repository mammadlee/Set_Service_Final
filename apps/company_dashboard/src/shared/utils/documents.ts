import { API_BASE_URL } from '../api/config';

export interface DisplayDocument {
  type: 'health_certificate';
  name?: string;
  status: string;
  canDownload: boolean;
}

export function normalizeDocuments(value: unknown): DisplayDocument[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    // Company access is intentionally limited; the backend additionally checks
    // the assignment relationship and the document's company-visible consent.
    if (record.type !== 'health_certificate' || record.company_visible !== true) return [];
    if (record.deleted_at || record.status === 'deleted' || record.status === 'rejected') return [];
    return [{
      type: 'health_certificate',
      name: typeof record.name === 'string' ? record.name : undefined,
      status: typeof record.status === 'string' ? record.status : 'legacy',
      canDownload: record.available === true || (record.available === undefined && record.status === 'ready' && record.scan_status === 'clean'),
    }];
  });
}

export function documentStatusLabel(document: DisplayDocument): string {
  if (document.status === 'legacy' && document.canDownload) return 'Açılarkən təhlükəsizlik yoxlaması aparılır';
  if (document.canDownload) return 'Yoxlamadan keçib';
  if (document.status === 'pending' || document.status === 'quarantined') return 'Təhlükəsizlik yoxlaması gözlənilir';
  return 'İşçi sənədi yenidən yükləməlidir';
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

// Open the tab synchronously for Safari, but fetch a fresh authorized URL on
// every click. Never navigate to or retain the legacy document.url metadata.
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

export function resolveAssetUrl(value: string): string {
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  const apiRoot = API_BASE_URL.replace(/\/v1$/, '');
  return `${apiRoot}${value.startsWith('/') ? '' : '/'}${value}`;
}
