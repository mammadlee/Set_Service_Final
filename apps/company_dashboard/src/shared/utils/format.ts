import type { AttendanceLog } from '../api/types';

export function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return new Intl.DateTimeFormat('az-Latn-AZ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatMoney(value?: number | string | null): string {
  if (value === null || value === undefined || value === '') return '-';
  const numeric = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(numeric)) return String(value);
  return new Intl.NumberFormat('az-Latn-AZ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
}

export function formatUnknown(value: unknown): string {
  if (!value) return '-';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return '-';
  }
}

export function shortId(value?: string | null): string {
  return value ? value.slice(0, 8) : '-';
}

export function attendanceStatus(record: AttendanceLog): 'waiting' | 'checked_in' | 'completed' {
  if (record.checkout_time) return 'completed';
  if (record.checkin_time) return 'checked_in';
  return 'waiting';
}
