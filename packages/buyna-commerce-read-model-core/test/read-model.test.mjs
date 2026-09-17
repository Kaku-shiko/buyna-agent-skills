import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCommerceReadModel,
  buildTimeBuckets,
  SUPPORTED_CURRENCIES,
  COMMERCE_READ_STATUSES,
  TREND_INTERVALS,
  READ_PAGE_LIMIT,
  MAX_FACT_ROWS,
  MAX_FACT_PAGES,
  MAX_CANDIDATE_ROWS,
  MAX_CANDIDATE_PAGES,
  MAX_DAY_BUCKETS,
  MAX_MONTH_BUCKETS,
} from '../src/index.mjs';

const SCOPE = Object.freeze({ projectId: 'project_alpha', sellerId: 'seller_alpha' });
const FROM = '2026-08-01T00:00:00.000Z';
const TO = '2026-08-03T00:00:00.000Z';
const AS_OF = '2026-08-03T01:00:00.000Z';

function pending(overrides = {}) {
  return {
    ...SCOPE,
    orderId: 'pending_1',
    status: 'pending_payment',
    payableAmount: 3000,
    currency: 'JPY',
    createdAt: '2026-08-01T01:00:00.000Z',
    updatedAt: '2026-08-01T01:01:00.000Z',
    ...overrides,
  };
}

function settlement(overrides = {}) {
  return {
    ...SCOPE,
    eventId: 'capture_1',
    orderId: 'paid_1',
    type: 'capture',
    amount: 5000,
    currency: 'JPY',
    occurredAt: '2026-08-01T02:00:00.000Z',
    settlementSource: 'trusted_settlement',
    ...overrides,
  };
}

function stock(overrides = {}) {
  return {
    ...SCOPE,
    productId: 'product_1',
    variantId: 'variant_1',
    availableQuantity: 2,
    reservedQuantity: 1,
    updatedAt: '2026-08-02T00:00:00.000Z',
    ...overrides,
  };
}

function recent(overrides = {}) {
  return {
    ...SCOPE,
    orderId: 'recent_1',
    status: 'paid',
    payableAmount: 5000,
    capturedAmount: 5000,
    refundedAmount: 0,
    currency: 'JPY',
    createdAt: '2026-08-02T05:00:00.000Z',
    ...overrides,
  };
}

function page(items = []) {
  return { items, nextCursor: null };
}

function sourceFixture(overrides = {}) {
  const calls = [];
  const defaults = {
    currentPending: [pending()],
    settlementFacts: [
      settlement(),
      settlement({ eventId: 'capture_2', orderId: 'paid_2', amount: 7000, occurredAt: '2026-08-02T02:00:00.000Z' }),
      settlement({ eventId: 'refund_1', orderId: 'paid_1', type: 'refund', amount: 2000, occurredAt: '2026-08-02T03:00:00.000Z' }),
    ],
    lowStock: [stock()],
    recentOrders: [recent()],
  };
  const data = { ...defaults, ...overrides };
  const source = {
    async listCurrentPendingPage(input) {
      calls.push(['pending', input]);
      return typeof data.currentPending === 'function'
        ? data.currentPending(input)
        : page(data.currentPending);
    },
    async listSettlementFactPage(input) {
      calls.push(['settlement', input]);
      return typeof data.settlementFacts === 'function'
        ? data.settlementFacts(input)
        : page(data.settlementFacts);
    },
    async listLowStockCandidatePage(input) {
      calls.push(['stock', input]);
      return typeof data.lowStock === 'function' ? data.lowStock(input) : page(data.lowStock);
    },
    async listRecentOrderCandidatePage(input) {
      calls.push(['recent', input]);
      return typeof data.recentOrders === 'function'
        ? data.recentOrders(input)
        : page(data.recentOrders);
    },
  };
  return { source, calls };
}

function createFixture(sourceOverrides = {}, modelOverrides = {}) {
  const fixture = sourceFixture(sourceOverrides);
  const model = createCommerceReadModel({
    ...SCOPE,
    source: fixture.source,
    clock: () => AS_OF,
    ...modelOverrides,
  });
  return { ...fixture, model };
}

function overviewInput(overrides = {}) {
  return {
    from: FROM,
    to: TO,
    timeZone: 'UTC',
    ...overrides,
  };
}

async function rejectsCode(promise, code) {
  await assert.rejects(promise, (error) => error.code === code);
}

test('summarizes current pending and trusted in-period settlement facts', async () => {
  const { model } = createFixture();
  const result = await model.getOverview(overviewInput());
  assert.deepEqual(result.metrics, {
    pendingOrders: 1,
    paidOrders: 2,
    refundedOrders: 1,
    pendingAmount: 3000,
    grossAmount: 12000,
    refundAmount: 2000,
    netAmount: 10000,
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.metrics), true);
});

test('requires both server-owned scope identifiers', () => {
  const { source } = sourceFixture();
  for (const [projectId, sellerId] of [['', 'seller'], ['project', '  '], [null, 'seller']]) {
    assert.throws(
      () => createCommerceReadModel({ projectId, sellerId, source }),
      (error) => error.code === 'READ_MODEL_SCOPE_REQUIRED',
    );
  }
});

test('passes one exact immutable server scope to every source method', async () => {
  const { model, calls } = createFixture();
  await model.getOverview(overviewInput());
  assert.deepEqual(calls.map(([kind]) => kind), ['pending', 'settlement', 'stock', 'recent']);
  const scopes = calls.map(([, input]) => input.scope);
  assert.ok(scopes.every((scope) => scope === scopes[0]));
  assert.deepEqual(scopes[0], SCOPE);
  assert.equal(Object.isFrozen(scopes[0]), true);
  assert.deepEqual(Object.keys(calls[0][1]).sort(), ['asOf', 'currency', 'cursor', 'limit', 'order', 'scope']);
  assert.deepEqual(Object.keys(calls[1][1]).sort(), ['currency', 'cursor', 'from', 'limit', 'order', 'scope', 'to']);
  assert.deepEqual(Object.keys(calls[2][1]).sort(), ['cursor', 'limit', 'order', 'scope', 'threshold']);
  assert.deepEqual(Object.keys(calls[3][1]).sort(), ['currency', 'cursor', 'limit', 'order', 'scope']);
});

test('rejects cross-project or cross-seller rows in every source stream', async () => {
  const mutations = [
    { currentPending: [pending({ sellerId: 'seller_other' })] },
    { settlementFacts: [settlement({ projectId: 'project_other' })] },
    { lowStock: [stock({ sellerId: 'seller_other' })] },
    { recentOrders: [recent({ projectId: 'project_other' })] },
  ];
  for (const mutation of mutations) {
    const { model } = createFixture(mutation);
    await rejectsCode(model.getOverview(overviewInput()), 'READ_MODEL_SCOPE_MISMATCH');
  }
});

test('rejects duplicate settlement event IDs and a second capture for one order', async () => {
  {
    const row = settlement();
    const { model } = createFixture({ settlementFacts: [row, { ...row }] });
    await rejectsCode(model.getOverview(overviewInput()), 'READ_MODEL_DUPLICATE_EVENT');
  }
  {
    const { model } = createFixture({ settlementFacts: [
      settlement(),
      settlement({ eventId: 'capture_2', amount: 1, occurredAt: '2026-08-01T03:00:00.000Z' }),
    ] });
    await rejectsCode(model.getOverview(overviewInput()), 'READ_MODEL_DUPLICATE_CAPTURE');
  }
});

test('rejects unsafe, negative, fractional, or mixed-currency source amounts', async () => {
  for (const amount of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, '100']) {
    const { model } = createFixture({ settlementFacts: [settlement({ amount })] });
    await rejectsCode(model.getOverview(overviewInput()), 'READ_MODEL_MONEY_INVALID');
  }
  const { model: pendingModel } = createFixture({ currentPending: [pending({ payableAmount: -1 })] });
  await rejectsCode(pendingModel.getOverview(overviewInput()), 'READ_MODEL_MONEY_INVALID');
  const { model: mixedModel } = createFixture({ settlementFacts: [settlement({ currency: 'USD' })] });
  await rejectsCode(mixedModel.getOverview(overviewInput()), 'READ_MODEL_CURRENCY_UNSUPPORTED');
});

test('rejects invalid pending status and untrusted settlement sources', async () => {
  const { model } = createFixture({ currentPending: [pending({ status: 'paid' })] });
  await rejectsCode(model.getOverview(overviewInput()), 'READ_MODEL_FACT_INVALID');
  for (const settlementSource of [undefined, 'callback', 'trusted']) {
    const { model: untrusted } = createFixture({ settlementFacts: [settlement({ settlementSource })] });
    await rejectsCode(untrusted.getOverview(overviewInput()), 'READ_MODEL_SETTLEMENT_UNTRUSTED');
  }
});

test('normalizes JPY and fails closed for every other currency', async () => {
  const { model } = createFixture();
  assert.equal((await model.getOverview(overviewInput({ currency: ' jpy ' }))).currency, 'JPY');
  for (const currency of ['USD', '', null, '円']) {
    await rejectsCode(model.getOverview(overviewInput({ currency })), 'READ_MODEL_CURRENCY_UNSUPPORTED');
  }
});

test('exports immutable public constants', () => {
  assert.deepEqual(SUPPORTED_CURRENCIES, ['JPY', 'CNY']);
  assert.deepEqual(TREND_INTERVALS, ['day', 'month']);
  assert.equal(READ_PAGE_LIMIT, 200);
  assert.equal(MAX_FACT_ROWS, 10000);
  assert.equal(MAX_FACT_PAGES, 50);
  assert.equal(MAX_CANDIDATE_ROWS, 2000);
  assert.equal(MAX_CANDIDATE_PAGES, 10);
  assert.equal(MAX_DAY_BUCKETS, 93);
  assert.equal(MAX_MONTH_BUCKETS, 36);
  assert.equal(Object.isFrozen(SUPPORTED_CURRENCIES), true);
  assert.equal(Object.isFrozen(COMMERCE_READ_STATUSES), true);
  assert.equal(Object.isFrozen(TREND_INTERVALS), true);
});

test('validates timezone, range, interval, and output limits before reading facts', async () => {
  assert.throws(
    () => buildTimeBuckets({ from: FROM, to: TO, timeZone: 'Not/AZone', interval: 'day' }),
    (error) => error.code === 'READ_MODEL_TIME_ZONE_INVALID',
  );
  for (const range of [
    { from: 'bad', to: TO },
    { from: TO, to: FROM },
    { from: FROM, to: FROM },
  ]) {
    assert.throws(
      () => buildTimeBuckets({ ...range, timeZone: 'UTC', interval: 'day' }),
      (error) => error.code === 'READ_MODEL_RANGE_INVALID',
    );
  }
  assert.throws(
    () => buildTimeBuckets({ from: FROM, to: TO, timeZone: 'UTC', interval: 'week' }),
    (error) => error.code === 'READ_MODEL_INTERVAL_INVALID',
  );
  for (const mutation of [
    { lowStockThreshold: -1 }, { lowStockThreshold: 1.5 },
    { lowStockLimit: 0 }, { lowStockLimit: 101 },
    { recentOrderLimit: 0 }, { recentOrderLimit: 1.5 },
  ]) {
    const { model, calls } = createFixture();
    await rejectsCode(model.getOverview(overviewInput(mutation)), 'READ_MODEL_LIMIT_INVALID');
    assert.equal(calls.length, 0);
  }
});

test('builds exact Tokyo local-day UTC boundaries and includes intersecting buckets', () => {
  const buckets = buildTimeBuckets({
    from: '2026-08-01T14:59:00.000Z',
    to: '2026-08-02T15:01:00.000Z',
    timeZone: 'Asia/Tokyo',
    interval: 'day',
  });
  assert.deepEqual(buckets, [
    { key: '2026-08-01', startUtc: '2026-07-31T15:00:00.000Z', endUtc: '2026-08-01T15:00:00.000Z' },
    { key: '2026-08-02', startUtc: '2026-08-01T15:00:00.000Z', endUtc: '2026-08-02T15:00:00.000Z' },
    { key: '2026-08-03', startUtc: '2026-08-02T15:00:00.000Z', endUtc: '2026-08-03T15:00:00.000Z' },
  ]);
});

test('builds New York DST days without duplicate keys or fixed 24-hour assumptions', () => {
  const buckets = buildTimeBuckets({
    from: '2026-03-07T05:00:00.000Z',
    to: '2026-03-10T04:00:00.000Z',
    timeZone: 'America/New_York',
    interval: 'day',
  });
  assert.deepEqual(buckets, [
    { key: '2026-03-07', startUtc: '2026-03-07T05:00:00.000Z', endUtc: '2026-03-08T05:00:00.000Z' },
    { key: '2026-03-08', startUtc: '2026-03-08T05:00:00.000Z', endUtc: '2026-03-09T04:00:00.000Z' },
    { key: '2026-03-09', startUtc: '2026-03-09T04:00:00.000Z', endUtc: '2026-03-10T04:00:00.000Z' },
  ]);
});

test('uses the first representable instant when local midnight is skipped', () => {
  const cases = [
    {
      timeZone: 'America/Santiago',
      from: '2026-09-06T04:00:00.000Z',
      to: '2026-09-07T03:00:00.000Z',
      expected: { key: '2026-09-06', startUtc: '2026-09-06T04:00:00.000Z', endUtc: '2026-09-07T03:00:00.000Z' },
    },
    {
      timeZone: 'America/Havana',
      from: '2026-03-08T05:00:00.000Z',
      to: '2026-03-09T04:00:00.000Z',
      expected: { key: '2026-03-08', startUtc: '2026-03-08T05:00:00.000Z', endUtc: '2026-03-09T04:00:00.000Z' },
    },
    {
      timeZone: 'Africa/Cairo',
      from: '2026-04-23T22:00:00.000Z',
      to: '2026-04-24T21:00:00.000Z',
      expected: { key: '2026-04-24', startUtc: '2026-04-23T22:00:00.000Z', endUtc: '2026-04-24T21:00:00.000Z' },
    },
  ];
  for (const item of cases) {
    assert.deepEqual(buildTimeBuckets({
      from: item.from,
      to: item.to,
      timeZone: item.timeZone,
      interval: 'day',
    }), [item.expected]);
  }
});

test('omits a completely skipped local calendar date without merging its key', () => {
  assert.deepEqual(buildTimeBuckets({
    from: '2011-12-29T10:00:00.000Z',
    to: '2012-01-01T10:00:00.000Z',
    timeZone: 'Pacific/Apia',
    interval: 'day',
  }), [
    { key: '2011-12-29', startUtc: '2011-12-29T10:00:00.000Z', endUtc: '2011-12-30T10:00:00.000Z' },
    { key: '2011-12-31', startUtc: '2011-12-30T10:00:00.000Z', endUtc: '2011-12-31T10:00:00.000Z' },
    { key: '2012-01-01', startUtc: '2011-12-31T10:00:00.000Z', endUtc: '2012-01-01T10:00:00.000Z' },
  ]);
});

test('builds chronological month buckets at local calendar boundaries', () => {
  assert.deepEqual(buildTimeBuckets({
    from: '2026-01-31T15:00:00.000Z',
    to: '2026-03-01T15:00:00.000Z',
    timeZone: 'Asia/Tokyo',
    interval: 'month',
  }), [
    { key: '2026-02', startUtc: '2026-01-31T15:00:00.000Z', endUtc: '2026-02-28T15:00:00.000Z' },
    { key: '2026-03', startUtc: '2026-02-28T15:00:00.000Z', endUtc: '2026-03-31T15:00:00.000Z' },
  ]);
});

test('zero-fills trends and assigns capture/refund by authoritative occurredAt boundaries', async () => {
  const { model } = createFixture({
    currentPending: [],
    settlementFacts: [
      settlement({ eventId: 'capture_tokyo', orderId: 'paid_tokyo', amount: 5000, occurredAt: '2026-08-01T14:59:59.999Z' }),
      settlement({ eventId: 'refund_old', orderId: 'older_order', type: 'refund', amount: 7000, occurredAt: '2026-08-01T15:00:00.000Z' }),
    ],
  });
  const result = await model.getOverview({
    from: '2026-08-01T14:00:00.000Z',
    to: '2026-08-03T14:00:00.000Z',
    timeZone: 'Asia/Tokyo',
  });
  assert.deepEqual(result.trends.map(({ key, grossAmount, refundAmount, netAmount }) => ({
    key, grossAmount, refundAmount, netAmount,
  })), [
    { key: '2026-08-01', grossAmount: 5000, refundAmount: 0, netAmount: 5000 },
    { key: '2026-08-02', grossAmount: 0, refundAmount: 7000, netAmount: -7000 },
    { key: '2026-08-03', grossAmount: 0, refundAmount: 0, netAmount: 0 },
  ]);
  assert.equal(result.metrics.netAmount, -2000);
});

test('rejects day and month requests beyond local calendar bucket caps', () => {
  assert.throws(
    () => buildTimeBuckets({
      from: '2026-01-01T00:00:00.000Z', to: '2026-04-05T00:00:00.000Z',
      timeZone: 'UTC', interval: 'day',
    }),
    (error) => error.code === 'READ_MODEL_SPAN_EXCEEDED',
  );
  assert.throws(
    () => buildTimeBuckets({
      from: '2023-01-01T00:00:00.000Z', to: '2026-02-01T00:00:00.000Z',
      timeZone: 'UTC', interval: 'month',
    }),
    (error) => error.code === 'READ_MODEL_SPAN_EXCEEDED',
  );
});

function paged(items) {
  return ({ cursor, limit }) => {
    const offset = cursor === null ? 0 : Number(cursor);
    const chunk = items.slice(offset, offset + limit);
    const next = offset + chunk.length;
    return { items: chunk, nextCursor: next < items.length ? String(next) : null };
  };
}

test('validates all candidates before applying stable low-stock and recent limits', async () => {
  const lowStock = [
    stock({ productId: 'a', variantId: 'b', availableQuantity: 1 }),
    stock({ productId: 'a', variantId: 'c', availableQuantity: 1 }),
    stock({ productId: 'z', variantId: 'z', availableQuantity: 2, sellerId: 'seller_other' }),
  ];
  const { model } = createFixture({ lowStock });
  await rejectsCode(
    model.getOverview(overviewInput({ lowStockLimit: 1 })),
    'READ_MODEL_SCOPE_MISMATCH',
  );

  const recentOrders = [
    recent({ orderId: 'a', createdAt: '2026-08-02T06:00:00.000Z' }),
    recent({ orderId: 'b', createdAt: '2026-08-02T05:00:00.000Z' }),
    recent({ orderId: 'c', createdAt: '2026-08-02T04:00:00.000Z', sellerId: 'seller_other' }),
  ];
  const { model: recentModel } = createFixture({ recentOrders });
  await rejectsCode(
    recentModel.getOverview(overviewInput({ recentOrderLimit: 1 })),
    'READ_MODEL_SCOPE_MISMATCH',
  );
});

test('returns already-validated source ordering and derives recent net paid amount', async () => {
  const { model } = createFixture({
    lowStock: [
      stock({ productId: 'a', variantId: 'a', availableQuantity: 1 }),
      stock({ productId: 'a', variantId: 'b', availableQuantity: 1 }),
      stock({ productId: 'b', variantId: 'a', availableQuantity: 2 }),
    ],
    recentOrders: [
      recent({ orderId: 'a', createdAt: '2026-08-02T06:00:00.000Z', refundedAmount: 2000 }),
      recent({ orderId: 'b', createdAt: '2026-08-02T05:00:00.000Z' }),
    ],
  });
  const result = await model.getOverview(overviewInput({ lowStockLimit: 2, recentOrderLimit: 1 }));
  assert.deepEqual(result.lowStock.map((row) => [row.productId, row.variantId]), [['a', 'a'], ['a', 'b']]);
  assert.deepEqual(result.recentOrders.map((row) => [row.orderId, row.netPaidAmount]), [['a', 3000]]);
});

test('rejects a source page over 200 rows, malformed cursor, and cursor loops', async () => {
  {
    const { model } = createFixture({ currentPending: () => page(Array.from({ length: 201 }, (_, index) => pending({ orderId: String(index).padStart(3, '0') }))) });
    await rejectsCode(model.getOverview(overviewInput()), 'READ_MODEL_PAGE_INVALID');
  }
  {
    const { model } = createFixture({ currentPending: () => ({ items: [], nextCursor: '' }) });
    await rejectsCode(model.getOverview(overviewInput()), 'READ_MODEL_PAGE_INVALID');
  }
  {
    const { model } = createFixture({ currentPending: ({ cursor }) => ({ items: [pending()], nextCursor: cursor ?? 'same' }) });
    await rejectsCode(model.getOverview(overviewInput()), 'READ_MODEL_CURSOR_LOOP');
  }
  {
    const { model } = createFixture({ currentPending: () => ({ items: [], nextCursor: 'no-progress' }) });
    await rejectsCode(model.getOverview(overviewInput()), 'READ_MODEL_PAGE_INVALID');
  }
});

test('rejects combined fact rows beyond 10,000 and candidates beyond 2,000', async () => {
  const pendingRows = Array.from({ length: 6000 }, (_, index) => pending({
    orderId: `p_${String(index).padStart(5, '0')}`,
  }));
  const settlementRows = Array.from({ length: 4001 }, (_, index) => settlement({
    eventId: `e_${String(index).padStart(5, '0')}`,
    orderId: `o_${String(index).padStart(5, '0')}`,
    amount: 1,
  }));
  const { model } = createFixture({
    currentPending: paged(pendingRows),
    settlementFacts: paged(settlementRows),
  });
  await rejectsCode(model.getOverview(overviewInput()), 'READ_MODEL_FACT_LIMIT_EXCEEDED');

  const candidates = Array.from({ length: 2001 }, (_, index) => stock({
    productId: `p_${String(index).padStart(5, '0')}`,
    variantId: 'v',
    availableQuantity: 1,
  }));
  const { model: candidateModel } = createFixture({ lowStock: paged(candidates) });
  await rejectsCode(candidateModel.getOverview(overviewInput()), 'READ_MODEL_FACT_LIMIT_EXCEEDED');
});

test('rejects out-of-order rows within and across pages in every stream', async () => {
  const cases = [
    { currentPending: [pending({ orderId: 'b' }), pending({ orderId: 'a' })] },
    { settlementFacts: [
      settlement({ eventId: 'b', orderId: 'b', occurredAt: '2026-08-02T00:00:00.000Z' }),
      settlement({ eventId: 'a', orderId: 'a', occurredAt: '2026-08-01T00:00:00.000Z' }),
    ] },
    { lowStock: [stock({ productId: 'b', availableQuantity: 2 }), stock({ productId: 'a', availableQuantity: 1 })] },
    { recentOrders: [recent({ orderId: 'a', createdAt: '2026-08-01T00:00:00.000Z' }), recent({ orderId: 'b', createdAt: '2026-08-02T00:00:00.000Z' })] },
  ];
  for (const mutation of cases) {
    const { model } = createFixture(mutation);
    await rejectsCode(model.getOverview(overviewInput()), 'READ_MODEL_SOURCE_ORDER_INVALID');
  }

  const { model: crossPageModel } = createFixture({
    currentPending: ({ cursor }) => cursor === null
      ? { items: [pending({ orderId: 'b' })], nextCursor: 'page-2' }
      : { items: [pending({ orderId: 'a' })], nextCursor: null },
  });
  await rejectsCode(
    crossPageModel.getOverview(overviewInput()),
    'READ_MODEL_SOURCE_ORDER_INVALID',
  );
});

test('rejects duplicate current-pending order IDs within and across pages', async () => {
  const duplicate = pending({ orderId: 'same_order' });
  const { model } = createFixture({ currentPending: [duplicate, { ...duplicate }] });
  await rejectsCode(model.getOverview(overviewInput()), 'READ_MODEL_FACT_INVALID');

  const { model: crossPageModel } = createFixture({
    currentPending: ({ cursor }) => cursor === null
      ? { items: [duplicate], nextCursor: 'page-2' }
      : { items: [{ ...duplicate }], nextCursor: null },
  });
  await rejectsCode(crossPageModel.getOverview(overviewInput()), 'READ_MODEL_FACT_INVALID');
});

test('rejects pending snapshot timestamps outside createdAt <= updatedAt <= asOf', async () => {
  for (const row of [
    pending({ createdAt: '2026-08-02T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' }),
    pending({ updatedAt: '2026-08-03T01:00:00.001Z' }),
    pending({ createdAt: '2026-08-03T01:00:00.001Z', updatedAt: '2026-08-03T01:00:00.001Z' }),
  ]) {
    const { model } = createFixture({ currentPending: [row] });
    await rejectsCode(model.getOverview(overviewInput()), 'READ_MODEL_FACT_INVALID');
  }
});

test('accepts from inclusively and rejects an Adapter fact at exclusive to', async () => {
  const { model } = createFixture({
    settlementFacts: [settlement({ occurredAt: FROM })],
  });
  assert.equal((await model.getOverview(overviewInput())).metrics.grossAmount, 5000);

  const { model: atTo } = createFixture({
    settlementFacts: [settlement({ occurredAt: TO })],
  });
  await rejectsCode(atTo.getOverview(overviewInput()), 'READ_MODEL_FACT_INVALID');
});

test('rejects invalid recent-order amount and status facts', async () => {
  for (const row of [
    recent({ capturedAmount: 6000 }),
    recent({ refundedAmount: 6000 }),
    recent({ status: 'pending_payment', capturedAmount: 1 }),
    recent({ status: 'unknown' }),
  ]) {
    const { model } = createFixture({ recentOrders: [row] });
    await rejectsCode(model.getOverview(overviewInput()), 'READ_MODEL_FACT_INVALID');
  }
});


test('CNY minor units and refunds stay isolated from JPY', async () => {
 const data={currentPending:[pending({currency:'CNY',payableAmount:990})],settlementFacts:[settlement({currency:'CNY',amount:9990}),settlement({currency:'CNY',eventId:'refund',type:'refund',amount:1990})],recentOrders:[recent({currency:'CNY'})]};
 const {model,calls}=createFixture(data);
 const result=await model.getOverview(overviewInput({currency:'CNY'}));
 assert.equal(result.currency,'CNY');
 assert.equal(result.metrics.netAmount,8000);
 assert.ok(calls.filter(([type])=>type!=='stock').every(([,input])=>input.currency==='CNY'));
 await rejectsCode(model.getOverview(overviewInput({currency:'JPY'})),'READ_MODEL_CURRENCY_UNSUPPORTED');
});
