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
        async getOrderForSettlement() {
          calls.push('getOrderForSettlement');
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
  assert.deepEqual(calls, ['transaction', 'claim', 'getOrderForSettlement']);
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
  assert.deepEqual(calls, ['transaction', 'claim', 'getOrderForSettlement']);
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

test('rejects malformed event and authoritative order payment amounts', async (t) => {
  const invalidAmounts = [
    ['missing', undefined],
    ['null', null],
    ['string', '1000'],
    ['negative', -1],
    ['fractional', 1.5],
    ['unsafe', Number.MAX_SAFE_INTEGER + 1],
  ];

  for (const [name, amount] of invalidAmounts) {
    await t.test(`event amount ${name}`, async () => {
      const { module, calls } = createHarness({ event: { amount } });
      await assert.rejects(() => module.settle(SCOPE), /PAYMENT_EVENT_AMOUNT_INVALID/);
      assert.equal(calls.includes('payment'), false);
    });
    await t.test(`order amount ${name}`, async () => {
      const { module, calls } = createHarness({ order: { amount } });
      await assert.rejects(() => module.settle(SCOPE), /ORDER_AMOUNT_INVALID/);
      assert.equal(calls.includes('payment'), false);
    });
  }
});

test('rejects malformed event and authoritative order currencies', async (t) => {
  const invalidCurrencies = [
    ['missing', undefined],
    ['null', null],
    ['empty', ''],
    ['lowercase', 'jpy'],
    ['whitespace', ' JPY '],
    ['non-string', 392],
    ['malformed', 'JP¥'],
  ];

  for (const [name, currency] of invalidCurrencies) {
    await t.test(`event currency ${name}`, async () => {
      const { module, calls } = createHarness({ event: { currency } });
      await assert.rejects(() => module.settle(SCOPE), /PAYMENT_EVENT_CURRENCY_INVALID/);
      assert.equal(calls.includes('payment'), false);
    });
    await t.test(`order currency ${name}`, async () => {
      const { module, calls } = createHarness({ order: { currency } });
      await assert.rejects(() => module.settle(SCOPE), /ORDER_CURRENCY_INVALID/);
      assert.equal(calls.includes('payment'), false);
    });
  }
});

test('rejects malformed cumulative and authoritative refund amounts', async (t) => {
  const invalidRefundAmounts = [
    ['missing', undefined],
    ['null', null],
    ['string', '400'],
    ['negative', -1],
    ['fractional', 1.5],
    ['unsafe', Number.MAX_SAFE_INTEGER + 1],
  ];

  for (const [name, amount] of invalidRefundAmounts) {
    await t.test(`event refund amount ${name}`, async () => {
      const { module, calls } = createHarness({
        order: { status: 'paid' },
        event: { status: 'partially_refunded', refundAmount: amount },
      });
      await assert.rejects(() => module.settle(SCOPE), /REFUND_AMOUNT_INVALID/);
      assert.equal(calls.includes('payment'), false);
    });
    await t.test(`stored refunded amount ${name}`, async () => {
      const { module, calls } = createHarness({
        order: { status: 'paid', refundedAmount: amount },
        event: { status: 'partially_refunded', refundAmount: 400 },
      });
      await assert.rejects(() => module.settle(SCOPE), /ORDER_REFUND_AMOUNT_INVALID/);
      assert.equal(calls.includes('payment'), false);
    });
    await t.test(`stored paid amount ${name}`, async () => {
      const { module, calls } = createHarness({
        order: { status: 'paid', paidAmount: amount },
        event: { status: 'partially_refunded', refundAmount: 400 },
      });
      await assert.rejects(() => module.settle(SCOPE), /ORDER_PAID_AMOUNT_INVALID/);
      assert.equal(calls.includes('payment'), false);
    });
  }
});

test('rejects cumulative refunds above the paid amount', async () => {
  const { module, calls } = createHarness({
    order: { status: 'paid' },
    event: { status: 'refunded', refundAmount: 1001 },
  });
  await assert.rejects(() => module.settle(SCOPE), /REFUND_AMOUNT_EXCEEDS_PAID/);
  assert.deepEqual(calls, ['transaction', 'claim', 'getOrderForSettlement']);
});

test('rejects every source outside the provider-owned closed enum', async (t) => {
  const cases = [
    {
      name: 'missing source',
      event: { source: undefined },
    },
    {
      name: 'null source',
      event: { source: null },
    },
    {
      name: 'unknown source',
      event: { source: 'provider_webhook' },
    },
    {
      name: 'browser_return source',
      event: { source: 'browser_return' },
    },
    {
      name: 'browserReturn source',
      event: { source: 'browserReturn' },
    },
    {
      name: 'return_url source',
      event: { source: 'return_url' },
    },
  ];

  for (const entry of cases) {
    await t.test(entry.name, async () => {
      const { module, calls } = createHarness({ event: entry.event });
      await assert.rejects(
        () => module.settle(SCOPE),
        /PROVIDER_EVENT_SOURCE_NOT_ALLOWED/,
      );
      assert.deepEqual(calls, []);
    });
  }
});

test('accepts only normalized notify query and scheduled provider sources', async (t) => {
  for (const source of ['provider_notify', 'provider_query', 'provider_scheduled']) {
    await t.test(source, async () => {
      const { module } = createHarness({ event: { source } });
      assert.equal((await module.settle(SCOPE)).status, 'applied');
    });
  }
});

test('rejects untrusted and identity-less provider events', async (t) => {
  const cases = [
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
        async getOrderForSettlement() {
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
        tx.applyRefundCouponPolicyOnce = async ({
          verified,
          refundDelta,
          cumulativeRefundAmount,
        }) => {
          effects.push({
            name: 'couponRefund',
            transactionId,
            eventId: verified.eventId,
            refundDelta,
            cumulativeRefundAmount,
          });
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

test('configured refund coupon policy runs once without replaying paid coupon redemption', async () => {
  const harness = createEffectHarness({
    events: [
      {
        eventId: 'refund-1',
        status: 'partially_refunded',
        refundAmount: 400,
      },
    ],
    capabilities: { coupon: true, refundCoupon: true },
    order: { status: 'paid' },
  });

  await harness.module.settle(SCOPE);
  assert.deepEqual(await harness.module.settle(SCOPE), {
    status: 'duplicate',
    eventId: 'refund-1',
  });
  assert.deepEqual(
    harness.effects.map(({ name }) => name),
    ['payment', 'order', 'refund', 'couponRefund', 'gmv'],
  );
  assert.deepEqual(
    harness.effects.find(({ name }) => name === 'couponRefund'),
    {
      name: 'couponRefund',
      transactionId: 1,
      eventId: 'refund-1',
      refundDelta: 400,
      cumulativeRefundAmount: 400,
    },
  );
  assert.equal(harness.effects.some(({ name }) => name === 'coupon'), false);
});

test('preflights every selected adapter before claiming or writing settlement state', async (t) => {
  const cases = [
    ['paid claim', 'paid', 'claimEvent', /MISSING_ADAPTER_CLAIMEVENT/],
    [
      'paid locked order read',
      'paid',
      'getOrderForSettlement',
      /MISSING_ADAPTER_GETORDERFORSETTLEMENT/,
    ],
    ['paid payment', 'paid', 'upsertPayment', /MISSING_ADAPTER_UPSERTPAYMENT/],
    ['paid order', 'paid', 'setOrderStatus', /MISSING_ADAPTER_SETORDERSTATUS/],
    ['paid inventory', 'paid', 'applyInventoryOnce', /MISSING_ADAPTER_APPLYINVENTORYONCE/],
    ['paid customer', 'paid', 'upsertPaidCustomer', /MISSING_ADAPTER_UPSERTPAIDCUSTOMER/],
    ['paid GMV', 'paid', 'appendGmvOutbox', /MISSING_ADAPTER_APPENDGMVOUTBOX/],
    ['paid coupon', 'paid', 'applyCouponOnce', /MISSING_ADAPTER_APPLYCOUPONONCE/],
    ['paid cart', 'paid', 'markCartClearOnce', /MISSING_ADAPTER_MARKCARTCLEARONCE/],
    ['refund record', 'refund', 'recordRefund', /MISSING_ADAPTER_RECORDREFUND/],
    ['refund GMV', 'refund', 'appendGmvOutbox', /MISSING_ADAPTER_APPENDGMVOUTBOX/],
    [
      'refund coupon policy',
      'refund',
      'applyRefundCouponPolicyOnce',
      /MISSING_ADAPTER_APPLYREFUNDCOUPONPOLICYONCE/,
    ],
  ];

  for (const [name, transition, missingMethod, expectedError] of cases) {
    await t.test(name, async () => {
      const writes = [];
      const isRefund = transition === 'refund';
      const event = {
        trusted: true,
        source: 'provider_notify',
        eventId: `${transition}-1`,
        provider: 'provider',
        orderId: 'order-1',
        ...SCOPE,
        status: isRefund ? 'partially_refunded' : 'paid',
        amount: 1000,
        currency: 'JPY',
        refundAmount: isRefund ? 400 : 0,
      };
      const order = {
        id: 'order-1',
        ...SCOPE,
        status: isRefund ? 'paid' : 'pending_payment',
        amount: 1000,
        currency: 'JPY',
        refundedAmount: 0,
      };
      const tx = {
        async claimEvent() {
          writes.push('claim');
          return true;
        },
        async getOrderForSettlement() {
          return order;
        },
        async upsertPayment() {
          writes.push('payment');
        },
        async setOrderStatus() {
          writes.push('order');
        },
        async applyInventoryOnce() {
          writes.push('inventory');
        },
        async applyCouponOnce() {
          writes.push('coupon');
        },
        async upsertPaidCustomer() {
          writes.push('customer');
        },
        async recordRefund() {
          writes.push('refund');
        },
        async applyRefundCouponPolicyOnce() {
          writes.push('couponRefund');
        },
        async appendGmvOutbox() {
          writes.push('gmv');
        },
        async markCartClearOnce() {
          writes.push('cart');
        },
      };
      delete tx[missingMethod];
      const module = createSettlementModule({
        provider: { async verify() { return event; } },
        store: { async transaction(run) { return run(tx); } },
        capabilities: isRefund
          ? { refundCoupon: true }
          : { coupon: true, cart: true },
      });

      await assert.rejects(() => module.settle(SCOPE), expectedError);
      assert.deepEqual(writes, []);
    });
  }
});

test('concurrent distinct refunds calculate deltas from serialized authoritative order state', async () => {
  const order = {
    id: 'order-1',
    ...SCOPE,
    status: 'paid',
    amount: 1000,
    currency: 'JPY',
    refundedAmount: 0,
  };
  const events = {
    'refund-1': {
      trusted: true,
      source: 'provider_notify',
      eventId: 'refund-1',
      provider: 'provider',
      orderId: 'order-1',
      ...SCOPE,
      status: 'partially_refunded',
      amount: 1000,
      currency: 'JPY',
      refundAmount: 400,
    },
    'refund-2': {
      trusted: true,
      source: 'provider_notify',
      eventId: 'refund-2',
      provider: 'provider',
      orderId: 'order-1',
      ...SCOPE,
      status: 'partially_refunded',
      amount: 1000,
      currency: 'JPY',
      refundAmount: 700,
    },
  };
  const refundEffects = [];
  const claimed = new Set();
  let staleReadCount = 0;
  let releaseStaleReads;
  const bothStaleReads = new Promise((resolve) => {
    releaseStaleReads = resolve;
  });
  let lockTail = Promise.resolve();
  const provider = {
    async verify(input) {
      return events[input.eventId];
    },
  };
  const store = {
    async transaction(run) {
      let releaseOrderLock;
      let hasOrderLock = false;
      const tx = {
        async claimEvent({ eventId }) {
          if (claimed.has(eventId)) return false;
          claimed.add(eventId);
          return true;
        },
        async getOrder() {
          const staleSnapshot = { ...order };
          staleReadCount += 1;
          if (staleReadCount === 2) releaseStaleReads();
          await bothStaleReads;
          return staleSnapshot;
        },
        async getOrderForSettlement() {
          const previousLock = lockTail;
          lockTail = new Promise((resolve) => {
            releaseOrderLock = resolve;
          });
          await previousLock;
          hasOrderLock = true;
          return order;
        },
        async upsertPayment() {},
        async setOrderStatus({ status }) {
          order.status = status;
        },
        async recordRefund({ verified, refundDelta }) {
          refundEffects.push({ eventId: verified.eventId, refundDelta });
          order.refundedAmount = verified.refundAmount;
        },
        async appendGmvOutbox() {},
      };
      try {
        return await run(tx);
      } finally {
        if (hasOrderLock) releaseOrderLock();
      }
    },
  };
  const module = createSettlementModule({ provider, store });

  await Promise.all([
    module.settle({ ...SCOPE, eventId: 'refund-1' }),
    module.settle({ ...SCOPE, eventId: 'refund-2' }),
  ]);

  assert.deepEqual(
    refundEffects.sort((left, right) => left.eventId.localeCompare(right.eventId)),
    [
      { eventId: 'refund-1', refundDelta: 400 },
      { eventId: 'refund-2', refundDelta: 300 },
    ],
  );
  assert.equal(order.refundedAmount, 700);
});
