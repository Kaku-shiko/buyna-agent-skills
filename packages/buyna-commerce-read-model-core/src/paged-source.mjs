import { fail } from './errors.mjs';

export const READ_PAGE_LIMIT = 200;
export const MAX_FACT_ROWS = 10000;
export const MAX_FACT_PAGES = 50;
export const MAX_CANDIDATE_ROWS = 2000;
export const MAX_CANDIDATE_PAGES = 10;

export async function readPaged({ load, maxRows, maxPages, compare }) {
  const rows = [];
  let previous;
  let cursor = null;
  const seen = new Set();
  for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
    const page = await load(cursor);
    if (!page || !Array.isArray(page.items) || page.items.length > READ_PAGE_LIMIT) {
      fail('READ_MODEL_PAGE_INVALID');
    }
    if (page.nextCursor !== null
      && (typeof page.nextCursor !== 'string' || page.nextCursor.length === 0)) {
      fail('READ_MODEL_PAGE_INVALID');
    }
    for (const row of page.items) {
      if (previous !== undefined && compare(previous, row) > 0) {
        fail('READ_MODEL_SOURCE_ORDER_INVALID');
      }
      rows.push(row);
      previous = row;
    }
    if (rows.length > maxRows) fail('READ_MODEL_FACT_LIMIT_EXCEEDED');
    if (page.nextCursor === null) return rows;
    if (page.items.length === 0) fail('READ_MODEL_PAGE_INVALID');
    if (page.nextCursor === cursor || seen.has(page.nextCursor)) {
      fail('READ_MODEL_CURSOR_LOOP');
    }
    seen.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  fail('READ_MODEL_FACT_LIMIT_EXCEEDED');
}
