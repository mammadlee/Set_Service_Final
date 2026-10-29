const DEFAULT_APP_TIME_ZONE = 'Asia/Baku';
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const formatters = new Map<string, Intl.DateTimeFormat>();

export type DateBoundary = 'start' | 'end';

/**
 * Date inputs from HTML date controls represent a calendar day in the
 * application's configured time zone, not UTC. Full ISO timestamps keep their
 * explicit offset and pass through unchanged for API compatibility.
 */
export function normalizeOptionalDateFilter(value: unknown, boundary: DateBoundary): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!DATE_ONLY_PATTERN.test(trimmed)) return trimmed;
  return zonedDateOnlyBoundary(trimmed, boundary, applicationTimeZone());
}

export function applicationTimeZone(): string {
  return process.env.APP_TIME_ZONE?.trim() || DEFAULT_APP_TIME_ZONE;
}

export function zonedDateOnlyBoundary(
  value: string,
  boundary: DateBoundary,
  timeZone: string,
): Date {
  assertTimeZone(timeZone);
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) return new Date(Number.NaN);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const validation = new Date(Date.UTC(year, month - 1, day));
  if (
    validation.getUTCFullYear() !== year
    || validation.getUTCMonth() !== month - 1
    || validation.getUTCDate() !== day
  ) {
    return new Date(Number.NaN);
  }

  const localTimestamp = Date.UTC(
    year,
    month - 1,
    day,
    boundary === 'end' ? 23 : 0,
    boundary === 'end' ? 59 : 0,
    boundary === 'end' ? 59 : 0,
    boundary === 'end' ? 999 : 0,
  );
  let utcTimestamp = localTimestamp;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const next = localTimestamp - timeZoneOffsetMs(new Date(utcTimestamp), timeZone);
    if (next === utcTimestamp) break;
    utcTimestamp = next;
  }
  return new Date(utcTimestamp);
}

export function assertTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date(0));
  } catch {
    throw new Error(`Invalid APP_TIME_ZONE: ${timeZone}`);
  }
}

function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      calendar: 'iso8601',
      numberingSystem: 'latn',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  const values: Record<string, number> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  const representedAsUtc = Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second,
  );
  const instantAtWholeSecond = Math.floor(instant.getTime() / 1000) * 1000;
  return representedAsUtc - instantAtWholeSecond;
}
