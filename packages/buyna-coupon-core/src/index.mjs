const STATES = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  PAUSED: 'paused',
  EXPIRED: 'expired',
  ARCHIVED: 'archived',
  RESERVED: 'reserved',
  REDEEMED: 'redeemed',
  RELEASED: 'released',
};

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const COUPON_STATES = deepFreeze({ ...STATES });
export const COUPON_TRANSITIONS = deepFreeze({
  [STATES.DRAFT]: [STATES.ACTIVE, STATES.ARCHIVED],
  [STATES.ACTIVE]: [
    STATES.PAUSED,
    STATES.EXPIRED,
    STATES.ARCHIVED,
    STATES.RESERVED,
  ],
  [STATES.PAUSED]: [STATES.ARCHIVED],
  [STATES.EXPIRED]: [STATES.ARCHIVED],
  [STATES.ARCHIVED]: [],
  [STATES.RESERVED]: [STATES.REDEEMED, STATES.RELEASED],
  [STATES.REDEEMED]: [],
  [STATES.RELEASED]: [],
});

function failure(code, message, details) {
  const error = new Error(message);
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function requiredText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw failure('COUPON_INVALID_INPUT', `${field} is required`, { field });
  }
  return value.trim();
}

function normalizeCode(value) {
  const code = requiredText(value, 'code').toUpperCase();
  if (code.length > 128) {
    throw failure('COUPON_INVALID_INPUT', 'code is too long', { field: 'code' });
  }
  return code;
}

function safeMoney(value, field, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw failure('COUPON_INVALID_MONEY', `${field} must be a non-negative safe integer`, {
      field,
    });
  }
  return value;
}

function positiveInteger(value, field, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw failure('COUPON_INVALID_INPUT', `${field} must be a positive integer`, { field });
  }
  return value;
}

function nonNegativeInteger(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw failure('COUPON_INVALID_INPUT', `${field} must be a non-negative integer`, { field });
  }
  return value;
}

function instant(value, field, { nullable = false } = {}) {
  if (nullable && (value === null || value === undefined)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    throw failure('COUPON_INVALID_INPUT', `${field} must be a valid timestamp`, { field });
  }
  return date.toISOString();
}

function normalizeDiscount(discount) {
  if (!discount || typeof discount !== 'object') {
    throw failure('COUPON_INVALID_INPUT', 'discount is required', { field: 'discount' });
  }
  if (discount.type === 'percentage') {
    const basisPoints = positiveInteger(discount.basisPoints, 'discount.basisPoints');
    if (basisPoints > 10_000) {
      throw failure('COUPON_INVALID_INPUT', 'percentage discount cannot exceed 100%', {
        field: 'discount.basisPoints',
      });
    }
    return { type: 'percentage', basisPoints };
  }
  if (discount.type === 'fixed') {
    return { type: 'fixed', amount: safeMoney(discount.amount, 'discount.amount') };
  }
  throw failure('COUPON_INVALID_INPUT', 'unsupported discount type', {
    field: 'discount.type',
  });
}

function immutable(value) {
  return deepFreeze(structuredClone(value));
}

function assertScope(record, projectId, sellerId) {
  if (record.projectId !== projectId || record.sellerId !== sellerId) {
    throw failure('COUPON_SCOPE_MISMATCH', 'coupon does not belong to the server scope');
  }
}

function assertTransition(from, to) {
  if (!COUPON_TRANSITIONS[from]?.includes(to)) {
    throw failure('COUPON_INVALID_TRANSITION', `cannot transition coupon from ${from} to ${to}`, {
      from,
      to,
    });
  }
}

function couponLookup(input) {
  if (input.couponId) return { couponId: requiredText(input.couponId, 'couponId') };
  if (input.couponCode) return { code: normalizeCode(input.couponCode) };
  throw failure('COUPON_INVALID_INPUT', 'couponId or couponCode is required');
}

function nowIso(clock) {
  const value = clock();
  return instant(value, 'clock');
}

function validateWindow(coupon, now) {
  if (coupon.validUntil && now >= coupon.validUntil) {
    throw failure('COUPON_EXPIRED', 'coupon validity window has ended');
  }
  if (coupon.validFrom && now < coupon.validFrom) {
    throw failure('COUPON_NOT_ELIGIBLE', 'coupon validity window has not started');
  }
}

function currentUsage(coupon, customerId) {
  const redeemedCount = nonNegativeInteger(coupon.redeemedCount ?? 0, 'redeemedCount');
  const reservedCount = nonNegativeInteger(coupon.reservedCount ?? 0, 'reservedCount');
  const perCustomerRedemptions = coupon.perCustomerRedemptions ?? {};
  const perCustomerReservations = coupon.perCustomerReservations ?? {};
  return {
    total: redeemedCount + reservedCount,
    customer:
      nonNegativeInteger(perCustomerRedemptions[customerId] ?? 0, 'perCustomerRedemptions') +
      nonNegativeInteger(perCustomerReservations[customerId] ?? 0, 'perCustomerReservations'),
  };
}

function quoteCoupon(coupon, input, now) {
  if (coupon.state !== STATES.ACTIVE) {
    if (coupon.state === STATES.EXPIRED) {
      throw failure('COUPON_EXPIRED', 'coupon is expired');
    }
    throw failure('COUPON_NOT_ELIGIBLE', 'coupon is not active');
  }
  validateWindow(coupon, now);

  const customerId = requiredText(input.customerId, 'customerId');
  const order = input.order ?? {};
  const itemQuantity = positiveInteger(order.itemQuantity, 'order.itemQuantity');
  const originalAmount = safeMoney(order.originalAmount, 'order.originalAmount');
  const currency = requiredText(order.currency, 'order.currency').toUpperCase();
  if (currency !== 'JPY') {
    throw failure('COUPON_INVALID_MONEY', 'coupon core currently requires integer JPY money', {
      field: 'order.currency',
    });
  }
  if (
    itemQuantity < coupon.minimumItemQuantity ||
    originalAmount < coupon.minimumOrderAmount
  ) {
    throw failure('COUPON_NOT_ELIGIBLE', 'order does not meet coupon requirements');
  }

  const usage = currentUsage(coupon, customerId);
  if (coupon.totalUsageLimit !== null && usage.total >= coupon.totalUsageLimit) {
    throw failure('COUPON_USAGE_LIMIT', 'coupon total usage limit reached');
  }
  if (
    coupon.perCustomerUsageLimit !== null &&
    usage.customer >= coupon.perCustomerUsageLimit
  ) {
    throw failure('COUPON_USAGE_LIMIT', 'coupon customer usage limit reached');
  }

  let discountAmount;
  if (coupon.discount.type === 'percentage') {
    discountAmount = Number(
      (BigInt(originalAmount) * BigInt(coupon.discount.basisPoints)) / 10_000n,
    );
  } else {
    discountAmount = coupon.discount.amount;
  }
  if (coupon.maximumDiscountAmount !== null) {
    discountAmount = Math.min(discountAmount, coupon.maximumDiscountAmount);
  }
  discountAmount = Math.min(discountAmount, originalAmount);

  return immutable({
    projectId: coupon.projectId,
    sellerId: coupon.sellerId,
    couponId: coupon.couponId,
    couponCode: coupon.code,
    policyVersion: coupon.policyVersion,
    customerId,
    currency,
    itemQuantity,
    originalAmount,
    discountAmount,
    payableAmount: originalAmount - discountAmount,
  });
}

function validateStore(store) {
  if (!store || typeof store.transaction !== 'function') {
    throw failure('COUPON_ADAPTER_INVALID', 'store.transaction is required');
  }
}

async function claim(tx, context) {
  if (typeof tx.claimCouponEvent !== 'function') {
    throw failure('COUPON_ADAPTER_INVALID', 'transaction claimCouponEvent is required');
  }
  const result = await tx.claimCouponEvent(context);
  if (!result || typeof result.claimed !== 'boolean') {
    throw failure('COUPON_ADAPTER_INVALID', 'claimCouponEvent returned an invalid result');
  }
  if (!result.claimed) {
    if (result.result === undefined) {
      throw failure('COUPON_EVENT_IN_PROGRESS', 'coupon event was claimed without a result');
    }
    return { duplicate: true, result: immutable(result.result) };
  }
  if (typeof result.complete !== 'function') {
    throw failure(
      'COUPON_ADAPTER_INVALID',
      'a newly claimed coupon event must provide complete(result)',
    );
  }
  return { duplicate: false, complete: result.complete };
}

async function completeClaim(claimResult, result) {
  await claimResult.complete(result);
}

const SNAPSHOT_FIELDS = Object.freeze([
  'projectId',
  'sellerId',
  'couponId',
  'couponCode',
  'policyVersion',
  'customerId',
  'currency',
  'itemQuantity',
  'originalAmount',
  'discountAmount',
  'payableAmount',
]);

function assertSnapshotScope(snapshot, scope) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw failure('COUPON_SNAPSHOT_MISMATCH', 'coupon snapshot is required');
  }
  if (snapshot.projectId !== scope.projectId || snapshot.sellerId !== scope.sellerId) {
    throw failure('COUPON_SCOPE_MISMATCH', 'coupon snapshot does not match server scope');
  }
}

function sameSnapshot(left, right) {
  return SNAPSHOT_FIELDS.every((field) => left?.[field] === right?.[field]);
}

function assertSameSnapshot(actual, expected) {
  if (!sameSnapshot(actual, expected)) {
    throw failure(
      'COUPON_SNAPSHOT_MISMATCH',
      'coupon snapshot differs from the authoritative locked quote',
    );
  }
}

function assertReservation(record, scope, reservationId) {
  if (!record) throw failure('COUPON_RESERVATION_NOT_FOUND', 'coupon reservation was not found');
  assertScope(record, scope.projectId, scope.sellerId);
  if (record.reservationId !== reservationId) {
    throw failure('COUPON_RESERVATION_NOT_FOUND', 'coupon reservation identity does not match');
  }
}

export function createCouponModule({ projectId, sellerId, store, clock = () => new Date() }) {
  const scope = {
    projectId: requiredText(projectId, 'projectId'),
    sellerId: requiredText(sellerId, 'sellerId'),
  };
  validateStore(store);
  if (typeof clock !== 'function') {
    throw failure('COUPON_INVALID_INPUT', 'clock must be a function');
  }

  async function createDraft(input = {}) {
    const eventId = requiredText(input.eventId, 'eventId');
    const couponId = requiredText(input.couponId, 'couponId');
    const validFrom = instant(input.validFrom, 'validFrom', { nullable: true });
    const validUntil = instant(input.validUntil, 'validUntil', { nullable: true });
    if (validFrom && validUntil && validUntil <= validFrom) {
      throw failure('COUPON_INVALID_INPUT', 'validUntil must be later than validFrom');
    }
    const record = {
      ...scope,
      couponId,
      code: normalizeCode(input.code),
      policyVersion: positiveInteger(input.policyVersion ?? 1, 'policyVersion'),
      state: STATES.DRAFT,
      discount: normalizeDiscount(input.discount),
      minimumItemQuantity: positiveInteger(
        input.minimumItemQuantity ?? 1,
        'minimumItemQuantity',
      ),
      minimumOrderAmount: safeMoney(
        input.minimumOrderAmount ?? 0,
        'minimumOrderAmount',
      ),
      maximumDiscountAmount: safeMoney(
        input.maximumDiscountAmount ?? null,
        'maximumDiscountAmount',
        { nullable: true },
      ),
      validFrom,
      validUntil,
      totalUsageLimit: positiveInteger(input.totalUsageLimit ?? null, 'totalUsageLimit', {
        nullable: true,
      }),
      perCustomerUsageLimit: positiveInteger(
        input.perCustomerUsageLimit ?? null,
        'perCustomerUsageLimit',
        { nullable: true },
      ),
      redeemedCount: 0,
      reservedCount: 0,
      perCustomerRedemptions: {},
      perCustomerReservations: {},
      createdAt: nowIso(clock),
      updatedAt: nowIso(clock),
    };

    return store.transaction(async (tx) => {
      const claimed = await claim(tx, { ...scope, eventId, operation: 'create_draft' });
      if (claimed.duplicate) return claimed.result;
      if (typeof tx.createCoupon !== 'function') {
        throw failure('COUPON_ADAPTER_INVALID', 'transaction createCoupon is required');
      }
      const saved = immutable(await tx.createCoupon(record));
      assertScope(saved, scope.projectId, scope.sellerId);
      await completeClaim(claimed, saved);
      return saved;
    });
  }

  async function transition(operation, targetState, input = {}) {
    const eventId = requiredText(input.eventId, 'eventId');
    const couponId = requiredText(input.couponId, 'couponId');
    return store.transaction(async (tx) => {
      const claimed = await claim(tx, { ...scope, eventId, operation });
      if (claimed.duplicate) return claimed.result;
      const current = await tx.getCouponForUpdate({ ...scope, couponId });
      if (!current) throw failure('COUPON_NOT_FOUND', 'coupon was not found');
      assertScope(current, scope.projectId, scope.sellerId);
      assertTransition(current.state, targetState);
      if (targetState === STATES.ACTIVE) validateWindow(current, nowIso(clock));
      const next = {
        ...current,
        reservation: undefined,
        state: targetState,
        updatedAt: nowIso(clock),
      };
      const saved = immutable(await tx.createCoupon(next));
      assertScope(saved, scope.projectId, scope.sellerId);
      await completeClaim(claimed, saved);
      return saved;
    });
  }

  async function quote(input = {}) {
    return store.transaction(async (tx) => {
      if (typeof tx.getCouponForUpdate !== 'function') {
        throw failure('COUPON_ADAPTER_INVALID', 'transaction getCouponForUpdate is required');
      }
      const current = await tx.getCouponForUpdate({ ...scope, ...couponLookup(input) });
      if (!current) throw failure('COUPON_NOT_FOUND', 'coupon was not found');
      assertScope(current, scope.projectId, scope.sellerId);
      return quoteCoupon(current, input, nowIso(clock));
    });
  }

  async function reserve(input = {}) {
    const eventId = requiredText(input.eventId, 'eventId');
    const reservationId = requiredText(input.reservationId, 'reservationId');
    const snapshot = immutable(input.snapshot);
    assertSnapshotScope(snapshot, scope);

    return store.transaction(async (tx) => {
      const claimed = await claim(tx, { ...scope, eventId, operation: 'reserve' });
      if (claimed.duplicate) return claimed.result;
      if (typeof tx.getCouponForUpdate !== 'function') {
        throw failure('COUPON_ADAPTER_INVALID', 'transaction getCouponForUpdate is required');
      }
      const current = await tx.getCouponForUpdate({
        ...scope,
        couponId: requiredText(snapshot.couponId, 'snapshot.couponId'),
        reservationId,
      });
      if (!current) throw failure('COUPON_NOT_FOUND', 'coupon was not found');
      assertScope(current, scope.projectId, scope.sellerId);
      if (current.reservation) {
        assertReservation(current.reservation, scope, reservationId);
        assertSameSnapshot(snapshot, current.reservation.discountSnapshot);
        if (current.reservation.state !== STATES.RESERVED) {
          throw failure(
            'COUPON_INVALID_TRANSITION',
            `cannot reserve a coupon reservation in ${current.reservation.state}`,
          );
        }
        await completeClaim(claimed, current.reservation);
        return immutable(current.reservation);
      }
      const authoritative = quoteCoupon(
        current,
        {
          customerId: snapshot.customerId,
          order: {
            itemQuantity: snapshot.itemQuantity,
            originalAmount: snapshot.originalAmount,
            currency: snapshot.currency,
          },
        },
        nowIso(clock),
      );
      assertSameSnapshot(snapshot, authoritative);
      if (typeof tx.createReservation !== 'function') {
        throw failure('COUPON_ADAPTER_INVALID', 'transaction createReservation is required');
      }
      const createdAt = nowIso(clock);
      const record = {
        ...scope,
        couponId: authoritative.couponId,
        reservationId,
        customerId: authoritative.customerId,
        state: STATES.RESERVED,
        discountSnapshot: authoritative,
        usageEffect: immutable({
          reservedDelta: 1,
          redeemedDelta: 0,
          customerId: authoritative.customerId,
        }),
        createdAt,
        updatedAt: createdAt,
      };
      const saved = immutable(await tx.createReservation(record));
      assertReservation(saved, scope, reservationId);
      if (saved.state !== STATES.RESERVED) {
        throw failure('COUPON_ADAPTER_INVALID', 'created reservation has an invalid state');
      }
      assertSameSnapshot(saved.discountSnapshot, authoritative);
      await completeClaim(claimed, saved);
      return saved;
    });
  }

  async function loadLockedReservation(tx, reservationId) {
    if (typeof tx.getCouponForUpdate !== 'function') {
      throw failure('COUPON_ADAPTER_INVALID', 'transaction getCouponForUpdate is required');
    }
    const coupon = await tx.getCouponForUpdate({ ...scope, reservationId });
    if (!coupon) throw failure('COUPON_NOT_FOUND', 'coupon was not found');
    assertScope(coupon, scope.projectId, scope.sellerId);
    assertReservation(coupon.reservation, scope, reservationId);
    return { coupon, reservation: coupon.reservation };
  }

  async function redeem(input = {}) {
    const eventId = requiredText(input.eventId, 'eventId');
    const reservationId = requiredText(input.reservationId, 'reservationId');
    const orderSnapshot = immutable(input.orderSnapshot);
    assertSnapshotScope(orderSnapshot, scope);

    return store.transaction(async (tx) => {
      const claimed = await claim(tx, { ...scope, eventId, operation: 'redeem' });
      if (claimed.duplicate) return claimed.result;
      const { reservation } = await loadLockedReservation(tx, reservationId);
      assertSameSnapshot(orderSnapshot, reservation.discountSnapshot);
      if (reservation.state === STATES.REDEEMED) {
        await completeClaim(claimed, reservation);
        return immutable(reservation);
      }
      assertTransition(reservation.state, STATES.REDEEMED);
      if (typeof tx.redeemReservation !== 'function') {
        throw failure('COUPON_ADAPTER_INVALID', 'transaction redeemReservation is required');
      }
      const next = {
        ...reservation,
        state: STATES.REDEEMED,
        usageEffect: immutable({
          reservedDelta: -1,
          redeemedDelta: 1,
          customerId: reservation.customerId,
        }),
        redeemedAt: nowIso(clock),
        updatedAt: nowIso(clock),
      };
      const saved = immutable(await tx.redeemReservation(next));
      assertReservation(saved, scope, reservationId);
      if (saved.state !== STATES.REDEEMED) {
        throw failure('COUPON_ADAPTER_INVALID', 'redeemed reservation has an invalid state');
      }
      assertSameSnapshot(saved.discountSnapshot, orderSnapshot);
      await completeClaim(claimed, saved);
      return saved;
    });
  }

  async function release(input = {}) {
    const eventId = requiredText(input.eventId, 'eventId');
    const reservationId = requiredText(input.reservationId, 'reservationId');
    const reason = requiredText(input.reason, 'reason');
    if (!['checkout_failed', 'checkout_expired', 'checkout_cancelled'].includes(reason)) {
      throw failure('COUPON_INVALID_INPUT', 'unsupported coupon release reason', {
        field: 'reason',
      });
    }

    return store.transaction(async (tx) => {
      const claimed = await claim(tx, { ...scope, eventId, operation: 'release' });
      if (claimed.duplicate) return claimed.result;
      const { reservation } = await loadLockedReservation(tx, reservationId);
      if (reservation.state === STATES.RELEASED) {
        if (reservation.releaseReason !== reason) {
          throw failure('COUPON_EVENT_CONFLICT', 'release reason differs from saved result');
        }
        await completeClaim(claimed, reservation);
        return immutable(reservation);
      }
      assertTransition(reservation.state, STATES.RELEASED);
      if (typeof tx.releaseReservation !== 'function') {
        throw failure('COUPON_ADAPTER_INVALID', 'transaction releaseReservation is required');
      }
      const next = {
        ...reservation,
        state: STATES.RELEASED,
        releaseReason: reason,
        usageEffect: immutable({
          reservedDelta: -1,
          redeemedDelta: 0,
          customerId: reservation.customerId,
        }),
        releasedAt: nowIso(clock),
        updatedAt: nowIso(clock),
      };
      const saved = immutable(await tx.releaseReservation(next));
      assertReservation(saved, scope, reservationId);
      if (saved.state !== STATES.RELEASED) {
        throw failure('COUPON_ADAPTER_INVALID', 'released reservation has an invalid state');
      }
      await completeClaim(claimed, saved);
      return saved;
    });
  }

  return Object.freeze({
    createDraft,
    activate: (input) => transition('activate', STATES.ACTIVE, input),
    pause: (input) => transition('pause', STATES.PAUSED, input),
    archive: (input) => transition('archive', STATES.ARCHIVED, input),
    quote,
    reserve,
    redeem,
    release,
  });
}
