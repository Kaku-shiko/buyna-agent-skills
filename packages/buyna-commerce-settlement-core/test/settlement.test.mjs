import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SETTLEMENT_STATUSES,
  SETTLEMENT_TRANSITIONS,
  createSettlementModule,
} from '../src/index.mjs';

const SCOPE = Object.freeze({
  projectId: 'project_alpha',
  sellerId: 'seller_alpha',
});

function createHarness({ event = {}, order = {}, capabilities } = {}) {
  const calls = [];
  const claimed = new Set();
  const verifiedEvent = {
    trusted: true,
    source: 'provider_query',
    eventId: 'event-1',
    provider: 'provider',
    orderId: 'order-1',
    ...SCOPE,
    status: 'paid',
    amount: 1000,
    currency: 'JPY',
    refundAmount: 0,
    ...event,
  };
  const storedOrder = {
    id: 'order-1',
    ...SCOPE,
    status: 'pending_payment',
    amount: 1000,
    currency: 'JPY',
    refundedAmount: 0,
    ...order,
  };
  const provider = {
    async verify() {
      return verifiedEvent;
    },
  };
  const store = {
    async transaction(run) {
      calls.push('transaction');
      return run({
        async claimEvent({ eventId }) {
          calls.push('claim');
          if (claimed.has(eventId)) return false;
          claimed.add(eventId);
          return true;
        },
        async getOrder() {
          calls.push('getOrder');
          return storedOrder;
        },
        async upsertPayment() {
          calls.push('payment');
        },
        async setOrderStatus() {
          calls.push('order');
        },
        async applyInventoryOnce() {
          calls.push('inventory');
        },
        async applyCouponOnce() {
          calls.push('coupon');
        },
        async upsertPaidCustomer() {
          calls.push('customer');
        },
        async recordRefund() {
          calls.push('refund');
        },
        async appendGmvOutbox() {
          calls.push('gmv');
        },
        async markCartClearOnce() {
          calls.push('cart');
        },
      });
    },
  };

  return {
    calls,
    module: createSettlementModule({ provider, store, capabilities }),
  };
}

test('exports immutable settlement status and transition contracts', () => {
  assert.equal(Object.isFrozen(SETTLEMENT_STATUSES), true);
  assert.equal(Object.isFrozen(SETTLEMENT_TRANSITIONS), true);
  for (const transitions of Object.values(SETTLEMENT_TRANSITIONS)) {
    assert.equal(Object.isFrozen(transitions), true);
  }
  assert.throws(
    () => SETTLEMENT_TRANSITIONS.pending_payment.push('refunded'),
    TypeError,
  );
});

test('applies every legal pending-payment terminal transition', async (t) => {
  for (const status of ['paid', 'failed', 'expired', 'cancelled']) {
    await t.test(`pending_payment to ${status}`, async () => {
      const { module } = createHarness({ event: { status } });
      const result = await module.settle(SCOPE);
      assert.deepEqual(result, {
        status: 'applied',
        orderId: 'order-1',
        paymentStatus: status,
        eventId: 'event-1',
      });
    });
  }
});

test('applies legal paid and partial-refund transitions', async (t) => {
  const cases = [
    {
      name: 'paid to partially_refunded',
      order: { status: 'paid', refundedAmount: 0 },
      event: { status: 'partially_refunded', refundAmount: 400 },
    },
    {
      name: 'paid to refunded',
      order: { status: 'paid', refundedAmount: 0 },
      event: { status: 'refunded', refundAmount: 1000 },
    },
    {
      name: 'partially_refunded to partially_refunded',
      order: { status: 'partially_refunded', refundedAmount: 400 },
      event: { status: 'partially_refunded', refundAmount: 700 },
    },
    {
      name: 'partially_refunded to refunded',
      order: { status: 'partially_refunded', refundedAmount: 400 },
      event: { status: 'refunded', refundAmount: 1000 },
    },
  ];

  for (const entry of cases) {
    await t.test(entry.name, async () => {
      const { module } = createHarness(entry);
      const result = await module.settle(SCOPE);
      assert.equal(result.paymentStatus, entry.event.status);
    });
  }
});

test('rejects a paid-to-failed transition before settlement effects', async () => {
  const { module, calls } = createHarness({
    order: { status: 'paid' },
    event: { status: 'failed' },
  });
  await assert.rejects(() => module.settle(SCOPE), /SETTLEMENT_INVALID_TRANSITION/);
  assert.deepEqual(calls, ['transaction', 'claim', 'getOrder']);
});

test('rejects provider and order scope mismatches before settlement effects', async (t) => {
  const cases = [
    {
      name: 'provider project scope',
      event: { projectId: 'project_other' },
    },
    {
      name: 'provider seller scope',
      event: { sellerId: 'seller_other' },
    },
    {
      name: 'stored order project scope',
      order: { projectId: 'project_other' },
    },
    {
      name: 'stored order seller scope',
      order: { sellerId: 'seller_other' },
    },
  ];

  for (const entry of cases) {
    await t.test(entry.name, async () => {
      const { module, calls } = createHarness(entry);
      await assert.rejects(() => module.settle(SCOPE), /MERCHANT_SCOPE_MISMATCH/);
      assert.equal(calls.includes('payment'), false);
      assert.equal(calls.includes('order'), false);
    });
  }
});

test('rejects provider and stored order identity mismatch', async () => {
  const { module, calls } = createHarness({ order: { id: 'order-other' } });
  await assert.rejects(() => module.settle(SCOPE), /ORDER_ID_MISMATCH/);
  assert.deepEqual(calls, ['transaction', 'claim', 'getOrder']);
});

test('rejects amount and currency mismatches before settlement effects', async (t) => {
  const cases = [
    {
      name: 'amount',
      event: { amount: 999 },
      error: /PAYMENT_AMOUNT_MISMATCH/,
    },
    {
      name: 'currency',
      event: { currency: 'CNY' },
      error: /PAYMENT_CURRENCY_MISMATCH/,
    },
  ];

  for (const entry of cases) {
    await t.test(entry.name, async () => {
      const { module, calls } = createHarness({ event: entry.event });
      await assert.rejects(() => module.settle(SCOPE), entry.error);
      assert.equal(calls.includes('payment'), false);
      assert.equal(calls.includes('order'), false);
    });
  }
});

test('rejects cumulative refunds above the paid amount', async () => {
  const { module, calls } = createHarness({
    order: { status: 'paid' },
    event: { status: 'refunded', refundAmount: 1001 },
  });
  await assert.rejects(() => module.settle(SCOPE), /REFUND_AMOUNT_EXCEEDS_PAID/);
  assert.deepEqual(calls, ['transaction', 'claim', 'getOrder']);
});

test('rejects browser-source, untrusted, and identity-less provider events', async (t) => {
  const cases = [
    {
      name: 'browser source',
      event: { source: 'browser_return' },
      error: /PROVIDER_EVENT_NOT_TRUSTED/,
    },
    {
      name: 'untrusted provider result',
      event: { trusted: false },
      error: /PROVIDER_EVENT_NOT_TRUSTED/,
    },
    {
      name: 'missing event ID',
      event: { eventId: '' },
      error: /PROVIDER_EVENT_ID_REQUIRED/,
    },
    {
      name: 'missing provider identity',
      event: { provider: '' },
      error: /PROVIDER_ID_REQUIRED/,
    },
  ];

  for (const entry of cases) {
    await t.test(entry.name, async () => {
      const { module, calls } = createHarness({ event: entry.event });
      await assert.rejects(() => module.settle(SCOPE), entry.error);
      assert.deepEqual(calls, []);
    });
  }
});

function createEffectHarness({
  events,
  capabilities,
  optionalAdapters = true,
  order: orderOverrides = {},
}) {
  const effects = [];
  const claimed = new Set();
  let eventIndex = 0;
  let transactionCount = 0;
  const order = {
    id: 'order-1',
    ...SCOPE,
    status: 'pending_payment',
    amount: 1000,
    currency: 'JPY',
    refundedAmount: 0,
    ...orderOverrides,
  };
  const normalizedEvents = events.map((event) => ({
    trusted: true,
    source: 'provider_notify',
    provider: 'provider',
    orderId: 'order-1',
    ...SCOPE,
    amount: 1000,
    currency: 'JPY',
    refundAmount: 0,
    ...event,
  }));
  const provider = {
    async verify() {
      const event = normalizedEvents[Math.min(eventIndex, normalizedEvents.length - 1)];
      eventIndex += 1;
      return event;
    },
  };
  const store = {
    async transaction(run) {
      transactionCount += 1;
      const transactionId = transactionCount;
      const tx = {
        async claimEvent({ eventId }) {
          if (claimed.has(eventId)) return false;
          claimed.add(eventId);
          return true;
        },
        async getOrder() {
          return order;
        },
        async upsertPayment({ verified }) {
          effects.push({ name: 'payment', transactionId, eventId: verified.eventId });
        },
        async setOrderStatus({ status }) {
          effects.push({ name: 'order', transactionId, status });
          order.status = status;
        },
        async applyInventoryOnce({ eventId }) {
          effects.push({ name: 'inventory', transactionId, eventId });
        },
        async upsertPaidCustomer({ verified }) {
          effects.push({ name: 'customer', transactionId, eventId: verified.eventId });
        },
        async recordRefund({ verified, refundDelta, cumulativeRefundAmount }) {
          effects.push({
            name: 'refund',
            transactionId,
            eventId: verified.eventId,
            refundDelta,
            cumulativeRefundAmount,
          });
          order.refundedAmount = verified.refundAmount;
        },
        async appendGmvOutbox({ verified, refundDelta }) {
          effects.push({
            name: 'gmv',
            transactionId,
            eventId: verified.eventId,
            refundDelta,
          });
        },
      };
      if (optionalAdapters) {
        tx.applyCouponOnce = async ({ eventId }) => {
          effects.push({ name: 'coupon', transactionId, eventId });
        };
        tx.markCartClearOnce = async ({ eventId }) => {
          effects.push({ name: 'cart', transactionId, eventId });
        };
      }
      return run(tx);
    },
  };

  return {
    effects,
    get transactionCount() {
      return transactionCount;
    },
    module: createSettlementModule({ provider, store, capabilities }),
  };
}

test('applies every enabled paid effect once inside one claimed-event transaction', async () => {
  const harness = createEffectHarness({
    events: [{ eventId: 'paid-1', status: 'paid' }],
    capabilities: { coupon: true, cart: true },
  });

  assert.deepEqual(await harness.module.settle(SCOPE), {
    status: 'applied',
    orderId: 'order-1',
    paymentStatus: 'paid',
    eventId: 'paid-1',
  });
  assert.deepEqual(await harness.module.settle(SCOPE), {
    status: 'duplicate',
    eventId: 'paid-1',
  });
  assert.deepEqual(
    harness.effects.map(({ name }) => name),
    ['payment', 'order', 'inventory', 'coupon', 'customer', 'gmv', 'cart'],
  );
  assert.deepEqual(
    [...new Set(harness.effects.map(({ transactionId }) => transactionId))],
    [1],
  );
  assert.equal(harness.transactionCount, 2);
});

test('disabled coupon and cart capabilities require no optional adapters', async () => {
  const harness = createEffectHarness({
    events: [{ eventId: 'paid-1', status: 'paid' }],
    capabilities: { coupon: false, cart: false },
    optionalAdapters: false,
  });

  await harness.module.settle(SCOPE);
  assert.deepEqual(
    harness.effects.map(({ name }) => name),
    ['payment', 'order', 'inventory', 'customer', 'gmv'],
  );
});

test('refund events append only new deltas and never repeat paid effects', async () => {
  const harness = createEffectHarness({
    events: [
      {
        eventId: 'refund-1',
        status: 'partially_refunded',
        refundAmount: 400,
      },
      {
        eventId: 'refund-2',
        status: 'partially_refunded',
        refundAmount: 700,
      },
      {
        eventId: 'refund-3',
        status: 'refunded',
        refundAmount: 1000,
      },
      {
        eventId: 'refund-3',
        status: 'refunded',
        refundAmount: 1000,
      },
    ],
    capabilities: { coupon: true, cart: true },
    order: { status: 'paid' },
  });

  assert.equal((await harness.module.settle(SCOPE)).paymentStatus, 'partially_refunded');
  assert.equal((await harness.module.settle(SCOPE)).paymentStatus, 'partially_refunded');
  assert.equal((await harness.module.settle(SCOPE)).paymentStatus, 'refunded');
  assert.deepEqual(await harness.module.settle(SCOPE), {
    status: 'duplicate',
    eventId: 'refund-3',
  });

  assert.deepEqual(
    harness.effects.map(({ name }) => name),
    [
      'payment', 'order', 'refund', 'gmv',
      'payment', 'order', 'refund', 'gmv',
      'payment', 'order', 'refund', 'gmv',
    ],
  );
  assert.deepEqual(
    harness.effects
      .filter(({ name }) => name === 'refund')
      .map(({ eventId, refundDelta, cumulativeRefundAmount }) => ({
        eventId,
        refundDelta,
        cumulativeRefundAmount,
      })),
    [
      { eventId: 'refund-1', refundDelta: 400, cumulativeRefundAmount: 400 },
      { eventId: 'refund-2', refundDelta: 300, cumulativeRefundAmount: 700 },
      { eventId: 'refund-3', refundDelta: 300, cumulativeRefundAmount: 1000 },
    ],
  );
  assert.deepEqual(
    harness.effects
      .filter(({ name }) => name === 'gmv')
      .map(({ eventId, refundDelta }) => ({ eventId, refundDelta })),
    [
      { eventId: 'refund-1', refundDelta: 400 },
      { eventId: 'refund-2', refundDelta: 300 },
      { eventId: 'refund-3', refundDelta: 300 },
    ],
  );
});
