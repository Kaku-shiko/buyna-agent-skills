import { randomUUID } from 'node:crypto';

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const EFFECT_TYPES = Object.freeze([
  'validate_file',
  'upload_object',
  'confirm_upload',
  'remove_file',
  'abort_upload',
]);
const RETRY_EFFECTS = Object.freeze({
  validating: 'validate_file',
  uploading: 'upload_object',
  confirming: 'confirm_upload',
  removing: 'remove_file',
});
const FAILURE_DEFAULTS = Object.freeze({
  validation_failed: 'UPLOAD_VALIDATION_FAILED',
  upload_failed: 'UPLOAD_TRANSPORT_FAILED',
  confirmation_failed: 'UPLOAD_CONFIRMATION_FAILED',
  removal_failed: 'UPLOAD_REMOVAL_FAILED',
});

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function parseId(value, code) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!ID_PATTERN.test(text)) fail(code);
  return text;
}

function parseScope(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!ID_PATTERN.test(text)) fail('UPLOAD_QUEUE_INVALID_SCOPE');
  return text;
}

function rejectScopeOverride(input) {
  if (!input || typeof input !== 'object') return;
  const data = input.data;
  if (
    Object.hasOwn(input, 'projectId')
    || Object.hasOwn(input, 'sellerId')
    || (data && typeof data === 'object' && (
      Object.hasOwn(data, 'projectId') || Object.hasOwn(data, 'sellerId')
    ))
  ) fail('UPLOAD_QUEUE_SCOPE_OVERRIDE_FORBIDDEN');
}

function safeMetadata(input) {
  if (!input || typeof input !== 'object') fail('UPLOAD_QUEUE_INVALID_FILE');
  rejectScopeOverride(input);
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const type = typeof input.type === 'string' ? input.type.trim().toLowerCase() : '';
  if (!name || !type || !Number.isSafeInteger(input.size) || input.size < 0) {
    fail('UPLOAD_QUEUE_INVALID_FILE');
  }
  return { name, size: input.size, type };
}

function parseErrorCode(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const code = typeof value === 'string' ? value.trim() : '';
  if (!/^[A-Z][A-Z0-9_]{2,127}$/.test(code)) fail('UPLOAD_QUEUE_INVALID_ERROR_CODE');
  return code;
}

function makeEffect({ projectId, sellerId, item, type }) {
  const effectId = `upload:${projectId}:${sellerId}:${item.itemId}:${item.attemptId}:${type}`;
  return deepFreeze({
    effectId,
    idempotencyKey: effectId,
    type,
    projectId,
    sellerId,
    itemId: item.itemId,
    attemptId: item.attemptId,
    payload: { ...item.file },
  });
}

export function createUploadQueue({
  projectId,
  sellerId,
  policy = {},
  idGenerator,
  clock = () => new Date(),
} = {}) {
  const scope = {
    projectId: parseScope(projectId),
    sellerId: parseScope(sellerId),
  };
  if (!policy || typeof policy !== 'object' || typeof clock !== 'function') {
    fail('UPLOAD_QUEUE_INVALID_CONFIGURATION');
  }
  const generateId = idGenerator ?? (kind => `${kind}_${randomUUID().replaceAll('-', '')}`);
  if (typeof generateId !== 'function') fail('UPLOAD_QUEUE_INVALID_CONFIGURATION');

  let items = [];
  let coverItemId = null;
  const attempts = new Set();
  const replayByItem = new Map();

  function now() {
    const value = clock();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
      fail('UPLOAD_QUEUE_INVALID_CLOCK');
    }
    return value.toISOString();
  }

  function allocateId(kind) {
    const code = kind === 'item' ? 'UPLOAD_QUEUE_INVALID_ITEM_ID' : 'UPLOAD_QUEUE_INVALID_ATTEMPT_ID';
    const id = parseId(generateId(kind), code);
    if (kind === 'item') {
      if (items.some(item => item.itemId === id)) fail('UPLOAD_QUEUE_DUPLICATE_ITEM_ID');
    } else {
      if (attempts.has(id)) fail('UPLOAD_QUEUE_DUPLICATE_ATTEMPT_ID');
      attempts.add(id);
    }
    return id;
  }

  function findItem(itemId) {
    const safeItemId = parseId(itemId, 'UPLOAD_QUEUE_INVALID_ITEM_ID');
    const item = items.find(candidate => candidate.itemId === safeItemId);
    if (!item) fail('UPLOAD_QUEUE_ITEM_NOT_FOUND');
    return item;
  }

  function snapshot() {
    return deepFreeze({
      projectId: scope.projectId,
      sellerId: scope.sellerId,
      coverItemId,
      items: items.map(item => ({ ...item, file: { ...item.file } })),
    });
  }

  function output(effects = []) {
    return deepFreeze({ snapshot: snapshot(), effects: [...effects] });
  }

  function cacheFor(item) {
    let cache = replayByItem.get(item.itemId);
    if (!cache) {
      cache = new Map();
      replayByItem.set(item.itemId, cache);
    }
    return cache;
  }

  function replayKey(event, attemptId) {
    return `${event}:${attemptId ?? 'none'}`;
  }

  function finish(item, event, effects = []) {
    item.updatedAt = now();
    const result = output(effects);
    if (event !== 'start_validation' && event !== 'start_removal' && event !== 'retry') {
      cacheFor(item).set(replayKey(event, item.attemptId), result);
    }
    return result;
  }

  function chooseReplacementCover() {
    if (coverItemId) {
      const current = items.find(item => item.itemId === coverItemId);
      if (current?.state === 'ready') return;
    }
    coverItemId = items.find(item => item.state === 'ready')?.itemId ?? null;
  }

  function reduce(input, internal = false) {
    if (!input || typeof input !== 'object') fail('UPLOAD_QUEUE_INVALID_TRANSITION');
    rejectScopeOverride(input);
    const event = typeof input.event === 'string' ? input.event : '';
    if (!internal && (event === 'retry' || event === 'cancel')) {
      fail('UPLOAD_QUEUE_CONVENIENCE_METHOD_REQUIRED');
    }
    const item = findItem(input.itemId);

    if (event === 'cancel') {
      const key = replayKey(event, item.attemptId);
      const replay = cacheFor(item).get(key);
      if (replay) return replay;
      if (!['selected', 'validating', 'uploading', 'confirming', 'failed'].includes(item.state)) {
        fail('UPLOAD_QUEUE_INVALID_TRANSITION');
      }
      const effects = item.state === 'uploading'
        ? [makeEffect({ ...scope, item, type: 'abort_upload' })]
        : [];
      item.state = 'removed';
      item.progress = 0;
      item.failedStage = null;
      item.retryTarget = null;
      item.errorCode = null;
      chooseReplacementCover();
      return finish(item, event, effects);
    }

    if (event === 'retry') {
      if (item.state !== 'failed' || !RETRY_EFFECTS[item.retryTarget]) {
        fail('UPLOAD_QUEUE_INVALID_TRANSITION');
      }
      const target = item.retryTarget;
      item.attemptId = allocateId('attempt');
      item.state = target;
      item.progress = item.state === 'uploading' ? 0 : item.progress;
      item.failedStage = null;
      item.retryTarget = null;
      item.errorCode = null;
      return finish(item, event, [makeEffect({
        ...scope,
        item,
        type: RETRY_EFFECTS[target],
      })]);
    }

    if (event === 'start_validation') {
      if (item.state !== 'selected') fail('UPLOAD_QUEUE_INVALID_TRANSITION');
      item.attemptId = allocateId('attempt');
      item.state = 'validating';
      item.progress = 0;
      return finish(item, event, [makeEffect({ ...scope, item, type: 'validate_file' })]);
    }

    if (event === 'start_removal') {
      if (item.state !== 'ready') fail('UPLOAD_QUEUE_INVALID_TRANSITION');
      item.attemptId = allocateId('attempt');
      item.state = 'removing';
      return finish(item, event, [makeEffect({ ...scope, item, type: 'remove_file' })]);
    }

    const attemptId = parseId(input.attemptId, 'UPLOAD_QUEUE_INVALID_ATTEMPT_ID');
    const replay = cacheFor(item).get(replayKey(event, attemptId));
    if (replay) return replay;
    if (attemptId !== item.attemptId) fail('UPLOAD_QUEUE_STALE_ATTEMPT');

    const legal = {
      validating: {
        validation_succeeded: ['uploading', 'upload_object'],
        validation_failed: ['failed', null],
      },
      uploading: {
        upload_succeeded: ['confirming', 'confirm_upload'],
        upload_failed: ['failed', null],
      },
      confirming: {
        confirmation_succeeded: ['ready', null],
        confirmation_failed: ['failed', null],
      },
      removing: {
        removal_succeeded: ['removed', null],
        removal_failed: ['failed', null],
      },
    };
    const previousState = item.state;
    const next = legal[previousState]?.[event];
    if (!next) fail('UPLOAD_QUEUE_INVALID_TRANSITION');

    item.state = next[0];
    if (item.state === 'failed') {
      item.failedStage = previousState;
      item.retryTarget = previousState;
      item.errorCode = parseErrorCode(input.data?.errorCode, FAILURE_DEFAULTS[event]);
    } else {
      item.failedStage = null;
      item.retryTarget = null;
      item.errorCode = null;
    }
    if (item.state === 'ready' && coverItemId === null) coverItemId = item.itemId;
    if (item.state === 'removed') chooseReplacementCover();
    return finish(item, event, next[1]
      ? [makeEffect({ ...scope, item, type: next[1] })]
      : []);
  }

  return Object.freeze({
    select(input = {}) {
      const file = safeMetadata(input);
      const itemId = allocateId('item');
      const timestamp = now();
      items.push({
        itemId,
        state: 'selected',
        file,
        attemptId: null,
        progress: 0,
        failedStage: null,
        retryTarget: null,
        errorCode: null,
        selectedAt: timestamp,
        updatedAt: timestamp,
      });
      return output();
    },
    transition(input = {}) { return reduce(input); },
    retry(input = {}) {
      rejectScopeOverride(input);
      return reduce({ ...input, event: 'retry' }, true);
    },
    cancel(input = {}) {
      rejectScopeOverride(input);
      return reduce({ ...input, event: 'cancel' }, true);
    },
    setProgress(input = {}) {
      rejectScopeOverride(input);
      const item = findItem(input.itemId);
      const attemptId = parseId(input.attemptId, 'UPLOAD_QUEUE_INVALID_ATTEMPT_ID');
      if (attemptId !== item.attemptId) fail('UPLOAD_QUEUE_STALE_ATTEMPT');
      if (item.state !== 'uploading') fail('UPLOAD_QUEUE_INVALID_TRANSITION');
      if (
        !Number.isSafeInteger(input.loaded)
        || !Number.isSafeInteger(input.total)
        || input.loaded < 0
        || input.total <= 0
      ) fail('UPLOAD_QUEUE_INVALID_PROGRESS');
      item.progress = Math.min(100, (input.loaded / input.total) * 100);
      item.updatedAt = now();
      return output();
    },
    reorder(input = {}) {
      rejectScopeOverride(input);
      if (!Array.isArray(input.itemIds)) fail('UPLOAD_QUEUE_INVALID_ORDER');
      const active = items.filter(item => item.state !== 'removed');
      const requested = input.itemIds;
      if (
        requested.length !== active.length
        || new Set(requested).size !== requested.length
        || requested.some(itemId => !active.some(item => item.itemId === itemId))
      ) fail('UPLOAD_QUEUE_INVALID_ORDER');
      const byId = new Map(active.map(item => [item.itemId, item]));
      items = [...requested.map(itemId => byId.get(itemId)), ...items.filter(item => item.state === 'removed')];
      return output();
    },
    setCover(input = {}) {
      rejectScopeOverride(input);
      const item = findItem(input.itemId);
      if (item.state !== 'ready') fail('UPLOAD_QUEUE_COVER_NOT_READY');
      coverItemId = item.itemId;
      return output();
    },
    snapshot,
  });
}

function requireAdapterMethod(owner, methodName) {
  if (typeof owner?.[methodName] !== 'function') {
    fail(`UPLOAD_EFFECT_ADAPTER_MISSING_${methodName.toUpperCase()}`);
  }
}

function validateEffect(effect, scope) {
  if (!effect || typeof effect !== 'object') fail('UPLOAD_EFFECT_INVALID');
  if (effect.projectId !== scope.projectId || effect.sellerId !== scope.sellerId) {
    fail('UPLOAD_EFFECT_SCOPE_MISMATCH');
  }
  if (!EFFECT_TYPES.includes(effect.type)) fail('UPLOAD_EFFECT_TYPE_UNSUPPORTED');
  const itemId = parseId(effect.itemId, 'UPLOAD_EFFECT_INVALID');
  const attemptId = parseId(effect.attemptId, 'UPLOAD_EFFECT_INVALID');
  const expected = `upload:${scope.projectId}:${scope.sellerId}:${itemId}:${attemptId}:${effect.type}`;
  if (effect.effectId !== expected || effect.idempotencyKey !== expected) fail('UPLOAD_EFFECT_ID_INVALID');
  if (!effect.payload || typeof effect.payload !== 'object' || Array.isArray(effect.payload)) {
    fail('UPLOAD_EFFECT_INVALID');
  }
  const effectKeys = Object.keys(effect);
  const expectedEffectKeys = [
    'effectId', 'idempotencyKey', 'type', 'projectId', 'sellerId',
    'itemId', 'attemptId', 'payload',
  ];
  if (
    effectKeys.length !== expectedEffectKeys.length
    || expectedEffectKeys.some(key => !Object.hasOwn(effect, key))
  ) fail('UPLOAD_EFFECT_INVALID');
  const payloadKeys = Object.keys(effect.payload);
  if (
    payloadKeys.length !== 3
    || !['name', 'size', 'type'].every(key => Object.hasOwn(effect.payload, key))
  ) fail('UPLOAD_EFFECT_INVALID');
  safeMetadata(effect.payload);
}

export function createUploadEffectExecutor({ projectId, sellerId, effectStore, handlers } = {}) {
  const scope = {
    projectId: parseScope(projectId),
    sellerId: parseScope(sellerId),
  };
  requireAdapterMethod(effectStore, 'acquireEffect');
  requireAdapterMethod(effectStore, 'completeEffect');
  requireAdapterMethod(effectStore, 'failEffect');
  if (!handlers || typeof handlers !== 'object') fail('UPLOAD_EFFECT_HANDLERS_REQUIRED');

  return Object.freeze({
    async execute(effect) {
      validateEffect(effect, scope);
      const handler = handlers[effect.type];
      if (typeof handler !== 'function') fail('UPLOAD_EFFECT_HANDLER_MISSING');
      const identity = {
        projectId: scope.projectId,
        sellerId: scope.sellerId,
        effectId: effect.effectId,
        idempotencyKey: effect.idempotencyKey,
      };
      const claim = await effectStore.acquireEffect(identity);
      if (claim?.outcome === 'completed') return claim.result;
      if (claim?.outcome === 'in_progress') fail('UPLOAD_EFFECT_IN_PROGRESS');
      if (claim?.outcome !== 'acquired') fail('UPLOAD_EFFECT_CLAIM_INVALID');
      try {
        const result = await handler(effect);
        await effectStore.completeEffect({ ...identity, result });
        return result;
      } catch (caught) {
        const error = caught instanceof Error ? caught : new Error('UPLOAD_EFFECT_HANDLER_FAILED');
        const errorCode = typeof error.code === 'string' && /^[A-Z][A-Z0-9_]{2,127}$/.test(error.code)
          ? error.code
          : 'UPLOAD_EFFECT_HANDLER_FAILED';
        error.code = errorCode;
        await effectStore.failEffect({ ...identity, errorCode });
        throw error;
      }
    },
  });
}
