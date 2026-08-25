import { deepFreeze, fail } from './errors.mjs';

export const MAX_DAY_BUCKETS = 93;
export const MAX_MONTH_BUCKETS = 36;

function formatter(timeZone) {
  try {
    return new Intl.DateTimeFormat('en-GB-u-hc-h23', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    fail('READ_MODEL_TIME_ZONE_INVALID');
  }
}

function localParts(format, epoch) {
  const parts = Object.fromEntries(
    format.formatToParts(new Date(epoch))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function pseudoUtc(parts) {
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
  );
}

function localMidnightToUtc(format, calendar) {
  const wanted = { ...calendar, hour: 0, minute: 0, second: 0 };
  const wantedPseudo = pseudoUtc(wanted);
  let candidate = wantedPseudo;
  for (let index = 0; index < 8; index += 1) {
    const actual = localParts(format, candidate);
    const delta = wantedPseudo - pseudoUtc(actual);
    if (delta === 0) return candidate;
    candidate += delta;
  }
  const actual = localParts(format, candidate);
  if (pseudoUtc(actual) !== wantedPseudo) fail('READ_MODEL_TIME_ZONE_INVALID');
  return candidate;
}

function advance(calendar, interval) {
  const cursor = new Date(Date.UTC(calendar.year, calendar.month - 1, calendar.day));
  if (interval === 'day') cursor.setUTCDate(cursor.getUTCDate() + 1);
  else cursor.setUTCMonth(cursor.getUTCMonth() + 1, 1);
  return {
    year: cursor.getUTCFullYear(),
    month: cursor.getUTCMonth() + 1,
    day: cursor.getUTCDate(),
  };
}

function keyFor(calendar, interval) {
  const year = String(calendar.year).padStart(4, '0');
  const month = String(calendar.month).padStart(2, '0');
  if (interval === 'month') return `${year}-${month}`;
  return `${year}-${month}-${String(calendar.day).padStart(2, '0')}`;
}

export function buildTimeBuckets({ from, to, timeZone, interval }) {
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) {
    fail('READ_MODEL_RANGE_INVALID');
  }
  if (interval !== 'day' && interval !== 'month') fail('READ_MODEL_INTERVAL_INVALID');
  if (typeof timeZone !== 'string' || timeZone.trim() === '') {
    fail('READ_MODEL_TIME_ZONE_INVALID');
  }
  const format = formatter(timeZone);
  const buckets = [];
  const localFrom = localParts(format, fromMs);
  let calendar = {
    year: localFrom.year,
    month: localFrom.month,
    day: interval === 'day' ? localFrom.day : 1,
  };
  const cap = interval === 'day' ? MAX_DAY_BUCKETS : MAX_MONTH_BUCKETS;
  while (true) {
    const next = advance(calendar, interval);
    const startMs = localMidnightToUtc(format, calendar);
    const endMs = localMidnightToUtc(format, next);
    if (startMs >= toMs) break;
    if (endMs > fromMs) {
      if (buckets.length >= cap) fail('READ_MODEL_SPAN_EXCEEDED');
      buckets.push({
        key: keyFor(calendar, interval),
        startUtc: new Date(startMs).toISOString(),
        endUtc: new Date(endMs).toISOString(),
      });
    }
    calendar = next;
  }
  return deepFreeze(buckets);
}
