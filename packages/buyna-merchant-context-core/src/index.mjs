const CALLER_SCOPE_KEYS = Object.freeze([
  'host',
  'projectId',
  'sellerId',
  'subjectId',
  'role',
]);
const CALLER_SCOPE_KEY_SET = new Set(CALLER_SCOPE_KEYS);
const MAX_CALLER_PROTOTYPE_DEPTH = 64;
const MEMBERSHIP_AUTHORITY_KEYS = Object.freeze([
  'subjectId',
  'projectId',
  'sellerId',
  'status',
  'role',
]);
const MEMBERSHIP_AUTHORITY_KEY_SET = new Set(MEMBERSHIP_AUTHORITY_KEYS);

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

function symbolName(key) {
  return Symbol.keyFor(key) ?? key.description;
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
    input === null
    || (typeof input !== 'object' && typeof input !== 'function')
  ) return;

  const visited = new Set();
  let current = input;
  let depth = 0;
  while (current !== null && depth < MAX_CALLER_PROTOTYPE_DEPTH) {
    if (visited.has(current)) {
      fail('MERCHANT_CONTEXT_CALLER_SCOPE_FORBIDDEN', 400);
    }
    visited.add(current);

    let keys;
    try {
      keys = Reflect.ownKeys(current);
    } catch {
      fail('MERCHANT_CONTEXT_CALLER_SCOPE_FORBIDDEN', 400);
    }
    if (keys.some((key) => {
      if (typeof key === 'string') return CALLER_SCOPE_KEY_SET.has(key);
      return CALLER_SCOPE_KEY_SET.has(symbolName(key));
    })) {
      fail('MERCHANT_CONTEXT_CALLER_SCOPE_FORBIDDEN', 400);
    }

    try {
      current = Reflect.getPrototypeOf(current);
    } catch {
      fail('MERCHANT_CONTEXT_CALLER_SCOPE_FORBIDDEN', 400);
    }
    depth += 1;
  }
  if (current !== null) {
    fail('MERCHANT_CONTEXT_CALLER_SCOPE_FORBIDDEN', 400);
  }
}

function ownMembershipData(membership, key, code) {
  let descriptor;
  try {
    descriptor = Reflect.getOwnPropertyDescriptor(membership, key);
  } catch {
    fail(code, 403);
  }
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail(code, 403);
  return descriptor.value;
}

function validateMembership(membership, { subjectId, projectId, sellerId }) {
  if (!membership || typeof membership !== 'object' || Array.isArray(membership)) {
    fail('MERCHANT_CONTEXT_FORBIDDEN', 403);
  }

  let membershipKeys;
  try {
    membershipKeys = Reflect.ownKeys(membership);
  } catch {
    fail('MERCHANT_CONTEXT_FORBIDDEN', 403);
  }
  if (membershipKeys.some((key) => (
    typeof key === 'symbol'
    && MEMBERSHIP_AUTHORITY_KEY_SET.has(symbolName(key))
  ))) {
    fail('MERCHANT_CONTEXT_SCOPE_MISMATCH', 403);
  }

  const status = ownMembershipData(
    membership,
    'status',
    'MERCHANT_CONTEXT_FORBIDDEN',
  );
  if (status !== 'active') fail('MERCHANT_CONTEXT_FORBIDDEN', 403);

  const membershipSubjectId = requiredRecordText(ownMembershipData(
    membership,
    'subjectId',
    'MERCHANT_CONTEXT_SCOPE_MISMATCH',
  ));
  const membershipProjectId = requiredRecordText(ownMembershipData(
    membership,
    'projectId',
    'MERCHANT_CONTEXT_SCOPE_MISMATCH',
  ));
  const membershipSellerId = requiredRecordText(ownMembershipData(
    membership,
    'sellerId',
    'MERCHANT_CONTEXT_SCOPE_MISMATCH',
  ));
  if (
    membershipSubjectId !== subjectId
    || membershipProjectId !== projectId
    || membershipSellerId !== sellerId
  ) {
    fail('MERCHANT_CONTEXT_SCOPE_MISMATCH', 403);
  }

  const role = requiredRecordText(ownMembershipData(
    membership,
    'role',
    'MERCHANT_CONTEXT_FORBIDDEN',
  ));
  if (!role) fail('MERCHANT_CONTEXT_FORBIDDEN', 403);
  return role;
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
    const role = validateMembership(membership, { subjectId, projectId, sellerId });

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
