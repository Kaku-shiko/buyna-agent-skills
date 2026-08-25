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

function exactLocalMidnight(format, calendar) {
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
  if (pseudoUtc(actual) !== wantedPseudo) return null;
  return candidate;
}

function dateKey(calendar) {
  return `${String(calendar.year).padStart(4, '0')}-${String(calendar.month).padStart(2, '0')}-${String(calendar.day).padStart(2, '0')}`;
}

function formattedDateKey(format, epoch) {
  const parts = localParts(format, epoch);
  return dateKey(parts);
}

function firstRepresentableInstant(format, calendar) {
  const exact = exactLocalMidnight(format, calendar);
  if (exact !== null) return exact;

  const target = dateKey(calendar);
  const approximate = Date.UTC(calendar.year, calendar.month - 1, calendar.day);
  const step = 15 * 60 * 1000;
  const searchStart = approximate - (72 * 60 * 60 * 1000);
  const searchEnd = approximate + (72 * 60 * 60 * 1000);
  let previous = searchStart;
  for (let current = searchStart; current <= searchEnd; current += step) {
    if (formattedDateKey(format, current) === target) {
      let low = previous;
      while (formattedDateKey(format, low) === target) low -= step;
      let high = current;
      while (high - low > 1) {
        const middle = low + Math.floor((high - low) / 2);
        if (formattedDateKey(format, middle) === target) high = middle;
        else low = middle;
      }
      return high;
    }
    previous = current;
  }
  return null;
}

function daysInMonth(calendar) {
  return new Date(Date.UTC(calendar.year, calendar.month, 0)).getUTCDate();
}

function periodStart(format, calendar, interval, cache) {
  const cacheKey = `${interval}:${calendar.year}:${calendar.month}:${calendar.day}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  let result = null;
  if (interval === 'day') {
    result = firstRepresentableInstant(format, calendar);
  } else {
    for (let day = 1; day <= daysInMonth(calendar); day += 1) {
      result = firstRepresentableInstant(format, { ...calendar, day });
      if (result !== null) break;
    }
  }
  cache.set(cacheKey, result);
  return result;
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
  const cache = new Map();
  let previous = null;
  let scanned = 0;
  while (true) {
    scanned += 1;
    if (scanned > cap + 400) fail('READ_MODEL_SPAN_EXCEEDED');
    const startMs = periodStart(format, calendar, interval, cache);
    if (startMs !== null) {
      if (previous !== null) {
        if (startMs <= previous.startMs) fail('READ_MODEL_TIME_ZONE_INVALID');
        if (previous.startMs < toMs && startMs > fromMs) {
          if (buckets.length >= cap) fail('READ_MODEL_SPAN_EXCEEDED');
          buckets.push({
            key: previous.key,
            startUtc: new Date(previous.startMs).toISOString(),
            endUtc: new Date(startMs).toISOString(),
          });
        }
      }
      previous = { key: keyFor(calendar, interval), startMs };
      if (startMs >= toMs) break;
    }
    calendar = advance(calendar, interval);
  }
  return deepFreeze(buckets);
}
