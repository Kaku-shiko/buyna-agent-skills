const CALLER_SCOPE_KEYS = Object.freeze([
  'host',
  'projectId',
  'sellerId',
  'subjectId',
  'role',
]);

const IDENTITY_KEYS = Object.freeze([
  'subjectId',
  'permissions',
  'issuedAt',
  'expiresAt',
]);

function fail(code, statusCode) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = statusCode;
  throw error;
}

function requiredFunction(owner, name) {
  if (!owner || typeof owner[name] !== 'function') {
    fail('MERCHANT_CONTEXT_CONFIGURATION_INVALID', 500);
  }
  return owner[name].bind(owner);
}

function requiredRecordText(value) {
  return typeof value === 'string' && value !== '' && value === value.trim()
    ? value
    : null;
}

function normalizeObservedHost(value) {
  if (typeof value !== 'string' || value === '' || value !== value.trim()) {
    fail('MERCHANT_CONTEXT_NOT_FOUND', 404);
  }

  if (
    /[\s\\/?#@,*]/u.test(value)
    || value.includes('://')
    || value.includes(',')
  ) {
    fail('MERCHANT_CONTEXT_NOT_FOUND', 404);
  }

  const colonCount = [...value].filter((character) => character === ':').length;
  let hostname = value;
  if (colonCount === 1) {
    const separator = value.lastIndexOf(':');
    hostname = value.slice(0, separator);
    const portText = value.slice(separator + 1);
    if (!/^\d{1,5}$/u.test(portText)) {
      fail('MERCHANT_CONTEXT_NOT_FOUND', 404);
    }
    const port = Number(portText);
    if (port < 1 || port > 65_535) {
      fail('MERCHANT_CONTEXT_NOT_FOUND', 404);
    }
  } else if (colonCount > 1) {
    fail('MERCHANT_CONTEXT_NOT_FOUND', 404);
  }

  if (hostname.endsWith('.')) hostname = hostname.slice(0, -1);
  hostname = hostname.toLowerCase();

  if (
    hostname.length < 1
    || hostname.length > 253
    || /^(?:0x[0-9a-f]+|\d+)(?:\.(?:0x[0-9a-f]+|\d+))*$/u.test(hostname)
  ) {
    fail('MERCHANT_CONTEXT_NOT_FOUND', 404);
  }

  const labels = hostname.split('.');
  if (labels.some((label) => (
    label.length < 1
    || label.length > 63
    || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(label)
  ))) {
    fail('MERCHANT_CONTEXT_NOT_FOUND', 404);
  }

  return hostname;
}

function authenticatedSubject(identity) {
  if (!identity || typeof identity !== 'object' || Array.isArray(identity)) {
    fail('MERCHANT_CONTEXT_AUTH_REQUIRED', 401);
  }
  const keys = Reflect.ownKeys(identity);
  if (
    keys.length !== IDENTITY_KEYS.length
    || keys.some((key) => typeof key !== 'string' || !IDENTITY_KEYS.includes(key))
    || !Array.isArray(identity.permissions)
    || typeof identity.issuedAt !== 'string'
    || typeof identity.expiresAt !== 'string'
  ) {
    fail('MERCHANT_CONTEXT_AUTH_REQUIRED', 401);
  }
  const subjectId = requiredRecordText(identity.subjectId);
  if (!subjectId) fail('MERCHANT_CONTEXT_AUTH_REQUIRED', 401);
  return subjectId;
}

function assertNoCallerScope(input) {
  if (
    input !== null
    && (typeof input === 'object' || typeof input === 'function')
    && CALLER_SCOPE_KEYS.some((key) => key in input)
  ) {
    fail('MERCHANT_CONTEXT_CALLER_SCOPE_FORBIDDEN', 400);
  }
}

export function createMerchantContextResolver({
  requestAdapter,
  sessionAdapter,
  directory,
} = {}) {
  const getObservedHost = requiredFunction(requestAdapter, 'getObservedHost');
  const getAuthenticatedIdentity = requiredFunction(
    sessionAdapter,
    'getAuthenticatedIdentity',
  );
  const findMerchantByHost = requiredFunction(directory, 'findMerchantByHost');
  const findMembership = requiredFunction(directory, 'findMembership');

  async function resolve(input) {
    assertNoCallerScope(input);

    const host = normalizeObservedHost(await getObservedHost());
    const subjectId = authenticatedSubject(await getAuthenticatedIdentity());

    const merchant = await findMerchantByHost({ host });
    const projectId = requiredRecordText(merchant?.projectId);
    const sellerId = requiredRecordText(merchant?.sellerId);
    if (merchant?.status !== 'active' || !projectId || !sellerId) {
      fail('MERCHANT_CONTEXT_NOT_FOUND', 404);
    }

    const membership = await findMembership({ subjectId, projectId, sellerId });
    if (membership?.status !== 'active') {
      fail('MERCHANT_CONTEXT_FORBIDDEN', 403);
    }
    if (
      membership.projectId !== projectId
      || membership.sellerId !== sellerId
    ) {
      fail('MERCHANT_CONTEXT_SCOPE_MISMATCH', 403);
    }
    const role = requiredRecordText(membership.role);
    if (!role) fail('MERCHANT_CONTEXT_FORBIDDEN', 403);

    return Object.freeze({
      projectId,
      sellerId,
      host,
      subjectId,
      role,
      merchantStatus: 'active',
    });
  }

  return Object.freeze({ resolve });
}
