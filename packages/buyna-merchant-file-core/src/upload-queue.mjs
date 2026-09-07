
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
  const generateId = idGenerator ?? (kind => `${kind}_${globalThis.crypto.randomUUID().replaceAll('-', '')}`);
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

function exactDataValues(value, expectedKeys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(code);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length !== expectedKeys.length
    || keys.some(key => typeof key !== 'string' || !expectedKeys.includes(key))
  ) fail(code);
  const values = {};
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail(code);
    values[key] = descriptor.value;
  }
  return values;
}

function canonicalizeEffect(effect, scope) {
  const values = exactDataValues(effect, [
    'effectId', 'idempotencyKey', 'type', 'projectId', 'sellerId',
    'itemId', 'attemptId', 'payload',
  ], 'UPLOAD_EFFECT_INVALID');
  if (values.projectId !== scope.projectId || values.sellerId !== scope.sellerId) {
    fail('UPLOAD_EFFECT_SCOPE_MISMATCH');
  }
  if (!EFFECT_TYPES.includes(values.type)) fail('UPLOAD_EFFECT_TYPE_UNSUPPORTED');
  const itemId = parseId(values.itemId, 'UPLOAD_EFFECT_INVALID');
  const attemptId = parseId(values.attemptId, 'UPLOAD_EFFECT_INVALID');
  const expected = `upload:${scope.projectId}:${scope.sellerId}:${itemId}:${attemptId}:${values.type}`;
  if (values.effectId !== expected || values.idempotencyKey !== expected) fail('UPLOAD_EFFECT_ID_INVALID');
  const payloadValues = exactDataValues(values.payload, ['name', 'size', 'type'], 'UPLOAD_EFFECT_INVALID');
  const payload = safeMetadata(payloadValues);
  return deepFreeze({
    effectId: expected,
    idempotencyKey: expected,
    type: values.type,
    projectId: scope.projectId,
    sellerId: scope.sellerId,
    itemId,
    attemptId,
    payload,
  });
}

function canonicalizeJsonSafe(value) {
  const maxNodes = 10_000;
  const maxArrayElements = 10_000;
  const stack = new WeakSet();
  let nodes = 0;

  function visit(current, depth) {
    nodes += 1;
    if (nodes > maxNodes) fail('UPLOAD_EFFECT_RESULT_TOO_LARGE');
    if (depth > 32) fail('UPLOAD_EFFECT_RESULT_TOO_DEEP');
    if (current === null || typeof current === 'string' || typeof current === 'boolean') return current;
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) fail('UPLOAD_EFFECT_RESULT_NOT_SERIALIZABLE');
      return current;
    }
    if (typeof current !== 'object') fail('UPLOAD_EFFECT_RESULT_NOT_SERIALIZABLE');
    if (stack.has(current)) fail('UPLOAD_EFFECT_RESULT_NOT_SERIALIZABLE');
    stack.add(current);
    try {
      if (Array.isArray(current)) {
        if (Object.getPrototypeOf(current) !== Array.prototype) {
          fail('UPLOAD_EFFECT_RESULT_NOT_SERIALIZABLE');
        }
        const descriptors = Object.getOwnPropertyDescriptors(current);
        const keys = Reflect.ownKeys(descriptors);
        if (keys.some(key => typeof key !== 'string')) fail('UPLOAD_EFFECT_RESULT_NOT_SERIALIZABLE');
        const lengthDescriptor = descriptors.length;
        if (
          !lengthDescriptor
          || lengthDescriptor.enumerable
          || !Object.hasOwn(lengthDescriptor, 'value')
        ) {
          fail('UPLOAD_EFFECT_RESULT_NOT_SERIALIZABLE');
        }
        const length = lengthDescriptor.value;
        if (!Number.isSafeInteger(length) || length < 0) {
          fail('UPLOAD_EFFECT_RESULT_NOT_SERIALIZABLE');
        }
        if (length > maxArrayElements) fail('UPLOAD_EFFECT_RESULT_TOO_LARGE');
        const indexKeys = keys.filter(key => key !== 'length');
        if (indexKeys.length !== length) fail('UPLOAD_EFFECT_RESULT_NOT_SERIALIZABLE');
        for (const key of indexKeys) {
          if (!/^(0|[1-9][0-9]*)$/.test(key)) fail('UPLOAD_EFFECT_RESULT_NOT_SERIALIZABLE');
          const index = Number(key);
          const descriptor = descriptors[key];
          if (
            !Number.isSafeInteger(index)
            || index < 0
            || index >= length
            || !descriptor?.enumerable
            || !Object.hasOwn(descriptor, 'value')
          ) fail('UPLOAD_EFFECT_RESULT_NOT_SERIALIZABLE');
        }
        const clone = new Array(length);
        for (let index = 0; index < length; index += 1) {
          const descriptor = descriptors[String(index)];
          if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
            fail('UPLOAD_EFFECT_RESULT_NOT_SERIALIZABLE');
          }
          clone[index] = visit(descriptor.value, depth + 1);
        }
        return clone;
      }
      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) {
        fail('UPLOAD_EFFECT_RESULT_NOT_SERIALIZABLE');
      }
      const descriptors = Object.getOwnPropertyDescriptors(current);
      const keys = Reflect.ownKeys(descriptors);
      if (keys.some(key => typeof key !== 'string')) fail('UPLOAD_EFFECT_RESULT_NOT_SERIALIZABLE');
      const clone = {};
      for (const key of keys) {
        const descriptor = descriptors[key];
        if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
          fail('UPLOAD_EFFECT_RESULT_NOT_SERIALIZABLE');
        }
        Object.defineProperty(clone, key, {
          value: visit(descriptor.value, depth + 1),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      return clone;
    } finally {
      stack.delete(current);
    }
  }

  const canonical = visit(value, 0);
  let serialized;
  try {
    serialized = JSON.stringify(canonical);
  } catch {
    fail('UPLOAD_EFFECT_RESULT_NOT_SERIALIZABLE');
  }
  if (serialized === undefined) fail('UPLOAD_EFFECT_RESULT_NOT_SERIALIZABLE');
  if (new TextEncoder().encode(serialized).byteLength > 256 * 1024) fail('UPLOAD_EFFECT_RESULT_TOO_LARGE');
  return deepFreeze(canonical);
}

function canonicalizeClaim(claim) {
  if (!claim || typeof claim !== 'object' || Array.isArray(claim)) {
    fail('UPLOAD_EFFECT_CLAIM_INVALID');
  }
  const descriptors = Object.getOwnPropertyDescriptors(claim);
  const outcomeDescriptor = descriptors.outcome;
  if (!outcomeDescriptor?.enumerable || !Object.hasOwn(outcomeDescriptor, 'value')) {
    fail('UPLOAD_EFFECT_CLAIM_INVALID');
  }
  const outcome = outcomeDescriptor.value;
  if (outcome === 'acquired' || outcome === 'in_progress') {
    exactDataValues(claim, ['outcome'], 'UPLOAD_EFFECT_CLAIM_INVALID');
    return deepFreeze({ outcome });
  }
  if (outcome === 'completed') {
    const values = exactDataValues(claim, ['outcome', 'result'], 'UPLOAD_EFFECT_CLAIM_INVALID');
    return deepFreeze({ outcome, result: canonicalizeJsonSafe(values.result) });
  }
  fail('UPLOAD_EFFECT_CLAIM_INVALID');
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
      const canonicalEffect = canonicalizeEffect(effect, scope);
      const handler = handlers[canonicalEffect.type];
      if (typeof handler !== 'function') fail('UPLOAD_EFFECT_HANDLER_MISSING');
      const identity = deepFreeze({
        projectId: scope.projectId,
        sellerId: scope.sellerId,
        effectId: canonicalEffect.effectId,
        idempotencyKey: canonicalEffect.idempotencyKey,
      });
      const claim = canonicalizeClaim(await effectStore.acquireEffect(identity));
      if (claim?.outcome === 'completed') return claim.result;
      if (claim?.outcome === 'in_progress') fail('UPLOAD_EFFECT_IN_PROGRESS');
      let rawResult;
      try {
        rawResult = await handler(canonicalEffect);
      } catch (caught) {
        const error = caught instanceof Error ? caught : new Error('UPLOAD_EFFECT_HANDLER_FAILED');
        const errorCode = typeof error.code === 'string' && /^[A-Z][A-Z0-9_]{2,127}$/.test(error.code)
          ? error.code
          : 'UPLOAD_EFFECT_HANDLER_FAILED';
        error.code = errorCode;
        await effectStore.failEffect(deepFreeze({ ...identity, errorCode }));
        throw error;
      }
      const result = canonicalizeJsonSafe(rawResult);
      try {
        await effectStore.completeEffect(deepFreeze({ ...identity, result }));
      } catch (cause) {
        const error = new Error('UPLOAD_EFFECT_COMPLETION_PERSISTENCE_FAILED', { cause });
        error.code = 'UPLOAD_EFFECT_COMPLETION_PERSISTENCE_FAILED';
        throw error;
      }
      return result;
    },
  });
}
