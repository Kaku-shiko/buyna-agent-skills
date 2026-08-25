import {
  canonicalizeDeliveryIntent,
  digestDeliveryIntent,
  normalizeDeliveryValue,
} from './canonical-json.mjs';
import { failDelivery, requireDeliveryMethod } from './errors.mjs';
import {
  DEFAULT_DELIVERY_RETRY_POLICY,
  normalizeLeaseSeconds,
  normalizeRetryPolicy,
} from './retry-policy.mjs';
import { canTransition, DELIVERY_STATES, DELIVERY_TRANSITIONS } from './state-machine.mjs';

export { canonicalizeDeliveryIntent, digestDeliveryIntent } from './canonical-json.mjs';
export { DELIVERY_STATES, DELIVERY_TRANSITIONS } from './state-machine.mjs';
export { DEFAULT_DELIVERY_RETRY_POLICY } from './retry-policy.mjs';

export const DELIVERY_KINDS = Object.freeze(['inquiry', 'order', 'booking']);
export const DELIVERY_CHANNELS = Object.freeze(['email', 'sms']);

const RECORD_KEYS = Object.freeze([
  'version', 'deliveryId', 'projectId', 'sellerId', 'sourceEventId',
  'domainRecordId', 'domainEventId', 'idempotencyKey', 'intentDigest', 'intent',
  'state', 'requestKey', 'attempts', 'currentAttempt', 'attemptCount',
  'nextRetryAt', 'createdAt', 'updatedAt',
]);
const ATTEMPT_KEYS = Object.freeze([
  'attemptId', 'attemptNumber', 'workerId', 'claimedAt', 'leaseUntil', 'state',
  'deliveredAt', 'failedAt', 'receipt', 'failure',
]);
const INTENT_KEYS = Object.freeze([
  'kind', 'channel', 'templateKey', 'locale', 'recipientRef', 'payload',
]);
const SOURCE_KEYS = Object.freeze([
  'sourceEventId', 'projectId', 'sellerId', 'domainRecordId', 'domainEventId',
  'occurredAt', 'intent',
]);

function plain(value) {
  return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, keys) {
  if (!plain(value) || Object.getOwnPropertySymbols(value).length !== 0) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function exactAllowedKeys(value, allowed, required = allowed) {
  if (!plain(value) || Object.getOwnPropertySymbols(value).length !== 0) return false;
  const actual = Object.keys(value);
  return actual.every((key) => allowed.includes(key)) && required.every((key) => Object.hasOwn(value, key));
}

function text(value, code) {
  if (typeof value !== 'string' || value.trim() === '') failDelivery(code);
  return value.trim().normalize('NFC');
}

function iso(value, code) {
  if (typeof value !== 'string') failDelivery(code);
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) failDelivery(code);
  return date.toISOString();
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function frozenClone(value) {
  return deepFreeze(structuredClone(value));
}

function scopeFrom(projectId, sellerId) {
  return Object.freeze({
    projectId: text(projectId, 'DELIVERY_SCOPE_REQUIRED'),
    sellerId: text(sellerId, 'DELIVERY_SCOPE_REQUIRED'),
  });
}

function verifyCallerScope(input, scope) {
  if (
    (Object.hasOwn(input, 'projectId') && input.projectId !== scope.projectId)
    || (Object.hasOwn(input, 'sellerId') && input.sellerId !== scope.sellerId)
  ) failDelivery('DELIVERY_SCOPE_MISMATCH');
}

function verifyRowScope(value, scope) {
  if (value?.projectId !== scope.projectId || value?.sellerId !== scope.sellerId) {
    failDelivery('DELIVERY_SCOPE_MISMATCH');
  }
}

function normalizeIntent(value) {
  if (!exactKeys(value, INTENT_KEYS)) failDelivery('DELIVERY_INTENT_INVALID');
  const kind = text(value.kind, 'DELIVERY_INTENT_INVALID');
  const channel = text(value.channel, 'DELIVERY_INTENT_INVALID');
  if (!DELIVERY_KINDS.includes(kind) || !DELIVERY_CHANNELS.includes(channel)) {
    failDelivery('DELIVERY_INTENT_INVALID');
  }
  const normalized = {
    kind,
    channel,
    templateKey: text(value.templateKey, 'DELIVERY_INTENT_INVALID'),
    locale: text(value.locale, 'DELIVERY_INTENT_INVALID'),
    recipientRef: text(value.recipientRef, 'DELIVERY_INTENT_INVALID'),
    payload: normalizeDeliveryValue(value.payload),
  };
  return frozenClone(normalized);
}

function sourceIdentity(input, normalizedIntent) {
  return {
    version: 1,
    projectId: text(input.projectId, 'DELIVERY_SCOPE_REQUIRED'),
    sellerId: text(input.sellerId, 'DELIVERY_SCOPE_REQUIRED'),
    kind: normalizedIntent.kind,
    domainRecordId: text(input.domainRecordId, 'DELIVERY_SOURCE_EVENT_INVALID'),
    domainEventId: text(input.domainEventId, 'DELIVERY_SOURCE_EVENT_INVALID'),
    channel: normalizedIntent.channel,
    templateKey: normalizedIntent.templateKey,
  };
}

function deterministicSourceEventId(input, normalizedIntent) {
  return `notification-source:v1:${digestDeliveryIntent(sourceIdentity(input, normalizedIntent))}`;
}

export function createNotificationSourceEvent(input = {}) {
  if (!exactAllowedKeys(input, SOURCE_KEYS, SOURCE_KEYS.filter((key) => key !== 'sourceEventId'))) {
    failDelivery('DELIVERY_SOURCE_EVENT_INVALID');
  }
  const normalizedIntent = normalizeIntent(input.intent);
  const identity = sourceIdentity(input, normalizedIntent);
  const derivedId = deterministicSourceEventId(input, normalizedIntent);
  if (Object.hasOwn(input, 'sourceEventId') && input.sourceEventId !== derivedId) {
    failDelivery('DELIVERY_SOURCE_EVENT_INVALID');
  }
  return frozenClone({
    sourceEventId: derivedId,
    projectId: identity.projectId,
    sellerId: identity.sellerId,
    domainRecordId: identity.domainRecordId,
    domainEventId: identity.domainEventId,
    occurredAt: iso(input.occurredAt, 'DELIVERY_SOURCE_EVENT_INVALID'),
    intent: normalizedIntent,
  });
}

function normalizeSourceEvent(input) {
  if (!exactKeys(input, SOURCE_KEYS)) failDelivery('DELIVERY_SOURCE_EVENT_INVALID');
  const normalized = {
    sourceEventId: text(input.sourceEventId, 'DELIVERY_SOURCE_EVENT_INVALID'),
    projectId: text(input.projectId, 'DELIVERY_SCOPE_REQUIRED'),
    sellerId: text(input.sellerId, 'DELIVERY_SCOPE_REQUIRED'),
    domainRecordId: text(input.domainRecordId, 'DELIVERY_SOURCE_EVENT_INVALID'),
    domainEventId: text(input.domainEventId, 'DELIVERY_SOURCE_EVENT_INVALID'),
    occurredAt: iso(input.occurredAt, 'DELIVERY_SOURCE_EVENT_INVALID'),
    intent: normalizeIntent(input.intent),
  };
  if (!/^notification-source:v1:[0-9a-f]{64}$/.test(normalized.sourceEventId)) {
    failDelivery('DELIVERY_SOURCE_EVENT_INVALID');
  }
  if (normalized.sourceEventId !== deterministicSourceEventId(normalized, normalized.intent)) {
    failDelivery('DELIVERY_SOURCE_EVENT_INVALID');
  }
  return frozenClone(normalized);
}

function intentDigestFor(sourceEvent) {
  return digestDeliveryIntent({
    version: 1,
    projectId: sourceEvent.projectId,
    sellerId: sourceEvent.sellerId,
    sourceEventId: sourceEvent.sourceEventId,
    domainRecordId: sourceEvent.domainRecordId,
    domainEventId: sourceEvent.domainEventId,
    occurredAt: sourceEvent.occurredAt,
    intent: sourceEvent.intent,
  });
}

function validateAttempt(attempt, index, record, policy, lease) {
  if (!exactKeys(attempt, ATTEMPT_KEYS)) failDelivery('DELIVERY_RECORD_INVALID');
  try {
    if (
      text(attempt.attemptId, 'DELIVERY_RECORD_INVALID') !== attempt.attemptId
      || attempt.attemptNumber !== index + 1
      || text(attempt.workerId, 'DELIVERY_RECORD_INVALID') !== attempt.workerId
      || iso(attempt.claimedAt, 'DELIVERY_RECORD_INVALID') !== attempt.claimedAt
      || attempt.claimedAt < record.createdAt
      || attempt.claimedAt > record.updatedAt
      || !['sending', 'delivered', 'failed'].includes(attempt.state)
    ) failDelivery('DELIVERY_RECORD_INVALID');
  } catch {
    failDelivery('DELIVERY_RECORD_INVALID');
  }
  if (attempt.state === 'sending') {
    if (attempt.leaseUntil === null || iso(attempt.leaseUntil, 'DELIVERY_RECORD_INVALID') !== attempt.leaseUntil
      || attempt.leaseUntil !== new Date(new Date(attempt.claimedAt).valueOf() + lease * 1000).toISOString()
      || attempt.deliveredAt !== null || attempt.failedAt !== null
      || attempt.receipt !== null || attempt.failure !== null) failDelivery('DELIVERY_RECORD_INVALID');
  } else if (attempt.leaseUntil !== null) failDelivery('DELIVERY_RECORD_INVALID');
  if (attempt.state === 'delivered') {
    if (attempt.deliveredAt === null || attempt.failedAt !== null || attempt.receipt === null || attempt.failure !== null) failDelivery('DELIVERY_RECORD_INVALID');
    try {
      const receipt = normalizeReceipt(attempt.receipt);
      if (canonicalizeDeliveryIntent(receipt) !== canonicalizeDeliveryIntent(attempt.receipt)
        || iso(attempt.deliveredAt, 'DELIVERY_RECORD_INVALID') !== attempt.deliveredAt
        || attempt.deliveredAt < attempt.claimedAt
        || attempt.deliveredAt > record.updatedAt
        || receipt.acceptedAt < record.createdAt
        || receipt.acceptedAt > attempt.deliveredAt) failDelivery('DELIVERY_RECORD_INVALID');
    } catch {
      failDelivery('DELIVERY_RECORD_INVALID');
    }
  }
  if (attempt.state === 'failed') {
    if (attempt.failedAt === null || attempt.deliveredAt !== null || attempt.failure === null || attempt.receipt !== null) failDelivery('DELIVERY_RECORD_INVALID');
    try {
      const failure = normalizeFailure(attempt.failure);
      if (canonicalizeDeliveryIntent(failure) !== canonicalizeDeliveryIntent(attempt.failure)) failDelivery('DELIVERY_RECORD_INVALID');
      if (iso(attempt.failedAt, 'DELIVERY_RECORD_INVALID') !== attempt.failedAt
        || attempt.failedAt < attempt.claimedAt
        || attempt.failedAt > record.updatedAt) failDelivery('DELIVERY_RECORD_INVALID');
    } catch {
      failDelivery('DELIVERY_RECORD_INVALID');
    }
  }
  if (index < record.attempts.length - 1) {
    const next = record.attempts[index + 1];
    const delay = policy.delaysSeconds[index];
    const eligibleAt = new Date(new Date(attempt.failedAt).valueOf() + delay * 1000).toISOString();
    if (attempt.state !== 'failed' || attempt.failure?.retryable !== true || next?.claimedAt < eligibleAt) {
      failDelivery('DELIVERY_RECORD_INVALID');
    }
  }
}

function validateRecord(record, scope, policy, lease) {
  if (!exactKeys(record, RECORD_KEYS)) failDelivery('DELIVERY_RECORD_INVALID');
  verifyRowScope(record, scope);
  try {
    const normalizedIntent = normalizeIntent(record.intent);
    const canonicalIntent = canonicalizeDeliveryIntent(normalizedIntent);
    const digest = intentDigestFor({
      ...record,
      occurredAt: record.createdAt,
      intent: normalizedIntent,
    });
    const expectedSourceEventId = deterministicSourceEventId(record, normalizedIntent);
    if (
      !Number.isSafeInteger(record.version) || record.version < 1
      || text(record.deliveryId, 'DELIVERY_RECORD_INVALID') !== record.deliveryId
      || text(record.domainRecordId, 'DELIVERY_RECORD_INVALID') !== record.domainRecordId
      || text(record.domainEventId, 'DELIVERY_RECORD_INVALID') !== record.domainEventId
      || record.sourceEventId !== expectedSourceEventId
      || !/^[0-9a-f]{64}$/.test(record.intentDigest)
      || record.intentDigest !== digest
      || record.idempotencyKey !== `delivery:v1:${record.intentDigest}`
      || record.requestKey !== `delivery-request:v1:${record.intentDigest}`
      || canonicalizeDeliveryIntent(record.intent) !== canonicalIntent
      || !Array.isArray(record.attempts)
      || record.attemptCount !== record.attempts.length
      || iso(record.createdAt, 'DELIVERY_RECORD_INVALID') !== record.createdAt
      || iso(record.updatedAt, 'DELIVERY_RECORD_INVALID') !== record.updatedAt
      || record.updatedAt < record.createdAt
      || !Object.values(DELIVERY_STATES).includes(record.state)
    ) failDelivery('DELIVERY_RECORD_INVALID');
  } catch {
    failDelivery('DELIVERY_RECORD_INVALID');
  }
  const attemptIds = new Set();
  record.attempts.forEach((attempt, index) => {
    validateAttempt(attempt, index, record, policy, lease);
    if (attemptIds.has(attempt.attemptId)) failDelivery('DELIVERY_RECORD_INVALID');
    attemptIds.add(attempt.attemptId);
  });
  if (record.state === 'pending') {
    if (record.version !== 1 || record.attempts.length !== 0 || record.currentAttempt !== null || record.nextRetryAt !== null) failDelivery('DELIVERY_RECORD_INVALID');
  } else {
    const last = record.attempts.at(-1);
    if (!exactKeys(record.currentAttempt, ['attemptId', 'attemptNumber'])
      || record.currentAttempt.attemptId !== last?.attemptId
      || record.currentAttempt.attemptNumber !== last?.attemptNumber
      || last.state !== record.state) failDelivery('DELIVERY_RECORD_INVALID');
    const minimumVersion = record.attemptCount * 2 + (record.state === 'sending' ? 0 : 1);
    if (record.version < minimumVersion) failDelivery('DELIVERY_RECORD_INVALID');
    const stateTimestamp = record.state === 'sending' ? last.claimedAt
      : record.state === 'delivered' ? last.deliveredAt : last.failedAt;
    if (record.updatedAt !== stateTimestamp) failDelivery('DELIVERY_RECORD_INVALID');
  }
  const last = record.attempts.at(-1);
  const retryEligible = record.state === 'failed'
    && last.failure.retryable
    && record.attemptCount < policy.maxAttempts;
  const expectedNextRetryAt = retryEligible
    ? new Date(new Date(last.failedAt).valueOf() + policy.delaysSeconds[record.attemptCount - 1] * 1000).toISOString()
    : null;
  if (record.nextRetryAt !== expectedNextRetryAt) failDelivery('DELIVERY_RECORD_INVALID');
  return record;
}

function normalizeReceipt(receipt) {
  if (!exactAllowedKeys(receipt, ['providerMessageId', 'acceptedAt', 'providerStatus'], ['providerMessageId', 'acceptedAt'])) {
    failDelivery('DELIVERY_RECEIPT_INVALID');
  }
  const normalized = {
    providerMessageId: text(receipt.providerMessageId, 'DELIVERY_RECEIPT_INVALID'),
    acceptedAt: iso(receipt.acceptedAt, 'DELIVERY_RECEIPT_INVALID'),
    ...(Object.hasOwn(receipt, 'providerStatus') ? { providerStatus: text(receipt.providerStatus, 'DELIVERY_RECEIPT_INVALID') } : {}),
  };
  return frozenClone(normalized);
}

function normalizeFailure(failure) {
  if (!exactKeys(failure, ['code', 'retryable']) || typeof failure.retryable !== 'boolean') {
    failDelivery('DELIVERY_FAILURE_INVALID');
  }
  return Object.freeze({ code: text(failure.code, 'DELIVERY_FAILURE_INVALID'), retryable: failure.retryable });
}

function normalizeMessage(message) {
  if (!exactAllowedKeys(message, ['subject', 'text', 'html'], [])) failDelivery('DELIVERY_TEMPLATE_ERROR');
  const normalized = {};
  for (const key of ['subject', 'text', 'html']) {
    if (Object.hasOwn(message, key)) normalized[key] = text(message[key], 'DELIVERY_TEMPLATE_ERROR');
  }
  if (Object.keys(normalized).length === 0) failDelivery('DELIVERY_TEMPLATE_ERROR');
  return frozenClone(normalized);
}

function businessFailure(error, fallbackCode) {
  if (plain(error) && typeof error.code === 'string' && error.code.trim() !== '' && typeof error.retryable === 'boolean') {
    return Object.freeze({ code: error.code.trim().normalize('NFC'), retryable: error.retryable });
  }
  return Object.freeze({ code: fallbackCode, retryable: false });
}

async function invokeBusiness(work, fallbackCode) {
  try {
    return { ok: true, value: await work() };
  } catch (error) {
    return { ok: false, failure: businessFailure(error, fallbackCode) };
  }
}

export function createDeliveryStateCore({
  projectId,
  sellerId,
  store,
  clock = () => new Date(),
  deliveryIdGenerator,
  attemptIdGenerator,
  retryPolicy,
  leaseSeconds = 60,
} = {}) {
  const scope = scopeFrom(projectId, sellerId);
  const policy = normalizeRetryPolicy(retryPolicy);
  const lease = normalizeLeaseSeconds(leaseSeconds);
  requireDeliveryMethod(store, 'transaction', 'DELIVERY_STORE_ADAPTER_REQUIRED');
  requireDeliveryMethod(store, 'getDelivery', 'DELIVERY_STORE_ADAPTER_REQUIRED');
  if (typeof clock !== 'function') failDelivery('DELIVERY_CLOCK_INVALID');
  if (typeof deliveryIdGenerator !== 'function' || typeof attemptIdGenerator !== 'function') {
    failDelivery('DELIVERY_ID_GENERATOR_REQUIRED');
  }

  function timestamp(previous = null) {
    const raw = clock();
    const date = raw instanceof Date ? raw : new Date(raw);
    if (Number.isNaN(date.valueOf())) failDelivery('DELIVERY_CLOCK_INVALID');
    const value = date.toISOString();
    if (previous !== null && value < previous) failDelivery('DELIVERY_CLOCK_INVALID');
    return value;
  }

  function verifyInput(input) {
    if (!plain(input)) failDelivery('DELIVERY_SOURCE_EVENT_INVALID');
    verifyCallerScope(input, scope);
  }

  async function reconcileSourceEvent(input) {
    verifyInput(input);
    const event = normalizeSourceEvent(input);
    verifyRowScope(event, scope);
    const digest = intentDigestFor(event);
    return store.transaction(async (tx) => {
      const getExisting = requireDeliveryMethod(tx, 'getBySourceEventForUpdate', 'DELIVERY_STORE_ADAPTER_REQUIRED');
      const createDelivery = requireDeliveryMethod(tx, 'createDelivery', 'DELIVERY_STORE_ADAPTER_REQUIRED');
      const existing = await getExisting({ scope, sourceEventId: event.sourceEventId });
      if (existing) {
        validateRecord(existing, scope, policy, lease);
        if (existing.intentDigest !== digest
          || existing.domainRecordId !== event.domainRecordId
          || existing.domainEventId !== event.domainEventId) failDelivery('DELIVERY_IDEMPOTENCY_CONFLICT');
        return frozenClone(existing);
      }
      const at = timestamp(event.occurredAt);
      const deliveryId = text(deliveryIdGenerator(), 'DELIVERY_ID_GENERATOR_REQUIRED');
      const record = {
        version: 1,
        deliveryId,
        ...scope,
        sourceEventId: event.sourceEventId,
        domainRecordId: event.domainRecordId,
        domainEventId: event.domainEventId,
        idempotencyKey: `delivery:v1:${digest}`,
        intentDigest: digest,
        intent: event.intent,
        state: DELIVERY_STATES.PENDING,
        requestKey: `delivery-request:v1:${digest}`,
        attempts: [],
        currentAttempt: null,
        attemptCount: 0,
        nextRetryAt: null,
        createdAt: event.occurredAt,
        updatedAt: at,
      };
      validateRecord(record, scope, policy, lease);
      await createDelivery({ scope, record: frozenClone(record) });
      return frozenClone(record);
    });
  }

  async function get(input = {}) {
    verifyInput(input);
    const deliveryId = text(input.deliveryId, 'DELIVERY_SOURCE_EVENT_INVALID');
    const record = await store.getDelivery({ scope, deliveryId });
    if (!record) failDelivery('DELIVERY_NOT_FOUND');
    validateRecord(record, scope, policy, lease);
    return frozenClone(record);
  }

  async function lockedMutation(deliveryId, mutate) {
    return store.transaction(async (tx) => {
      const read = requireDeliveryMethod(tx, 'getDeliveryForUpdate', 'DELIVERY_STORE_ADAPTER_REQUIRED');
      const save = requireDeliveryMethod(tx, 'saveDelivery', 'DELIVERY_STORE_ADAPTER_REQUIRED');
      const current = await read({ scope, deliveryId });
      if (!current) failDelivery('DELIVERY_NOT_FOUND');
      validateRecord(current, scope, policy, lease);
      const next = await mutate(current);
      if (next === current) return frozenClone(current);
      validateRecord(next, scope, policy, lease);
      await save({ scope, expectedVersion: current.version, record: frozenClone(next) });
      return frozenClone(next);
    });
  }

  function newAttempt(record, workerId, at) {
    const attemptId = text(attemptIdGenerator(), 'DELIVERY_ID_GENERATOR_REQUIRED');
    const attemptNumber = record.attemptCount + 1;
    return {
      attemptId,
      attemptNumber,
      workerId,
      claimedAt: at,
      leaseUntil: new Date(new Date(at).valueOf() + lease * 1000).toISOString(),
      state: DELIVERY_STATES.SENDING,
      deliveredAt: null,
      failedAt: null,
      receipt: null,
      failure: null,
    };
  }

  async function claim(input = {}) {
    verifyInput(input);
    const deliveryId = text(input.deliveryId, 'DELIVERY_SOURCE_EVENT_INVALID');
    const workerId = text(input.workerId, 'DELIVERY_SOURCE_EVENT_INVALID');
    return lockedMutation(deliveryId, (current) => {
      const at = timestamp(current.updatedAt);
      if (current.state === DELIVERY_STATES.SENDING) {
        if (current.attempts.at(-1).leaseUntil > at) failDelivery('DELIVERY_LEASE_ACTIVE');
        failDelivery('DELIVERY_INVALID_TRANSITION');
      }
      if (!canTransition(current.state, DELIVERY_STATES.SENDING) || current.state !== DELIVERY_STATES.PENDING) {
        failDelivery('DELIVERY_INVALID_TRANSITION');
      }
      const attempt = newAttempt(current, workerId, at);
      return {
        ...current,
        version: current.version + 1,
        state: DELIVERY_STATES.SENDING,
        attempts: [...current.attempts, attempt],
        currentAttempt: { attemptId: attempt.attemptId, attemptNumber: attempt.attemptNumber },
        attemptCount: current.attemptCount + 1,
        nextRetryAt: null,
        updatedAt: at,
      };
    });
  }

  async function retry(input = {}) {
    verifyInput(input);
    const deliveryId = text(input.deliveryId, 'DELIVERY_SOURCE_EVENT_INVALID');
    const workerId = text(input.workerId, 'DELIVERY_SOURCE_EVENT_INVALID');
    return lockedMutation(deliveryId, (current) => {
      if (current.state !== DELIVERY_STATES.FAILED) failDelivery('DELIVERY_INVALID_TRANSITION');
      const last = current.attempts.at(-1);
      if (!last.failure.retryable || current.attemptCount >= policy.maxAttempts) failDelivery('DELIVERY_RETRY_EXHAUSTED');
      const at = timestamp(current.updatedAt);
      if (current.nextRetryAt === null || at < current.nextRetryAt) failDelivery('DELIVERY_RETRY_NOT_READY');
      const attempt = newAttempt(current, workerId, at);
      return {
        ...current,
        version: current.version + 1,
        state: DELIVERY_STATES.SENDING,
        attempts: [...current.attempts, attempt],
        currentAttempt: { attemptId: attempt.attemptId, attemptNumber: attempt.attemptNumber },
        attemptCount: current.attemptCount + 1,
        nextRetryAt: null,
        updatedAt: at,
      };
    });
  }

  async function recoverExpired(input = {}) {
    verifyInput(input);
    const deliveryId = text(input.deliveryId, 'DELIVERY_SOURCE_EVENT_INVALID');
    const workerId = text(input.workerId, 'DELIVERY_SOURCE_EVENT_INVALID');
    return lockedMutation(deliveryId, (current) => {
      if (current.state !== DELIVERY_STATES.SENDING) failDelivery('DELIVERY_INVALID_TRANSITION');
      const at = timestamp(current.updatedAt);
      const attempts = current.attempts.map((attempt, index) => {
        if (index !== current.attempts.length - 1) return attempt;
        if (attempt.leaseUntil > at) failDelivery('DELIVERY_LEASE_ACTIVE');
        return {
          ...attempt,
          workerId,
          claimedAt: at,
          leaseUntil: new Date(new Date(at).valueOf() + lease * 1000).toISOString(),
        };
      });
      return { ...current, version: current.version + 1, attempts, updatedAt: at };
    });
  }

  async function markDelivered(input = {}) {
    verifyInput(input);
    const deliveryId = text(input.deliveryId, 'DELIVERY_SOURCE_EVENT_INVALID');
    const attemptId = text(input.attemptId, 'DELIVERY_ATTEMPT_STALE');
    return lockedMutation(deliveryId, (current) => {
      if (current.state === DELIVERY_STATES.DELIVERED) {
        if (current.currentAttempt?.attemptId !== attemptId) failDelivery('DELIVERY_ATTEMPT_STALE');
        return current;
      }
      if (current.state !== DELIVERY_STATES.SENDING) failDelivery('DELIVERY_INVALID_TRANSITION');
      if (current.currentAttempt?.attemptId !== attemptId) failDelivery('DELIVERY_ATTEMPT_STALE');
      const at = timestamp(current.updatedAt);
      const normalizedReceipt = normalizeReceipt(input.receipt);
      if (normalizedReceipt.acceptedAt < current.createdAt || normalizedReceipt.acceptedAt > at) {
        failDelivery('DELIVERY_RECEIPT_INVALID');
      }
      const attempts = current.attempts.map((attempt, index) => index === current.attempts.length - 1 ? {
        ...attempt,
        state: DELIVERY_STATES.DELIVERED,
        leaseUntil: null,
        deliveredAt: at,
        receipt: normalizedReceipt,
      } : attempt);
      return { ...current, version: current.version + 1, state: DELIVERY_STATES.DELIVERED, attempts, nextRetryAt: null, updatedAt: at };
    });
  }

  async function markFailed(input = {}) {
    verifyInput(input);
    const deliveryId = text(input.deliveryId, 'DELIVERY_SOURCE_EVENT_INVALID');
    const attemptId = text(input.attemptId, 'DELIVERY_ATTEMPT_STALE');
    return lockedMutation(deliveryId, (current) => {
      if (current.state === DELIVERY_STATES.FAILED) {
        if (current.currentAttempt?.attemptId !== attemptId) failDelivery('DELIVERY_ATTEMPT_STALE');
        return current;
      }
      if (current.state !== DELIVERY_STATES.SENDING) failDelivery('DELIVERY_INVALID_TRANSITION');
      if (current.currentAttempt?.attemptId !== attemptId) failDelivery('DELIVERY_ATTEMPT_STALE');
      const normalizedFailure = normalizeFailure(input.failure);
      const at = timestamp(current.updatedAt);
      const mayRetry = normalizedFailure.retryable && current.attemptCount < policy.maxAttempts;
      const nextRetryAt = mayRetry
        ? new Date(new Date(at).valueOf() + policy.delaysSeconds[current.attemptCount - 1] * 1000).toISOString()
        : null;
      const attempts = current.attempts.map((attempt, index) => index === current.attempts.length - 1 ? {
        ...attempt,
        state: DELIVERY_STATES.FAILED,
        leaseUntil: null,
        failedAt: at,
        failure: normalizedFailure,
      } : attempt);
      return { ...current, version: current.version + 1, state: DELIVERY_STATES.FAILED, attempts, nextRetryAt, updatedAt: at };
    });
  }

  async function dispatch(input = {}) {
    verifyInput(input);
    requireDeliveryMethod(input.recipients, 'resolve', 'DELIVERY_RECIPIENT_ADAPTER_REQUIRED');
    requireDeliveryMethod(input.templates, 'render', 'DELIVERY_TEMPLATE_ADAPTER_REQUIRED');
    const before = await get({ deliveryId: input.deliveryId });
    const provider = input.providers?.[before.intent.channel];
    requireDeliveryMethod(provider, 'send', 'DELIVERY_PROVIDER_ADAPTER_REQUIRED');

    let sending;
    if (before.state === DELIVERY_STATES.PENDING) sending = await claim(input);
    else if (before.state === DELIVERY_STATES.FAILED) sending = await retry(input);
    else if (before.state === DELIVERY_STATES.SENDING) sending = await recoverExpired(input);
    else failDelivery('DELIVERY_INVALID_TRANSITION');

    const attemptId = sending.currentAttempt.attemptId;
    const recipientResult = await invokeBusiness(async () => {
      const value = await input.recipients.resolve({
        scope,
        recipientRef: sending.intent.recipientRef,
        channel: sending.intent.channel,
      });
      if (!exactKeys(value, ['address'])) failDelivery('DELIVERY_RECIPIENT_ERROR');
      return text(value.address, 'DELIVERY_RECIPIENT_ERROR');
    }, 'DELIVERY_RECIPIENT_ERROR');
    if (!recipientResult.ok) {
      return markFailed({ deliveryId: sending.deliveryId, attemptId, failure: recipientResult.failure });
    }

    const templateResult = await invokeBusiness(async () => normalizeMessage(await input.templates.render({
      scope,
      kind: sending.intent.kind,
      templateKey: sending.intent.templateKey,
      locale: sending.intent.locale,
      payload: sending.intent.payload,
    })), 'DELIVERY_TEMPLATE_ERROR');
    if (!templateResult.ok) {
      return markFailed({ deliveryId: sending.deliveryId, attemptId, failure: templateResult.failure });
    }

    const metadata = Object.freeze({
      deliveryId: sending.deliveryId,
      sourceEventId: sending.sourceEventId,
      attemptId,
    });
    const providerResult = await invokeBusiness(async () => normalizeReceipt(await provider.send({
      scope,
      requestKey: sending.requestKey,
      recipient: recipientResult.value,
      message: templateResult.value,
      metadata,
    })), 'DELIVERY_PROVIDER_ERROR');
    if (!providerResult.ok) {
      return markFailed({ deliveryId: sending.deliveryId, attemptId, failure: providerResult.failure });
    }
    return markDelivered({ deliveryId: sending.deliveryId, attemptId, receipt: providerResult.value });
  }

  return Object.freeze({
    reconcileSourceEvent,
    claim,
    markDelivered,
    markFailed,
    retry,
    recoverExpired,
    dispatch,
    get,
  });
}
