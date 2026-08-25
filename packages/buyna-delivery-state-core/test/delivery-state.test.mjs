import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DELIVERY_CHANNELS,
  DELIVERY_KINDS,
  DELIVERY_STATES,
  DELIVERY_TRANSITIONS,
  canonicalizeDeliveryIntent,
  createDeliveryStateCore,
  createNotificationSourceEvent,
  digestDeliveryIntent,
} from '../src/index.mjs';

const SCOPE = Object.freeze({ projectId: 'project_alpha', sellerId: 'seller_alpha' });

function expectCode(code) {
  return (error) => error?.code === code;
}

function clock(start = '2026-08-26T00:00:00.000Z') {
  let value = new Date(start);
  const now = () => new Date(value);
  now.set = (next) => { value = new Date(next); };
  return now;
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

class MemoryStore {
  deliveries = new Map();
  scopes = [];
  writes = [];
  #tail = Promise.resolve();

  async transaction(work) {
    let release;
    const turn = new Promise((resolve) => { release = resolve; });
    const previous = this.#tail;
    this.#tail = turn;
    await previous;
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
        const current = this.deliveries.get(record.deliveryId);
        if (current?.version !== expectedVersion) throw Object.assign(new Error('occ'), { code: 'STORE_OCC' });
        this.deliveries.set(record.deliveryId, clone(record));
        this.writes.push(['save', clone(record)]);
      },
    };
    try { return await work(tx); } finally { release(); }
  }

  async getDelivery({ scope, deliveryId }) {
    this.#scope(scope);
    return clone(this.deliveries.get(deliveryId));
  }

  #scope(scope) {
    assert.deepEqual(scope, SCOPE);
    assert.ok(Object.isFrozen(scope));
    this.scopes.push(scope);
  }
}

function intent(overrides = {}) {
  return {
    kind: 'order',
    channel: 'email',
    templateKey: 'order-paid',
    locale: 'ja-JP',
    recipientRef: 'customer:42',
    payload: { orderId: 'order-42', labels: ['a', 'b'] },
    ...overrides,
  };
}

function source(overrides = {}) {
  return createNotificationSourceEvent({
    ...SCOPE,
    domainRecordId: 'order-42',
    domainEventId: 'paid-1',
    occurredAt: '2026-08-25T23:59:00.000Z',
    intent: intent(),
    ...overrides,
  });
}

function setup(options = {}) {
  const store = options.store ?? new MemoryStore();
  const now = options.clock ?? clock();
  let deliverySequence = 0;
  let attemptSequence = 0;
  const core = createDeliveryStateCore({
    ...SCOPE,
    store,
    clock: now,
    deliveryIdGenerator: () => `delivery-${++deliverySequence}`,
    attemptIdGenerator: () => `attempt-${++attemptSequence}`,
    ...options,
  });
  return { core, store, now };
}

const RECORD_KEYS = [
  'version', 'deliveryId', 'projectId', 'sellerId', 'sourceEventId',
  'domainRecordId', 'domainEventId', 'idempotencyKey', 'intentDigest', 'intent',
  'state', 'requestKey', 'attempts', 'currentAttempt', 'attemptCount',
  'nextRetryAt', 'createdAt', 'updatedAt',
].sort();
const ATTEMPT_KEYS = [
  'attemptId', 'attemptNumber', 'workerId', 'claimedAt', 'leaseUntil', 'state',
  'deliveredAt', 'failedAt', 'receipt', 'failure',
].sort();

test('exports immutable delivery vocabulary and only the legal transitions', () => {
  assert.deepEqual(DELIVERY_STATES, { PENDING: 'pending', SENDING: 'sending', DELIVERED: 'delivered', FAILED: 'failed' });
  assert.deepEqual(DELIVERY_KINDS, ['inquiry', 'order', 'booking']);
  assert.deepEqual(DELIVERY_CHANNELS, ['email', 'sms']);
  assert.deepEqual(DELIVERY_TRANSITIONS, { pending: ['sending'], sending: ['delivered', 'failed'], failed: ['sending'], delivered: [] });
  for (const value of [DELIVERY_STATES, DELIVERY_KINDS, DELIVERY_CHANNELS, DELIVERY_TRANSITIONS]) assert.ok(Object.isFrozen(value));
});

test('canonical JSON normalizes strings and keys, but preserves array order and rejects unsafe values', () => {
  const first = { z: 'e\u0301', '\u0065\u0301': { b: 2, a: 1 }, list: ['x', 'y'] };
  const second = { list: ['x', 'y'], '\u00e9': { a: 1, b: 2 }, z: '\u00e9' };
  assert.equal(canonicalizeDeliveryIntent(first), canonicalizeDeliveryIntent(second));
  assert.equal(digestDeliveryIntent(first), digestDeliveryIntent(second));
  assert.notEqual(digestDeliveryIntent(first), digestDeliveryIntent({ ...second, list: ['y', 'x'] }));
  for (const invalid of [undefined, 1.5, Infinity, 1n, new Date(), Buffer.from('x'), () => {}, Symbol('x'), Object.create(null)]) {
    assert.throws(() => canonicalizeDeliveryIntent({ invalid }), expectCode('DELIVERY_INTENT_INVALID'));
  }
  const sparse = []; sparse[1] = 'x';
  assert.throws(() => canonicalizeDeliveryIntent(sparse), expectCode('DELIVERY_INTENT_INVALID'));
  const cycle = {}; cycle.self = cycle;
  assert.throws(() => canonicalizeDeliveryIntent(cycle), expectCode('DELIVERY_INTENT_INVALID'));
  assert.throws(() => canonicalizeDeliveryIntent({ constructor: 'x' }), expectCode('DELIVERY_INTENT_INVALID'));
  assert.throws(() => canonicalizeDeliveryIntent({ '\u00e9': 1, 'e\u0301': 2 }), expectCode('DELIVERY_INTENT_INVALID'));
});

test('source identity is deterministic while every identity component changes it', () => {
  const base = source();
  assert.deepEqual(Object.keys(base).sort(), ['sourceEventId', 'projectId', 'sellerId', 'domainRecordId', 'domainEventId', 'occurredAt', 'intent'].sort());
  assert.equal(source().sourceEventId, base.sourceEventId);
  const variants = [
    { projectId: 'project_beta' }, { sellerId: 'seller_beta' },
    { domainRecordId: 'order-43' }, { domainEventId: 'paid-2' },
    { intent: intent({ kind: 'booking' }) }, { intent: intent({ channel: 'sms' }) },
    { intent: intent({ templateKey: 'other' }) },
  ];
  for (const variant of variants) assert.notEqual(source(variant).sourceEventId, base.sourceEventId);
  assert.ok(Object.isFrozen(base));
  assert.ok(Object.isFrozen(base.intent.payload));
});

test('validates source events, scope, intent, retry policy, and lease before store I/O', async () => {
  const store = new MemoryStore();
  assert.throws(() => createDeliveryStateCore({ store }), expectCode('DELIVERY_SCOPE_REQUIRED'));
  assert.throws(() => setup({ store, leaseSeconds: 4 }), expectCode('DELIVERY_LEASE_INVALID'));
  assert.throws(() => setup({ store, retryPolicy: { maxAttempts: 3, delaysSeconds: [1] } }), expectCode('DELIVERY_RETRY_POLICY_INVALID'));
  for (const bad of [intent({ kind: 'other' }), intent({ channel: 'push' }), intent({ templateKey: ' ' }), intent({ recipientRef: '' })]) {
    assert.throws(() => source({ intent: bad }), expectCode('DELIVERY_INTENT_INVALID'));
  }
  assert.throws(() => source({ occurredAt: 'not-time' }), expectCode('DELIVERY_SOURCE_EVENT_INVALID'));
  const { core } = setup({ store });
  await assert.rejects(core.reconcileSourceEvent({ ...source(), sellerId: 'other' }), expectCode('DELIVERY_SCOPE_MISMATCH'));
  assert.equal(store.writes.length, 0);
});

test('pending -> sending -> delivered has exact immutable shape and monotonic versions', async () => {
  const { core, now } = setup();
  const pending = await core.reconcileSourceEvent(source());
  assert.deepEqual(Object.keys(pending).sort(), RECORD_KEYS);
  assert.equal(pending.version, 1);
  assert.equal(pending.state, 'pending');
  assert.deepEqual(pending.attempts, []);
  assert.equal(pending.currentAttempt, null);
  assert.ok(Object.isFrozen(pending.intent.payload));

  now.set('2026-08-26T00:01:00.000Z');
  const sending = await core.claim({ deliveryId: pending.deliveryId, workerId: 'worker-a' });
  assert.deepEqual(Object.keys(sending).sort(), RECORD_KEYS);
  assert.deepEqual(Object.keys(sending.attempts[0]).sort(), ATTEMPT_KEYS);
  assert.equal(sending.version, 2);
  assert.equal(sending.createdAt, pending.createdAt);
  assert.equal(sending.updatedAt, '2026-08-26T00:01:00.000Z');
  assert.deepEqual(sending.currentAttempt, { attemptId: 'attempt-1', attemptNumber: 1 });
  assert.deepEqual(sending.attempts[0], {
    attemptId: 'attempt-1', attemptNumber: 1, workerId: 'worker-a',
    claimedAt: '2026-08-26T00:01:00.000Z', leaseUntil: '2026-08-26T00:02:00.000Z',
    state: 'sending', deliveredAt: null, failedAt: null, receipt: null, failure: null,
  });

  now.set('2026-08-26T00:01:30.000Z');
  const delivered = await core.markDelivered({
    deliveryId: pending.deliveryId, attemptId: 'attempt-1',
    receipt: { providerMessageId: 'provider-1', acceptedAt: '2026-08-26T00:01:20.000Z', providerStatus: 'accepted' },
  });
  assert.equal(delivered.version, 3);
  assert.equal(delivered.state, 'delivered');
  assert.deepEqual(delivered.attempts[0].receipt, { providerMessageId: 'provider-1', acceptedAt: '2026-08-26T00:01:20.000Z', providerStatus: 'accepted' });
  assert.equal(delivered.attempts[0].leaseUntil, null);
  assert.equal(delivered.attempts[0].deliveredAt, '2026-08-26T00:01:30.000Z');
  assert.ok(Object.isFrozen(delivered.attempts[0].receipt));
  await assert.rejects(core.claim({ deliveryId: pending.deliveryId, workerId: 'worker-b' }), expectCode('DELIVERY_INVALID_TRANSITION'));
});

test('failure retry schedule uses stable request key and new attempt only after due retry', async () => {
  const { core, now } = setup();
  const pending = await core.reconcileSourceEvent(source());
  const first = await core.claim({ deliveryId: pending.deliveryId, workerId: 'worker-a' });
  now.set('2026-08-26T00:00:10.000Z');
  const failed = await core.markFailed({ deliveryId: pending.deliveryId, attemptId: 'attempt-1', failure: { code: 'MAIL_BUSY', retryable: true } });
  assert.equal(failed.state, 'failed');
  assert.equal(failed.nextRetryAt, '2026-08-26T00:01:10.000Z');
  assert.deepEqual(failed.attempts[0].failure, { code: 'MAIL_BUSY', retryable: true });
  await assert.rejects(core.retry({ deliveryId: pending.deliveryId, workerId: 'worker-b' }), expectCode('DELIVERY_RETRY_NOT_READY'));
  now.set('2026-08-26T00:01:10.000Z');
  const retrying = await core.retry({ deliveryId: pending.deliveryId, workerId: 'worker-b' });
  assert.equal(retrying.attemptCount, 2);
  assert.equal(retrying.requestKey, first.requestKey);
  assert.equal(retrying.attempts[1].attemptId, 'attempt-2');
  assert.equal(retrying.nextRetryAt, null);
});

test('default retry delays are 60, 300, 900, and 3600 seconds without a sixth attempt', async () => {
  const { core, now } = setup();
  const pending = await core.reconcileSourceEvent(source());
  let sending = await core.claim({ deliveryId: pending.deliveryId, workerId: 'worker' });
  const expectedDelays = [60, 300, 900, 3600];
  for (let index = 0; index < 5; index += 1) {
    const failedAt = new Date(`2026-08-26T0${index}:00:00.000Z`);
    now.set(failedAt);
    const failed = await core.markFailed({
      deliveryId: pending.deliveryId,
      attemptId: sending.currentAttempt.attemptId,
      failure: { code: 'TEMPORARY', retryable: true },
    });
    if (index === 4) {
      assert.equal(failed.nextRetryAt, null);
      await assert.rejects(core.retry({ deliveryId: pending.deliveryId, workerId: 'worker' }), expectCode('DELIVERY_RETRY_EXHAUSTED'));
    } else {
      assert.equal(new Date(failed.nextRetryAt).valueOf() - failedAt.valueOf(), expectedDelays[index] * 1000);
      now.set(failed.nextRetryAt);
      sending = await core.retry({ deliveryId: pending.deliveryId, workerId: 'worker' });
    }
  }
});

test('permanent and exhausted failures cannot retry and stale completions fail closed', async () => {
  const { core } = setup({ retryPolicy: { maxAttempts: 1, delaysSeconds: [] } });
  const pending = await core.reconcileSourceEvent(source());
  await assert.rejects(core.markDelivered({ deliveryId: pending.deliveryId, attemptId: 'none', receipt: {} }), expectCode('DELIVERY_INVALID_TRANSITION'));
  await core.claim({ deliveryId: pending.deliveryId, workerId: 'worker' });
  await assert.rejects(core.markDelivered({ deliveryId: pending.deliveryId, attemptId: 'stale', receipt: {} }), expectCode('DELIVERY_ATTEMPT_STALE'));
  const failed = await core.markFailed({ deliveryId: pending.deliveryId, attemptId: 'attempt-1', failure: { code: 'NO', retryable: true } });
  assert.equal(failed.nextRetryAt, null);
  await assert.rejects(core.retry({ deliveryId: pending.deliveryId, workerId: 'worker' }), expectCode('DELIVERY_RETRY_EXHAUSTED'));

  const other = setup();
  const p2 = await other.core.reconcileSourceEvent(source({ domainEventId: 'paid-2' }));
  await other.core.claim({ deliveryId: p2.deliveryId, workerId: 'worker' });
  await other.core.markFailed({ deliveryId: p2.deliveryId, attemptId: 'attempt-1', failure: { code: 'NO', retryable: false } });
  await assert.rejects(other.core.retry({ deliveryId: p2.deliveryId, workerId: 'worker' }), expectCode('DELIVERY_RETRY_EXHAUSTED'));
});

test('duplicate source reconciliation is idempotent but changed intent under identity conflicts', async () => {
  const { core, store } = setup();
  const event = source();
  const first = await core.reconcileSourceEvent(event);
  const replay = await core.reconcileSourceEvent(event);
  assert.deepEqual(replay, first);
  assert.equal(store.writes.length, 1);
  for (const changed of [
    { ...event, occurredAt: '2026-08-25T23:58:00.000Z' },
    { ...event, intent: intent({ kind: 'booking' }) },
    { ...event, intent: intent({ channel: 'sms' }) },
    { ...event, intent: intent({ templateKey: 'changed' }) },
    { ...event, intent: intent({ locale: 'en-US' }) },
    { ...event, intent: intent({ recipientRef: 'customer:99' }) },
    { ...event, intent: intent({ payload: { orderId: 'other' } }) },
  ]) await assert.rejects(core.reconcileSourceEvent(changed), expectCode('DELIVERY_IDEMPOTENCY_CONFLICT'));
});

test('claim races have one winner and lease recovery preserves attempt and request identity', async () => {
  const { core, now } = setup();
  const pending = await core.reconcileSourceEvent(source());
  const results = await Promise.allSettled([
    core.claim({ deliveryId: pending.deliveryId, workerId: 'a' }),
    core.claim({ deliveryId: pending.deliveryId, workerId: 'b' }),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.find((result) => result.status === 'rejected').reason.code, 'DELIVERY_LEASE_ACTIVE');
  const winner = results.find((result) => result.status === 'fulfilled').value;
  await assert.rejects(core.recoverExpired({ deliveryId: pending.deliveryId, workerId: 'c' }), expectCode('DELIVERY_LEASE_ACTIVE'));
  now.set('2026-08-26T00:01:01.000Z');
  const recovered = await core.recoverExpired({ deliveryId: pending.deliveryId, workerId: 'c' });
  assert.equal(recovered.attemptCount, 1);
  assert.equal(recovered.currentAttempt.attemptId, winner.currentAttempt.attemptId);
  assert.equal(recovered.requestKey, winner.requestKey);
  assert.equal(recovered.attempts[0].workerId, 'c');
});

test('receipt/failure allowlists reject secret-bearing or undocumented fields', async () => {
  const one = setup();
  const p1 = await one.core.reconcileSourceEvent(source());
  await one.core.claim({ deliveryId: p1.deliveryId, workerId: 'w' });
  await assert.rejects(one.core.markDelivered({ deliveryId: p1.deliveryId, attemptId: 'attempt-1', receipt: { providerMessageId: 'x', acceptedAt: '2026-08-26T00:00:00.000Z', token: 'secret' } }), expectCode('DELIVERY_RECEIPT_INVALID'));
  const two = setup();
  const p2 = await two.core.reconcileSourceEvent(source({ domainEventId: 'paid-2' }));
  await two.core.claim({ deliveryId: p2.deliveryId, workerId: 'w' });
  await assert.rejects(two.core.markFailed({ deliveryId: p2.deliveryId, attemptId: 'attempt-1', failure: { code: 'X', retryable: false, stack: 'secret' } }), expectCode('DELIVERY_FAILURE_INVALID'));
});

test('rejects a persisted Store row that smuggles secret-bearing terminal data', async () => {
  const { core, store } = setup();
  const pending = await core.reconcileSourceEvent(source());
  await core.claim({ deliveryId: pending.deliveryId, workerId: 'w' });
  const delivered = await core.markDelivered({
    deliveryId: pending.deliveryId,
    attemptId: 'attempt-1',
    receipt: { providerMessageId: 'msg', acceptedAt: '2026-08-26T00:00:00.000Z' },
  });
  const poisoned = clone(delivered);
  poisoned.attempts[0].receipt.token = 'secret';
  store.deliveries.set(delivered.deliveryId, poisoned);
  await assert.rejects(core.get({ deliveryId: delivered.deliveryId }), expectCode('DELIVERY_RECORD_INVALID'));
});

test('dispatch sends transient recipient and minimal metadata, then persists allowlisted receipt', async () => {
  const { core, store } = setup();
  const pending = await core.reconcileSourceEvent(source());
  let providerInput;
  const delivered = await core.dispatch({
    deliveryId: pending.deliveryId,
    workerId: 'worker-a',
    recipients: { resolve: async ({ scope, recipientRef, channel }) => {
      assert.equal(scope, store.scopes[0]);
      assert.deepEqual({ recipientRef, channel }, { recipientRef: 'customer:42', channel: 'email' });
      return { address: 'buyer@example.test' };
    } },
    templates: { render: async ({ scope, kind, templateKey, locale, payload }) => {
      assert.ok(Object.isFrozen(scope));
      assert.deepEqual({ kind, templateKey, locale, payload }, { kind: 'order', templateKey: 'order-paid', locale: 'ja-JP', payload: { orderId: 'order-42', labels: ['a', 'b'] } });
      return { subject: 'subject', text: 'text' };
    } },
    providers: { email: { send: async (input) => {
      providerInput = input;
      return { providerMessageId: 'msg-1', acceptedAt: '2026-08-26T00:00:00.000Z', providerStatus: 'accepted' };
    } } },
  });
  assert.equal(delivered.state, 'delivered');
  assert.deepEqual(providerInput.metadata, { deliveryId: pending.deliveryId, sourceEventId: pending.sourceEventId, attemptId: 'attempt-1' });
  assert.equal(providerInput.recipient, 'buyer@example.test');
  assert.equal(providerInput.requestKey, pending.requestKey);
  assert.equal(JSON.stringify(delivered).includes('buyer@example.test'), false);
  assert.deepEqual(delivered.attempts[0].receipt, { providerMessageId: 'msg-1', acceptedAt: '2026-08-26T00:00:00.000Z', providerStatus: 'accepted' });
});

test('missing dispatch adapters fail before claim and business failures alone mark failed', async () => {
  const { core } = setup();
  const pending = await core.reconcileSourceEvent(source());
  await assert.rejects(core.dispatch({ deliveryId: pending.deliveryId, workerId: 'w', recipients: {}, templates: {}, providers: {} }), expectCode('DELIVERY_RECIPIENT_ADAPTER_REQUIRED'));
  assert.equal((await core.get({ deliveryId: pending.deliveryId })).state, 'pending');
  const failed = await core.dispatch({
    deliveryId: pending.deliveryId, workerId: 'w',
    recipients: { resolve: async () => { throw { code: 'RECIPIENT_GONE', retryable: false, message: 'private' }; } },
    templates: { render: async () => ({ text: 'x' }) },
    providers: { email: { send: async () => ({}) } },
  });
  assert.equal(failed.state, 'failed');
  assert.deepEqual(failed.attempts[0].failure, { code: 'RECIPIENT_GONE', retryable: false });
  assert.equal(JSON.stringify(failed).includes('private'), false);
});

test('store save errors preserve object identity and are never reclassified as business failures', async () => {
  class FailingStore extends MemoryStore {
    failure = null;
    async transaction(work) {
      return super.transaction(async (tx) => work({
        ...tx,
        saveDelivery: async (input) => {
          if (this.failure && input.record.state === 'delivered') { const error = this.failure; this.failure = null; throw error; }
          return tx.saveDelivery(input);
        },
      }));
    }
  }
  const store = new FailingStore();
  const { core, now } = setup({ store });
  const pending = await core.reconcileSourceEvent(source());
  const providerReceipts = new Map();
  let externalEffects = 0;
  const adapters = {
    recipients: { resolve: async () => ({ address: 'buyer@example.test' }) },
    templates: { render: async () => ({ text: 'hello' }) },
    providers: { email: { send: async ({ requestKey }) => {
      if (!providerReceipts.has(requestKey)) {
        externalEffects += 1;
        providerReceipts.set(requestKey, { providerMessageId: 'msg-1', acceptedAt: '2026-08-26T00:00:00.000Z' });
      }
      return providerReceipts.get(requestKey);
    } } },
  };
  const exactStoreError = { code: 'RECIPIENT_GONE', retryable: true };
  store.failure = exactStoreError;
  await assert.rejects(core.dispatch({ deliveryId: pending.deliveryId, workerId: 'a', ...adapters }), (error) => error === exactStoreError);
  const sending = await core.get({ deliveryId: pending.deliveryId });
  assert.equal(sending.state, 'sending');
  assert.equal(store.writes.filter(([, row]) => row.state === 'failed').length, 0);
  await assert.rejects(core.dispatch({ deliveryId: pending.deliveryId, workerId: 'b', ...adapters }), expectCode('DELIVERY_LEASE_ACTIVE'));
  now.set('2026-08-26T00:01:01.000Z');
  const delivered = await core.dispatch({ deliveryId: pending.deliveryId, workerId: 'b', ...adapters });
  assert.equal(delivered.state, 'delivered');
  assert.equal(delivered.attemptCount, 1);
  assert.equal(externalEffects, 1);
});

test('committed source-event recovery is exact-once and rolled-back events produce no delivery', async () => {
  const committed = [];
  const event = source({ domainEventId: 'paid-after-crash' });
  const domainTransaction = async ({ rollback = false } = {}) => {
    const staged = [event];
    if (!rollback) committed.push(...staged);
  };
  await domainTransaction();
  const { core, store } = setup();
  for (const row of committed) await core.reconcileSourceEvent(row);
  let providerEffects = 0;
  const adapters = {
    recipients: { resolve: async () => ({ address: 'buyer@example.test' }) },
    templates: { render: async () => ({ text: 'paid' }) },
    providers: { email: { send: async () => {
      providerEffects += 1;
      return { providerMessageId: 'provider-once', acceptedAt: '2026-08-26T00:00:00.000Z' };
    } } },
  };
  const [delivery] = [...store.deliveries.values()];
  await core.dispatch({ deliveryId: delivery.deliveryId, workerId: 'restarted-worker', ...adapters });
  for (const row of committed) await core.reconcileSourceEvent(row);
  assert.equal(store.deliveries.size, 1);
  assert.equal(providerEffects, 1);
  await domainTransaction({ rollback: true });
  assert.equal(committed.length, 1);
});
