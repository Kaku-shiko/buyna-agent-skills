import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createUploadEffectExecutor,
  createUploadQueue,
} from '../src/file-core.mjs';

function sequenceGenerator(values) {
  const queues = {
    item: [...(values.item ?? [])],
    attempt: [...(values.attempt ?? [])],
  };
  return kind => {
    const value = queues[kind]?.shift();
    if (!value) throw new Error(`MISSING_TEST_ID:${kind}`);
    return value;
  };
}

function createQueue(values = {}) {
  return createUploadQueue({
    projectId: 'project_alpha',
    sellerId: 'seller_alpha',
    idGenerator: sequenceGenerator({
      item: values.item ?? ['file_1'],
      attempt: values.attempt ?? ['attempt_1'],
    }),
    clock: () => new Date('2026-08-26T00:00:00.000Z'),
  });
}

test('upload queue completes the legal selected to ready lifecycle with deterministic effects', () => {
  const queue = createQueue();

  const selected = queue.select({ name: 'item.webp', size: 1200, type: 'image/webp' });
  assert.equal(selected.snapshot.items[0].state, 'selected');
  assert.deepEqual(selected.effects, []);

  const validating = queue.transition({ itemId: 'file_1', event: 'start_validation' });
  assert.equal(validating.snapshot.items[0].state, 'validating');
  assert.equal(validating.effects[0].type, 'validate_file');
  assert.equal(
    validating.effects[0].effectId,
    'upload:project_alpha:seller_alpha:file_1:attempt_1:validate_file',
  );

  const uploading = queue.transition({
    itemId: 'file_1', event: 'validation_succeeded', attemptId: 'attempt_1',
  });
  assert.equal(uploading.snapshot.items[0].state, 'uploading');
  assert.equal(uploading.effects[0].type, 'upload_object');

  const confirming = queue.transition({
    itemId: 'file_1', event: 'upload_succeeded', attemptId: 'attempt_1',
  });
  assert.equal(confirming.snapshot.items[0].state, 'confirming');
  assert.equal(confirming.effects[0].type, 'confirm_upload');

  const ready = queue.transition({
    itemId: 'file_1', event: 'confirmation_succeeded', attemptId: 'attempt_1',
  });
  assert.equal(ready.snapshot.items[0].state, 'ready');
  assert.deepEqual(ready.effects, []);
  assert.throws(
    () => queue.transition({
      itemId: 'file_1', event: 'validation_failed', attemptId: 'attempt_1',
    }),
    error => error.code === 'UPLOAD_QUEUE_INVALID_TRANSITION',
  );
});

test('upload queue rejects missing scope and caller ownership overrides', () => {
  for (const input of [
    { sellerId: 'seller_alpha' },
    { projectId: 'project_alpha' },
    { projectId: '../project', sellerId: 'seller_alpha' },
  ]) {
    assert.throws(
      () => createUploadQueue(input),
      error => error.code === 'UPLOAD_QUEUE_INVALID_SCOPE',
    );
  }

  const queue = createQueue();
  for (const input of [
    { name: 'item.webp', size: 1200, type: 'image/webp', projectId: 'other' },
    { name: 'item.webp', size: 1200, type: 'image/webp', sellerId: 'other' },
  ]) {
    assert.throws(
      () => queue.select(input),
      error => error.code === 'UPLOAD_QUEUE_SCOPE_OVERRIDE_FORBIDDEN',
    );
  }
  queue.select({ name: 'item.webp', size: 1200, type: 'image/webp' });
  for (const operation of [
    () => queue.transition({ itemId: 'file_1', event: 'start_validation', projectId: 'other' }),
    () => queue.retry({ itemId: 'file_1', sellerId: 'other' }),
    () => queue.cancel({ itemId: 'file_1', projectId: 'other' }),
    () => queue.setProgress({ itemId: 'file_1', attemptId: 'attempt_1', loaded: 1, total: 2, sellerId: 'other' }),
    () => queue.reorder({ itemIds: ['file_1'], projectId: 'other' }),
    () => queue.setCover({ itemId: 'file_1', sellerId: 'other' }),
  ]) {
    assert.throws(operation, error => error.code === 'UPLOAD_QUEUE_SCOPE_OVERRIDE_FORBIDDEN');
  }
});

test('progress is normalized only for the current uploading attempt', () => {
  const queue = createQueue();
  queue.select({ name: 'item.webp', size: 1200, type: 'image/webp' });
  queue.transition({ itemId: 'file_1', event: 'start_validation' });
  queue.transition({ itemId: 'file_1', event: 'validation_succeeded', attemptId: 'attempt_1' });

  assert.equal(queue.setProgress({
    itemId: 'file_1', attemptId: 'attempt_1', loaded: 25, total: 100,
  }).snapshot.items[0].progress, 25);
  assert.equal(queue.setProgress({
    itemId: 'file_1', attemptId: 'attempt_1', loaded: 120, total: 100,
  }).snapshot.items[0].progress, 100);

  for (const input of [
    { itemId: 'file_1', attemptId: 'attempt_1', loaded: -1, total: 100 },
    { itemId: 'file_1', attemptId: 'attempt_1', loaded: 1.2, total: 100 },
    { itemId: 'file_1', attemptId: 'attempt_1', loaded: 1, total: 0 },
    { itemId: 'file_1', attemptId: 'attempt_old', loaded: 1, total: 100 },
  ]) {
    assert.throws(() => queue.setProgress(input), error => [
      'UPLOAD_QUEUE_INVALID_PROGRESS', 'UPLOAD_QUEUE_STALE_ATTEMPT',
    ].includes(error.code));
  }
});

test('failed stages remember retry targets and retry allocates exactly one new attempt and effect', () => {
  let attemptAllocations = 0;
  const ids = sequenceGenerator({ item: ['file_1'], attempt: ['attempt_1', 'attempt_2'] });
  const queue = createUploadQueue({
    projectId: 'project_alpha', sellerId: 'seller_alpha',
    idGenerator(kind) {
      if (kind === 'attempt') attemptAllocations += 1;
      return ids(kind);
    },
  });
  queue.select({ name: 'item.webp', size: 1200, type: 'image/webp' });
  queue.transition({ itemId: 'file_1', event: 'start_validation' });
  queue.transition({ itemId: 'file_1', event: 'validation_succeeded', attemptId: 'attempt_1' });
  const failed = queue.transition({
    itemId: 'file_1', event: 'upload_failed', attemptId: 'attempt_1',
    data: { errorCode: 'UPLOAD_TRANSPORT_FAILED' },
  });
  assert.deepEqual(
    {
      state: failed.snapshot.items[0].state,
      failedStage: failed.snapshot.items[0].failedStage,
      retryTarget: failed.snapshot.items[0].retryTarget,
      errorCode: failed.snapshot.items[0].errorCode,
    },
    {
      state: 'failed', failedStage: 'uploading', retryTarget: 'uploading',
      errorCode: 'UPLOAD_TRANSPORT_FAILED',
    },
  );
  assert.equal(attemptAllocations, 1);

  const retried = queue.retry({ itemId: 'file_1' });
  assert.equal(attemptAllocations, 2);
  assert.equal(retried.snapshot.items[0].state, 'uploading');
  assert.equal(retried.snapshot.items[0].attemptId, 'attempt_2');
  assert.equal(retried.effects.length, 1);
  assert.equal(retried.effects[0].effectId,
    'upload:project_alpha:seller_alpha:file_1:attempt_2:upload_object');
  assert.throws(() => queue.retry({ itemId: 'file_1' }),
    error => error.code === 'UPLOAD_QUEUE_INVALID_TRANSITION');
});

test('state transition replay returns cached effects while stale attempts cannot mutate state', () => {
  const queue = createQueue({ attempt: ['attempt_1'] });
  queue.select({ name: 'item.webp', size: 1200, type: 'image/webp' });
  queue.transition({ itemId: 'file_1', event: 'start_validation' });

  const uploadA = queue.transition({
    itemId: 'file_1', event: 'validation_succeeded', attemptId: 'attempt_1',
  });
  const uploadB = queue.transition({
    itemId: 'file_1', event: 'validation_succeeded', attemptId: 'attempt_1',
  });
  assert.deepEqual(uploadB, uploadA);
  assert.equal(uploadB.effects[0].effectId, uploadA.effects[0].effectId);

  const confirmA = queue.transition({
    itemId: 'file_1', event: 'upload_succeeded', attemptId: 'attempt_1',
  });
  const confirmB = queue.transition({
    itemId: 'file_1', event: 'upload_succeeded', attemptId: 'attempt_1',
  });
  assert.deepEqual(confirmB, confirmA);
  assert.equal(confirmB.effects[0].type, 'confirm_upload');

  const readyA = queue.transition({
    itemId: 'file_1', event: 'confirmation_succeeded', attemptId: 'attempt_1',
  });
  const readyB = queue.transition({
    itemId: 'file_1', event: 'confirmation_succeeded', attemptId: 'attempt_1',
  });
  assert.deepEqual(readyB, readyA);
  assert.deepEqual(readyB.effects, []);
  assert.throws(
    () => queue.transition({
      itemId: 'file_1', event: 'upload_succeeded', attemptId: 'attempt_old',
    }),
    error => error.code === 'UPLOAD_QUEUE_STALE_ATTEMPT',
  );
  assert.equal(queue.snapshot().items[0].state, 'ready');
});

test('matching failure events replay without minting effects or attempts', () => {
  const queue = createQueue({ attempt: ['attempt_1', 'attempt_2'] });
  queue.select({ name: 'item.webp', size: 1200, type: 'image/webp' });
  queue.transition({ itemId: 'file_1', event: 'start_validation' });
  const first = queue.transition({
    itemId: 'file_1', event: 'validation_failed', attemptId: 'attempt_1',
    data: { errorCode: 'FILE_TYPE_NOT_ALLOWED' },
  });
  const replay = queue.transition({
    itemId: 'file_1', event: 'validation_failed', attemptId: 'attempt_1',
    data: { errorCode: 'FILE_TYPE_NOT_ALLOWED' },
  });
  assert.deepEqual(replay, first);
  assert.deepEqual(replay.effects, []);
  assert.equal(replay.snapshot.items[0].attemptId, 'attempt_1');
});

test('removal failure can retry with a new attempt and removal success replays without a new effect', () => {
  const queue = createQueue({ attempt: ['upload_1', 'remove_1', 'remove_2'] });
  queue.select({ name: 'item.webp', size: 1200, type: 'image/webp' });
  makeReady(queue, 'file_1', 'upload_1');
  queue.transition({ itemId: 'file_1', event: 'start_removal' });
  const failure = queue.transition({
    itemId: 'file_1', event: 'removal_failed', attemptId: 'remove_1',
    data: { errorCode: 'OBJECT_DELETE_FAILED' },
  });
  assert.equal(failure.snapshot.items[0].retryTarget, 'removing');
  assert.deepEqual(queue.transition({
    itemId: 'file_1', event: 'removal_failed', attemptId: 'remove_1',
    data: { errorCode: 'OBJECT_DELETE_FAILED' },
  }), failure);

  const retry = queue.retry({ itemId: 'file_1' });
  assert.equal(retry.snapshot.items[0].attemptId, 'remove_2');
  assert.equal(retry.effects[0].type, 'remove_file');
  const removed = queue.transition({
    itemId: 'file_1', event: 'removal_succeeded', attemptId: 'remove_2',
  });
  assert.deepEqual(queue.transition({
    itemId: 'file_1', event: 'removal_succeeded', attemptId: 'remove_2',
  }), removed);
  assert.deepEqual(removed.effects, []);
});

function makeReady(queue, itemId, attemptId) {
  queue.transition({ itemId, event: 'start_validation' });
  queue.transition({ itemId, event: 'validation_succeeded', attemptId });
  queue.transition({ itemId, event: 'upload_succeeded', attemptId });
  queue.transition({ itemId, event: 'confirmation_succeeded', attemptId });
}

test('reorder requires every active item exactly once and preserves item state and scope', () => {
  const queue = createQueue({
    item: ['file_1', 'file_2'], attempt: ['attempt_1', 'attempt_2'],
  });
  queue.select({ name: 'one.webp', size: 1, type: 'image/webp' });
  queue.select({ name: 'two.webp', size: 2, type: 'image/webp' });
  makeReady(queue, 'file_1', 'attempt_1');
  makeReady(queue, 'file_2', 'attempt_2');

  const before = new Map(queue.snapshot().items.map(item => [item.itemId, item.state]));
  const reordered = queue.reorder({ itemIds: ['file_2', 'file_1'] });
  assert.deepEqual(reordered.snapshot.items.map(item => item.itemId), ['file_2', 'file_1']);
  for (const item of reordered.snapshot.items) assert.equal(item.state, before.get(item.itemId));
  assert.equal(reordered.snapshot.projectId, 'project_alpha');
  assert.equal(reordered.snapshot.sellerId, 'seller_alpha');

  for (const itemIds of [['file_1'], ['file_1', 'file_1'], ['file_1', 'unknown']]) {
    assert.throws(() => queue.reorder({ itemIds }),
      error => error.code === 'UPLOAD_QUEUE_INVALID_ORDER');
  }
});

test('cover accepts ready items and moves to the first remaining ready item after removal', () => {
  const queue = createQueue({
    item: ['file_1', 'file_2'], attempt: ['attempt_1', 'attempt_2', 'remove_1'],
  });
  queue.select({ name: 'one.webp', size: 1, type: 'image/webp' });
  queue.select({ name: 'two.webp', size: 2, type: 'image/webp' });
  assert.throws(() => queue.setCover({ itemId: 'file_1' }),
    error => error.code === 'UPLOAD_QUEUE_COVER_NOT_READY');
  makeReady(queue, 'file_1', 'attempt_1');
  makeReady(queue, 'file_2', 'attempt_2');
  assert.equal(queue.setCover({ itemId: 'file_1' }).snapshot.coverItemId, 'file_1');

  const removing = queue.transition({ itemId: 'file_1', event: 'start_removal' });
  assert.equal(removing.effects[0].type, 'remove_file');
  assert.equal(removing.snapshot.items[0].attemptId, 'remove_1');
  const removed = queue.transition({
    itemId: 'file_1', event: 'removal_succeeded', attemptId: 'remove_1',
  });
  assert.equal(removed.snapshot.coverItemId, 'file_2');
  assert.equal(removed.snapshot.items.find(item => item.itemId === 'file_1').state, 'removed');
});

test('cancellation emits one replayable abort only during upload and never removes ready objects', () => {
  const queue = createQueue({
    item: ['file_1', 'file_2'], attempt: ['attempt_1'],
  });
  queue.select({ name: 'one.webp', size: 1, type: 'image/webp' });
  queue.transition({ itemId: 'file_1', event: 'start_validation' });
  queue.transition({ itemId: 'file_1', event: 'validation_succeeded', attemptId: 'attempt_1' });
  const cancelledA = queue.cancel({ itemId: 'file_1' });
  const cancelledB = queue.cancel({ itemId: 'file_1' });
  assert.equal(cancelledA.snapshot.items[0].state, 'removed');
  assert.equal(cancelledA.effects.length, 1);
  assert.equal(cancelledA.effects[0].type, 'abort_upload');
  assert.deepEqual(cancelledB, cancelledA);

  queue.select({ name: 'two.webp', size: 2, type: 'image/webp' });
  const selectedCancel = queue.cancel({ itemId: 'file_2' });
  assert.deepEqual(selectedCancel.effects, []);
  assert.throws(() => queue.retry({ itemId: 'file_2' }),
    error => error.code === 'UPLOAD_QUEUE_INVALID_TRANSITION');

  const readyQueue = createQueue();
  readyQueue.select({ name: 'ready.webp', size: 1, type: 'image/webp' });
  makeReady(readyQueue, 'file_1', 'attempt_1');
  assert.throws(() => readyQueue.cancel({ itemId: 'file_1' }),
    error => error.code === 'UPLOAD_QUEUE_INVALID_TRANSITION');
});

test('retry and cancel must use convenience methods and cannot double-reduce', () => {
  const queue = createQueue();
  queue.select({ name: 'item.webp', size: 1, type: 'image/webp' });
  const before = queue.snapshot();
  for (const event of ['retry', 'cancel']) {
    assert.throws(
      () => queue.transition({ itemId: 'file_1', event }),
      error => error.code === 'UPLOAD_QUEUE_CONVENIENCE_METHOD_REQUIRED',
    );
    assert.deepEqual(queue.snapshot(), before);
  }
});

test('snapshots and exact effects are deeply immutable and exclude unsafe payload fields', () => {
  const queue = createQueue();
  const selected = queue.select({
    name: 'item.webp', size: 1200, type: 'image/webp', bytes: Buffer.from('not-copied'),
    credential: 'not-copied', bucket: 'not-copied', url: 'https://not-copied.invalid',
  });
  const validating = queue.transition({ itemId: 'file_1', event: 'start_validation' });
  const effect = validating.effects[0];
  assert.deepEqual(Object.keys(effect), [
    'effectId', 'idempotencyKey', 'type', 'projectId', 'sellerId', 'itemId', 'attemptId', 'payload',
  ]);
  assert.deepEqual(effect.payload, { name: 'item.webp', size: 1200, type: 'image/webp' });
  assert.equal(effect.idempotencyKey, effect.effectId);
  assert.ok(Object.isFrozen(effect));
  assert.ok(Object.isFrozen(effect.payload));
  assert.ok(Object.isFrozen(selected.snapshot));
  assert.ok(Object.isFrozen(selected.snapshot.items));
  assert.ok(Object.isFrozen(selected.snapshot.items[0]));
  assert.throws(() => { effect.payload.name = 'changed'; }, TypeError);
  assert.equal(queue.snapshot().items[0].file.name, 'item.webp');
});

function createEffectStore() {
  const records = new Map();
  const calls = [];
  return {
    records,
    calls,
    async acquireEffect(input) {
      calls.push(['acquire', input]);
      const record = records.get(input.idempotencyKey);
      if (record?.status === 'completed') return { outcome: 'completed', result: record.result };
      if (record?.status === 'in_progress') return { outcome: 'in_progress' };
      records.set(input.idempotencyKey, { status: 'in_progress' });
      return { outcome: 'acquired' };
    },
    async completeEffect(input) {
      calls.push(['complete', input]);
      records.set(input.idempotencyKey, { status: 'completed', result: input.result });
    },
    async failEffect(input) {
      calls.push(['fail', input]);
      records.set(input.idempotencyKey, { status: 'failed', errorCode: input.errorCode });
    },
  };
}

function validationEffect() {
  const queue = createQueue();
  queue.select({ name: 'item.webp', size: 1, type: 'image/webp' });
  return queue.transition({ itemId: 'file_1', event: 'start_validation' }).effects[0];
}

test('effect executor claims before handling and concurrent/replayed calls run the handler at most once', async () => {
  const effectStore = createEffectStore();
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  let handlerCalls = 0;
  const executor = createUploadEffectExecutor({
    projectId: 'project_alpha', sellerId: 'seller_alpha', effectStore,
    handlers: {
      async validate_file(effect) {
        handlerCalls += 1;
        assert.equal(effect.projectId, 'project_alpha');
        await barrier;
        return { valid: true };
      },
    },
  });
  const effect = validationEffect();

  const first = executor.execute(effect);
  await new Promise(resolve => setImmediate(resolve));
  const second = executor.execute(effect);
  await assert.rejects(second, error => error.code === 'UPLOAD_EFFECT_IN_PROGRESS');
  release();
  assert.deepEqual(await first, { valid: true });
  assert.equal(handlerCalls, 1);
  assert.deepEqual(await executor.execute(effect), { valid: true });
  assert.equal(handlerCalls, 1);
  assert.deepEqual(effectStore.calls.map(([kind]) => kind), [
    'acquire', 'acquire', 'complete', 'acquire',
  ]);
});

test('effect executor records stable failure and permits the store to reacquire the same request key', async () => {
  const effectStore = createEffectStore();
  let calls = 0;
  const executor = createUploadEffectExecutor({
    projectId: 'project_alpha', sellerId: 'seller_alpha', effectStore,
    handlers: {
      async validate_file() {
        calls += 1;
        if (calls === 1) {
          const error = new Error('network unavailable');
          error.code = 'VALIDATOR_UNAVAILABLE';
          throw error;
        }
        return { valid: true };
      },
    },
  });
  const effect = validationEffect();
  await assert.rejects(() => executor.execute(effect), error => error.code === 'VALIDATOR_UNAVAILABLE');
  assert.equal(effectStore.records.get(effect.idempotencyKey).status, 'failed');
  assert.deepEqual(await executor.execute(effect), { valid: true });
  assert.equal(calls, 2);
  assert.equal(effectStore.calls.filter(([kind]) => kind === 'complete').length, 1);
});

test('effect executor rejects scope mismatches before claiming external work', async () => {
  const effectStore = createEffectStore();
  const executor = createUploadEffectExecutor({
    projectId: 'project_alpha', sellerId: 'seller_alpha', effectStore,
    handlers: { async validate_file() { return { valid: true }; } },
  });
  const effect = { ...validationEffect(), sellerId: 'seller_other' };
  await assert.rejects(() => executor.execute(effect),
    error => error.code === 'UPLOAD_EFFECT_SCOPE_MISMATCH');
  assert.equal(effectStore.calls.length, 0);
});

test('effect executor canonicalizes and freezes an exact safe effect before its first await', async () => {
  let releaseAcquire;
  const acquireBarrier = new Promise(resolve => { releaseAcquire = resolve; });
  let handledEffect;
  const effectStore = {
    async acquireEffect() {
      await acquireBarrier;
      return { outcome: 'acquired' };
    },
    async completeEffect() {},
    async failEffect() {},
  };
  const executor = createUploadEffectExecutor({
    projectId: 'project_alpha', sellerId: 'seller_alpha', effectStore,
    handlers: {
      async validate_file(effect) {
        handledEffect = effect;
        assert.throws(() => { effect.payload.name = 'handler-mutated.webp'; }, TypeError);
        return { valid: true };
      },
    },
  });
  const source = validationEffect();
  const mutableEffect = { ...source, payload: { ...source.payload } };
  const execution = executor.execute(mutableEffect);

  mutableEffect.projectId = 'project_other';
  mutableEffect.itemId = 'file_other';
  mutableEffect.payload.name = 'caller-mutated.webp';
  mutableEffect.payload.credential = 'unsafe';
  releaseAcquire();

  assert.deepEqual(await execution, { valid: true });
  assert.notEqual(handledEffect, mutableEffect);
  assert.notEqual(handledEffect.payload, mutableEffect.payload);
  assert.ok(Object.isFrozen(handledEffect));
  assert.ok(Object.isFrozen(handledEffect.payload));
  assert.equal(handledEffect.projectId, 'project_alpha');
  assert.equal(handledEffect.itemId, 'file_1');
  assert.deepEqual(handledEffect.payload, { name: 'item.webp', size: 1, type: 'image/webp' });
});

test('effect executor rejects accessors, symbols, extra fields, and unsafe payload before acquiring', async () => {
  const effectStore = createEffectStore();
  const executor = createUploadEffectExecutor({
    projectId: 'project_alpha', sellerId: 'seller_alpha', effectStore,
    handlers: { async validate_file() { return { valid: true }; } },
  });
  const source = validationEffect();
  const symbol = Symbol('unsafe');
  const accessorEffect = { ...source, payload: { ...source.payload } };
  Object.defineProperty(accessorEffect.payload, 'name', {
    enumerable: true,
    get() { return 'item.webp'; },
  });
  const cases = [
    { ...source, payload: { ...source.payload, credential: 'unsafe' } },
    { ...source, payload: { ...source.payload }, credential: 'unsafe' },
    Object.assign({ ...source, payload: { ...source.payload } }, { [symbol]: 'unsafe' }),
    accessorEffect,
  ];
  for (const effect of cases) {
    await assert.rejects(() => executor.execute(effect),
      error => error.code === 'UPLOAD_EFFECT_INVALID');
  }
  assert.equal(effectStore.calls.length, 0);
});

test('completion persistence failure leaves the claim in progress and never repeats the external handler', async () => {
  let handlerCalls = 0;
  let failCalls = 0;
  let status = 'new';
  const effectStore = {
    async acquireEffect() {
      if (status === 'new') {
        status = 'in_progress';
        return { outcome: 'acquired' };
      }
      return { outcome: 'in_progress' };
    },
    async completeEffect() { throw new Error('persistence unavailable'); },
    async failEffect() { failCalls += 1; status = 'failed'; },
  };
  const executor = createUploadEffectExecutor({
    projectId: 'project_alpha', sellerId: 'seller_alpha', effectStore,
    handlers: { async validate_file() { handlerCalls += 1; return { valid: true }; } },
  });
  const effect = validationEffect();

  await assert.rejects(() => executor.execute(effect),
    error => error.code === 'UPLOAD_EFFECT_COMPLETION_PERSISTENCE_FAILED');
  assert.equal(handlerCalls, 1);
  assert.equal(failCalls, 0);
  assert.equal(status, 'in_progress');
  await assert.rejects(() => executor.execute(effect),
    error => error.code === 'UPLOAD_EFFECT_IN_PROGRESS');
  assert.equal(handlerCalls, 1);
  assert.equal(failCalls, 0);
});

test('effect executor validates exact acquire envelopes before handler dispatch', async () => {
  const invalidClaims = [
    null,
    {},
    { outcome: 'unknown' },
    { outcome: 'acquired', result: {} },
    { outcome: 'in_progress', result: {} },
    { outcome: 'completed' },
    { outcome: 'completed', result: { ok: true }, extra: true },
  ];
  for (const claim of invalidClaims) {
    let handlerCalls = 0;
    const executor = createUploadEffectExecutor({
      projectId: 'project_alpha', sellerId: 'seller_alpha',
      effectStore: {
        async acquireEffect() { return claim; },
        async completeEffect() {},
        async failEffect() {},
      },
      handlers: { async validate_file() { handlerCalls += 1; return { valid: true }; } },
    });
    await assert.rejects(() => executor.execute(validationEffect()),
      error => error.code === 'UPLOAD_EFFECT_CLAIM_INVALID');
    assert.equal(handlerCalls, 0);
  }
});

test('completed acquire replay requires and returns a canonical JSON-safe result without a handler call', async () => {
  const stored = { ok: true, nested: ['safe', 1, null] };
  let handlerCalls = 0;
  const executor = createUploadEffectExecutor({
    projectId: 'project_alpha', sellerId: 'seller_alpha',
    effectStore: {
      async acquireEffect() { return { outcome: 'completed', result: stored }; },
      async completeEffect() {},
      async failEffect() {},
    },
    handlers: { async validate_file() { handlerCalls += 1; return { valid: false }; } },
  });
  const result = await executor.execute(validationEffect());
  stored.ok = false;
  stored.nested[0] = 'changed';
  assert.deepEqual(result, { ok: true, nested: ['safe', 1, null] });
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.nested));
  assert.equal(handlerCalls, 0);
});

test('completed acquire rejects non JSON-safe persisted results', async () => {
  const circular = {};
  circular.self = circular;
  const invalidResults = [
    undefined,
    { nested: undefined },
    { nested: () => true },
    { nested: 1n },
    { nested: Symbol('unsafe') },
    circular,
  ];
  for (const result of invalidResults) {
    const executor = createUploadEffectExecutor({
      projectId: 'project_alpha', sellerId: 'seller_alpha',
      effectStore: {
        async acquireEffect() { return { outcome: 'completed', result }; },
        async completeEffect() {},
        async failEffect() {},
      },
      handlers: { async validate_file() { return { valid: true }; } },
    });
    await assert.rejects(() => executor.execute(validationEffect()),
      error => error.code === 'UPLOAD_EFFECT_RESULT_NOT_SERIALIZABLE');
  }
});

test('handler result must be JSON-safe before completion is recorded', async () => {
  const circular = {};
  circular.self = circular;
  const invalidResults = [
    undefined,
    { nested: undefined },
    { nested: () => true },
    { nested: 1n },
    { nested: Symbol('unsafe') },
    circular,
  ];
  for (const result of invalidResults) {
    let completed = 0;
    let failed = 0;
    const executor = createUploadEffectExecutor({
      projectId: 'project_alpha', sellerId: 'seller_alpha',
      effectStore: {
        async acquireEffect() { return { outcome: 'acquired' }; },
        async completeEffect() { completed += 1; },
        async failEffect() { failed += 1; },
      },
      handlers: { async validate_file() { return result; } },
    });
    await assert.rejects(() => executor.execute(validationEffect()),
      error => error.code === 'UPLOAD_EFFECT_RESULT_NOT_SERIALIZABLE');
    assert.equal(completed, 0);
    assert.equal(failed, 0);
  }
});
