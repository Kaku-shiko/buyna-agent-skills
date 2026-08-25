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

function requiredText(value, code) {
  if (typeof value !== 'string' || value.trim() === '') fail(code);
  return value.trim();
}

function normalizeTimestamp(value) {
  const match = typeof value === 'string'
    ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value)
    : null;
  if (!match) {
    fail('AUTH_IDENTITY_TIMESTAMP_INVALID');
  }
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction = '', zone] = match;
  const components = [yearText, monthText, dayText, hourText, minuteText, secondText]
    .map(Number);
  const [year, month, day, hour, minute, second] = components;
  const millisecond = Number(fraction.padEnd(3, '0'));
  const localParts = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
  if (
    localParts.getUTCFullYear() !== year
    || localParts.getUTCMonth() !== month - 1
    || localParts.getUTCDate() !== day
    || localParts.getUTCHours() !== hour
    || localParts.getUTCMinutes() !== minute
    || localParts.getUTCSeconds() !== second
    || localParts.getUTCMilliseconds() !== millisecond
  ) {
    fail('AUTH_IDENTITY_TIMESTAMP_INVALID');
  }
  if (zone !== 'Z') {
    const [zoneHour, zoneMinute] = zone.slice(1).split(':').map(Number);
    if (zoneHour > 23 || zoneMinute > 59) fail('AUTH_IDENTITY_TIMESTAMP_INVALID');
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) fail('AUTH_IDENTITY_TIMESTAMP_INVALID');
  return parsed.toISOString();
}

const IDENTITY_FIELDS = Object.freeze([
  'subjectId',
  'permissions',
  'issuedAt',
  'expiresAt',
]);

function ownIdentityValues(identity) {
  try {
    const prototype = Object.getPrototypeOf(identity);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(identity);
    if (
      keys.length !== IDENTITY_FIELDS.length
      || keys.some((key) => typeof key !== 'string' || !IDENTITY_FIELDS.includes(key))
      || IDENTITY_FIELDS.some((field) => !keys.includes(field))
    ) {
      return null;
    }

    const values = Object.create(null);
    for (const field of IDENTITY_FIELDS) {
      const descriptor = Object.getOwnPropertyDescriptor(identity, field);
      if (
        !descriptor
        || descriptor.enumerable !== true
        || !Object.hasOwn(descriptor, 'value')
      ) {
        return null;
      }
      values[field] = descriptor.value;
    }
    return values;
  } catch {
    return null;
  }
}

function normalizePermissions(value) {
  if (!Array.isArray(value)) fail('AUTH_IDENTITY_PERMISSIONS_INVALID');
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      fail('AUTH_IDENTITY_PERMISSIONS_INVALID');
    }
    const keys = Reflect.ownKeys(value);
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    const length = lengthDescriptor?.value;
    if (
      !lengthDescriptor
      || !Object.hasOwn(lengthDescriptor, 'value')
      || !Number.isSafeInteger(length)
      || length < 0
      || keys.length !== length + 1
      || keys.some((key) => typeof key !== 'string')
    ) {
      fail('AUTH_IDENTITY_PERMISSIONS_INVALID');
    }

    const expectedKeys = new Set(['length']);
    for (let index = 0; index < length; index += 1) expectedKeys.add(String(index));
    if (keys.some((key) => !expectedKeys.has(key))) {
      fail('AUTH_IDENTITY_PERMISSIONS_INVALID');
    }

    const permissions = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (
        !descriptor
        || descriptor.enumerable !== true
        || !Object.hasOwn(descriptor, 'value')
        || typeof descriptor.value !== 'string'
        || descriptor.value.trim() === ''
      ) {
        fail('AUTH_IDENTITY_PERMISSIONS_INVALID');
      }
      permissions.push(descriptor.value.trim());
    }
    if (new Set(permissions).size !== permissions.length) {
      fail('AUTH_IDENTITY_PERMISSIONS_INVALID');
    }
    structuredClone(value);
    return permissions;
  } catch (error) {
    if (error?.code === 'AUTH_IDENTITY_PERMISSIONS_INVALID') throw error;
    fail('AUTH_IDENTITY_PERMISSIONS_INVALID');
  }
}

function normalizeIdentity(identity) {
  if (!identity || typeof identity !== 'object' || Array.isArray(identity)) {
    fail('AUTH_IDENTITY_INVALID');
  }
  const values = ownIdentityValues(identity);
  if (!values) fail('AUTH_IDENTITY_FIELD_FORBIDDEN');
  const subjectId = requiredText(values.subjectId, 'AUTH_IDENTITY_SUBJECT_REQUIRED');
  const permissions = normalizePermissions(values.permissions);
  const issuedAt = normalizeTimestamp(values.issuedAt);
  const expiresAt = normalizeTimestamp(values.expiresAt);
  if (new Date(issuedAt).valueOf() >= new Date(expiresAt).valueOf()) {
    fail('AUTH_IDENTITY_TIME_RANGE_INVALID');
  }
  try {
    structuredClone(identity);
  } catch {
    fail('AUTH_IDENTITY_FIELD_FORBIDDEN');
  }
  return deepFreeze({ subjectId, permissions, issuedAt, expiresAt });
}

export const AUTH_SESSION_STATES = Object.freeze({
  ANONYMOUS: 'anonymous',
  AUTHENTICATING: 'authenticating',
  AUTHENTICATED: 'authenticated',
  EXPIRED: 'expired',
  FORBIDDEN: 'forbidden',
  LOGGING_OUT: 'logging_out',
});

export const AUTH_SESSION_TRANSITIONS = deepFreeze({
  anonymous: ['authenticating'],
  authenticating: ['authenticated', 'anonymous'],
  authenticated: ['expired', 'forbidden', 'logging_out'],
  expired: [],
  forbidden: [],
  logging_out: ['anonymous'],
});

export function createAuthSession({ clock, initialIdentity } = {}) {
  const now = typeof clock === 'function' ? clock : () => new Date();

  function timestamp() {
    const value = now();
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.valueOf())) fail('AUTH_CLOCK_INVALID');
    return parsed.toISOString();
  }

  const createdAt = timestamp();
  const trustedIdentity = initialIdentity == null
    ? null
    : normalizeIdentity(initialIdentity);
  const initiallyExpired = trustedIdentity !== null
    && new Date(trustedIdentity.expiresAt).valueOf() <= new Date(createdAt).valueOf();
  let current = {
    state: initiallyExpired
      ? AUTH_SESSION_STATES.EXPIRED
      : trustedIdentity
        ? AUTH_SESSION_STATES.AUTHENTICATED
        : AUTH_SESSION_STATES.ANONYMOUS,
    attemptId: null,
    identity: trustedIdentity,
    errorCode: initiallyExpired ? 'AUTH_SESSION_EXPIRED' : null,
    createdAt,
    updatedAt: createdAt,
  };

  function snapshot() {
    return deepFreeze(structuredClone(current));
  }

  function transition(nextState, changes = {}, transitionAt = timestamp()) {
    if (!AUTH_SESSION_TRANSITIONS[current.state]?.includes(nextState)) {
      fail('AUTH_INVALID_TRANSITION');
    }
    current = {
      ...current,
      ...changes,
      state: nextState,
      updatedAt: transitionAt,
    };
    return snapshot();
  }

  function assertCurrentAttempt(attemptId) {
    const normalizedAttemptId = requiredText(attemptId, 'AUTH_ATTEMPT_ID_REQUIRED');
    if (normalizedAttemptId !== current.attemptId) fail('AUTH_STALE_ATTEMPT');
    return normalizedAttemptId;
  }

  function beginAuthentication({ attemptId } = {}) {
    const normalizedAttemptId = requiredText(attemptId, 'AUTH_ATTEMPT_ID_REQUIRED');
    return transition(AUTH_SESSION_STATES.AUTHENTICATING, {
      attemptId: normalizedAttemptId,
      identity: null,
      errorCode: null,
    });
  }

  function acceptAuthentication({ attemptId, identity } = {}) {
    assertCurrentAttempt(attemptId);
    const normalized = normalizeIdentity(identity);
    const acceptedAt = timestamp();
    if (new Date(normalized.expiresAt).valueOf() <= new Date(acceptedAt).valueOf()) {
      fail('AUTH_IDENTITY_EXPIRED');
    }
    return transition(AUTH_SESSION_STATES.AUTHENTICATED, {
      attemptId: null,
      identity: normalized,
      errorCode: null,
    }, acceptedAt);
  }

  function rejectAuthentication({ attemptId, code } = {}) {
    assertCurrentAttempt(attemptId);
    const errorCode = code === undefined
      ? 'AUTH_AUTHENTICATION_REJECTED'
      : requiredText(code, 'AUTH_REJECTION_CODE_REQUIRED');
    return transition(AUTH_SESSION_STATES.ANONYMOUS, {
      attemptId: null,
      identity: null,
      errorCode,
    });
  }

  function expire({ reason } = {}) {
    const errorCode = reason === undefined
      ? 'AUTH_SESSION_EXPIRED'
      : requiredText(reason, 'AUTH_EXPIRY_REASON_REQUIRED');
    return transition(AUTH_SESSION_STATES.EXPIRED, { errorCode });
  }

  function forbid({ reason } = {}) {
    const errorCode = reason === undefined
      ? 'AUTH_SESSION_FORBIDDEN'
      : requiredText(reason, 'AUTH_FORBIDDEN_REASON_REQUIRED');
    return transition(AUTH_SESSION_STATES.FORBIDDEN, { errorCode });
  }

  function beginLogout() {
    return transition(AUTH_SESSION_STATES.LOGGING_OUT, { errorCode: null });
  }

  function completeLogout() {
    return transition(AUTH_SESSION_STATES.ANONYMOUS, {
      attemptId: null,
      identity: null,
      errorCode: null,
    });
  }

  function requiredPermissions(value) {
    if (value === undefined) return [];
    if (
      !Array.isArray(value)
      || value.some((permission) => (
        typeof permission !== 'string' || permission.trim() === ''
      ))
    ) {
      fail('AUTH_PERMISSION_REQUIREMENTS_INVALID');
    }
    const normalized = value.map((permission) => permission.trim());
    if (new Set(normalized).size !== normalized.length) {
      fail('AUTH_PERMISSION_REQUIREMENTS_INVALID');
    }
    return normalized;
  }

  function denied(statusCode, code) {
    return deepFreeze({ allowed: false, statusCode, code });
  }

  function requireAuthorization({ permissions } = {}) {
    const required = requiredPermissions(permissions);
    if (current.state === AUTH_SESSION_STATES.AUTHENTICATED) {
      const authorizationAt = timestamp();
      if (new Date(current.identity.expiresAt).valueOf() <= new Date(authorizationAt).valueOf()) {
        transition(AUTH_SESSION_STATES.EXPIRED, {
          errorCode: 'AUTH_SESSION_EXPIRED',
        }, authorizationAt);
      }
    }

    if (current.state === AUTH_SESSION_STATES.EXPIRED) {
      return denied(401, 'AUTH_SESSION_EXPIRED');
    }
    if (current.state === AUTH_SESSION_STATES.FORBIDDEN) {
      return denied(403, 'AUTH_SESSION_FORBIDDEN');
    }
    if (current.state !== AUTH_SESSION_STATES.AUTHENTICATED) {
      return denied(401, 'AUTH_SESSION_REQUIRED');
    }
    if (required.some((permission) => !current.identity.permissions.includes(permission))) {
      return denied(403, 'AUTH_PERMISSION_FORBIDDEN');
    }
    return deepFreeze({
      allowed: true,
      statusCode: 200,
      code: 'AUTH_AUTHORIZED',
      identity: current.identity,
    });
  }

  return Object.freeze({
    beginAuthentication,
    acceptAuthentication,
    rejectAuthentication,
    expire,
    forbid,
    beginLogout,
    completeLogout,
    requireAuthorization,
    snapshot,
  });
}
