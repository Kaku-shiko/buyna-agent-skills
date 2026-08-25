import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createSettlementModule,
  SETTLEMENT_STATUSES,
} from '../packages/buyna-commerce-settlement-core/src/index.mjs';
import { createCommerceReadModel } from '../packages/buyna-commerce-read-model-core/src/index.mjs';
import { createDashboardOperation } from '../packages/buyna-merchant-dashboard-core/src/index.mjs';
import {
  createDeliveryStateCore,
  createNotificationSourceEvent,
} from '../packages/buyna-delivery-state-core/src/index.mjs';

const SCOPE = Object.freeze({ projectId: 'project_integration', sellerId: 'seller_integration' });
const OTHER_SCOPE = Object.freeze({ projectId: 'project_integration', sellerId: 'seller_other' });

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function clock(start = '2026-08-26T01:00:00.000Z') {
  let current = new Date(start);
  const now = () => new Date(current);
  now.set = (value) => { current = new Date(value); };
  return now;
}

function page(items, cursor) {
  if (cursor === null) return { items: items.slice(0, 1), nextCursor: items.length > 1 ? 'page-2' : null };
  if (cursor === 'page-2') return { items: items.slice(1), nextCursor: null };
  throw Object.assign(new Error('BAD_CURSOR'), { code: 'BAD_CURSOR' });
}

class DeliveryMemoryStore {
  deliveries = new Map();
  scopeCalls = [];
  writes = [];
  failDeliveredSave = null;
  #tail = Promise.resolve();

  #scope(scope) {
    assert.deepEqual(scope, SCOPE);
    assert.equal(Object.isFrozen(scope), true);
    this.scopeCalls.push(scope);
  }

  async transaction(work) {
    let release;
    const turn = new Promise((resolve) => { release = resolve; });
    const prior = this.#tail;
    this.#tail = turn;
    await prior;
    const tx = {
      getBySourceEventForUpdate: async ({ scope, sourceEventId }) => {
        this.#scope(scope);
        return clone([...this.deliveries.values()].find((row) => row.sourceEventId === sourceEventId));
      },
      createDelivery: async ({ scope, record }) => {
        this.#scope(scope);
        this.deliveries.set(record.deliveryId, clone(record));
        this.writes.push(['create', clone(record)]);
      },
      getDeliveryForUpdate: async ({ scope, deliveryId }) => {
        this.#scope(scope);
        return clone(this.deliveries.get(deliveryId));
      },
      saveDelivery: async ({ scope, expectedVersion, record }) => {
        this.#scope(scope);
        if (this.failDeliveredSave && record.state === 'delivered') {
          const error = this.failDeliveredSave;
          this.failDeliveredSave = null;
          throw error;
        }
        const current = this.deliveries.get(record.deliveryId);
        if (current?.version !== expectedVersion) throw Object.assign(new Error('OCC'), { code: 'STORE_OCC' });
        this.deliveries.set(record.deliveryId, clone(record));
        this.writes.push(['save', clone(record)]);
      },
    };
    try {
      return await work(tx);
    } finally {
      release();
    }
  }

  async getDelivery({ scope, deliveryId }) {
    this.#scope(scope);
    return clone(this.deliveries.get(deliveryId));
  }
}

function deliveryFixture({ now = clock(), store = new DeliveryMemoryStore() } = {}) {
  let deliveryId = 0;
  let attemptId = 0;
  return {
    now,
    store,
    core: createDeliveryStateCore({
      ...SCOPE,
      store,
      clock: now,
      leaseSeconds: 60,
      deliveryIdGenerator: () => `delivery-${++deliveryId}`,
      attemptIdGenerator: () => `attempt-${++attemptId}`,
    }),
  };
}

function notificationSource({ domainEventId = 'paid-event', channel = 'email' } = {}) {
  return createNotificationSourceEvent({
    ...SCOPE,
    domainRecordId: 'order-100',
    domainEventId,
    occurredAt: '2026-08-26T00:30:00.000Z',
    intent: {
      kind: 'order',
      channel,
      templateKey: channel === 'email' ? 'order-paid' : 'order-status',
      locale: 'ja-JP',
      recipientRef: 'customer-100',
      payload: { orderId: 'order-100' },
    },
  });
}

function settlementFixture() {
  const order = {
    id: 'order-100',
    ...SCOPE,
    amount: 10000,
    currency: 'JPY',
    status: SETTLEMENT_STATUSES.PENDING_PAYMENT,
    paidAmount: 0,
    refundedAmount: 0,
  };
  const claimed = new Set();
  const facts = [];
  const committedNotificationEvents = [];
  const providerEvents = new Map([
    ['paid-1', {
      trusted: true, source: 'provider_query', eventId: 'paid-1', provider: 'provider-test',
      orderId: order.id, ...SCOPE, status: SETTLEMENT_STATUSES.PAID,
      amount: 10000, currency: 'JPY', occurredAt: '2026-08-25T15:30:00.000Z',
    }],
    ['refund-1', {
      trusted: true, source: 'provider_query', eventId: 'refund-1', provider: 'provider-test',
      orderId: order.id, ...SCOPE, status: SETTLEMENT_STATUSES.PARTIALLY_REFUNDED,
      amount: 10000, refundAmount: 2000, currency: 'JPY', occurredAt: '2026-08-26T03:00:00.000Z',
    }],
  ]);
  const provider = { verify: async ({ eventId }) => clone(providerEvents.get(eventId)) };
  const store = {
    async transaction(work) {
      const before = clone({ order, claimed: [...claimed], facts, committedNotificationEvents });
      const stagedNotifications = [];
      const tx = {
        claimEvent: async ({ eventId }) => {
          if (claimed.has(eventId)) return false;
          claimed.add(eventId);
          return true;
        },
        getOrderForSettlement: async ({ projectId, sellerId, orderId }) => {
          assert.deepEqual({ projectId, sellerId }, SCOPE);
          return orderId === order.id ? clone(order) : null;
        },
        upsertPayment: async () => {},
        setOrderStatus: async ({ status }) => {
          order.status = status;
          if (status === SETTLEMENT_STATUSES.PAID) {
            order.paidAmount = order.amount;
            stagedNotifications.push(notificationSource());
          }
        },
        applyInventoryOnce: async () => {},
        upsertPaidCustomer: async () => {},
        appendGmvOutbox: async () => {},
        recordRefund: async ({ refundDelta, cumulativeRefundAmount, verified }) => {
          order.refundedAmount = cumulativeRefundAmount;
          facts.push({
            ...SCOPE, eventId: verified.eventId, orderId: order.id, type: 'refund',
            amount: refundDelta, currency: order.currency, occurredAt: verified.occurredAt,
            settlementSource: 'trusted_settlement',
          });
        },
      };
      try {
        const result = await work(tx);
        if (result.status === 'applied' && result.paymentStatus === SETTLEMENT_STATUSES.PAID) {
          facts.push({
            ...SCOPE, eventId: result.eventId, orderId: order.id, type: 'capture',
            amount: order.amount, currency: order.currency,
            occurredAt: providerEvents.get(result.eventId).occurredAt,
            settlementSource: 'trusted_settlement',
          });
        }
        committedNotificationEvents.push(...stagedNotifications);
        return result;
      } catch (error) {
        Object.assign(order, before.order);
        claimed.clear();
        before.claimed.forEach((value) => claimed.add(value));
        facts.splice(0, facts.length, ...before.facts);
        committedNotificationEvents.splice(0, committedNotificationEvents.length, ...before.committedNotificationEvents);
        throw error;
      }
    },
  };
  return {
    order,
    facts,
    committedNotificationEvents,
    settlement: createSettlementModule({ provider, store }),
  };
}

function readModelFixture(settlement, { scope = SCOPE, injectWrongScope = false } = {}) {
  const scopeCalls = [];
  const seen = (received) => {
    assert.equal(Object.isFrozen(received), true);
    scopeCalls.push(received);
  };
  const factRows = injectWrongScope
    ? settlement.facts.map((row) => ({ ...row, sellerId: SCOPE.sellerId }))
    : settlement.facts;
  const recent = [
    {
      ...SCOPE, orderId: 'order-100', status: 'partially_refunded', payableAmount: 10000,
      capturedAmount: 10000, refundedAmount: 2000, currency: 'JPY', createdAt: '2026-08-26T00:30:00.000Z',
    },
    {
      ...SCOPE, orderId: 'order-old', status: 'cancelled', payableAmount: 500,
      capturedAmount: 0, refundedAmount: 0, currency: 'JPY', createdAt: '2026-08-20T00:00:00.000Z',
    },
  ];
  const lowStock = [
    { ...SCOPE, productId: 'product-low', variantId: 'sku-low', availableQuantity: 1, reservedQuantity: 1, updatedAt: '2026-08-26T00:00:00.000Z' },
    { ...SCOPE, productId: 'product-ok', variantId: 'sku-ok', availableQuantity: 9, reservedQuantity: 0, updatedAt: '2026-08-26T00:00:00.000Z' },
  ];
  const source = {
    listCurrentPendingPage: async ({ scope: received, cursor }) => { seen(received); return page([], cursor); },
    listSettlementFactPage: async ({ scope: received, cursor, from, to }) => {
      seen(received);
      return page(factRows.filter((row) => row.occurredAt >= from && row.occurredAt < to), cursor);
    },
    listLowStockCandidatePage: async ({ scope: received, cursor }) => { seen(received); return page(lowStock, cursor); },
    listRecentOrderCandidatePage: async ({ scope: received, cursor }) => { seen(received); return page(recent, cursor); },
  };
  return {
    scopeCalls,
    model: createCommerceReadModel({ ...scope, source, clock: () => new Date('2026-08-27T00:00:00.000Z') }),
  };
}

function overview(model, overrides = {}) {
  return model.getOverview({
    from: '2026-08-25T15:00:00.000Z',
    to: '2026-08-27T15:00:00.000Z',
    timeZone: 'Asia/Tokyo',
    interval: 'day',
    lowStockThreshold: 5,
    ...overrides,
  });
}

test('trusted settlement composes through paged read model, Dashboard state, and crash-safe notification reconciliation', async () => {
  const settlement = settlementFixture();
  assert.deepEqual(await settlement.settlement.settle({ ...SCOPE, eventId: 'paid-1' }), {
    status: 'applied', orderId: 'order-100', paymentStatus: 'paid', eventId: 'paid-1',
  });
  assert.deepEqual(await settlement.settlement.settle({ ...SCOPE, eventId: 'refund-1' }), {
    status: 'applied', orderId: 'order-100', paymentStatus: 'partially_refunded', eventId: 'refund-1',
  });
  assert.equal(settlement.order.refundedAmount, 2000);
  assert.equal(settlement.committedNotificationEvents.length, 1);

  const read = readModelFixture(settlement);
  const first = await overview(read.model);
  assert.deepEqual(first.metrics, {
    pendingOrders: 0, paidOrders: 1, refundedOrders: 1, pendingAmount: 0,
    grossAmount: 10000, refundAmount: 2000, netAmount: 8000,
  });
  assert.deepEqual(first.trends.map(({ key, grossAmount, refundAmount, netAmount }) => ({ key, grossAmount, refundAmount, netAmount })), [
    { key: '2026-08-26', grossAmount: 10000, refundAmount: 2000, netAmount: 8000 },
    { key: '2026-08-27', grossAmount: 0, refundAmount: 0, netAmount: 0 },
  ]);
  assert.deepEqual(first.lowStock.map((row) => row.productId), ['product-low']);
  assert.deepEqual(first.recentOrders.map((row) => row.orderId), ['order-100', 'order-old']);
  assert.ok(read.scopeCalls.every((value) => value.projectId === SCOPE.projectId && value.sellerId === SCOPE.sellerId));

  const dashboard = createDashboardOperation();
  const loading = dashboard.transition('load');
  assert.equal(loading.state, 'loading');
  const ready = dashboard.transition('load_success', { requestId: loading.requestId, data: first });
  assert.equal(ready.state, 'ready');
  assert.deepEqual(ready.data.metrics, first.metrics);

  // The order transaction committed the immutable source event, then the process
  // "crashed" before reconciliation. A fresh delivery core recovers it.
  const delivery = deliveryFixture();
  const sourceEvent = settlement.committedNotificationEvents[0];
  const pending = await delivery.core.reconcileSourceEvent(sourceEvent);
  const replayPending = await delivery.core.reconcileSourceEvent(sourceEvent);
  assert.deepEqual(replayPending, pending);
  const providerReceipts = new Map();
  let externalEffects = 0;
  const adapterScopes = [];
  const adapters = {
    recipients: { resolve: async ({ scope }) => { adapterScopes.push(scope); return { address: 'buyer@example.test' }; } },
    templates: { render: async ({ scope }) => { adapterScopes.push(scope); return { subject: 'paid', text: 'paid' }; } },
    providers: { email: { send: async ({ scope, requestKey }) => {
      adapterScopes.push(scope);
      if (!providerReceipts.has(requestKey)) {
        externalEffects += 1;
        providerReceipts.set(requestKey, { providerMessageId: 'email-1', acceptedAt: '2026-08-26T00:45:00.000Z', providerStatus: 'accepted' });
      }
      return providerReceipts.get(requestKey);
    } } },
  };
  const delivered = await delivery.core.dispatch({ deliveryId: pending.deliveryId, workerId: 'worker-a', ...adapters });
  assert.equal(delivered.state, 'delivered');
  assert.equal(delivered.currentAttempt.attemptId, 'attempt-1');
  assert.equal(externalEffects, 1);
  assert.ok(adapterScopes.every((value) => value.projectId === SCOPE.projectId && value.sellerId === SCOPE.sellerId));
  assert.ok(delivery.store.scopeCalls.every((value) => value.projectId === SCOPE.projectId && value.sellerId === SCOPE.sellerId));
  await assert.rejects(
    delivery.core.dispatch({ deliveryId: pending.deliveryId, workerId: 'worker-replay', ...adapters }),
    (error) => error.code === 'DELIVERY_INVALID_TRANSITION',
  );
  assert.deepEqual(await overview(read.model), first);
  assert.deepEqual(await settlement.settlement.settle({ ...SCOPE, eventId: 'paid-1' }), { status: 'duplicate', eventId: 'paid-1' });
  assert.deepEqual(await settlement.settlement.settle({ ...SCOPE, eventId: 'refund-1' }), { status: 'duplicate', eventId: 'refund-1' });
  assert.equal(externalEffects, 1);
  assert.equal(delivery.store.deliveries.size, 1);
});

test('retry and accepted-provider/store-failure recovery preserve identities without undoing commerce state', async () => {
  const settlement = settlementFixture();
  await settlement.settlement.settle({ ...SCOPE, eventId: 'paid-1' });
  await settlement.settlement.settle({ ...SCOPE, eventId: 'refund-1' });
  const read = readModelFixture(settlement);
  const before = await overview(read.model);

  const retryDelivery = deliveryFixture();
  const smsEvent = notificationSource({ domainEventId: 'sms-event', channel: 'sms' });
  const smsPending = await retryDelivery.core.reconcileSourceEvent(smsEvent);
  let smsCalls = 0;
  const smsRequestKeys = [];
  const retryAdapters = {
    recipients: { resolve: async () => ({ address: '+81000000000' }) },
    templates: { render: async () => ({ text: 'status' }) },
    providers: { sms: { send: async ({ requestKey }) => {
      smsCalls += 1;
      smsRequestKeys.push(requestKey);
      if (smsCalls === 1) throw { code: 'SMS_BUSY', retryable: true };
      return { providerMessageId: `sms:${requestKey}`, acceptedAt: '2026-08-26T01:01:00.000Z' };
    } } },
  };
  const failed = await retryDelivery.core.dispatch({ deliveryId: smsPending.deliveryId, workerId: 'sms-a', ...retryAdapters });
  assert.equal(failed.state, 'failed');
  const firstRequestKey = failed.requestKey;
  retryDelivery.now.set(failed.nextRetryAt);
  const smsDelivered = await retryDelivery.core.dispatch({ deliveryId: smsPending.deliveryId, workerId: 'sms-b', ...retryAdapters });
  assert.equal(smsDelivered.state, 'delivered');
  assert.equal(smsDelivered.attemptCount, 2);
  assert.equal(smsDelivered.attempts[0].attemptId, 'attempt-1');
  assert.equal(smsDelivered.attempts[1].attemptId, 'attempt-2');
  assert.equal(smsDelivered.requestKey, firstRequestKey);
  assert.deepEqual(smsRequestKeys, [firstRequestKey, firstRequestKey]);

  const store = new DeliveryMemoryStore();
  const acceptedDelivery = deliveryFixture({ store });
  const acceptedPending = await acceptedDelivery.core.reconcileSourceEvent(notificationSource({ domainEventId: 'accepted-store-failure' }));
  const exactStoreError = { code: 'PROVIDER_BUSY', retryable: true };
  store.failDeliveredSave = exactStoreError;
  const providerReceipts = new Map();
  let acceptedExternalEffects = 0;
  const acceptedAdapters = {
    recipients: { resolve: async () => ({ address: 'buyer@example.test' }) },
    templates: { render: async () => ({ text: 'paid' }) },
    providers: { email: { send: async ({ requestKey }) => {
      if (!providerReceipts.has(requestKey)) {
        acceptedExternalEffects += 1;
        providerReceipts.set(requestKey, { providerMessageId: 'accepted-once', acceptedAt: '2026-08-26T00:50:00.000Z' });
      }
      return providerReceipts.get(requestKey);
    } } },
  };
  await assert.rejects(
    acceptedDelivery.core.dispatch({ deliveryId: acceptedPending.deliveryId, workerId: 'worker-a', ...acceptedAdapters }),
    (error) => error === exactStoreError,
  );
  const sending = await acceptedDelivery.core.get({ deliveryId: acceptedPending.deliveryId });
  assert.equal(sending.state, 'sending');
  assert.equal(sending.currentAttempt.attemptId, 'attempt-1');
  assert.equal(store.writes.some(([, row]) => row.state === 'failed'), false);
  acceptedDelivery.now.set('2026-08-26T01:01:01.000Z');
  const recovered = await acceptedDelivery.core.dispatch({ deliveryId: acceptedPending.deliveryId, workerId: 'worker-b', ...acceptedAdapters });
  assert.equal(recovered.state, 'delivered');
  assert.equal(recovered.currentAttempt.attemptId, 'attempt-1');
  assert.equal(recovered.requestKey, sending.requestKey);
  assert.equal(acceptedExternalEffects, 1);

  assert.equal(settlement.order.status, 'partially_refunded');
  assert.deepEqual((await overview(read.model)).metrics, before.metrics);
});

test('negative-net refund windows are preserved and cross-seller facts/events fail before effects', async () => {
  const settlement = settlementFixture();
  await settlement.settlement.settle({ ...SCOPE, eventId: 'paid-1' });
  await settlement.settlement.settle({ ...SCOPE, eventId: 'refund-1' });
  const read = readModelFixture(settlement);
  const refundOnly = await overview(read.model, {
    from: '2026-08-26T02:00:00.000Z',
    to: '2026-08-26T04:00:00.000Z',
  });
  assert.equal(refundOnly.metrics.grossAmount, 0);
  assert.equal(refundOnly.metrics.refundAmount, 2000);
  assert.equal(refundOnly.metrics.netAmount, -2000);

  const wrongRead = readModelFixture(settlement, { scope: OTHER_SCOPE, injectWrongScope: true });
  await assert.rejects(overview(wrongRead.model), (error) => error.code === 'READ_MODEL_SCOPE_MISMATCH');

  const otherStore = new DeliveryMemoryStore();
  let effects = 0;
  const otherCore = createDeliveryStateCore({
    ...OTHER_SCOPE,
    store: {
      transaction: async () => { throw new Error('TRANSACTION_MUST_NOT_RUN'); },
      getDelivery: async () => { effects += 1; },
    },
    clock: () => new Date('2026-08-26T01:00:00.000Z'),
    deliveryIdGenerator: () => 'never',
    attemptIdGenerator: () => 'never',
  });
  const firstSellerEvent = notificationSource({ domainEventId: 'cross-seller' });
  await assert.rejects(otherCore.reconcileSourceEvent(firstSellerEvent), (error) => error.code === 'DELIVERY_SCOPE_MISMATCH');
  assert.equal(effects, 0);
  assert.equal(otherStore.deliveries.size, 0);
});
