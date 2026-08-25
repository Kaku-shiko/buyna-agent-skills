function operationError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function fail(code) {
  throw operationError(code);
}

function cloneSerializable(value) {
  if (value === undefined) return undefined;
  try {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) fail('DASHBOARD_OPERATION_NOT_SERIALIZABLE');
    return JSON.parse(encoded);
  } catch (error) {
    if (error?.code === 'DASHBOARD_OPERATION_NOT_SERIALIZABLE') throw error;
    fail('DASHBOARD_OPERATION_NOT_SERIALIZABLE');
  }
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function immutableSnapshot(value) {
  return deepFreeze(cloneSerializable(value));
}

export const DASHBOARD_OPERATION_STATES = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  EMPTY: 'empty',
  ERROR: 'error',
  FORBIDDEN: 'forbidden',
  EDITING: 'editing',
  SAVING: 'saving',
  SAVED: 'saved',
  VALIDATION_ERROR: 'validation_error',
});

const destinations = (values) => Object.freeze(values);

export const DASHBOARD_OPERATION_TRANSITIONS = Object.freeze({
  idle: Object.freeze({ load: 'loading' }),
  loading: Object.freeze({
    load: 'loading',
    load_success: 'ready',
    load_empty: 'empty',
    load_error: 'error',
    forbid: 'forbidden',
  }),
  ready: Object.freeze({ load: 'loading', edit: 'editing' }),
  empty: Object.freeze({ load: 'loading' }),
  error: Object.freeze({ retry: destinations(['loading', 'saving']), cancel: 'ready' }),
  forbidden: Object.freeze({ load: 'loading' }),
  editing: Object.freeze({ save: 'saving', cancel: 'ready', forbid: 'forbidden' }),
  saving: Object.freeze({
    save: 'saving',
    save_success: 'saved',
    validation_error: 'validation_error',
    save_error: 'error',
    forbid: 'forbidden',
  }),
  saved: Object.freeze({ load: 'loading', edit: 'editing', acknowledge: 'ready' }),
  validation_error: Object.freeze({ save: 'saving', cancel: 'ready', edit: 'editing' }),
});

const states = new Set(Object.values(DASHBOARD_OPERATION_STATES));
const busyStates = new Set([
  DASHBOARD_OPERATION_STATES.LOADING,
  DASHBOARD_OPERATION_STATES.SAVING,
]);

function semanticSnapshot(state, details = {}) {
  const snapshot = {
    state,
    dataState: state,
    dataStatus: state,
    ariaBusy: busyStates.has(state),
  };
  for (const key of [
    'requestId',
    'data',
    'errorCode',
    'errors',
    'recoverable',
    'retryTarget',
  ]) {
    if (details[key] !== undefined) snapshot[key] = details[key];
  }
  return immutableSnapshot(snapshot);
}

function transitionDestination(state, event) {
  const destination = DASHBOARD_OPERATION_TRANSITIONS[state]?.[event];
  if (destination === undefined) fail('DASHBOARD_OPERATION_INVALID_TRANSITION');
  return destination;
}

function requireRequest(current, requestId) {
  const received = String(requestId ?? '').trim();
  if (!received) fail('DASHBOARD_OPERATION_REQUEST_ID_REQUIRED');
  if (received !== current.requestId) fail('DASHBOARD_OPERATION_STALE_RESPONSE');
}

function editingData(currentData, draft) {
  const base = currentData && typeof currentData === 'object' && !Array.isArray(currentData)
    ? cloneSerializable(currentData)
    : currentData === undefined
      ? {}
      : { value: cloneSerializable(currentData) };
  if (draft !== undefined) base.draft = cloneSerializable(draft);
  return base;
}

function initialSnapshot(initial) {
  if (initial === undefined) return semanticSnapshot(DASHBOARD_OPERATION_STATES.IDLE);
  if (!initial || typeof initial !== 'object' || Array.isArray(initial)) {
    fail('DASHBOARD_OPERATION_INVALID_INITIAL_STATE');
  }
  const state = initial.state === 'permission' ? DASHBOARD_OPERATION_STATES.FORBIDDEN : initial.state;
  if (!states.has(state)) fail('DASHBOARD_OPERATION_INVALID_INITIAL_STATE');
  return semanticSnapshot(state, initial);
}

export function dashboardOperationStateFromTableView(view = {}) {
  const mapping = {
    loading: DASHBOARD_OPERATION_STATES.LOADING,
    empty: DASHBOARD_OPERATION_STATES.EMPTY,
    ready: DASHBOARD_OPERATION_STATES.READY,
    error: DASHBOARD_OPERATION_STATES.ERROR,
    permission: DASHBOARD_OPERATION_STATES.FORBIDDEN,
    forbidden: DASHBOARD_OPERATION_STATES.FORBIDDEN,
  };
  const mapped = mapping[view?.state];
  if (!mapped) fail('DASHBOARD_TABLE_STATE_UNSUPPORTED');
  return mapped;
}

export function createDashboardOperation(initial) {
  let current = initialSnapshot(initial);
  let readSequence = current.requestId?.startsWith('dashboard-read-')
    ? Number(current.requestId.split('-').at(-1)) || 0
    : 0;
  let saveSequence = current.requestId?.startsWith('dashboard-save-')
    ? Number(current.requestId.split('-').at(-1)) || 0
    : 0;
  let latestReadRequestId = current.requestId?.startsWith('dashboard-read-')
    ? current.requestId
    : undefined;
  let latestSaveRequestId = current.requestId?.startsWith('dashboard-save-')
    ? current.requestId
    : undefined;
  let lastReady = current.state === DASHBOARD_OPERATION_STATES.READY
    ? current
    : current.state === DASHBOARD_OPERATION_STATES.SAVED
      ? semanticSnapshot(DASHBOARD_OPERATION_STATES.READY, { data: current.data })
      : undefined;

  const startRead = () => {
    readSequence += 1;
    latestReadRequestId = `dashboard-read-${readSequence}`;
    current = semanticSnapshot(DASHBOARD_OPERATION_STATES.LOADING, {
      requestId: latestReadRequestId,
    });
    return current;
  };

  const startSave = () => {
    saveSequence += 1;
    latestSaveRequestId = `dashboard-save-${saveSequence}`;
    current = semanticSnapshot(DASHBOARD_OPERATION_STATES.SAVING, {
      requestId: latestSaveRequestId,
      data: current.data,
    });
    return current;
  };

  return Object.freeze({
    snapshot() {
      return current;
    },

    transition(event, data = {}) {
      const normalizedEvent = String(event ?? '').trim();
      if (!normalizedEvent) fail('DASHBOARD_OPERATION_EVENT_REQUIRED');
      if (
        ['load_success', 'load_empty', 'load_error'].includes(normalizedEvent)
        && data.requestId
        && latestReadRequestId
        && data.requestId !== latestReadRequestId
      ) {
        fail('DASHBOARD_OPERATION_STALE_RESPONSE');
      }
      if (
        ['save_success', 'validation_error', 'save_error'].includes(normalizedEvent)
        && data.requestId
        && latestSaveRequestId
        && data.requestId !== latestSaveRequestId
      ) {
        fail('DASHBOARD_OPERATION_STALE_RESPONSE');
      }
      transitionDestination(current.state, normalizedEvent);

      if (normalizedEvent === 'load') return startRead();
      if (normalizedEvent === 'save' && current.state === DASHBOARD_OPERATION_STATES.SAVING) {
        return current;
      }
      if (normalizedEvent === 'save') return startSave();

      if (normalizedEvent === 'retry') {
        if (current.recoverable === false) fail('DASHBOARD_OPERATION_NOT_RECOVERABLE');
        if (current.retryTarget === DASHBOARD_OPERATION_STATES.SAVING) return startSave();
        return startRead();
      }

      if (normalizedEvent === 'cancel') {
        if (!lastReady) fail('DASHBOARD_OPERATION_READY_SNAPSHOT_REQUIRED');
        current = lastReady;
        return current;
      }

      if (normalizedEvent === 'edit') {
        const sourceData = current.state === DASHBOARD_OPERATION_STATES.VALIDATION_ERROR
          ? current.data
          : current.data;
        if (current.state === DASHBOARD_OPERATION_STATES.READY) lastReady = current;
        if (current.state === DASHBOARD_OPERATION_STATES.SAVED) {
          lastReady = semanticSnapshot(DASHBOARD_OPERATION_STATES.READY, { data: current.data });
        }
        current = semanticSnapshot(DASHBOARD_OPERATION_STATES.EDITING, {
          data: editingData(sourceData, data.draft),
        });
        return current;
      }

      if ([
        'load_success',
        'load_empty',
        'load_error',
        'save_success',
        'validation_error',
        'save_error',
      ].includes(normalizedEvent)) {
        requireRequest(current, data.requestId);
      }
      if (normalizedEvent === 'forbid' && current.requestId) {
        requireRequest(current, data.requestId);
      }

      if (normalizedEvent === 'load_success') {
        current = semanticSnapshot(DASHBOARD_OPERATION_STATES.READY, { data: data.data });
        lastReady = current;
      } else if (normalizedEvent === 'load_empty') {
        current = semanticSnapshot(DASHBOARD_OPERATION_STATES.EMPTY, { data: data.data });
      } else if (normalizedEvent === 'load_error') {
        current = semanticSnapshot(DASHBOARD_OPERATION_STATES.ERROR, {
          errorCode: String(data.errorCode ?? 'DASHBOARD_READ_FAILED'),
          recoverable: data.recoverable !== false,
          retryTarget: DASHBOARD_OPERATION_STATES.LOADING,
        });
      } else if (normalizedEvent === 'forbid') {
        current = semanticSnapshot(DASHBOARD_OPERATION_STATES.FORBIDDEN, {
          errorCode: 'DASHBOARD_FORBIDDEN',
        });
      } else if (normalizedEvent === 'save_success') {
        current = semanticSnapshot(DASHBOARD_OPERATION_STATES.SAVED, {
          data: data.data === undefined ? current.data : data.data,
        });
        lastReady = semanticSnapshot(DASHBOARD_OPERATION_STATES.READY, { data: current.data });
      } else if (normalizedEvent === 'validation_error') {
        current = semanticSnapshot(DASHBOARD_OPERATION_STATES.VALIDATION_ERROR, {
          data: current.data,
          errorCode: 'DASHBOARD_VALIDATION_FAILED',
          errors: data.errors ?? {},
        });
      } else if (normalizedEvent === 'save_error') {
        current = semanticSnapshot(DASHBOARD_OPERATION_STATES.ERROR, {
          data: current.data,
          errorCode: String(data.errorCode ?? 'DASHBOARD_SAVE_FAILED'),
          recoverable: data.recoverable !== false,
          retryTarget: DASHBOARD_OPERATION_STATES.SAVING,
        });
      } else if (normalizedEvent === 'acknowledge') {
        current = semanticSnapshot(DASHBOARD_OPERATION_STATES.READY, { data: current.data });
        lastReady = current;
      }
      return current;
    },
  });
}
