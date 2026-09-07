import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function testFingerprint(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function createStore({
  asyncEventCompletion = false,
  omittedMethods = [],
  failOnce = {},
  corruptReturns = {},
} = {}) {
  const coupons = new Map();
  const reservations = new Map();
  const events = new Map();
  let queue = Promise.resolve();
  const calls = {
    claimCouponEvent: 0,
    createCoupon: 0,
    createReservation: 0,
    redeemReservation: 0,
    releaseReservation: 0,
  };
  const failures = { ...failOnce };
  const corrupt = { ...corruptReturns };

  function mapSnapshot(map) {
    return [...map.entries()].map(([key, value]) => [key, clone(value)]);
  }

  function restoreMap(map, snapshot) {
    map.clear();
    for (const [key, value] of snapshot) map.set(key, clone(value));
  }

  function maybeFail(method) {
    if ((failures[method] ?? 0) > 0) {
      failures[method] -= 1;
      const error = new Error(`forced ${method} failure`);
      error.code = 'FORCED_ADAPTER_FAILURE';
      throw error;
    }
  }

  function adapterResult(method, record) {
    return clone(typeof corrupt[method] === 'function' ? corrupt[method](clone(record)) : record);
  }

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
      const before = {
        coupons: mapSnapshot(coupons),
        reservations: mapSnapshot(reservations),
        events: mapSnapshot(events),
      };
      const tx = {
        async deleteCoupon(input) {
          const record=coupons.get(input.couponId);
          if(!record||record.projectId!==input.projectId||record.sellerId!==input.sellerId)return null;
          if([...reservations.values()].some(row=>row.couponId===input.couponId))throw Object.assign(new Error('referenced'),{code:'COUPON_DELETE_REFERENCED'});
          coupons.delete(input.couponId);
          return {...input,deleted:true};
        },
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
        async claimCouponEvent(context) {
          calls.claimCouponEvent += 1;
          const { eventId } = context;
          if (events.has(eventId)) {
            return { claimed: false, event: clone(events.get(eventId)) };
          }
          events.set(eventId, { ...clone(context), result: null });
          return {
            claimed: true,
            async complete(result, metadata = {}) {
              if (asyncEventCompletion) {
                await new Promise((resolve) => setImmediate(resolve));
              }
              events.get(eventId).result = clone(result);
              events.get(eventId).resultFingerprint = metadata.resultFingerprint;
            },
          };
        },
        async createCoupon(record) {
          calls.createCoupon += 1;
          maybeFail('createCoupon');
          coupons.set(record.couponId, clone(record));
          return adapterResult('createCoupon', record);
        },
        async createReservation(record) {
          calls.createReservation += 1;
          maybeFail('createReservation');
          reservations.set(record.reservationId, clone(record));
          updateUsage(record, 'reserve');
          return adapterResult('createReservation', record);
        },
        async redeemReservation(record) {
          calls.redeemReservation += 1;
          maybeFail('redeemReservation');
          reservations.set(record.reservationId, clone(record));
          updateUsage(record, 'redeem');
          return adapterResult('redeemReservation', record);
        },
        async releaseReservation(record) {
          calls.releaseReservation += 1;
          maybeFail('releaseReservation');
          reservations.set(record.reservationId, clone(record));
          updateUsage(record, 'release');
          return adapterResult('releaseReservation', record);
        },
      };
      for (const name of omittedMethods) delete tx[name];
      try {
        return await work(tx);
      } catch (error) {
        restoreMap(coupons, before.coupons);
        restoreMap(reservations, before.reservations);
        restoreMap(events, before.events);
        throw error;
      }
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
    mutateReservation(id, mutate) {
      const next = mutate(clone(reservations.get(id)));
      reservations.set(id, clone(next));
    },
    setCorruptReturn(method, transform) {
      corrupt[method] = transform;
    },
    inspectEvent(id) {
      return clone(events.get(id));
    },
    mutateEvent(id, mutate) {
      const next = mutate(clone(events.get(id)));
      events.set(id, clone(next));
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

function orderInput(overrides = {}) {
  return {
    orderId: 'order-1',
    checkoutSnapshotId: 'checkout-snapshot-1',
    itemQuantity: 2,
    originalAmount: 2_000,
    currency: 'JPY',
    ...overrides,
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
    order: orderInput({ itemQuantity: 3, originalAmount: 5_001, currency: 'jpy' }),
  });

  assert.deepEqual(snapshot, {
    projectId: PROJECT_ID,
    sellerId: SELLER_ID,
    couponId: 'coupon-1',
    couponCode: 'SUMMER-10',
    policyVersion: 3,
    customerId: 'customer-1',
    orderId: 'order-1',
    checkoutSnapshotId: 'checkout-snapshot-1',
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
    order: orderInput({ itemQuantity: 1, originalAmount: 1_200 }),
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
      order: orderInput({ itemQuantity: 1 }),
    }),
    { code: 'COUPON_NOT_ELIGIBLE' },
  );
  await assert.rejects(
    coupons.quote({
      couponId: 'coupon-1',
      customerId: 'customer-1',
      order: orderInput({ originalAmount: 999 }),
    }),
    { code: 'COUPON_NOT_ELIGIBLE' },
  );
});

test('enforces validity windows and usage limits', async () => {
  const first = moduleWith();
  await activeCoupon(first.coupons);
  first.store.mutateCoupon('coupon-1', (coupon) => ({
    ...coupon,
    redeemedCount: 2,
    perCustomerRedemptions: { 'customer-a': 1, 'customer-b': 1 },
  }));
  await assert.rejects(
    first.coupons.quote({
      couponId: 'coupon-1',
      customerId: 'customer-1',
      order: orderInput({ originalAmount: 1_000 }),
    }),
    { code: 'COUPON_USAGE_LIMIT' },
  );

  const second = moduleWith();
  await activeCoupon(second.coupons);
  second.store.mutateCoupon('coupon-1', (coupon) => ({
    ...coupon,
    redeemedCount: 1,
    perCustomerRedemptions: { 'customer-1': 1 },
  }));
  await assert.rejects(
    second.coupons.quote({
      couponId: 'coupon-1',
      customerId: 'customer-1',
      order: orderInput({ originalAmount: 1_000 }),
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
      order: orderInput({ originalAmount: 1_000 }),
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
        order: orderInput({ originalAmount }),
      }),
      { code: 'COUPON_INVALID_MONEY' },
    );
  }
});

async function quoteDefault(coupons, overrides = {}) {
  return coupons.quote({
    couponId: 'coupon-1',
    customerId: 'customer-1',
    order: orderInput(),
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

test('binds every event to scope, operation, aggregate, and immutable input', async () => {
  const sharedStore = createStore();
  const { coupons } = moduleWith(sharedStore);
  await activeCoupon(coupons);
  const snapshot = await quoteDefault(coupons);
  await coupons.reserve({
    eventId: 'event-bound',
    reservationId: 'reservation-1',
    snapshot,
  });

  await assert.rejects(
    coupons.reserve({
      eventId: 'event-bound',
      reservationId: 'reservation-2',
      snapshot,
    }),
    { code: 'COUPON_EVENT_CONFLICT' },
  );
  await assert.rejects(
    coupons.release({
      eventId: 'event-bound',
      reservationId: 'reservation-1',
      reason: 'checkout_failed',
    }),
    { code: 'COUPON_EVENT_CONFLICT' },
  );
  await assert.rejects(
    coupons.reserve({
      eventId: 'event-bound',
      reservationId: 'reservation-1',
      snapshot: { ...snapshot, originalAmount: snapshot.originalAmount + 1 },
    }),
    { code: 'COUPON_EVENT_CONFLICT' },
  );

  const otherScope = createCouponModule({
    projectId: PROJECT_ID,
    sellerId: 'seller-other',
    store: sharedStore,
    clock: () => new Date(NOW),
  });
  await assert.rejects(
    otherScope.createDraft({
      eventId: 'event-bound',
      couponId: 'coupon-other',
      code: 'OTHER',
      discount: { type: 'fixed', amount: 100 },
    }),
    { code: 'COUPON_EVENT_CONFLICT' },
  );
});

test('rejects a corrupted replay result instead of trusting event storage', async () => {
  const { coupons, store } = moduleWith();
  await activeCoupon(coupons);
  const snapshot = await quoteDefault(coupons);
  await coupons.reserve({
    eventId: 'event-reserve-corrupt',
    reservationId: 'reservation-corrupt',
    snapshot,
  });
  store.mutateEvent('event-reserve-corrupt', (event) => ({
    ...event,
    result: { ...event.result, state: 'redeemed' },
    resultFingerprint: testFingerprint({ ...event.result, state: 'redeemed' }),
  }));
  await assert.rejects(
    coupons.reserve({
      eventId: 'event-reserve-corrupt',
      reservationId: 'reservation-corrupt',
      snapshot,
    }),
    { code: 'COUPON_EVENT_CONFLICT' },
  );

  const releaseInput = {
    eventId: 'event-release-signed-corrupt',
    reservationId: 'reservation-corrupt',
    reason: 'checkout_failed',
  };
  await coupons.release(releaseInput);
  store.mutateEvent(releaseInput.eventId, (event) => {
    const result = {
      ...event.result,
      discountSnapshot: { ...event.result.discountSnapshot, orderId: 'order-other' },
    };
    return { ...event, result, resultFingerprint: testFingerprint(result) };
  });
  await assert.rejects(coupons.release(releaseInput), {
    code: 'COUPON_EVENT_CONFLICT',
  });
});

test('binds the immutable discount snapshot to order and checkout identity', async () => {
  const { coupons, store } = moduleWith();
  await activeCoupon(coupons);
  const snapshot = await quoteDefault(coupons);
  assert.equal(snapshot.orderId, 'order-1');
  assert.equal(snapshot.checkoutSnapshotId, 'checkout-snapshot-1');
  await coupons.reserve({
    eventId: 'event-order-bound',
    reservationId: 'reservation-order-bound',
    snapshot,
  });

  await assert.rejects(
    coupons.redeem({
      eventId: 'event-order-swap',
      reservationId: 'reservation-order-bound',
      orderSnapshot: {
        ...snapshot,
        orderId: 'order-2',
        checkoutSnapshotId: 'checkout-snapshot-2',
      },
    }),
    { code: 'COUPON_SNAPSHOT_MISMATCH' },
  );
  assert.equal(store.calls.redeemReservation, 0);

  for (const missingField of ['orderId', 'checkoutSnapshotId']) {
    const order = orderInput();
    delete order[missingField];
    await assert.rejects(
      coupons.quote({ couponId: 'coupon-1', customerId: 'customer-2', order }),
      { code: 'COUPON_INVALID_INPUT' },
    );
  }
});

test('rejects malformed Adapter returns for policy and reservation writes', async () => {
  const draftStore = createStore({
    corruptReturns: {
      createCoupon: (record) => ({ ...record, couponId: 'coupon-wrong', state: 'active' }),
    },
  });
  const draftModule = moduleWith(draftStore).coupons;
  await assert.rejects(
    draftModule.createDraft({
      eventId: 'event-bad-draft',
      couponId: 'coupon-1',
      code: 'BAD',
      discount: { type: 'fixed', amount: 100 },
    }),
    { code: 'COUPON_ADAPTER_INVALID' },
  );
  assert.equal(draftStore.inspectCoupon('coupon-1'), undefined);

  const { coupons, store } = moduleWith();
  await activeCoupon(coupons);
  const snapshot = await quoteDefault(coupons);
  store.setCorruptReturn('createReservation', (record) => ({
    ...record,
    usageEffect: { ...record.usageEffect, reservedDelta: 2 },
  }));
  await assert.rejects(
    coupons.reserve({
      eventId: 'event-bad-reservation',
      reservationId: 'reservation-bad',
      snapshot,
    }),
    { code: 'COUPON_ADAPTER_INVALID' },
  );
  assert.equal(store.inspectReservation('reservation-bad'), undefined);
  assert.equal(store.inspectCoupon('coupon-1').reservedCount, 0);
});

test('validates transition, redemption, and release Adapter results before commit', async () => {
  const transition = moduleWith();
  const draft = await transition.coupons.createDraft({
    eventId: 'event-transition-draft',
    couponId: 'coupon-transition',
    code: 'TRANSITION',
    discount: { type: 'fixed', amount: 100 },
  });
  transition.store.setCorruptReturn('createCoupon', (record) => ({
    ...record,
    state: 'paused',
  }));
  await assert.rejects(
    transition.coupons.activate({
      eventId: 'event-transition-corrupt',
      couponId: draft.couponId,
    }),
    { code: 'COUPON_ADAPTER_INVALID' },
  );
  assert.equal(transition.store.inspectCoupon(draft.couponId).state, 'draft');

  const redemption = moduleWith();
  await activeCoupon(redemption.coupons);
  const redeemSnapshot = await quoteDefault(redemption.coupons);
  await redemption.coupons.reserve({
    eventId: 'event-redeem-reserve',
    reservationId: 'reservation-redeem-corrupt',
    snapshot: redeemSnapshot,
  });
  redemption.store.setCorruptReturn('redeemReservation', (record) => ({
    ...record,
    usageEffect: { ...record.usageEffect, redeemedDelta: 2 },
  }));
  await assert.rejects(
    redemption.coupons.redeem({
      eventId: 'event-redeem-corrupt',
      reservationId: 'reservation-redeem-corrupt',
      orderSnapshot: redeemSnapshot,
    }),
    { code: 'COUPON_ADAPTER_INVALID' },
  );
  assert.equal(redemption.store.inspectReservation('reservation-redeem-corrupt').state, 'reserved');
  assert.equal(redemption.store.inspectCoupon('coupon-1').redeemedCount, 0);

  const release = moduleWith();
  await activeCoupon(release.coupons);
  const releaseSnapshot = await quoteDefault(release.coupons);
  await release.coupons.reserve({
    eventId: 'event-release-reserve',
    reservationId: 'reservation-release-corrupt',
    snapshot: releaseSnapshot,
  });
  release.store.setCorruptReturn('releaseReservation', (record) => ({
    ...record,
    releaseReason: 'checkout_cancelled',
  }));
  await assert.rejects(
    release.coupons.release({
      eventId: 'event-release-corrupt',
      reservationId: 'reservation-release-corrupt',
      reason: 'checkout_failed',
    }),
    { code: 'COUPON_ADAPTER_INVALID' },
  );
  assert.equal(release.store.inspectReservation('reservation-release-corrupt').state, 'reserved');
  assert.equal(release.store.inspectCoupon('coupon-1').reservedCount, 1);
});

test('rejects a locked coupon returned under the wrong aggregate identity', async () => {
  const { coupons, store } = moduleWith();
  await activeCoupon(coupons);
  store.mutateCoupon('coupon-1', (coupon) => ({ ...coupon, couponId: 'coupon-other' }));
  await assert.rejects(
    coupons.quote({
      couponId: 'coupon-1',
      customerId: 'customer-1',
      order: orderInput(),
    }),
    { code: 'COUPON_ADAPTER_INVALID' },
  );

  const reservation = moduleWith();
  await activeCoupon(reservation.coupons);
  const snapshot = await quoteDefault(reservation.coupons);
  reservation.store.mutateCoupon('coupon-1', (coupon) => ({
    ...coupon,
    couponId: 'coupon-other',
  }));
  await assert.rejects(
    reservation.coupons.reserve({
      eventId: 'event-wrong-coupon-id',
      reservationId: 'reservation-wrong-coupon-id',
      snapshot,
    }),
    { code: 'COUPON_ADAPTER_INVALID' },
  );
});

test('preflights operation Adapter methods before claiming an event', async () => {
  const store = createStore({ omittedMethods: ['createReservation'] });
  const { coupons } = moduleWith(store);
  await activeCoupon(coupons);
  const snapshot = await quoteDefault(coupons);
  const claimsBefore = store.calls.claimCouponEvent;

  await assert.rejects(
    coupons.reserve({
      eventId: 'event-preflight',
      reservationId: 'reservation-preflight',
      snapshot,
    }),
    { code: 'COUPON_ADAPTER_CREATE_RESERVATION_REQUIRED' },
  );
  assert.equal(store.calls.claimCouponEvent, claimsBefore);
  assert.equal(store.inspectEvent('event-preflight'), undefined);
});

test('rolls back failed reservations so the same event can retry safely', async () => {
  const store = createStore({ failOnce: { createReservation: 1 } });
  const { coupons } = moduleWith(store);
  await activeCoupon(coupons);
  const snapshot = await quoteDefault(coupons);
  const input = {
    eventId: 'event-rollback',
    reservationId: 'reservation-rollback',
    snapshot,
  };

  await assert.rejects(coupons.reserve(input), { code: 'FORCED_ADAPTER_FAILURE' });
  assert.equal(store.inspectReservation('reservation-rollback'), undefined);
  assert.equal(store.inspectCoupon('coupon-1').reservedCount, 0);
  assert.equal(store.inspectEvent('event-rollback'), undefined);

  const retried = await coupons.reserve(input);
  assert.equal(retried.state, 'reserved');
  assert.equal(store.inspectCoupon('coupon-1').reservedCount, 1);
  assert.equal(store.inspectEvent('event-rollback').result.state, 'reserved');
});

test('rejects malformed authoritative coupon policy records before quoting', async () => {
  const corruptions = [
    ['illegal state', (coupon) => ({ ...coupon, state: 'unknown' })],
    ['unnormalized code', (coupon) => ({ ...coupon, code: ' summer-10 ' })],
    ['zero percentage', (coupon) => ({
      ...coupon,
      discount: { type: 'percentage', basisPoints: 0 },
    })],
    ['oversized percentage', (coupon) => ({
      ...coupon,
      discount: { type: 'percentage', basisPoints: 10_001 },
    })],
    ['negative fixed discount', (coupon) => ({
      ...coupon,
      discount: { type: 'fixed', amount: -100 },
    })],
    ['unsupported discount', (coupon) => ({
      ...coupon,
      discount: { type: 'mystery', amount: 100 },
    })],
    ['invalid minimum quantity', (coupon) => ({ ...coupon, minimumItemQuantity: 0 })],
    ['unsafe minimum amount', (coupon) => ({
      ...coupon,
      minimumOrderAmount: Number.MAX_SAFE_INTEGER + 1,
    })],
    ['fractional maximum discount', (coupon) => ({
      ...coupon,
      maximumDiscountAmount: 1.5,
    })],
    ['invalid policy version', (coupon) => ({ ...coupon, policyVersion: '' })],
    ['invalid total limit', (coupon) => ({ ...coupon, totalUsageLimit: 0 })],
    ['negative redeemed counter', (coupon) => ({ ...coupon, redeemedCount: -1 })],
    ['counter map mismatch', (coupon) => ({
      ...coupon,
      redeemedCount: 1,
      perCustomerRedemptions: {},
    })],
    ['per-customer limit exceeded', (coupon) => ({
      ...coupon,
      redeemedCount: 2,
      perCustomerRedemptions: { 'customer-1': 2 },
    })],
    ['invalid validity timestamp', (coupon) => ({ ...coupon, validFrom: 'not-a-date' })],
    ['reversed validity window', (coupon) => ({
      ...coupon,
      validFrom: '2026-09-01T00:00:00.000Z',
      validUntil: '2026-08-01T00:00:00.000Z',
    })],
  ];

  for (const [label, corrupt] of corruptions) {
    const { coupons, store } = moduleWith();
    await activeCoupon(coupons);
    store.mutateCoupon('coupon-1', corrupt);
    await assert.rejects(
      coupons.quote({
        couponId: 'coupon-1',
        customerId: 'customer-1',
        order: orderInput(),
      }),
      (error) => error.code === 'COUPON_ADAPTER_INVALID',
      label,
    );
  }
});

test('rejects a corrupted policy before reserve without leaking usage or raising payable', async () => {
  const { coupons, store } = moduleWith();
  await activeCoupon(coupons);
  const snapshot = await quoteDefault(coupons);
  store.mutateCoupon('coupon-1', (coupon) => ({
    ...coupon,
    discount: { type: 'fixed', amount: -500 },
  }));

  await assert.rejects(
    coupons.reserve({
      eventId: 'event-invalid-policy-reserve',
      reservationId: 'reservation-invalid-policy',
      snapshot,
    }),
    { code: 'COUPON_ADAPTER_INVALID' },
  );
  assert.equal(store.inspectReservation('reservation-invalid-policy'), undefined);
  assert.equal(store.inspectCoupon('coupon-1').reservedCount, 0);
  assert.equal(store.inspectEvent('event-invalid-policy-reserve'), undefined);
  assert.ok(snapshot.payableAmount <= snapshot.originalAmount);
});

test('rejects replay envelopes with a missing or different event identity', async () => {
  for (const replacement of [undefined, 'event-other']) {
    const { coupons, store } = moduleWith();
    await activeCoupon(coupons);
    const snapshot = await quoteDefault(coupons);
    const input = {
      eventId: 'event-envelope-id',
      reservationId: 'reservation-envelope-id',
      snapshot,
    };
    await coupons.reserve(input);
    store.mutateEvent(input.eventId, (event) => {
      const next = { ...event };
      if (replacement === undefined) delete next.eventId;
      else next.eventId = replacement;
      return next;
    });
    await assert.rejects(coupons.reserve(input), {
      code: 'COUPON_EVENT_CONFLICT',
    });
  }
});

test('rejects invalid authoritative policy before activate, pause, or archive', async () => {
  const activation = moduleWith();
  const draft = await activation.coupons.createDraft({
    eventId: 'event-invalid-draft-create',
    couponId: 'coupon-invalid-draft',
    code: 'INVALID-DRAFT',
    discount: { type: 'fixed', amount: 100 },
  });
  activation.store.mutateCoupon(draft.couponId, (coupon) => ({
    ...coupon,
    discount: { type: 'fixed', amount: -1 },
  }));
  await assert.rejects(
    activation.coupons.activate({
      eventId: 'event-invalid-draft-activate',
      couponId: draft.couponId,
    }),
    { code: 'COUPON_ADAPTER_INVALID' },
  );
  assert.equal(activation.store.inspectCoupon(draft.couponId).state, 'draft');
  assert.equal(activation.store.inspectEvent('event-invalid-draft-activate'), undefined);

  for (const operation of ['pause', 'archive']) {
    const fixture = moduleWith();
    await activeCoupon(fixture.coupons);
    fixture.store.mutateCoupon('coupon-1', (coupon) => ({
      ...coupon,
      policyVersion: '',
    }));
    const eventId = `event-invalid-active-${operation}`;
    await assert.rejects(
      fixture.coupons[operation]({ eventId, couponId: 'coupon-1' }),
      { code: 'COUPON_ADAPTER_INVALID' },
    );
    assert.equal(fixture.store.inspectCoupon('coupon-1').state, 'active');
    assert.equal(fixture.store.inspectEvent(eventId), undefined);
  }
});


test('deleteCoupon removes an unused coupon and safely replays the deletion event',async()=>{
 const {coupons,store}=moduleWith();await activeCoupon(coupons);
 const input={eventId:'delete-1',couponId:'coupon-1'};
 const result=await coupons.deleteCoupon(input);
 assert.equal(result.deleted,true);assert.equal(store.inspectCoupon('coupon-1'),undefined);
 assert.deepEqual(await coupons.deleteCoupon(input),result);
});
test('deleteCoupon protects used coupons and tenant scope',async()=>{
 const {coupons,store}=moduleWith();await activeCoupon(coupons);
 store.mutateCoupon('coupon-1',row=>({...row,reservedCount:1,perCustomerReservations:{c1:1}}));
 await assert.rejects(()=>coupons.deleteCoupon({eventId:'delete-1',couponId:'coupon-1'}),{code:'COUPON_DELETE_REFERENCED'});
 assert.equal(store.inspectCoupon('coupon-1').state,'active');
 store.mutateCoupon('coupon-1',row=>({...row,sellerId:'other'}));
 await assert.rejects(()=>coupons.deleteCoupon({eventId:'delete-2',couponId:'coupon-1'}),{code:'COUPON_SCOPE_MISMATCH'});
});
