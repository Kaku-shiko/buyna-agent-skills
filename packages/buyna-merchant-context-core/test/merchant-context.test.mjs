import assert from 'node:assert/strict';
import test from 'node:test';

import { createMerchantContextResolver } from '../src/index.mjs';

const identity = Object.freeze({
  subjectId: 'user_1',
  permissions: Object.freeze(['catalog:write']),
  issuedAt: '2026-08-26T00:00:00.000Z',
  expiresAt: '2026-08-26T01:00:00.000Z',
});

async function rejectsWith(promise, code, statusCode) {
  await assert.rejects(
    promise,
    (error) => error?.code === code && error?.statusCode === statusCode,
  );
}

function activeDirectory({ calls, merchant, membership }) {
  return {
    async findMerchantByHost({ host }) {
      calls?.push(`merchant:${host}`);
      return merchant === undefined ? {
        projectId: 'project_alpha',
        sellerId: 'seller_alpha',
        status: 'active',
      } : merchant;
    },
    async findMembership(scope) {
      calls?.push(`membership:${scope.subjectId}:${scope.projectId}:${scope.sellerId}`);
      return membership === undefined ? {
        projectId: 'project_alpha',
        sellerId: 'seller_alpha',
        role: 'admin',
        status: 'active',
      } : membership;
    },
  };
}

test('resolves a normalized server host and trusted identity into an immutable active context', async () => {
  const calls = [];
  const resolver = createMerchantContextResolver({
    requestAdapter: {
      async getObservedHost() {
        calls.push('host');
        return 'SHOP.EXAMPLE.COM:443';
      },
    },
    sessionAdapter: {
      async getAuthenticatedIdentity() {
        calls.push('identity');
        return identity;
      },
    },
    directory: activeDirectory({ calls }),
  });

  const context = await resolver.resolve();

  assert.deepEqual(context, {
    projectId: 'project_alpha',
    sellerId: 'seller_alpha',
    host: 'shop.example.com',
    subjectId: 'user_1',
    role: 'admin',
    merchantStatus: 'active',
  });
  assert.equal(Object.isFrozen(context), true);
  assert.deepEqual(calls, [
    'host',
    'identity',
    'merchant:shop.example.com',
    'membership:user_1:project_alpha:seller_alpha',
  ]);
});

test('normalizes lowercase, one trailing dot, and a valid port before lookup', async () => {
  const observed = [];
  const resolver = createMerchantContextResolver({
    requestAdapter: { async getObservedHost() { return 'Store.Example.COM.:8443'; } },
    sessionAdapter: { async getAuthenticatedIdentity() { return identity; } },
    directory: {
      ...activeDirectory({}),
      async findMerchantByHost({ host }) {
        observed.push(host);
        return { projectId: 'project_alpha', sellerId: 'seller_alpha', status: 'active' };
      },
    },
  });

  const context = await resolver.resolve();
  assert.equal(context.host, 'store.example.com');
  assert.deepEqual(observed, ['store.example.com']);
});

test('allows an authoritative directory to own a valid single-label server host', async () => {
  const resolver = createMerchantContextResolver({
    requestAdapter: { async getObservedHost() { return 'MERCHANT-HOST:8080'; } },
    sessionAdapter: { async getAuthenticatedIdentity() { return identity; } },
    directory: {
      async findMerchantByHost({ host }) {
        assert.equal(host, 'merchant-host');
        return { projectId: 'project_alpha', sellerId: 'seller_alpha', status: 'active' };
      },
      async findMembership() {
        return {
          projectId: 'project_alpha', sellerId: 'seller_alpha', role: 'admin', status: 'active',
        };
      },
    },
  });

  assert.equal((await resolver.resolve()).host, 'merchant-host');
});

test('rejects malformed, chained, wildcard, IP, and path-like observed hosts before identity or directory lookup', async (t) => {
  const invalidHosts = [
    '',
    'https://shop.example.com',
    'shop.example.com/path',
    'shop.example.com, proxy.example.com',
    '*.example.com',
    '127.0.0.1',
    '127.1',
    '2130706433',
    '0x7f000001',
    '0x7f.0.0.1',
    '[2001:db8::1]',
    '2001:db8::1',
    'shop.example.com?owner=seller_other',
    'shop.example.com#seller_other',
    'shop..example.com',
    'shop.example.com:0',
    'shop.example.com:65536',
  ];

  for (const host of invalidHosts) {
    await t.test(JSON.stringify(host), async () => {
      const calls = [];
      const resolver = createMerchantContextResolver({
        requestAdapter: { async getObservedHost() { calls.push('host'); return host; } },
        sessionAdapter: { async getAuthenticatedIdentity() { calls.push('identity'); return identity; } },
        directory: activeDirectory({ calls }),
      });

      await rejectsWith(resolver.resolve(), 'MERCHANT_CONTEXT_NOT_FOUND', 404);
      assert.deepEqual(calls, ['host']);
    });
  }
});

test('rejects every caller-provided ownership key before observing request state', async () => {
  for (const key of ['host', 'projectId', 'sellerId', 'subjectId', 'role']) {
    const calls = [];
    const resolver = createMerchantContextResolver({
      requestAdapter: { async getObservedHost() { calls.push('host'); return 'shop.example.com'; } },
      sessionAdapter: { async getAuthenticatedIdentity() { calls.push('identity'); return identity; } },
      directory: activeDirectory({ calls }),
    });

    await rejectsWith(
      resolver.resolve({ [key]: 'caller_owned_value' }),
      'MERCHANT_CONTEXT_CALLER_SCOPE_FORBIDDEN',
      400,
    );
    assert.deepEqual(calls, []);
  }
});

test('returns 401 without directory lookup when no fresh authenticated identity exists', async () => {
  const calls = [];
  const resolver = createMerchantContextResolver({
    requestAdapter: { async getObservedHost() { calls.push('host'); return 'shop.example.com'; } },
    sessionAdapter: { async getAuthenticatedIdentity() { calls.push('identity'); return null; } },
    directory: activeDirectory({ calls }),
  });

  await rejectsWith(resolver.resolve(), 'MERCHANT_CONTEXT_AUTH_REQUIRED', 401);
  assert.deepEqual(calls, ['host', 'identity']);
});

test('returns 404 for an unknown or inactive host without membership lookup', async () => {
  for (const merchant of [null, {
    projectId: 'project_alpha',
    sellerId: 'seller_alpha',
    status: 'inactive',
  }]) {
    const calls = [];
    const resolver = createMerchantContextResolver({
      requestAdapter: { async getObservedHost() { calls.push('host'); return 'shop.example.com'; } },
      sessionAdapter: { async getAuthenticatedIdentity() { calls.push('identity'); return identity; } },
      directory: activeDirectory({ calls, merchant }),
    });

    await rejectsWith(resolver.resolve(), 'MERCHANT_CONTEXT_NOT_FOUND', 404);
    assert.deepEqual(calls, ['host', 'identity', 'merchant:shop.example.com']);
  }
});

test('returns 403 for missing or inactive membership', async () => {
  for (const membership of [null, {
    projectId: 'project_alpha',
    sellerId: 'seller_alpha',
    role: 'admin',
    status: 'inactive',
  }]) {
    const calls = [];
    const resolver = createMerchantContextResolver({
      requestAdapter: { async getObservedHost() { calls.push('host'); return 'shop.example.com'; } },
      sessionAdapter: { async getAuthenticatedIdentity() { calls.push('identity'); return identity; } },
      directory: activeDirectory({ calls, membership }),
    });

    await rejectsWith(resolver.resolve(), 'MERCHANT_CONTEXT_FORBIDDEN', 403);
    assert.deepEqual(calls, [
      'host',
      'identity',
      'merchant:shop.example.com',
      'membership:user_1:project_alpha:seller_alpha',
    ]);
  }
});

test('returns 403 when membership ownership differs from the active host record', async () => {
  for (const membership of [
    { projectId: 'project_other', sellerId: 'seller_alpha', role: 'admin', status: 'active' },
    { projectId: 'project_alpha', sellerId: 'seller_other', role: 'admin', status: 'active' },
  ]) {
    const resolver = createMerchantContextResolver({
      requestAdapter: { async getObservedHost() { return 'shop.example.com'; } },
      sessionAdapter: { async getAuthenticatedIdentity() { return identity; } },
      directory: activeDirectory({ membership }),
    });

    await rejectsWith(resolver.resolve(), 'MERCHANT_CONTEXT_SCOPE_MISMATCH', 403);
  }
});

test('does not normalize directory ownership identifiers into a match', async () => {
  const resolver = createMerchantContextResolver({
    requestAdapter: { async getObservedHost() { return 'shop.example.com'; } },
    sessionAdapter: { async getAuthenticatedIdentity() { return identity; } },
    directory: activeDirectory({
      merchant: {
        projectId: ' project_alpha ',
        sellerId: 'seller_alpha',
        status: 'active',
      },
    }),
  });

  await rejectsWith(resolver.resolve(), 'MERCHANT_CONTEXT_NOT_FOUND', 404);
});

test('one resolver performs the complete sequence again for two hosts and identities on shared infrastructure', async () => {
  const requests = [
    { host: 'ALPHA.EXAMPLE.COM:443', identity: { ...identity, subjectId: 'user_alpha' } },
    { host: 'beta.example.com.', identity: { ...identity, subjectId: 'user_beta' } },
  ];
  const merchants = new Map([
    ['alpha.example.com', {
      projectId: 'project_alpha', sellerId: 'seller_alpha', status: 'active',
      sharedEc2: 'same-foundation', sharedRds: 'same-foundation',
    }],
    ['beta.example.com', {
      projectId: 'project_beta', sellerId: 'seller_beta', status: 'active',
      sharedEc2: 'same-foundation', sharedRds: 'same-foundation',
    }],
  ]);
  const memberships = new Map([
    ['user_alpha:project_alpha:seller_alpha', {
      projectId: 'project_alpha', sellerId: 'seller_alpha', role: 'owner', status: 'active',
    }],
    ['user_beta:project_beta:seller_beta', {
      projectId: 'project_beta', sellerId: 'seller_beta', role: 'editor', status: 'active',
    }],
  ]);
  const calls = [];
  let requestIndex = 0;
  const resolver = createMerchantContextResolver({
    requestAdapter: {
      async getObservedHost() {
        calls.push(`host:${requestIndex}`);
        return requests[requestIndex].host;
      },
    },
    sessionAdapter: {
      async getAuthenticatedIdentity() {
        calls.push(`identity:${requestIndex}`);
        return requests[requestIndex].identity;
      },
    },
    directory: {
      async findMerchantByHost({ host }) {
        calls.push(`merchant:${host}`);
        return merchants.get(host) ?? null;
      },
      async findMembership({ subjectId, projectId, sellerId }) {
        calls.push(`membership:${subjectId}:${projectId}:${sellerId}`);
        return memberships.get(`${subjectId}:${projectId}:${sellerId}`) ?? null;
      },
    },
  });

  const first = await resolver.resolve();
  requestIndex = 1;
  const second = await resolver.resolve();

  assert.deepEqual(first, {
    projectId: 'project_alpha', sellerId: 'seller_alpha', host: 'alpha.example.com',
    subjectId: 'user_alpha', role: 'owner', merchantStatus: 'active',
  });
  assert.deepEqual(second, {
    projectId: 'project_beta', sellerId: 'seller_beta', host: 'beta.example.com',
    subjectId: 'user_beta', role: 'editor', merchantStatus: 'active',
  });
  assert.notStrictEqual(first, second);
  assert.deepEqual(calls, [
    'host:0',
    'identity:0',
    'merchant:alpha.example.com',
    'membership:user_alpha:project_alpha:seller_alpha',
    'host:1',
    'identity:1',
    'merchant:beta.example.com',
    'membership:user_beta:project_beta:seller_beta',
  ]);
});
