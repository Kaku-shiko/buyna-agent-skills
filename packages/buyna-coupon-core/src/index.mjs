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
  [STATES.PAUSED]: [STATES.ACTIVE, STATES.ARCHIVED],
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
    const amount = safeMoney(discount.amount, 'discount.amount');
    if (amount === 0) {
      throw failure('COUPON_INVALID_INPUT', 'fixed discount must be positive', {
        field: 'discount.amount',
      });
    }
    return { type: 'fixed', amount };
  }
  throw failure('COUPON_INVALID_INPUT', 'unsupported discount type', {
    field: 'discount.type',
  });
}

function immutable(value) {
  return deepFreeze(structuredClone(value));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function snakeCase(value) {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
}

function requireMethods(owner, names) {
  for (const name of names) {
    if (typeof owner?.[name] !== 'function') {
      throw failure(
        `COUPON_ADAPTER_${snakeCase(name)}_REQUIRED`,
        `transaction ${name} is required`,
      );
    }
  }
}

function adapterInvalid(message) {
  throw failure('COUPON_ADAPTER_INVALID', message);
}

function assertScope(record, projectId, sellerId) {
  if (record.projectId !== projectId || record.sellerId !== sellerId) {
    throw failure('COUPON_SCOPE_MISMATCH', 'coupon does not belong to the server scope');
  }
}

const POLICY_STATES = new Set([
  STATES.DRAFT,
  STATES.ACTIVE,
  STATES.PAUSED,
  STATES.EXPIRED,
  STATES.ARCHIVED,
]);

function isNonNegativeSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function isNormalizedIso(value) {
  if (typeof value !== 'string') return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

function counterMapTotal(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  let total = 0n;
  for (const [customerId, count] of Object.entries(value)) {
    if (customerId.trim() === '' || !isNonNegativeSafeInteger(count)) return null;
    total += BigInt(count);
    if (total > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  }
  return Number(total);
}

function validateAuthoritativeCoupon(coupon) {
  try {
    if (!coupon || typeof coupon !== 'object') throw new Error('missing record');
    if (!POLICY_STATES.has(coupon.state)) throw new Error('illegal policy state');
    if (normalizeCode(coupon.code) !== coupon.code) throw new Error('unnormalized code');
    if (!isPositiveSafeInteger(coupon.policyVersion)) throw new Error('invalid policy version');

    const discount = coupon.discount;
    if (!discount || typeof discount !== 'object' || Array.isArray(discount)) {
      throw new Error('invalid discount');
    }
    if (discount.type === 'percentage') {
      if (!isPositiveSafeInteger(discount.basisPoints) || discount.basisPoints > 10_000) {
        throw new Error('invalid percentage discount');
      }
    } else if (discount.type === 'fixed') {
      if (!isPositiveSafeInteger(discount.amount)) throw new Error('invalid fixed discount');
    } else {
      throw new Error('unsupported discount');
    }

    if (!isPositiveSafeInteger(coupon.minimumItemQuantity)) {
      throw new Error('invalid minimum quantity');
    }
    if (!isNonNegativeSafeInteger(coupon.minimumOrderAmount)) {
      throw new Error('invalid minimum amount');
    }
    if (
      coupon.maximumDiscountAmount !== null
      && !isNonNegativeSafeInteger(coupon.maximumDiscountAmount)
    ) {
      throw new Error('invalid maximum discount');
    }
    for (const field of ['totalUsageLimit', 'perCustomerUsageLimit']) {
      if (coupon[field] !== null && !isPositiveSafeInteger(coupon[field])) {
        throw new Error(`invalid ${field}`);
      }
    }

    if (!isNonNegativeSafeInteger(coupon.redeemedCount)) {
      throw new Error('invalid redeemed count');
    }
    if (!isNonNegativeSafeInteger(coupon.reservedCount)) {
      throw new Error('invalid reserved count');
    }
    const redemptionMapTotal = counterMapTotal(coupon.perCustomerRedemptions);
    const reservationMapTotal = counterMapTotal(coupon.perCustomerReservations);
    if (
      redemptionMapTotal === null
      || reservationMapTotal === null
      || redemptionMapTotal !== coupon.redeemedCount
      || reservationMapTotal !== coupon.reservedCount
    ) {
      throw new Error('coupon usage counters are inconsistent');
    }
    const totalUsage = BigInt(coupon.redeemedCount) + BigInt(coupon.reservedCount);
    if (
      totalUsage > BigInt(Number.MAX_SAFE_INTEGER)
      || (coupon.totalUsageLimit !== null && totalUsage > BigInt(coupon.totalUsageLimit))
    ) {
      throw new Error('coupon total usage is inconsistent');
    }
    if (coupon.perCustomerUsageLimit !== null) {
      const customerIds = new Set([
        ...Object.keys(coupon.perCustomerRedemptions),
        ...Object.keys(coupon.perCustomerReservations),
      ]);
      for (const customerId of customerIds) {
        const used =
          (coupon.perCustomerRedemptions[customerId] ?? 0)
          + (coupon.perCustomerReservations[customerId] ?? 0);
        if (!Number.isSafeInteger(used) || used > coupon.perCustomerUsageLimit) {
          throw new Error('coupon customer usage is inconsistent');
        }
      }
    }

    for (const field of ['validFrom', 'validUntil']) {
      if (coupon[field] !== null && !isNormalizedIso(coupon[field])) {
        throw new Error(`invalid ${field}`);
      }
    }
    if (coupon.validFrom && coupon.validUntil && coupon.validUntil <= coupon.validFrom) {
      throw new Error('invalid validity order');
    }
    if (!isNormalizedIso(coupon.createdAt) || !isNormalizedIso(coupon.updatedAt)) {
      throw new Error('invalid audit timestamp');
    }
    if (coupon.updatedAt < coupon.createdAt) throw new Error('invalid audit timestamp order');
  } catch (error) {
    adapterInvalid(`authoritative coupon policy is invalid: ${error.message}`);
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
  const orderId = requiredText(order.orderId, 'order.orderId');
  const checkoutSnapshotId = requiredText(
    order.checkoutSnapshotId,
    'order.checkoutSnapshotId',
  );
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
    orderId,
    checkoutSnapshotId,
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
  const result = await tx.claimCouponEvent(context);
  if (!result || typeof result.claimed !== 'boolean') {
    throw failure('COUPON_ADAPTER_INVALID', 'claimCouponEvent returned an invalid result');
  }
  if (!result.claimed) {
    const event = result.event;
    if (
      !event
      || event.eventId !== context.eventId
      || event.projectId !== context.projectId
      || event.sellerId !== context.sellerId
      || event.operation !== context.operation
      || event.aggregateType !== context.aggregateType
      || event.aggregateId !== context.aggregateId
      || event.inputFingerprint !== context.inputFingerprint
    ) {
      throw failure('COUPON_EVENT_CONFLICT', 'coupon event envelope does not match input');
    }
    if (event.result === null || event.result === undefined) {
      throw failure('COUPON_EVENT_IN_PROGRESS', 'coupon event was claimed without a result');
    }
    if (
      typeof event.resultFingerprint !== 'string'
      || event.resultFingerprint !== fingerprint(event.result)
    ) {
      throw failure('COUPON_EVENT_CONFLICT', 'coupon event result fingerprint is invalid');
    }
    return { duplicate: true, result: immutable(event.result) };
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
  await claimResult.complete(result, { resultFingerprint: fingerprint(result) });
}

const SNAPSHOT_FIELDS = Object.freeze([
  'projectId',
  'sellerId',
  'couponId',
  'couponCode',
  'policyVersion',
  'customerId',
  'orderId',
  'checkoutSnapshotId',
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

function eventContext(scope, eventId, operation, aggregateType, aggregateId, input) {
  return {
    ...scope,
    eventId,
    operation,
    aggregateType,
    aggregateId,
    inputFingerprint: fingerprint(input),
  };
}

function valuesMatch(actual, expected, fields = Object.keys(expected)) {
  if (!actual || typeof actual !== 'object') return false;
  return fields.every(
    (field) => JSON.stringify(canonicalize(actual[field])) === JSON.stringify(canonicalize(expected[field])),
  );
}

function assertAdapterWrite(actual, expected, label) {
  if (!valuesMatch(actual, expected)) {
    adapterInvalid(`${label} returned a record that differs from the requested write`);
  }
}

function assertReplay(actual, expected, fields, label) {
  if (!valuesMatch(actual, expected, fields)) {
    throw failure('COUPON_EVENT_CONFLICT', `${label} replay result does not match the event`);
  }
}

function reservationUsageEffect(state, customerId) {
  if (state === STATES.RESERVED) {
    return immutable({ reservedDelta: 1, redeemedDelta: 0, customerId });
  }
  if (state === STATES.REDEEMED) {
    return immutable({ reservedDelta: -1, redeemedDelta: 1, customerId });
  }
  return immutable({ reservedDelta: -1, redeemedDelta: 0, customerId });
}

const RESERVATION_REPLAY_FIELDS = Object.freeze([
  'projectId',
  'sellerId',
  'couponId',
  'reservationId',
  'customerId',
  'state',
  'discountSnapshot',
  'usageEffect',
]);

function assertReplayReservationAgainstLocked(result, locked) {
  if (
    result?.projectId !== locked?.projectId
    || result?.sellerId !== locked?.sellerId
    || result?.couponId !== locked?.couponId
    || result?.reservationId !== locked?.reservationId
    || result?.customerId !== locked?.customerId
    || !sameSnapshot(result?.discountSnapshot, locked?.discountSnapshot)
  ) {
    throw failure(
      'COUPON_EVENT_CONFLICT',
      'coupon replay result does not match the locked reservation snapshot',
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
    const policy = {
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
    };
    const at = nowIso(clock);
    const record = {
      ...policy,
      createdAt: at,
      updatedAt: at,
    };

    return store.transaction(async (tx) => {
      requireMethods(tx, ['claimCouponEvent', 'createCoupon']);
      const claimed = await claim(
        tx,
        eventContext(scope, eventId, 'create_draft', 'coupon', couponId, policy),
      );
      if (claimed.duplicate) {
        assertReplay(claimed.result, policy, Object.keys(policy), 'create draft');
        return claimed.result;
      }
      const adapterResult = await tx.createCoupon(record);
      assertAdapterWrite(adapterResult, record, 'createCoupon');
      const saved = immutable(adapterResult);
      assertScope(saved, scope.projectId, scope.sellerId);
      await completeClaim(claimed, saved);
      return saved;
    });
  }

  async function transition(operation, targetState, input = {}) {
    const eventId = requiredText(input.eventId, 'eventId');
    const couponId = requiredText(input.couponId, 'couponId');
    return store.transaction(async (tx) => {
      requireMethods(tx, ['claimCouponEvent', 'getCouponForUpdate', 'createCoupon']);
      const claimed = await claim(
        tx,
        eventContext(scope, eventId, operation, 'coupon', couponId, {
          couponId,
          targetState,
        }),
      );
      if (claimed.duplicate) {
        assertReplay(
          claimed.result,
          { ...scope, couponId, state: targetState },
          ['projectId', 'sellerId', 'couponId', 'state'],
          operation,
        );
        return claimed.result;
      }
      const current = await tx.getCouponForUpdate({ ...scope, couponId });
      if (!current) throw failure('COUPON_NOT_FOUND', 'coupon was not found');
      assertScope(current, scope.projectId, scope.sellerId);
      if (current.couponId !== couponId) adapterInvalid('locked coupon identity is invalid');
      validateAuthoritativeCoupon(current);
      assertTransition(current.state, targetState);
      if (targetState === STATES.ACTIVE) validateWindow(current, nowIso(clock));
      const next = {
        ...current,
        reservation: undefined,
        state: targetState,
        updatedAt: nowIso(clock),
      };
      const adapterResult = await tx.createCoupon(next);
      assertAdapterWrite(adapterResult, next, 'createCoupon');
      const saved = immutable(adapterResult);
      assertScope(saved, scope.projectId, scope.sellerId);
      await completeClaim(claimed, saved);
      return saved;
    });
  }

  async function deleteCoupon(input = {}) {
    const eventId=requiredText(input.eventId,'eventId');
    const couponId=requiredText(input.couponId,'couponId');
    return store.transaction(async tx=>{
      requireMethods(tx,['claimCouponEvent','getCouponForUpdate','deleteCoupon']);
      const claimed=await claim(tx,eventContext(scope,eventId,'delete','coupon',couponId,{couponId}));
      const result={...scope,couponId,deleted:true};
      if(claimed.duplicate){
        assertReplay(claimed.result,result,Object.keys(result),'delete');
        return claimed.result;
      }
      const current=await tx.getCouponForUpdate({...scope,couponId});
      if(!current)throw failure('COUPON_NOT_FOUND','coupon was not found');
      assertScope(current,scope.projectId,scope.sellerId);
      if(current.couponId!==couponId)adapterInvalid('locked coupon identity is invalid');
      validateAuthoritativeCoupon(current);
      if(current.reservedCount>0||current.redeemedCount>0)throw failure('COUPON_DELETE_REFERENCED','coupon has reservations or redemptions');
      const removed=await tx.deleteCoupon({...scope,couponId});
      assertAdapterWrite(removed,result,'deleteCoupon');
      await completeClaim(claimed,result);
      return immutable(result);
    });
  }

  async function quote(input = {}) {
    return store.transaction(async (tx) => {
      requireMethods(tx, ['getCouponForUpdate']);
      const lookup = couponLookup(input);
      const current = await tx.getCouponForUpdate({ ...scope, ...lookup });
      if (!current) throw failure('COUPON_NOT_FOUND', 'coupon was not found');
      assertScope(current, scope.projectId, scope.sellerId);
      if (
        (lookup.couponId && current.couponId !== lookup.couponId)
        || (lookup.code && current.code !== lookup.code)
      ) {
        adapterInvalid('locked coupon does not match the requested identity');
      }
      validateAuthoritativeCoupon(current);
      return quoteCoupon(current, input, nowIso(clock));
    });
  }

  async function reserve(input = {}) {
    const eventId = requiredText(input.eventId, 'eventId');
    const reservationId = requiredText(input.reservationId, 'reservationId');
    const snapshot = immutable(input.snapshot);
    assertSnapshotScope(snapshot, scope);

    return store.transaction(async (tx) => {
      requireMethods(tx, ['claimCouponEvent', 'getCouponForUpdate', 'createReservation']);
      const claimed = await claim(
        tx,
        eventContext(scope, eventId, 'reserve', 'coupon_reservation', reservationId, {
          reservationId,
          snapshot,
        }),
      );
      const replayExpected = {
        ...scope,
        couponId: snapshot.couponId,
        reservationId,
        customerId: snapshot.customerId,
        state: STATES.RESERVED,
        discountSnapshot: snapshot,
        usageEffect: reservationUsageEffect(STATES.RESERVED, snapshot.customerId),
      };
      if (claimed.duplicate) {
        assertReplay(
          claimed.result,
          replayExpected,
          RESERVATION_REPLAY_FIELDS,
          'coupon reservation',
        );
        const { reservation } = await loadLockedReservation(tx, reservationId);
        assertReplayReservationAgainstLocked(claimed.result, reservation);
        return claimed.result;
      }
      const current = await tx.getCouponForUpdate({
        ...scope,
        couponId: requiredText(snapshot.couponId, 'snapshot.couponId'),
        reservationId,
      });
      if (!current) throw failure('COUPON_NOT_FOUND', 'coupon was not found');
      assertScope(current, scope.projectId, scope.sellerId);
      if (current.couponId !== snapshot.couponId) {
        adapterInvalid('locked coupon does not match the reservation snapshot identity');
      }
      validateAuthoritativeCoupon(current);
      if (current.reservation) {
        assertReservation(current.reservation, scope, reservationId);
        assertSameSnapshot(snapshot, current.reservation.discountSnapshot);
        if (current.reservation.state !== STATES.RESERVED) {
          throw failure(
            'COUPON_INVALID_TRANSITION',
            `cannot reserve a coupon reservation in ${current.reservation.state}`,
          );
        }
        assertAdapterWrite(
          Object.fromEntries(
            RESERVATION_REPLAY_FIELDS.map((field) => [field, current.reservation[field]]),
          ),
          Object.fromEntries(
            RESERVATION_REPLAY_FIELDS.map((field) => [field, replayExpected[field]]),
          ),
          'existing coupon reservation',
        );
        await completeClaim(claimed, current.reservation);
        return immutable(current.reservation);
      }
      const authoritative = quoteCoupon(
        current,
        {
          customerId: snapshot.customerId,
          order: {
            orderId: snapshot.orderId,
            checkoutSnapshotId: snapshot.checkoutSnapshotId,
            itemQuantity: snapshot.itemQuantity,
            originalAmount: snapshot.originalAmount,
            currency: snapshot.currency,
          },
        },
        nowIso(clock),
      );
      assertSameSnapshot(snapshot, authoritative);
      const createdAt = nowIso(clock);
      const record = {
        ...scope,
        couponId: authoritative.couponId,
        reservationId,
        customerId: authoritative.customerId,
        state: STATES.RESERVED,
        discountSnapshot: authoritative,
        usageEffect: reservationUsageEffect(STATES.RESERVED, authoritative.customerId),
        createdAt,
        updatedAt: createdAt,
      };
      const adapterRecord = await tx.createReservation(record);
      assertAdapterWrite(adapterRecord, record, 'createReservation');
      const saved = immutable(adapterRecord);
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
    requireMethods(tx, ['getCouponForUpdate']);
    const coupon = await tx.getCouponForUpdate({ ...scope, reservationId });
    if (!coupon) throw failure('COUPON_NOT_FOUND', 'coupon was not found');
    assertScope(coupon, scope.projectId, scope.sellerId);
    assertReservation(coupon.reservation, scope, reservationId);
    if (coupon.couponId !== coupon.reservation.couponId) {
      adapterInvalid('locked coupon and reservation identities do not match');
    }
    return { coupon, reservation: coupon.reservation };
  }

  async function redeem(input = {}) {
    const eventId = requiredText(input.eventId, 'eventId');
    const reservationId = requiredText(input.reservationId, 'reservationId');
    const orderSnapshot = immutable(input.orderSnapshot);
    assertSnapshotScope(orderSnapshot, scope);

    return store.transaction(async (tx) => {
      requireMethods(tx, ['claimCouponEvent', 'getCouponForUpdate', 'redeemReservation']);
      const claimed = await claim(
        tx,
        eventContext(scope, eventId, 'redeem', 'coupon_reservation', reservationId, {
          reservationId,
          orderSnapshot,
        }),
      );
      const replayExpected = {
        ...scope,
        couponId: orderSnapshot.couponId,
        reservationId,
        customerId: orderSnapshot.customerId,
        state: STATES.REDEEMED,
        discountSnapshot: orderSnapshot,
        usageEffect: reservationUsageEffect(STATES.REDEEMED, orderSnapshot.customerId),
      };
      if (claimed.duplicate) {
        assertReplay(
          claimed.result,
          replayExpected,
          RESERVATION_REPLAY_FIELDS,
          'coupon redemption',
        );
        const { reservation } = await loadLockedReservation(tx, reservationId);
        assertReplayReservationAgainstLocked(claimed.result, reservation);
        return claimed.result;
      }
      const { reservation } = await loadLockedReservation(tx, reservationId);
      assertSameSnapshot(orderSnapshot, reservation.discountSnapshot);
      if (reservation.state === STATES.REDEEMED) {
        assertReplay(
          reservation,
          replayExpected,
          RESERVATION_REPLAY_FIELDS,
          'coupon redemption',
        );
        await completeClaim(claimed, reservation);
        return immutable(reservation);
      }
      assertTransition(reservation.state, STATES.REDEEMED);
      const next = {
        ...reservation,
        state: STATES.REDEEMED,
        usageEffect: reservationUsageEffect(STATES.REDEEMED, reservation.customerId),
        redeemedAt: nowIso(clock),
        updatedAt: nowIso(clock),
      };
      const adapterRecord = await tx.redeemReservation(next);
      assertAdapterWrite(adapterRecord, next, 'redeemReservation');
      const saved = immutable(adapterRecord);
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
      requireMethods(tx, ['claimCouponEvent', 'getCouponForUpdate', 'releaseReservation']);
      const claimed = await claim(
        tx,
        eventContext(scope, eventId, 'release', 'coupon_reservation', reservationId, {
          reservationId,
          reason,
        }),
      );
      if (claimed.duplicate) {
        assertReplay(
          claimed.result,
          {
            ...scope,
            reservationId,
            state: STATES.RELEASED,
            releaseReason: reason,
            usageEffect: reservationUsageEffect(
              STATES.RELEASED,
              claimed.result?.customerId,
            ),
          },
          [
            'projectId',
            'sellerId',
            'reservationId',
            'state',
            'releaseReason',
            'usageEffect',
          ],
          'coupon release',
        );
        const { reservation } = await loadLockedReservation(tx, reservationId);
        assertReplayReservationAgainstLocked(claimed.result, reservation);
        return claimed.result;
      }
      const { reservation } = await loadLockedReservation(tx, reservationId);
      if (reservation.state === STATES.RELEASED) {
        if (reservation.releaseReason !== reason) {
          throw failure('COUPON_EVENT_CONFLICT', 'release reason differs from saved result');
        }
        if (
          !valuesMatch(
            reservation.usageEffect,
            reservationUsageEffect(STATES.RELEASED, reservation.customerId),
          )
        ) {
          adapterInvalid('released reservation usage effect is invalid');
        }
        await completeClaim(claimed, reservation);
        return immutable(reservation);
      }
      assertTransition(reservation.state, STATES.RELEASED);
      const next = {
        ...reservation,
        state: STATES.RELEASED,
        releaseReason: reason,
        usageEffect: reservationUsageEffect(STATES.RELEASED, reservation.customerId),
        releasedAt: nowIso(clock),
        updatedAt: nowIso(clock),
      };
      const adapterRecord = await tx.releaseReservation(next);
      assertAdapterWrite(adapterRecord, next, 'releaseReservation');
      const saved = immutable(adapterRecord);
      assertReservation(saved, scope, reservationId);
      if (saved.state !== STATES.RELEASED) {
        throw failure('COUPON_ADAPTER_INVALID', 'released reservation has an invalid state');
      }
      if (saved.releaseReason !== reason) {
        adapterInvalid('released reservation reason is invalid');
      }
      await completeClaim(claimed, saved);
      return saved;
    });
  }

  return Object.freeze({
    createDraft,
    deleteCoupon,
    activate: (input) => transition('activate', STATES.ACTIVE, input),
    pause: (input) => transition('pause', STATES.PAUSED, input),
    archive: (input) => transition('archive', STATES.ARCHIVED, input),
    quote,
    reserve,
    redeem,
    release,
  });
}
import { createHash } from 'node:crypto';
