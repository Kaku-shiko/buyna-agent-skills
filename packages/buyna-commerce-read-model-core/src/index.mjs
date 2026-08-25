import { deepFreeze, fail, isoInstant, requiredText, safeNonNegativeInteger } from './errors.mjs';
import {
  MAX_CANDIDATE_PAGES,
  MAX_CANDIDATE_ROWS,
  MAX_FACT_PAGES,
  MAX_FACT_ROWS,
  READ_PAGE_LIMIT,
  readPaged,
} from './paged-source.mjs';
import {
  normalizePendingRows,
  normalizeSettlementEvents,
  summarizeCommerceFacts,
} from './metrics.mjs';
import { buildTimeBuckets, MAX_DAY_BUCKETS, MAX_MONTH_BUCKETS } from './time-buckets.mjs';

export { buildTimeBuckets, MAX_DAY_BUCKETS, MAX_MONTH_BUCKETS };
export { READ_PAGE_LIMIT, MAX_FACT_ROWS, MAX_FACT_PAGES, MAX_CANDIDATE_ROWS, MAX_CANDIDATE_PAGES };

export const SUPPORTED_CURRENCIES = Object.freeze(['JPY']);
export const COMMERCE_READ_STATUSES = Object.freeze([
  'pending_payment', 'paid', 'partially_refunded', 'refunded', 'cancelled',
]);
export const TREND_INTERVALS = Object.freeze(['day', 'month']);

const ORDERS = Object.freeze({
  pending: 'created_at_asc_order_id_asc',
  settlement: 'event_time_asc_order_id_asc_event_id_asc',
  stock: 'available_asc_product_asc_variant_asc',
  recent: 'created_at_desc_order_id_asc',
});

function compareText(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareDate(left, right) {
  return Date.parse(left) - Date.parse(right);
}

function comparePending(left, right) {
  return compareDate(left.createdAt, right.createdAt)
    || compareText(left.orderId, right.orderId);
}

function compareSettlement(left, right) {
  return compareDate(left.occurredAt, right.occurredAt)
    || compareText(left.orderId, right.orderId)
    || compareText(left.eventId, right.eventId);
}

function compareStock(left, right) {
  return left.availableQuantity - right.availableQuantity
    || compareText(left.productId, right.productId)
    || compareText(left.variantId, right.variantId);
}

function compareRecent(left, right) {
  return compareDate(right.createdAt, left.createdAt)
    || compareText(left.orderId, right.orderId);
}

function method(owner, name) {
  if (typeof owner?.[name] !== 'function') fail('READ_MODEL_SOURCE_REQUIRED');
}

function normalizeCurrency(value) {
  if (typeof value !== 'string' || value.trim().toUpperCase() !== 'JPY') {
    fail('READ_MODEL_CURRENCY_UNSUPPORTED');
  }
  return 'JPY';
}

function outputLimit(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 100) {
    fail('READ_MODEL_LIMIT_INVALID');
  }
  return value;
}

function threshold(value) {
  return safeNonNegativeInteger(value, 'READ_MODEL_LIMIT_INVALID');
}

function validateScope(row, scope) {
  if (row?.projectId !== scope.projectId || row?.sellerId !== scope.sellerId) {
    fail('READ_MODEL_SCOPE_MISMATCH');
  }
}

function normalizeStock(rows, scope, limit, stockThreshold) {
  return rows.map((row) => {
    validateScope(row, scope);
    const availableQuantity = safeNonNegativeInteger(row.availableQuantity);
    const reservedQuantity = safeNonNegativeInteger(row.reservedQuantity);
    return {
      productId: requiredText(row.productId),
      variantId: requiredText(row.variantId),
      availableQuantity,
      reservedQuantity,
      updatedAt: isoInstant(row.updatedAt),
    };
  }).filter((row) => row.availableQuantity <= stockThreshold).slice(0, limit);
}

function normalizeRecent(rows, scope, currency, limit) {
  return rows.map((row) => {
    validateScope(row, scope);
    if (!COMMERCE_READ_STATUSES.includes(row.status)) fail('READ_MODEL_FACT_INVALID');
    if (row.currency !== currency) fail('READ_MODEL_CURRENCY_UNSUPPORTED');
    const payableAmount = safeNonNegativeInteger(row.payableAmount, 'READ_MODEL_MONEY_INVALID');
    const capturedAmount = safeNonNegativeInteger(row.capturedAmount, 'READ_MODEL_MONEY_INVALID');
    const refundedAmount = safeNonNegativeInteger(row.refundedAmount, 'READ_MODEL_MONEY_INVALID');
    if (refundedAmount > capturedAmount || capturedAmount > payableAmount) {
      fail('READ_MODEL_FACT_INVALID');
    }
    if (row.status === 'pending_payment' && (capturedAmount !== 0 || refundedAmount !== 0)) {
      fail('READ_MODEL_FACT_INVALID');
    }
    return {
      orderId: requiredText(row.orderId),
      status: row.status,
      payableAmount,
      capturedAmount,
      refundedAmount,
      netPaidAmount: capturedAmount - refundedAmount,
      currency,
      createdAt: isoInstant(row.createdAt),
    };
  }).slice(0, limit);
}

function buildTrends(buckets, events) {
  return buckets.map((bucket) => {
    const included = events.filter((event) => (
      event.occurredAt >= bucket.startUtc && event.occurredAt < bucket.endUtc
    ));
    return { ...bucket, ...summarizeCommerceFacts({ pendingRows: [], settlementEvents: included }) };
  }).map(({ pendingOrders, pendingAmount, ...trend }) => trend);
}

export function createCommerceReadModel({ projectId, sellerId, source, clock } = {}) {
  const scope = deepFreeze({
    projectId: requiredText(projectId, 'READ_MODEL_SCOPE_REQUIRED'),
    sellerId: requiredText(sellerId, 'READ_MODEL_SCOPE_REQUIRED'),
  });
  for (const name of [
    'listCurrentPendingPage', 'listSettlementFactPage',
    'listLowStockCandidatePage', 'listRecentOrderCandidatePage',
  ]) method(source, name);
  const now = typeof clock === 'function' ? clock : () => new Date();

  async function getOverview(input = {}) {
    const currency = normalizeCurrency(input.currency === undefined ? 'JPY' : input.currency);
    const interval = input.interval ?? 'day';
    const lowStockThreshold = threshold(input.lowStockThreshold ?? 5);
    const lowStockLimit = outputLimit(input.lowStockLimit ?? 10);
    const recentOrderLimit = outputLimit(input.recentOrderLimit ?? 10);
    const asOf = isoInstant(now(), 'READ_MODEL_CLOCK_INVALID');
    const buckets = buildTimeBuckets({
      from: input.from, to: input.to, timeZone: input.timeZone, interval,
    });
    const from = new Date(Date.parse(input.from)).toISOString();
    const to = new Date(Date.parse(input.to)).toISOString();
    const pageRequest = { scope, limit: READ_PAGE_LIMIT };
    const pendingRows = normalizePendingRows(await readPaged({
      maxRows: MAX_FACT_ROWS,
      maxPages: MAX_FACT_PAGES,
      load: (cursor) => source.listCurrentPendingPage({
        ...pageRequest, currency, asOf, cursor, order: ORDERS.pending,
      }),
      compare: comparePending,
    }), scope, currency);
    const settlementEvents = normalizeSettlementEvents(await readPaged({
      maxRows: MAX_FACT_ROWS - pendingRows.length,
      maxPages: MAX_FACT_PAGES,
      load: (cursor) => source.listSettlementFactPage({
        ...pageRequest, currency, from, to, cursor, order: ORDERS.settlement,
      }),
      compare: compareSettlement,
    }), scope, currency);
    for (const event of settlementEvents) {
      if (event.occurredAt < from || event.occurredAt >= to) fail('READ_MODEL_FACT_INVALID');
    }
    const stockRows = await readPaged({
      maxRows: MAX_CANDIDATE_ROWS,
      maxPages: MAX_CANDIDATE_PAGES,
      load: (cursor) => source.listLowStockCandidatePage({
        ...pageRequest, threshold: lowStockThreshold, cursor, order: ORDERS.stock,
      }),
      compare: compareStock,
    });
    const recentRows = await readPaged({
      maxRows: MAX_CANDIDATE_ROWS,
      maxPages: MAX_CANDIDATE_PAGES,
      load: (cursor) => source.listRecentOrderCandidatePage({
        ...pageRequest, cursor, order: ORDERS.recent,
      }),
      compare: compareRecent,
    });
    return deepFreeze({
      scope,
      window: { from, to, asOf, timeZone: input.timeZone, interval },
      currency,
      metrics: summarizeCommerceFacts({ pendingRows, settlementEvents }),
      trends: buildTrends(buckets, settlementEvents),
      lowStock: normalizeStock(stockRows, scope, lowStockLimit, lowStockThreshold),
      recentOrders: normalizeRecent(recentRows, scope, currency, recentOrderLimit),
    });
  }
  return Object.freeze({ getOverview });
}
