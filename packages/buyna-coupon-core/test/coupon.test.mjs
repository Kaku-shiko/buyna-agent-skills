import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COUPON_STATES,
  COUPON_TRANSITIONS,
  createCouponModule,
} from '../src/index.mjs';

const PROJECT_ID = 'project_test';
const SELLER_ID = 'seller_test';
const NOW = new Date('2026-08-25T00:00:00.000Z');

function clone(value) {
  return value === undefined ? value : structuredClone(value);
}

function createStore({ asyncEventCompletion = false } = {}) {
  const coupons = new Map();
  const reservations = new Map();
  const events = new Map();
  let queue = Promise.resolve();
  const calls = {
    createReservation: 0,
    redeemReservation: 0,
    releaseReservation: 0,
  };

  function updateUsage(record, kind) {
    const coupon = coupons.get(record.couponId);
    if (!coupon) return;
    const customerId = record.customerId;
    const next = clone(coupon);
    const reserved = next.perCustomerReservations ?? {};
    const redeemed = next.perCustomerRedemptions ?? {};
    if (kind === 'reserve') {
      next.reservedCount = (next.reservedCount ?? 0) + 1;
      reserved[customerId] = (reserved[customerId] ?? 0) + 1;
    } else if (kind === 'redeem') {
      next.reservedCount = Math.max(0, (next.reservedCount ?? 0) - 1);
      next.redeemedCount = (next.redeemedCount ?? 0) + 1;
      reserved[customerId] = Math.max(0, (reserved[customerId] ?? 0) - 1);
      redeemed[customerId] = (redeemed[customerId] ?? 0) + 1;
    } else {
      next.reservedCount = Math.max(0, (next.reservedCount ?? 0) - 1);
      reserved[customerId] = Math.max(0, (reserved[customerId] ?? 0) - 1);
    }
    next.perCustomerReservations = reserved;
    next.perCustomerRedemptions = redeemed;
    coupons.set(record.couponId, next);
  }

  const transaction = (work) => {
    const run = queue.then(async () => {
      const tx = {
        async getCouponForUpdate(query) {
          const matchedReservation = query.reservationId
            ? reservations.get(query.reservationId)
            : null;
          const coupon = query.couponId
            ? coupons.get(query.couponId)
            : matchedReservation
              ? coupons.get(matchedReservation.couponId)
              : [...coupons.values()].find((entry) => entry.code === query.code);
          if (!coupon) return null;
          const reservation = query.reservationId
            ? reservations.get(query.reservationId) ?? null
            : null;
          return clone({ ...coupon, reservation });
        },
        async claimCouponEvent({ eventId }) {
          if (events.has(eventId)) {
            return { claimed: false, result: clone(events.get(eventId)) };
          }
          events.set(eventId, undefined);
          return {
            claimed: true,
            async complete(result) {
              if (asyncEventCompletion) {
                await new Promise((resolve) => setImmediate(resolve));
              }
              events.set(eventId, clone(result));
            },
          };
        },
        async createCoupon(record) {
          coupons.set(record.couponId, clone(record));
          return clone(record);
        },
        async createReservation(record) {
          calls.createReservation += 1;
          reservations.set(record.reservationId, clone(record));
          updateUsage(record, 'reserve');
          return clone(record);
        },
        async redeemReservation(record) {
          calls.redeemReservation += 1;
          reservations.set(record.reservationId, clone(record));
          updateUsage(record, 'redeem');
          return clone(record);
        },
        async releaseReservation(record) {
          calls.releaseReservation += 1;
          reservations.set(record.reservationId, clone(record));
          updateUsage(record, 'release');
          return clone(record);
        },
      };
      return work(tx);
    });
    queue = run.catch(() => {});
    return run;
  };

  return {
    transaction,
    inspectCoupon(id) {
      return clone(coupons.get(id));
    },
    inspectReservation(id) {
      return clone(reservations.get(id));
    },
    mutateCoupon(id, mutate) {
      const next = mutate(clone(coupons.get(id)));
      coupons.set(id, clone(next));
    },
    calls,
  };
}

function moduleWith(store = createStore(), clock = () => new Date(NOW)) {
  return {
    store,
    coupons: createCouponModule({
      projectId: PROJECT_ID,
      sellerId: SELLER_ID,
      store,
      clock,
    }),
  };
}

async function activeCoupon(coupons, overrides = {}) {
  const draft = await coupons.createDraft({
    eventId: 'event-create',
    couponId: 'coupon-1',
    code: '  summer-10  ',
    policyVersion: 3,
    discount: { type: 'percentage', basisPoints: 1_000 },
    minimumItemQuantity: 2,
    minimumOrderAmount: 1_000,
    maximumDiscountAmount: 300,
    validFrom: '2026-08-01T00:00:00.000Z',
    validUntil: '2026-09-01T00:00:00.000Z',
    totalUsageLimit: 2,
    perCustomerUsageLimit: 1,
    ...overrides,
  });
  return coupons.activate({
    eventId: 'event-activate',
    couponId: draft.couponId,
  });
}

test('exports immutable coupon states and transitions', () => {
  assert.equal(COUPON_STATES.DRAFT, 'draft');
  assert.equal(COUPON_STATES.REDEEMED, 'redeemed');
  assert.ok(COUPON_TRANSITIONS.active.includes('reserved'));
  assert.ok(Object.isFrozen(COUPON_STATES));
  assert.ok(Object.isFrozen(COUPON_TRANSITIONS));
  assert.throws(() => COUPON_TRANSITIONS.draft.push('paused'), TypeError);
});

test('normalizes codes and owns guarded management transitions', async () => {
  const { coupons } = moduleWith();
  const active = await activeCoupon(coupons);
  assert.equal(active.code, 'SUMMER-10');
  assert.equal(active.state, 'active');

  const paused = await coupons.pause({
    eventId: 'event-pause',
    couponId: active.couponId,
  });
  assert.equal(paused.state, 'paused');

  await assert.rejects(
    coupons.activate({ eventId: 'event-reactivate', couponId: active.couponId }),
    { code: 'COUPON_INVALID_TRANSITION' },
  );

  const archived = await coupons.archive({
    eventId: 'event-archive',
    couponId: active.couponId,
  });
  assert.equal(archived.state, 'archived');
});

test('quotes percentage discounts with JPY-safe integer math and a maximum', async () => {
  const { coupons } = moduleWith();
  await activeCoupon(coupons);

  const snapshot = await coupons.quote({
    couponCode: ' summer-10 ',
    customerId: 'customer-1',
    order: { itemQuantity: 3, originalAmount: 5_001, currency: 'jpy' },
  });

  assert.deepEqual(snapshot, {
    projectId: PROJECT_ID,
    sellerId: SELLER_ID,
    couponId: 'coupon-1',
    couponCode: 'SUMMER-10',
    policyVersion: 3,
    customerId: 'customer-1',
    currency: 'JPY',
    itemQuantity: 3,
    originalAmount: 5_001,
    discountAmount: 300,
    payableAmount: 4_701,
  });
  assert.ok(Object.isFrozen(snapshot));
});

test('quotes fixed discounts without allowing a negative payable amount', async () => {
  const { coupons } = moduleWith();
  await activeCoupon(coupons, {
    discount: { type: 'fixed', amount: 2_000 },
    minimumItemQuantity: 1,
    minimumOrderAmount: 0,
    maximumDiscountAmount: null,
  });

  const snapshot = await coupons.quote({
    couponId: 'coupon-1',
    customerId: 'customer-1',
    order: { itemQuantity: 1, originalAmount: 1_200, currency: 'JPY' },
  });
  assert.equal(snapshot.discountAmount, 1_200);
  assert.equal(snapshot.payableAmount, 0);
});

test('enforces minimum quantity and amount eligibility', async () => {
  const { coupons } = moduleWith();
  await activeCoupon(coupons);

  await assert.rejects(
    coupons.quote({
      couponId: 'coupon-1',
      customerId: 'customer-1',
      order: { itemQuantity: 1, originalAmount: 2_000, currency: 'JPY' },
    }),
    { code: 'COUPON_NOT_ELIGIBLE' },
  );
  await assert.rejects(
    coupons.quote({
      couponId: 'coupon-1',
      customerId: 'customer-1',
      order: { itemQuantity: 2, originalAmount: 999, currency: 'JPY' },
    }),
    { code: 'COUPON_NOT_ELIGIBLE' },
  );
});

test('enforces validity windows and usage limits', async () => {
  const first = moduleWith();
  await activeCoupon(first.coupons);
  first.store.mutateCoupon('coupon-1', (coupon) => ({ ...coupon, redeemedCount: 2 }));
  await assert.rejects(
    first.coupons.quote({
      couponId: 'coupon-1',
      customerId: 'customer-1',
      order: { itemQuantity: 2, originalAmount: 1_000, currency: 'JPY' },
    }),
    { code: 'COUPON_USAGE_LIMIT' },
  );

  const second = moduleWith();
  await activeCoupon(second.coupons);
  second.store.mutateCoupon('coupon-1', (coupon) => ({
    ...coupon,
    perCustomerRedemptions: { 'customer-1': 1 },
  }));
  await assert.rejects(
    second.coupons.quote({
      couponId: 'coupon-1',
      customerId: 'customer-1',
      order: { itemQuantity: 2, originalAmount: 1_000, currency: 'JPY' },
    }),
    { code: 'COUPON_USAGE_LIMIT' },
  );

  let currentTime = new Date('2026-08-24T00:00:00.000Z');
  const expired = moduleWith(createStore(), () => new Date(currentTime));
  await activeCoupon(expired.coupons, {
    validUntil: '2026-08-25T00:00:00.000Z',
  });
  currentTime = new Date(NOW);
  await assert.rejects(
    expired.coupons.quote({
      couponId: 'coupon-1',
      customerId: 'customer-1',
      order: { itemQuantity: 2, originalAmount: 1_000, currency: 'JPY' },
    }),
    { code: 'COUPON_EXPIRED' },
  );
});

test('rejects unsafe or fractional JPY money before calculating', async () => {
  const { coupons } = moduleWith();
  await activeCoupon(coupons);
  for (const originalAmount of [1.5, -1, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(
      coupons.quote({
        couponId: 'coupon-1',
        customerId: 'customer-1',
        order: { itemQuantity: 2, originalAmount, currency: 'JPY' },
      }),
      { code: 'COUPON_INVALID_MONEY' },
    );
  }
});

async function quoteDefault(coupons, overrides = {}) {
  return coupons.quote({
    couponId: 'coupon-1',
    customerId: 'customer-1',
    order: { itemQuantity: 2, originalAmount: 2_000, currency: 'JPY' },
    ...overrides,
  });
}

test('reserves the authoritative quote and returns the exact payable snapshot', async () => {
  const { coupons, store } = moduleWith();
  await activeCoupon(coupons);
  const quoted = await quoteDefault(coupons);

  const reservation = await coupons.reserve({
    eventId: 'event-reserve-1',
    reservationId: 'reservation-1',
    snapshot: quoted,
  });

  assert.equal(reservation.state, 'reserved');
  assert.deepEqual(reservation.discountSnapshot, quoted);
  assert.equal(reservation.discountSnapshot.payableAmount, 1_800);
  assert.equal(store.calls.createReservation, 1);
  assert.ok(Object.isFrozen(reservation));
});

test('reserve is exact-once for a repeated submit event', async () => {
  const store = createStore({ asyncEventCompletion: true });
  const { coupons } = moduleWith(store);
  await activeCoupon(coupons);
  const snapshot = await quoteDefault(coupons);
  const input = {
    eventId: 'event-reserve-1',
    reservationId: 'reservation-1',
    snapshot,
  };

  const first = await coupons.reserve(input);
  const duplicate = await coupons.reserve(input);
  assert.deepEqual(duplicate, first);
  assert.equal(store.calls.createReservation, 1);
});

test('reserve is exact-once when the same reservation is retried with a new event', async () => {
  const { coupons, store } = moduleWith();
  await activeCoupon(coupons);
  const snapshot = await quoteDefault(coupons);
  const first = await coupons.reserve({
    eventId: 'event-reserve-1',
    reservationId: 'reservation-1',
    snapshot,
  });
  const retry = await coupons.reserve({
    eventId: 'event-reserve-2',
    reservationId: 'reservation-1',
    snapshot,
  });
  assert.deepEqual(retry, first);
  assert.equal(store.calls.createReservation, 1);
});

test('serializes competing reservations for the last total use', async () => {
  const { coupons, store } = moduleWith();
  await activeCoupon(coupons, { totalUsageLimit: 1, perCustomerUsageLimit: null });
  const firstSnapshot = await quoteDefault(coupons);
  const secondSnapshot = await quoteDefault(coupons, { customerId: 'customer-2' });

  const results = await Promise.allSettled([
    coupons.reserve({
      eventId: 'event-reserve-1',
      reservationId: 'reservation-1',
      snapshot: firstSnapshot,
    }),
    coupons.reserve({
      eventId: 'event-reserve-2',
      reservationId: 'reservation-2',
      snapshot: secondSnapshot,
    }),
  ]);

  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected');
  assert.equal(rejected.reason.code, 'COUPON_USAGE_LIMIT');
  assert.equal(store.calls.createReservation, 1);
});

test('rejects a changed or cross-scope quote snapshot', async () => {
  const { coupons } = moduleWith();
  await activeCoupon(coupons);
  const snapshot = await quoteDefault(coupons);

  await assert.rejects(
    coupons.reserve({
      eventId: 'event-reserve-changed',
      reservationId: 'reservation-changed',
      snapshot: { ...snapshot, payableAmount: snapshot.payableAmount - 1 },
    }),
    { code: 'COUPON_SNAPSHOT_MISMATCH' },
  );
  await assert.rejects(
    coupons.reserve({
      eventId: 'event-reserve-scope',
      reservationId: 'reservation-scope',
      snapshot: { ...snapshot, sellerId: 'seller_other' },
    }),
    { code: 'COUPON_SCOPE_MISMATCH' },
  );
});

test('redeems once from the locked order coupon snapshot', async () => {
  const { coupons, store } = moduleWith();
  await activeCoupon(coupons);
  const snapshot = await quoteDefault(coupons);
  await coupons.reserve({
    eventId: 'event-reserve-1',
    reservationId: 'reservation-1',
    snapshot,
  });

  const input = {
    eventId: 'provider-payment-1',
    reservationId: 'reservation-1',
    orderSnapshot: snapshot,
  };
  const redeemed = await coupons.redeem(input);
  const duplicate = await coupons.redeem(input);
  assert.equal(redeemed.state, 'redeemed');
  assert.deepEqual(redeemed.discountSnapshot, snapshot);
  assert.deepEqual(duplicate, redeemed);
  const newEventRetry = await coupons.redeem({
    ...input,
    eventId: 'provider-payment-retry-2',
  });
  assert.deepEqual(newEventRetry, redeemed);
  assert.equal(store.calls.redeemReservation, 1);

  await assert.rejects(
    coupons.release({
      eventId: 'event-release-after-redeem',
      reservationId: 'reservation-1',
      reason: 'checkout_failed',
    }),
    { code: 'COUPON_INVALID_TRANSITION' },
  );
});

test('rejects settlement redemption when the locked order snapshot differs', async () => {
  const { coupons, store } = moduleWith();
  await activeCoupon(coupons);
  const snapshot = await quoteDefault(coupons);
  await coupons.reserve({
    eventId: 'event-reserve-1',
    reservationId: 'reservation-1',
    snapshot,
  });

  await assert.rejects(
    coupons.redeem({
      eventId: 'provider-payment-1',
      reservationId: 'reservation-1',
      orderSnapshot: { ...snapshot, originalAmount: 2_001 },
    }),
    { code: 'COUPON_SNAPSHOT_MISMATCH' },
  );
  assert.equal(store.calls.redeemReservation, 0);
});

test('releases a reservation once after failed or expired checkout', async () => {
  for (const reason of ['checkout_failed', 'checkout_expired']) {
    const { coupons, store } = moduleWith();
    await activeCoupon(coupons);
    const snapshot = await quoteDefault(coupons);
    await coupons.reserve({
      eventId: `event-reserve-${reason}`,
      reservationId: `reservation-${reason}`,
      snapshot,
    });
    const input = {
      eventId: `event-release-${reason}`,
      reservationId: `reservation-${reason}`,
      reason,
    };
    const released = await coupons.release(input);
    const duplicate = await coupons.release(input);
    const newEventRetry = await coupons.release({
      ...input,
      eventId: `event-release-retry-${reason}`,
    });
    assert.equal(released.state, 'released');
    assert.equal(released.releaseReason, reason);
    assert.deepEqual(duplicate, released);
    assert.deepEqual(newEventRetry, released);
    assert.equal(store.calls.releaseReservation, 1);
  }
});
