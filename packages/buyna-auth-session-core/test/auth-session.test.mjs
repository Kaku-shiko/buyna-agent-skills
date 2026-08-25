import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTH_SESSION_STATES,
  AUTH_SESSION_TRANSITIONS,
  createAuthSession,
} from '../src/index.mjs';

const NOW = '2026-08-26T00:00:00.000Z';

function identity(overrides = {}) {
  return {
    subjectId: 'user_1',
    permissions: ['catalog:write'],
    issuedAt: '2026-08-25T23:59:00.000Z',
    expiresAt: '2026-08-26T01:00:00.000Z',
    ...overrides,
  };
}

function createFixture(options = {}) {
  return createAuthSession({
    clock: () => new Date(NOW),
    ...options,
  });
}

test('moves one current authentication attempt from anonymous to authenticated', () => {
  const auth = createFixture();
  auth.beginAuthentication({ attemptId: 'attempt_1' });
  auth.acceptAuthentication({ attemptId: 'attempt_1', identity: identity() });

  assert.equal(auth.snapshot().state, 'authenticated');
  assert.equal(auth.snapshot().attemptId, null);
  assert.deepEqual(auth.snapshot().identity, identity());
});

test('rejects stale authentication success and failure attempts before changing state', () => {
  const auth = createFixture();
  auth.beginAuthentication({ attemptId: 'attempt_current' });

  assert.throws(
    () => auth.acceptAuthentication({ attemptId: 'attempt_old', identity: {} }),
    (error) => error.code === 'AUTH_STALE_ATTEMPT',
  );
  assert.throws(
    () => auth.rejectAuthentication({ attemptId: 'attempt_old' }),
    (error) => error.code === 'AUTH_STALE_ATTEMPT',
  );
  assert.equal(auth.snapshot().state, 'authenticating');
  assert.equal(auth.snapshot().attemptId, 'attempt_current');
});

test('returns a rejected authentication attempt to anonymous with a stable error', () => {
  const auth = createFixture();
  auth.beginAuthentication({ attemptId: 'attempt_1' });
  auth.rejectAuthentication({ attemptId: 'attempt_1', code: 'AUTH_BAD_CREDENTIALS' });

  assert.equal(auth.snapshot().state, 'anonymous');
  assert.equal(auth.snapshot().attemptId, null);
  assert.equal(auth.snapshot().errorCode, 'AUTH_BAD_CREDENTIALS');
});

test('supports authenticated expiry, explicit forbidden, and logout paths', () => {
  const expired = createFixture({ initialIdentity: identity() });
  expired.expire({ reason: 'AUTH_PROVIDER_EXPIRED' });
  assert.equal(expired.snapshot().state, 'expired');
  assert.equal(expired.snapshot().errorCode, 'AUTH_PROVIDER_EXPIRED');

  const forbidden = createFixture({ initialIdentity: identity() });
  forbidden.forbid({ reason: 'AUTH_POLICY_DENIED' });
  assert.equal(forbidden.snapshot().state, 'forbidden');
  assert.equal(forbidden.snapshot().errorCode, 'AUTH_POLICY_DENIED');

  const logout = createFixture({ initialIdentity: identity() });
  logout.beginLogout();
  assert.equal(logout.snapshot().state, 'logging_out');
  logout.completeLogout();
  assert.equal(logout.snapshot().state, 'anonymous');
  assert.equal(logout.snapshot().identity, null);
});

test('rejects illegal transitions without mutating session state', () => {
  const anonymous = createFixture();
  assert.throws(
    () => anonymous.beginLogout(),
    (error) => error.code === 'AUTH_INVALID_TRANSITION',
  );
  assert.equal(anonymous.snapshot().state, 'anonymous');

  const authenticating = createFixture();
  authenticating.beginAuthentication({ attemptId: 'attempt_1' });
  assert.throws(
    () => authenticating.beginAuthentication({ attemptId: 'attempt_2' }),
    (error) => error.code === 'AUTH_INVALID_TRANSITION',
  );
  assert.equal(authenticating.snapshot().attemptId, 'attempt_1');
});

test('requires a non-empty authentication attempt identity', () => {
  const auth = createFixture();
  for (const attemptId of [undefined, null, '', '   ', 1]) {
    assert.throws(
      () => auth.beginAuthentication({ attemptId }),
      (error) => error.code === 'AUTH_ATTEMPT_ID_REQUIRED',
    );
  }
  assert.equal(auth.snapshot().state, 'anonymous');
});

test('rejects malformed trusted identity fields before authenticating', () => {
  const invalidCases = [
    [identity({ subjectId: '' }), 'AUTH_IDENTITY_SUBJECT_REQUIRED'],
    [identity({ permissions: 'catalog:write' }), 'AUTH_IDENTITY_PERMISSIONS_INVALID'],
    [identity({ permissions: ['catalog:write', 'catalog:write'] }), 'AUTH_IDENTITY_PERMISSIONS_INVALID'],
    [identity({ permissions: [''] }), 'AUTH_IDENTITY_PERMISSIONS_INVALID'],
    [identity({ issuedAt: 'not-a-date' }), 'AUTH_IDENTITY_TIMESTAMP_INVALID'],
    [identity({ issuedAt: '2026-08-25' }), 'AUTH_IDENTITY_TIMESTAMP_INVALID'],
    [identity({ issuedAt: '2026-02-30T00:00:00Z' }), 'AUTH_IDENTITY_TIMESTAMP_INVALID'],
    [identity({ expiresAt: 123 }), 'AUTH_IDENTITY_TIMESTAMP_INVALID'],
    [identity({ expiresAt: '2026-08-25T23:58:00.000Z' }), 'AUTH_IDENTITY_TIME_RANGE_INVALID'],
  ];

  for (const [trustedIdentity, expectedCode] of invalidCases) {
    const auth = createFixture();
    auth.beginAuthentication({ attemptId: 'attempt_1' });
    assert.throws(
      () => auth.acceptAuthentication({
        attemptId: 'attempt_1',
        identity: trustedIdentity,
      }),
      (error) => error.code === expectedCode,
    );
    assert.equal(auth.snapshot().state, 'authenticating');
  }
});

test('interprets an already expired initial trusted identity as expired', () => {
  const auth = createFixture({
    initialIdentity: identity({ expiresAt: '2026-08-26T00:00:00.000Z' }),
  });

  assert.equal(auth.snapshot().state, 'expired');
  assert.equal(auth.snapshot().errorCode, 'AUTH_SESSION_EXPIRED');
});

test('rejects a newly accepted identity that is already expired at the request clock', () => {
  const auth = createFixture();
  auth.beginAuthentication({ attemptId: 'attempt_1' });

  assert.throws(
    () => auth.acceptAuthentication({
      attemptId: 'attempt_1',
      identity: identity({ expiresAt: NOW }),
    }),
    (error) => error.code === 'AUTH_IDENTITY_EXPIRED',
  );
  assert.equal(auth.snapshot().state, 'authenticating');
  assert.equal(auth.snapshot().identity, null);
});

test('exports immutable state and transition contracts used by consumers', () => {
  assert.deepEqual(AUTH_SESSION_STATES, {
    ANONYMOUS: 'anonymous',
    AUTHENTICATING: 'authenticating',
    AUTHENTICATED: 'authenticated',
    EXPIRED: 'expired',
    FORBIDDEN: 'forbidden',
    LOGGING_OUT: 'logging_out',
  });
  assert.deepEqual(AUTH_SESSION_TRANSITIONS, {
    anonymous: ['authenticating'],
    authenticating: ['authenticated', 'anonymous'],
    authenticated: ['expired', 'forbidden', 'logging_out'],
    expired: [],
    forbidden: [],
    logging_out: ['anonymous'],
  });
  assert.equal(Object.isFrozen(AUTH_SESSION_STATES), true);
  assert.equal(Object.isFrozen(AUTH_SESSION_TRANSITIONS), true);
  for (const transitions of Object.values(AUTH_SESSION_TRANSITIONS)) {
    assert.equal(Object.isFrozen(transitions), true);
  }
});

test('returns stable 401 decisions for missing and expired sessions', () => {
  const anonymous = createFixture();
  assert.deepEqual(anonymous.requireAuthorization(), {
    allowed: false,
    statusCode: 401,
    code: 'AUTH_SESSION_REQUIRED',
  });

  const expired = createFixture({ initialIdentity: identity() });
  expired.expire();
  assert.deepEqual(expired.requireAuthorization(), {
    allowed: false,
    statusCode: 401,
    code: 'AUTH_SESSION_EXPIRED',
  });
});

test('expires a trusted identity when the request clock reaches its expiry', () => {
  let currentTime = new Date(NOW);
  const auth = createAuthSession({
    clock: () => currentTime,
    initialIdentity: identity(),
  });
  currentTime = new Date('2026-08-26T01:00:00.000Z');

  assert.deepEqual(auth.requireAuthorization(), {
    allowed: false,
    statusCode: 401,
    code: 'AUTH_SESSION_EXPIRED',
  });
  assert.equal(auth.snapshot().state, 'expired');
});

test('returns stable 403 decisions for policy denial and missing permissions', () => {
  const denied = createFixture({ initialIdentity: identity() });
  denied.forbid({ reason: 'AUTH_PRIVATE_POLICY_REASON' });
  assert.deepEqual(denied.requireAuthorization(), {
    allowed: false,
    statusCode: 403,
    code: 'AUTH_SESSION_FORBIDDEN',
  });

  const missingPermission = createFixture({ initialIdentity: identity() });
  assert.deepEqual(
    missingPermission.requireAuthorization({ permissions: ['orders:write'] }),
    {
      allowed: false,
      statusCode: 403,
      code: 'AUTH_PERMISSION_FORBIDDEN',
    },
  );
});

test('returns an immutable trusted identity only when authorization succeeds', () => {
  const auth = createFixture({ initialIdentity: identity() });
  const decision = auth.requireAuthorization({ permissions: ['catalog:write'] });

  assert.deepEqual(decision, {
    allowed: true,
    statusCode: 200,
    code: 'AUTH_AUTHORIZED',
    identity: identity(),
  });
  assert.equal(Object.isFrozen(decision), true);
  assert.equal(Object.isFrozen(decision.identity), true);
  assert.equal(Object.isFrozen(decision.identity.permissions), true);
});

test('rejects malformed permission requirements instead of granting access', () => {
  for (const permissions of [
    'catalog:write',
    [''],
    ['catalog:write', 'catalog:write'],
    [1],
  ]) {
    const auth = createFixture({ initialIdentity: identity() });
    assert.throws(
      () => auth.requireAuthorization({ permissions }),
      (error) => error.code === 'AUTH_PERMISSION_REQUIREMENTS_INVALID',
    );
  }
});

test('rejects every named forbidden trusted identity field', () => {
  const forbiddenFields = [
    'sessionId',
    'password',
    'passwordHash',
    'cookie',
    'token',
    'accessToken',
    'refreshToken',
    'credential',
    'cardNumber',
    'cvv',
    'displayName',
  ];

  for (const field of forbiddenFields) {
    const auth = createFixture();
    auth.beginAuthentication({ attemptId: `attempt_${field}` });
    assert.throws(
      () => auth.acceptAuthentication({
        attemptId: `attempt_${field}`,
        identity: { ...identity(), [field]: 'must-not-cross-boundary' },
      }),
      (error) => error.code === 'AUTH_IDENTITY_FIELD_FORBIDDEN',
      `expected ${field} to be rejected`,
    );
    assert.equal(auth.snapshot().state, 'authenticating');
  }
});

test('applies the exact identity allowlist to initial trusted sessions too', () => {
  assert.throws(
    () => createFixture({
      initialIdentity: { ...identity(), providerSecret: 'must-not-cross-boundary' },
    }),
    (error) => error.code === 'AUTH_IDENTITY_FIELD_FORBIDDEN',
  );
});

test('exports only public session fields and deeply freezes every snapshot', () => {
  const auth = createFixture({ initialIdentity: identity() });
  const snapshot = auth.snapshot();

  assert.deepEqual(Object.keys(snapshot).sort(), [
    'attemptId',
    'createdAt',
    'errorCode',
    'identity',
    'state',
    'updatedAt',
  ]);
  assert.deepEqual(Object.keys(snapshot.identity).sort(), [
    'expiresAt',
    'issuedAt',
    'permissions',
    'subjectId',
  ]);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.identity), true);
  assert.equal(Object.isFrozen(snapshot.identity.permissions), true);
  assert.throws(() => snapshot.identity.permissions.push('orders:write'), TypeError);
  assert.throws(() => { snapshot.identity.subjectId = 'user_other'; }, TypeError);
  assert.deepEqual(auth.snapshot().identity, identity());
});
