function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function requiredText(value, code) {
  if (typeof value !== 'string' || value.trim() === '') fail(code);
  return value.trim();
}

function method(owner, name) {
  if (typeof owner?.[name] !== 'function') {
    fail(`INVENTORY_ADAPTER_${name.toUpperCase()}_REQUIRED`);
  }
}

function quantity(value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    fail('INVENTORY_INVALID_QUANTITY');
  }
  return value;
}

function nonNegativeInteger(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail('INVENTORY_STOCK_INVALID');
  }
  return value;
}

export const INVENTORY_STATES = Object.freeze({
  AVAILABLE: 'available',
  RESERVED: 'reserved',
  COMMITTED: 'committed',
  RELEASED: 'released',
  INSUFFICIENT: 'insufficient',
});

export const INVENTORY_TRANSITIONS = Object.freeze({
  available: Object.freeze([
    INVENTORY_STATES.RESERVED,
    INVENTORY_STATES.INSUFFICIENT,
  ]),
  reserved: Object.freeze([
    INVENTORY_STATES.COMMITTED,
    INVENTORY_STATES.RELEASED,
    INVENTORY_STATES.INSUFFICIENT,
  ]),
  committed: Object.freeze([]),
  released: Object.freeze([]),
  insufficient: Object.freeze([]),
});

function scopeFrom(projectId, sellerId) {
  return Object.freeze({
    projectId: requiredText(projectId, 'INVENTORY_SCOPE_REQUIRED'),
    sellerId: requiredText(sellerId, 'INVENTORY_SCOPE_REQUIRED'),
  });
}

function verifyCallerScope(input, scope) {
  if (
    (Object.hasOwn(input, 'projectId') && input.projectId !== scope.projectId)
    || (Object.hasOwn(input, 'sellerId') && input.sellerId !== scope.sellerId)
  ) {
    fail('INVENTORY_SCOPE_MISMATCH');
  }
}

function verifyRecordScope(record, scope) {
  if (
    record?.projectId !== scope.projectId
    || record?.sellerId !== scope.sellerId
  ) {
    fail('INVENTORY_SCOPE_MISMATCH');
  }
}

function serializable(record) {
  return structuredClone(record);
}

function eventResult(claim, expected, scope) {
  const event = claim?.event;
  if (!event) fail('INVENTORY_EVENT_INVALID');
  verifyRecordScope(event.scope, scope);
  if (
    event.operation !== expected.operation
    || event.reservationId !== expected.reservationId
  ) {
    fail('INVENTORY_EVENT_CONFLICT');
  }
  if (!event.result) fail('INVENTORY_EVENT_INCOMPLETE');
  verifyRecordScope(event.result, scope);
  return serializable(event.result);
}

function verifyReservationIdentity(reservation, input) {
  if (
    reservation.productId !== input.productId
    || reservation.skuId !== input.skuId
    || reservation.quantity !== input.quantity
  ) {
    fail('INVENTORY_RESERVATION_CONFLICT');
  }
}

export function createInventoryModule({ projectId, sellerId, store, clock } = {}) {
  const scope = scopeFrom(projectId, sellerId);
  method(store, 'transaction');
  const now = typeof clock === 'function' ? clock : () => new Date();

  function timestamp() {
    const value = now();
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.valueOf())) fail('INVENTORY_CLOCK_INVALID');
    return date.toISOString();
  }

  async function reserve(input = {}) {
    verifyCallerScope(input, scope);
    const eventId = requiredText(input.eventId, 'INVENTORY_EVENT_ID_REQUIRED');
    const reservationId = requiredText(
      input.reservationId,
      'INVENTORY_RESERVATION_ID_REQUIRED',
    );
    const productId = requiredText(input.productId, 'INVENTORY_PRODUCT_REQUIRED');
    const skuId = requiredText(input.skuId, 'INVENTORY_SKU_REQUIRED');
    const requestedQuantity = quantity(input.quantity);

    return store.transaction(async (tx) => {
      method(tx, 'claimReservationEvent');
      method(tx, 'getStockForUpdate');
      method(tx, 'createReservation');
      const claimInput = {
        scope,
        operation: 'reserve',
        eventId,
        reservationId,
      };
      const claim = await tx.claimReservationEvent(claimInput);
      if (claim?.claimed !== true) return eventResult(claim, claimInput, scope);

      if (claim.reservation) {
        verifyRecordScope(claim.reservation, scope);
        verifyReservationIdentity(claim.reservation, {
          productId,
          skuId,
          quantity: requestedQuantity,
        });
        method(claim, 'complete');
        await claim.complete(claim.reservation);
        return serializable(claim.reservation);
      }

      const stock = await tx.getStockForUpdate({ scope, productId, skuId });
      if (!stock) fail('INVENTORY_INSUFFICIENT');
      verifyRecordScope(stock, scope);
      if (stock.productId !== productId || stock.skuId !== skuId) {
        fail('INVENTORY_SCOPE_MISMATCH');
      }
      const onHandQuantity = nonNegativeInteger(stock.onHandQuantity);
      const reservedQuantity = nonNegativeInteger(stock.reservedQuantity);
      if (onHandQuantity - reservedQuantity < requestedQuantity) {
        fail('INVENTORY_INSUFFICIENT');
      }

      const at = timestamp();
      const reservation = {
        ...scope,
        reservationId,
        productId,
        skuId,
        quantity: requestedQuantity,
        state: INVENTORY_STATES.RESERVED,
        createdAt: at,
        updatedAt: at,
      };
      await tx.createReservation({ scope, eventId, reservation });
      return serializable(reservation);
    });
  }

  async function transition(operation, targetState, adapterMethod, input = {}) {
    verifyCallerScope(input, scope);
    const eventId = requiredText(input.eventId, 'INVENTORY_EVENT_ID_REQUIRED');
    const reservationId = requiredText(
      input.reservationId,
      'INVENTORY_RESERVATION_ID_REQUIRED',
    );

    return store.transaction(async (tx) => {
      method(tx, 'claimReservationEvent');
      method(tx, adapterMethod);
      const claimInput = { scope, operation, eventId, reservationId };
      const claim = await tx.claimReservationEvent(claimInput);
      if (claim?.claimed !== true) return eventResult(claim, claimInput, scope);
      const current = claim.reservation;
      if (!current) fail('INVENTORY_RESERVATION_NOT_FOUND');
      verifyRecordScope(current, scope);

      if (current.state === targetState) {
        method(claim, 'complete');
        await claim.complete(current);
        return serializable(current);
      }
      if (!INVENTORY_TRANSITIONS[current.state]?.includes(targetState)) {
        fail('INVENTORY_INVALID_TRANSITION');
      }

      const reservation = {
        ...current,
        state: targetState,
        updatedAt: timestamp(),
      };
      await tx[adapterMethod]({ scope, eventId, reservation });
      return serializable(reservation);
    });
  }

  return Object.freeze({
    reserve,
    commit: (input) => transition(
      'commit',
      INVENTORY_STATES.COMMITTED,
      'commitReservation',
      input,
    ),
    release: (input) => transition(
      'release',
      INVENTORY_STATES.RELEASED,
      'releaseReservation',
      input,
    ),
  });
}
