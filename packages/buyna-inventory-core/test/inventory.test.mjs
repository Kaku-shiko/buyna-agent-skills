import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInventoryModule,
  INVENTORY_STATES,
  INVENTORY_TRANSITIONS,
} from '../src/index.mjs';

const SCOPE = Object.freeze({ projectId: 'project_alpha', sellerId: 'seller_alpha' });

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function cloneMap(map) {
  return new Map([...map].map(([key, value]) => [key, clone(value)]));
}

function restoreMap(target, snapshot) {
  target.clear();
  for (const [key, value] of snapshot) target.set(key, clone(value));
}

function stockKey({ projectId, sellerId, productId, skuId }) {
  return `${projectId}:${sellerId}:${productId}:${skuId}`;
}

function createMemoryStore({ quantity = 5 } = {}) {
  const stock = new Map([
    [
      stockKey({ ...SCOPE, productId: 'product_1', skuId: 'sku_1' }),
      { ...SCOPE, productId: 'product_1', skuId: 'sku_1', onHandQuantity: quantity },
    ],
  ]);
  const reservations = new Map();
  const events = new Map();
  const calls = [];
  let transactionTail = Promise.resolve();

  function scopedReservation(scope, reservationId) {
    const reservation = reservations.get(reservationId);
    if (!reservation) return null;
    if (
      reservation.projectId !== scope.projectId
      || reservation.sellerId !== scope.sellerId
    ) return null;
    return reservation;
  }

  function completeEvent(eventId, result) {
    const event = events.get(eventId);
    event.result = clone(result);
    event.fingerprint = {
      ...event.fingerprint,
      productId: result.productId,
      skuId: result.skuId,
      quantity: result.quantity,
    };
  }

  const transaction = (work) => {
    const run = transactionTail.then(async () => {
      calls.push('transaction');
      const before = {
        stock: cloneMap(stock),
        reservations: cloneMap(reservations),
        events: cloneMap(events),
      };
      const tx = {
        async claimReservationEvent(input) {
          calls.push(`claim:${input.operation}:${input.eventId}`);
          const existingEvent = events.get(input.eventId);
          if (existingEvent) {
            return { claimed: false, event: clone(existingEvent) };
          }
          const event = {
            ...clone(input),
            result: null,
          };
          events.set(input.eventId, event);
          return {
            claimed: true,
            reservation: clone(scopedReservation(input.scope, input.reservationId)),
            async complete(result) {
              completeEvent(input.eventId, result);
            },
          };
        },
        async getStockForUpdate(input) {
          calls.push(`lock:${input.productId}:${input.skuId}`);
          const row = stock.get(stockKey({ ...input.scope, ...input }));
          if (!row) return null;
          const reservedQuantity = [...reservations.values()]
            .filter((reservation) => (
              reservation.projectId === input.scope.projectId
              && reservation.sellerId === input.scope.sellerId
              && reservation.productId === input.productId
              && reservation.skuId === input.skuId
              && reservation.state === 'reserved'
            ))
            .reduce((sum, reservation) => sum + reservation.quantity, 0);
          return { ...clone(row), reservedQuantity };
        },
        async createReservation({ reservation, eventId }) {
          calls.push(`create:${reservation.reservationId}`);
          reservations.set(reservation.reservationId, clone(reservation));
          completeEvent(eventId, reservation);
          return clone(reservation);
        },
        async commitReservation({ reservation, eventId }) {
          calls.push(`commit:${reservation.reservationId}`);
          reservations.set(reservation.reservationId, clone(reservation));
          completeEvent(eventId, reservation);
          return clone(reservation);
        },
        async releaseReservation({ reservation, eventId }) {
          calls.push(`release:${reservation.reservationId}`);
          reservations.set(reservation.reservationId, clone(reservation));
          completeEvent(eventId, reservation);
          return clone(reservation);
        },
      };
      try {
        return await work(tx);
      } catch (error) {
        restoreMap(stock, before.stock);
        restoreMap(reservations, before.reservations);
        restoreMap(events, before.events);
        throw error;
      }
    });
    transactionTail = run.catch(() => undefined);
    return run;
  };

  return {
    store: { transaction },
    calls,
    stock,
    reservations,
    events,
  };
}

function moduleFixture(options = {}) {
  const memory = createMemoryStore(options);
  const inventory = createInventoryModule({
    ...SCOPE,
    store: memory.store,
    clock: () => '2026-08-25T09:00:00.000Z',
  });
  return { ...memory, inventory };
}

function reserveInput(overrides = {}) {
  return {
    eventId: 'event_reserve_1',
    reservationId: 'reservation_1',
    productId: 'product_1',
    skuId: 'sku_1',
    quantity: 2,
    ...overrides,
  };
}

test('exports immutable inventory states and legal transitions', () => {
  assert.deepEqual(INVENTORY_STATES, {
    AVAILABLE: 'available',
    RESERVED: 'reserved',
    COMMITTED: 'committed',
    RELEASED: 'released',
    INSUFFICIENT: 'insufficient',
  });
  assert.deepEqual(INVENTORY_TRANSITIONS.available, ['reserved', 'insufficient']);
  assert.deepEqual(INVENTORY_TRANSITIONS.reserved, ['committed', 'released', 'insufficient']);
  assert.equal(Object.isFrozen(INVENTORY_STATES), true);
  assert.equal(Object.isFrozen(INVENTORY_TRANSITIONS), true);
  assert.equal(Object.isFrozen(INVENTORY_TRANSITIONS.available), true);
});

test('requires a server-owned project and seller scope', () => {
  const { store } = createMemoryStore();
  assert.throws(
    () => createInventoryModule({ projectId: '', sellerId: 'seller_alpha', store }),
    (error) => error.code === 'INVENTORY_SCOPE_REQUIRED',
  );
  assert.throws(
    () => createInventoryModule({ projectId: 'project_alpha', sellerId: '', store }),
    (error) => error.code === 'INVENTORY_SCOPE_REQUIRED',
  );
});

test('rejects non-positive, fractional, and unsafe reservation quantities', async () => {
  for (const quantity of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '2']) {
    const { inventory } = moduleFixture();
    await assert.rejects(
      inventory.reserve(reserveInput({ quantity })),
      (error) => error.code === 'INVENTORY_INVALID_QUANTITY',
    );
  }
});

test('requires both product and SKU identity', async () => {
  const { inventory } = moduleFixture();
  await assert.rejects(
    inventory.reserve(reserveInput({ productId: '' })),
    (error) => error.code === 'INVENTORY_PRODUCT_REQUIRED',
  );
  await assert.rejects(
    inventory.reserve(reserveInput({ eventId: 'event_reserve_2', skuId: '' })),
    (error) => error.code === 'INVENTORY_SKU_REQUIRED',
  );
});

test('rejects caller scope that differs from the server-owned scope', async () => {
  const { inventory } = moduleFixture();
  await assert.rejects(
    inventory.reserve(reserveInput({ projectId: 'project_other' })),
    (error) => error.code === 'INVENTORY_SCOPE_MISMATCH',
  );
  await assert.rejects(
    inventory.reserve(reserveInput({ eventId: 'event_reserve_2', sellerId: 'seller_other' })),
    (error) => error.code === 'INVENTORY_SCOPE_MISMATCH',
  );
});

test('reserves locked available stock and commits the reservation', async () => {
  const { inventory, calls } = moduleFixture({ quantity: 3 });
  const reserved = await inventory.reserve(reserveInput());
  assert.deepEqual(reserved, {
    ...SCOPE,
    reservationId: 'reservation_1',
    productId: 'product_1',
    skuId: 'sku_1',
    quantity: 2,
    state: 'reserved',
    createdAt: '2026-08-25T09:00:00.000Z',
    updatedAt: '2026-08-25T09:00:00.000Z',
  });
  const committed = await inventory.commit({
    eventId: 'event_commit_1',
    reservationId: 'reservation_1',
  });
  assert.equal(committed.state, 'committed');
  assert.equal(committed.updatedAt, '2026-08-25T09:00:00.000Z');
  assert.ok(calls.indexOf('lock:product_1:sku_1') < calls.indexOf('create:reservation_1'));
});

test('releases a reserved quantity without committing it', async () => {
  const { inventory } = moduleFixture();
  await inventory.reserve(reserveInput());
  const released = await inventory.release({
    eventId: 'event_release_1',
    reservationId: 'reservation_1',
  });
  assert.equal(released.state, 'released');
});

test('rejects a reservation when locked stock cannot cover active reservations', async () => {
  const { inventory } = moduleFixture({ quantity: 1 });
  await assert.rejects(
    inventory.reserve(reserveInput({ quantity: 2 })),
    (error) => error.code === 'INVENTORY_INSUFFICIENT',
  );
});

test('rejects commit and release from illegal reservation states', async () => {
  const { inventory } = moduleFixture();
  await inventory.reserve(reserveInput());
  await inventory.commit({ eventId: 'event_commit_1', reservationId: 'reservation_1' });
  await assert.rejects(
    inventory.release({ eventId: 'event_release_1', reservationId: 'reservation_1' }),
    (error) => error.code === 'INVENTORY_INVALID_TRANSITION',
  );

  const second = moduleFixture();
  await second.inventory.reserve(reserveInput());
  await second.inventory.release({ eventId: 'event_release_1', reservationId: 'reservation_1' });
  await assert.rejects(
    second.inventory.commit({ eventId: 'event_commit_1', reservationId: 'reservation_1' }),
    (error) => error.code === 'INVENTORY_INVALID_TRANSITION',
  );
});

test('retries the same reserve event without creating another reservation', async () => {
  const { inventory, calls } = moduleFixture();
  const first = await inventory.reserve(reserveInput());
  const retry = await inventory.reserve(reserveInput());
  assert.deepEqual(retry, first);
  assert.equal(calls.filter((call) => call === 'create:reservation_1').length, 1);
});

test('treats the same reservation identity as exact-once across new event IDs', async () => {
  const { inventory, calls } = moduleFixture();
  const first = await inventory.reserve(reserveInput());
  const secondEvent = reserveInput({ eventId: 'event_reserve_2' });
  assert.deepEqual(await inventory.reserve(secondEvent), first);
  assert.deepEqual(await inventory.reserve(secondEvent), first);
  assert.equal(calls.filter((call) => call === 'create:reservation_1').length, 1);
});

test('rejects reuse of an event or reservation identity for different stock', async () => {
  const { inventory } = moduleFixture();
  await inventory.reserve(reserveInput());
  await assert.rejects(
    inventory.reserve(reserveInput({ reservationId: 'reservation_other' })),
    (error) => error.code === 'INVENTORY_EVENT_CONFLICT',
  );
  await assert.rejects(
    inventory.reserve(reserveInput({ eventId: 'event_other', quantity: 1 })),
    (error) => error.code === 'INVENTORY_RESERVATION_CONFLICT',
  );
});

test('serializes competing reservations so only one can reserve the last unit', async () => {
  const { inventory, calls } = moduleFixture({ quantity: 1 });
  const results = await Promise.allSettled([
    inventory.reserve(reserveInput({ reservationId: 'reservation_a', eventId: 'event_a', quantity: 1 })),
    inventory.reserve(reserveInput({ reservationId: 'reservation_b', eventId: 'event_b', quantity: 1 })),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejection = results.find((result) => result.status === 'rejected');
  assert.equal(rejection.reason.code, 'INVENTORY_INSUFFICIENT');
  assert.equal(calls.filter((call) => call.startsWith('create:')).length, 1);
});

test('commits a reservation once across event retries and new event IDs', async () => {
  const { inventory, calls } = moduleFixture();
  await inventory.reserve(reserveInput());
  const first = await inventory.commit({
    eventId: 'event_commit_1',
    reservationId: 'reservation_1',
  });
  const secondEvent = {
    eventId: 'event_commit_2',
    reservationId: 'reservation_1',
  };
  assert.deepEqual(await inventory.commit(secondEvent), first);
  assert.deepEqual(await inventory.commit(secondEvent), first);
  assert.equal(calls.filter((call) => call === 'commit:reservation_1').length, 1);
});

test('releases a reservation once across event retries and new event IDs', async () => {
  const { inventory, calls } = moduleFixture();
  await inventory.reserve(reserveInput());
  const first = await inventory.release({
    eventId: 'event_release_1',
    reservationId: 'reservation_1',
  });
  const secondEvent = {
    eventId: 'event_release_2',
    reservationId: 'reservation_1',
  };
  assert.deepEqual(await inventory.release(secondEvent), first);
  assert.deepEqual(await inventory.release(secondEvent), first);
  assert.equal(calls.filter((call) => call === 'release:reservation_1').length, 1);
});

test('never releases a committed reservation even when release is retried', async () => {
  const { inventory, calls } = moduleFixture();
  await inventory.reserve(reserveInput());
  await inventory.commit({ eventId: 'event_commit_1', reservationId: 'reservation_1' });
  for (const eventId of ['event_release_1', 'event_release_2']) {
    await assert.rejects(
      inventory.release({ eventId, reservationId: 'reservation_1' }),
      (error) => error.code === 'INVENTORY_INVALID_TRANSITION',
    );
  }
  assert.equal(calls.filter((call) => call === 'release:reservation_1').length, 0);
});

test('reserve event replay rejects every immutable fingerprint change', async () => {
  for (const changed of [
    { quantity: 1 },
    { productId: 'product_other' },
    { skuId: 'sku_other' },
  ]) {
    const { inventory } = moduleFixture();
    await inventory.reserve(reserveInput());
    await assert.rejects(
      inventory.reserve(reserveInput(changed)),
      (error) => error.code === 'INVENTORY_EVENT_CONFLICT',
    );
  }
});

test('commit rejects malformed Adapter reservation identity before mutation', async () => {
  const mutations = [
    (record) => { record.reservationId = 'reservation_other'; },
    (record) => { record.productId = ''; },
    (record) => { record.skuId = ''; },
    (record) => { record.quantity = 0; },
    (record) => { record.state = 'adapter_unknown'; },
  ];
  for (const mutate of mutations) {
    const { inventory, reservations, calls } = moduleFixture();
    await inventory.reserve(reserveInput());
    mutate(reservations.get('reservation_1'));
    await assert.rejects(
      inventory.commit({ eventId: 'event_commit_1', reservationId: 'reservation_1' }),
      (error) => error.code === 'INVENTORY_ADAPTER_RESERVATION_INVALID',
    );
    assert.equal(calls.filter((call) => call === 'commit:reservation_1').length, 0);
  }
});

test('release rejects replay results that do not match stored reservation identity', async () => {
  const mutations = [
    (record) => { record.reservationId = 'reservation_other'; },
    (record) => { record.productId = 'product_other'; },
    (record) => { record.skuId = 'sku_other'; },
    (record) => { record.quantity = 1; },
    (record) => { record.state = 'committed'; },
  ];
  for (const mutate of mutations) {
    const { inventory, events, calls } = moduleFixture();
    await inventory.reserve(reserveInput());
    await inventory.release({
      eventId: 'event_release_1',
      reservationId: 'reservation_1',
    });
    mutate(events.get('event_release_1').result);
    await assert.rejects(
      inventory.release({ eventId: 'event_release_1', reservationId: 'reservation_1' }),
      (error) => error.code === 'INVENTORY_ADAPTER_RESERVATION_INVALID',
    );
    assert.equal(calls.filter((call) => call === 'release:reservation_1').length, 1);
  }
});

test('failed insufficient reservation rolls back its event claim and can be retried', async () => {
  const { inventory, stock, calls } = moduleFixture({ quantity: 1 });
  const input = reserveInput({ quantity: 2 });
  await assert.rejects(
    inventory.reserve(input),
    (error) => error.code === 'INVENTORY_INSUFFICIENT',
  );
  stock.values().next().value.onHandQuantity = 2;
  const reserved = await inventory.reserve(input);
  assert.equal(reserved.state, 'reserved');
  assert.equal(calls.filter((call) => call === 'create:reservation_1').length, 1);
});

test('failed illegal transition rolls back its event claim and can be retried', async () => {
  const { inventory, reservations, calls } = moduleFixture();
  await inventory.reserve(reserveInput());
  await inventory.commit({ eventId: 'event_commit_1', reservationId: 'reservation_1' });
  const releaseInput = { eventId: 'event_release_1', reservationId: 'reservation_1' };
  await assert.rejects(
    inventory.release(releaseInput),
    (error) => error.code === 'INVENTORY_INVALID_TRANSITION',
  );
  reservations.get('reservation_1').state = 'reserved';
  const released = await inventory.release(releaseInput);
  assert.equal(released.state, 'released');
  assert.equal(calls.filter((call) => call === 'release:reservation_1').length, 1);
});
