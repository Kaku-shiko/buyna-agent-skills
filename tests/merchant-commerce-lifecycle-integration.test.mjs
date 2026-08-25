import assert from 'node:assert/strict';
import test from 'node:test';

import { createCheckoutFlow } from '../packages/buyna-checkout-flow-core/src/index.mjs';
import { createSettlementModule } from '../packages/buyna-commerce-settlement-core/src/index.mjs';
import { createCouponModule } from '../packages/buyna-coupon-core/src/index.mjs';
import { createInventoryModule } from '../packages/buyna-inventory-core/src/index.mjs';
import { createDashboardOperation } from '../packages/buyna-merchant-dashboard-core/src/index.mjs';

const SCOPE = Object.freeze({ projectId: 'project_contract', sellerId: 'seller_contract' });
const NOW = '2026-08-26T00:00:00.000Z';

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function createCouponFixture() {
  const coupon = {
    ...SCOPE,
    couponId: 'coupon-1',
    code: 'SAVE10',
    policyVersion: 1,
    state: 'active',
    discount: { type: 'percentage', basisPoints: 1_000 },
    minimumItemQuantity: 1,
    minimumOrderAmount: 0,
    maximumDiscountAmount: null,
    validFrom: null,
    validUntil: null,
    totalUsageLimit: null,
    perCustomerUsageLimit: null,
    redeemedCount: 0,
    reservedCount: 0,
    perCustomerRedemptions: {},
    perCustomerReservations: {},
    createdAt: NOW,
    updatedAt: NOW,
  };
  const reservations = new Map();
  const events = new Map();
  const seenScopes = [];
  const calls = { create: 0, redeem: 0, release: 0 };

  const store = {
    async transaction(work) {
      return work({
        async getCouponForUpdate(query) {
          seenScopes.push({ projectId: query.projectId, sellerId: query.sellerId });
          const reservation = query.reservationId
            ? reservations.get(query.reservationId) ?? null
            : null;
          return clone({ ...coupon, reservation });
        },
        async claimCouponEvent(context) {
          const saved = events.get(context.eventId);
          if (saved) return { claimed: false, event: clone(saved) };
          const event = { ...clone(context), result: null };
          events.set(context.eventId, event);
          return {
            claimed: true,
            async complete(result, metadata = {}) {
              event.result = clone(result);
              event.resultFingerprint = metadata.resultFingerprint;
            },
          };
        },
        async createReservation(record) {
          calls.create += 1;
          reservations.set(record.reservationId, clone(record));
          return clone(record);
        },
        async redeemReservation(record) {
          calls.redeem += 1;
          reservations.set(record.reservationId, clone(record));
          return clone(record);
        },
        async releaseReservation(record) {
          calls.release += 1;
          reservations.set(record.reservationId, clone(record));
          return clone(record);
        },
      });
    },
  };

  return {
    coupons: createCouponModule({ ...SCOPE, store, clock: () => new Date(NOW) }),
    calls,
    reservations,
    seenScopes,
  };
}

function createInventoryFixture() {
  const reservations = new Map();
  const events = new Map();
  const seenScopes = [];
  const calls = { create: 0, commit: 0, release: 0 };

  function complete(eventId, result, fingerprint) {
    const event = events.get(eventId);
    event.result = clone(result);
    event.fingerprint = clone(fingerprint ?? event.fingerprint);
  }

  const store = {
    async transaction(work) {
      return work({
        async claimReservationEvent(input) {
          seenScopes.push(clone(input.scope));
          const saved = events.get(input.eventId);
          if (saved) return { claimed: false, event: clone(saved) };
          const event = { ...clone(input), result: null };
          events.set(input.eventId, event);
          return {
            claimed: true,
            reservation: clone(reservations.get(input.reservationId)),
            async complete(result, fingerprint) {
              complete(input.eventId, result, fingerprint);
            },
          };
        },
        async getStockForUpdate(input) {
          seenScopes.push(clone(input.scope));
          return {
            ...input.scope,
            productId: input.productId,
            skuId: input.skuId,
            onHandQuantity: 10,
            reservedQuantity: 0,
          };
        },
        async createReservation({ reservation, eventId, fingerprint }) {
          calls.create += 1;
          reservations.set(reservation.reservationId, clone(reservation));
          complete(eventId, reservation, fingerprint);
          return clone(reservation);
        },
        async commitReservation({ reservation, eventId, fingerprint }) {
          calls.commit += 1;
          reservations.set(reservation.reservationId, clone(reservation));
          complete(eventId, reservation, fingerprint);
          return clone(reservation);
        },
        async releaseReservation({ reservation, eventId, fingerprint }) {
          calls.release += 1;
          reservations.set(reservation.reservationId, clone(reservation));
          complete(eventId, reservation, fingerprint);
          return clone(reservation);
        },
      });
    },
  };

  return {
    inventory: createInventoryModule({ ...SCOPE, store, clock: () => new Date(NOW) }),
    calls,
    reservations,
    seenScopes,
  };
}

function createReviewState() {
  const records = new Map();
  return {
    async create({ scope, review }) {
      records.set(`${scope.projectId}:${scope.sellerId}:${review.reviewToken}`, clone(review));
      return clone(review);
    },
    async get({ scope, reviewToken }) {
      return clone(records.get(`${scope.projectId}:${scope.sellerId}:${reviewToken}`));
    },
    async update({ scope, reviewToken, expectedState, patch }) {
      const record = records.get(`${scope.projectId}:${scope.sellerId}:${reviewToken}`);
      if (!record || (expectedState && record.state !== expectedState)) return null;
      Object.assign(record, clone(patch));
      return clone(record);
    },
  };
}

async function reserveCommerce() {
  const couponFixture = createCouponFixture();
  const inventoryFixture = createInventoryFixture();
  const couponSnapshot = await couponFixture.coupons.quote({
    couponId: 'coupon-1',
    customerId: 'customer-1',
    order: {
      orderId: 'order-1',
      checkoutSnapshotId: 'checkout-1',
      itemQuantity: 2,
      originalAmount: 2_000,
      currency: 'JPY',
    },
  });
  await couponFixture.coupons.reserve({
    eventId: 'coupon-reserve-1',
    reservationId: 'coupon-reservation-1',
    snapshot: couponSnapshot,
  });
  await inventoryFixture.inventory.reserve({
    eventId: 'inventory-reserve-1',
    reservationId: 'inventory-reservation-1',
    productId: 'product-1',
    skuId: 'sku-1',
    quantity: 2,
  });
  return { couponFixture, inventoryFixture, couponSnapshot };
}

test('coupon payable amount becomes the immutable checkout and provider amount', async () => {
  const { couponSnapshot, couponFixture, inventoryFixture } = await reserveCommerce();
  let lockedSnapshot;
  const flow = createCheckoutFlow({
    ...SCOPE,
    reviewState: createReviewState(),
    cart: {
      async createCheckoutSnapshot(scope) {
        assert.deepEqual(scope, SCOPE);
        return {
          total: couponSnapshot.payableAmount,
          currency: couponSnapshot.currency,
          coupon: couponSnapshot,
        };
      },
    },
    orders: {
      async createPendingOrder(input) {
        assert.equal(Object.isFrozen(input.checkoutSnapshot), true);
        assert.throws(() => { input.checkoutSnapshot.total = 1; }, TypeError);
        lockedSnapshot = clone(input.checkoutSnapshot);
        return { id: 'order-1' };
      },
    },
    submissions: {
      async acquire() { return { status: 'acquired', attemptToken: 'attempt-1' }; },
      async complete() {},
      async release() {},
    },
    policy: { minimumFields: ['name'], paymentMethods: ['card'], supportedCurrencies: ['JPY'] },
  });
  const review = await flow.createReview({ fields: { name: 'Buyer' }, paymentMethod: 'card' });
  const result = await flow.submit({ reviewToken: review.reviewToken });

  assert.equal(couponSnapshot.payableAmount, 1_800);
  assert.equal(lockedSnapshot.total, 1_800);
  assert.deepEqual(lockedSnapshot.coupon, couponSnapshot);
  assert.equal(result.providerRequest.amount, 1_800);
  assert.ok(couponFixture.seenScopes.every((scope) => assert.deepEqual(scope, SCOPE) === undefined));
  assert.ok(inventoryFixture.seenScopes.every((scope) => assert.deepEqual(scope, SCOPE) === undefined));
});

function settlementFixture({ status, couponFixture, inventoryFixture, couponSnapshot }) {
  const claimed = new Set();
  const calls = { inventoryCommit: 0, couponRedeem: 0, inventoryRelease: 0, couponRelease: 0 };
  const order = {
    id: 'order-1',
    ...SCOPE,
    status: 'pending_payment',
    amount: couponSnapshot.payableAmount,
    currency: couponSnapshot.currency,
    inventoryReservationId: 'inventory-reservation-1',
    couponReservationId: 'coupon-reservation-1',
    couponSnapshot,
  };
  const provider = {
    async verify(input) {
      assert.deepEqual({ projectId: input.projectId, sellerId: input.sellerId }, SCOPE);
      return {
        trusted: true,
        source: 'provider_query',
        provider: 'test-provider',
        eventId: `${status}-event-1`,
        orderId: order.id,
        ...SCOPE,
        status,
        amount: order.amount,
        currency: order.currency,
      };
    },
  };
  const store = {
    async transaction(work) {
      return work({
        async claimEvent({ eventId }) {
          if (claimed.has(eventId)) return false;
          claimed.add(eventId);
          return true;
        },
        async getOrderForSettlement(query) {
          assert.deepEqual(query, { ...SCOPE, orderId: order.id });
          return clone(order);
        },
        async upsertPayment() {},
        async setOrderStatus() {},
        async applyInventoryOnce({ eventId }) {
          calls.inventoryCommit += 1;
          return inventoryFixture.inventory.commit({
            eventId: `inventory-${eventId}`,
            reservationId: order.inventoryReservationId,
          });
        },
        async applyCouponOnce({ eventId }) {
          calls.couponRedeem += 1;
          return couponFixture.coupons.redeem({
            eventId: `coupon-${eventId}`,
            reservationId: order.couponReservationId,
            orderSnapshot: order.couponSnapshot,
          });
        },
        async releaseInventoryOnce({ eventId, reason }) {
          calls.inventoryRelease += 1;
          assert.equal(reason, `checkout_${status}`);
          return inventoryFixture.inventory.release({
            eventId: `inventory-${eventId}`,
            reservationId: order.inventoryReservationId,
          });
        },
        async releaseCouponOnce({ eventId, reason }) {
          calls.couponRelease += 1;
          return couponFixture.coupons.release({
            eventId: `coupon-${eventId}`,
            reservationId: order.couponReservationId,
            reason,
          });
        },
        async upsertPaidCustomer() {},
        async appendGmvOutbox() {},
      });
    },
  };
  return {
    calls,
    settlement: createSettlementModule({ provider, store, capabilities: { coupon: true } }),
  };
}

test('trusted settlement commits inventory and redeems coupon exactly once', async () => {
  const commerce = await reserveCommerce();
  const { settlement, calls } = settlementFixture({ status: 'paid', ...commerce });

  assert.equal((await settlement.settle(SCOPE)).status, 'applied');
  assert.equal((await settlement.settle(SCOPE)).status, 'duplicate');
  assert.equal(calls.inventoryCommit, 1);
  assert.equal(calls.couponRedeem, 1);
  assert.equal(commerce.inventoryFixture.reservations.get('inventory-reservation-1').state, 'committed');
  assert.equal(commerce.couponFixture.reservations.get('coupon-reservation-1').state, 'redeemed');
});

for (const status of ['failed', 'expired', 'cancelled']) {
  test(`${status} settlement releases inventory and coupon reservations once`, async () => {
    const commerce = await reserveCommerce();
    const { settlement, calls } = settlementFixture({ status, ...commerce });

    assert.equal((await settlement.settle(SCOPE)).status, 'applied');
    assert.equal((await settlement.settle(SCOPE)).status, 'duplicate');
    assert.equal(calls.inventoryRelease, 1);
    assert.equal(calls.couponRelease, 1);
    assert.equal(commerce.inventoryFixture.reservations.get('inventory-reservation-1').state, 'released');
    assert.equal(commerce.couponFixture.reservations.get('coupon-reservation-1').state, 'released');
  });
}

test('Dashboard rejects stale responses and exposes no appearance contract', () => {
  const operation = createDashboardOperation();
  const oldRequest = operation.transition('load').requestId;
  const currentRequest = operation.transition('load').requestId;

  assert.throws(
    () => operation.transition('load_success', { requestId: oldRequest, data: [] }),
    { code: 'DASHBOARD_OPERATION_STALE_RESPONSE' },
  );
  const ready = operation.transition('load_success', {
    requestId: currentRequest,
    data: [{ id: 'row-1' }],
  });
  assert.equal(ready.state, 'ready');
  for (const key of ['className', 'style', 'theme', 'color', 'font', 'layout', 'component']) {
    assert.equal(Object.hasOwn(ready, key), false);
  }
});

test('server project and seller scope cannot be replaced at module boundaries', async () => {
  const inventoryFixture = createInventoryFixture();
  await assert.rejects(
    inventoryFixture.inventory.reserve({
      eventId: 'wrong-scope',
      reservationId: 'wrong-scope',
      productId: 'product-1',
      skuId: 'sku-1',
      quantity: 1,
      sellerId: 'seller_other',
    }),
    { code: 'INVENTORY_SCOPE_MISMATCH' },
  );

  let transactionCalls = 0;
  const settlement = createSettlementModule({
    provider: {
      async verify() {
        return {
          trusted: true,
          source: 'provider_query',
          provider: 'test-provider',
          eventId: 'wrong-scope',
          orderId: 'order-1',
          projectId: SCOPE.projectId,
          sellerId: 'seller_other',
          status: 'paid',
          amount: 1_800,
          currency: 'JPY',
        };
      },
    },
    store: { async transaction() { transactionCalls += 1; } },
  });
  await assert.rejects(settlement.settle(SCOPE), /MERCHANT_SCOPE_MISMATCH/);
  assert.equal(transactionCalls, 0);
});
