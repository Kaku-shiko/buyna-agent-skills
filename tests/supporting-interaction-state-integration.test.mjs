import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createAuthSession } from '../packages/buyna-auth-session-core/src/index.mjs';
import { createDashboardOperation } from '../packages/buyna-merchant-dashboard-core/src/operation-state.mjs';
import { createMerchantContextResolver } from '../packages/buyna-merchant-context-core/src/index.mjs';
import {
  buildMerchantObjectKey,
  createMerchantFileService,
  createUploadEffectExecutor,
  createUploadQueue,
} from '../packages/buyna-merchant-file-core/src/file-core.mjs';
import { planWebsiteRoute } from '../skills/buyna-website-builder/scripts/route-builder.mjs';

const projectId = 'project_alpha';
const sellerId = 'seller_alpha';
const identity = Object.freeze({
  subjectId: 'subject_alpha',
  permissions: Object.freeze(['files:write']),
  issuedAt: '2026-08-26T00:00:00.000Z',
  expiresAt: '2026-08-27T00:00:00.000Z',
});

const capabilities = Object.freeze({
  siteType: 'commerce',
  requiresDashboard: true,
  requiresCart: true,
  requiresCheckout: true,
  requiresPayment: false,
  requiresBooking: false,
  requiresCatalog: true,
  requiresInventory: true,
  requiresCoupons: false,
});

function dashboardRouteState() {
  const approved = (delivery) => ({
    status: 'approved',
    delivery,
    approvedBy: 'user',
    approvedAt: '2026-08-26T00:00:00.000Z',
  });
  return {
    projectId: 'supporting-integration',
    currentGate: 'dashboard_integration',
    configuration: {
      capabilities,
      dashboardSlices: ['products'],
      dashboardSliceApproval: {
        slices: ['products'],
        approvedBy: 'user',
        approvedAt: '2026-08-26T00:00:00.000Z',
        authorizationEvidence: {
          source: 'workflow_transition',
          event: 'dashboard_slices_approved',
          slices: ['products'],
          approvedBy: 'user',
          approvedAt: '2026-08-26T00:00:00.000Z',
        },
      },
    },
    gates: {
      customer_intake: approved({ record: 'intake.json', capabilities }),
      design_and_structure: approved({
        designRecord: 'design.json',
        pageStructure: 'pages.json',
        boardStatus: 'delivered',
      }),
      frontend_code: approved({
        deliveredFiles: ['app.tsx'],
        verification: ['PASS'],
        interfaceContract: 'contract.json',
      }),
      dashboard_integration: { status: 'ready' },
      checkout_payment: { status: 'locked' },
      testing_upload_gate: { status: 'locked' },
      aws_release: { status: 'locked' },
    },
  };
}

function assertProductsRouteContract(route) {
  const expectedModules = [
    'buyna-workflow-state-core',
    'buyna-merchant-catalog-core',
    'buyna-inventory-core',
    'buyna-merchant-dashboard-core',
    'buyna-auth-session-core',
    'buyna-merchant-context-core',
    'buyna-merchant-file-core',
  ];
  assert.equal(route.action, 'execute');
  assert.equal(route.targetGate, 'dashboard_integration');
  assert.equal(route.requestedSlice, 'dashboard_integration');
  assert.equal(route.dashboardSlice, 'products');
  assert.deepEqual(route.dashboardSlices, ['products']);
  assert.deepEqual(route.skills, [
    'buyai-product-merchant-backend',
    'buyai-dashboard-data-interaction',
  ]);
  assert.deepEqual(route.fixedModules, expectedModules);
  for (const moduleName of expectedModules) {
    assert.equal(route.fixedModules.filter((value) => value === moduleName).length, 1);
  }
  assert.deepEqual(route.manifestVerification, {
    profile: 'website-builder',
    verified: true,
  });
  for (const forbidden of [
    'buyna-merchant-dashboard-headless',
    'buyna-merchant-dashboard-ui',
    'buyna-dashboard-ui-core',
    'buyna-storefront-gallery-core',
  ]) {
    assert.equal(route.fixedModules.includes(forbidden), false);
    assert.equal(route.skills.includes(forbidden), false);
  }
}

function idSequence(values) {
  const queues = {
    item: [...values.item],
    attempt: [...values.attempt],
  };
  return (kind) => {
    const value = queues[kind]?.shift();
    if (!value) throw new Error(`MISSING_INTEGRATION_ID:${kind}`);
    return value;
  };
}

function createEffectStore(callLog) {
  const records = new Map();
  return {
    records,
    async acquireEffect(input) {
      callLog.push({ adapter: 'effect.acquire', scope: [input.projectId, input.sellerId], key: input.idempotencyKey });
      const record = records.get(input.idempotencyKey);
      if (record?.status === 'completed') return { outcome: 'completed', result: record.result };
      if (record?.status === 'in_progress') return { outcome: 'in_progress' };
      records.set(input.idempotencyKey, { status: 'in_progress' });
      return { outcome: 'acquired' };
    },
    async completeEffect(input) {
      callLog.push({ adapter: 'effect.complete', scope: [input.projectId, input.sellerId], key: input.idempotencyKey });
      records.set(input.idempotencyKey, { status: 'completed', result: input.result });
    },
    async failEffect(input) {
      callLog.push({ adapter: 'effect.fail', scope: [input.projectId, input.sellerId], key: input.idempotencyKey });
      records.set(input.idempotencyKey, { status: 'failed', errorCode: input.errorCode });
    },
  };
}

test('Builder route, manifest, and Dashboard state select fixed behavior without selecting presentation', async () => {
  const manifest = JSON.parse(await readFile(new URL('../repository-manifest.json', import.meta.url), 'utf8'));
  const fixedModules = [
    'buyna-auth-session-core',
    'buyna-merchant-context-core',
    'buyna-merchant-file-core',
    'buyna-merchant-dashboard-core',
  ];
  for (const moduleName of fixedModules) {
    assert.ok(manifest.packages.includes(moduleName));
    assert.ok(manifest.profiles['website-builder'].packages.includes(moduleName));
  }

  const route = planWebsiteRoute({
    capabilities,
    workflowState: dashboardRouteState(),
    requestedSlice: 'dashboard_integration',
    dashboardSlice: 'products',
  });
  assertProductsRouteContract(route);
  assert.deepEqual(route.externalActions, { git: false, aws: false });

  const operation = createDashboardOperation();
  const loading = operation.transition('load');
  const ready = operation.transition('load_success', {
    requestId: loading.requestId,
    data: { items: [] },
  });
  assert.equal(ready.state, 'ready');
  assert.equal(ready.dataState, 'ready');
  assert.equal(ready.ariaBusy, false);
  assert.equal(Object.isFrozen(ready), true);
});

test('Builder route contract assertions reject duplicate, presentation, scope, and manifest mutations', () => {
  const valid = planWebsiteRoute({
    capabilities,
    workflowState: dashboardRouteState(),
    requestedSlice: 'dashboard_integration',
    dashboardSlice: 'products',
  });
  const mutations = [
    { ...valid, action: 'blocked' },
    { ...valid, targetGate: 'frontend_code' },
    { ...valid, dashboardSlice: 'orders' },
    { ...valid, dashboardSlices: ['orders'] },
    { ...valid, manifestVerification: { profile: 'website-builder', verified: false } },
    { ...valid, fixedModules: [...valid.fixedModules, 'buyna-auth-session-core'] },
    { ...valid, fixedModules: [...valid.fixedModules, 'buyna-merchant-dashboard-headless'] },
    { ...valid, fixedModules: [...valid.fixedModules, 'buyna-storefront-gallery-core'] },
  ];
  for (const mutation of mutations) {
    assert.throws(() => assertProductsRouteContract(mutation));
  }
});

test('authenticated merchant upload keeps fresh server scope, exact-once effects, and safe retries', async () => {
  const requestCalls = [];
  const scopedCalls = [];
  const externalCalls = new Map();
  const storedObjects = new Map();
  const confirmedFiles = [];
  const storageCalls = [];
  const metadataInputs = [];
  let observedHost = 'alpha.example.test';

  const merchants = new Map([
    ['alpha.example.test', { projectId, sellerId, status: 'active' }],
    ['beta.example.test', { projectId: 'project_beta', sellerId: 'seller_beta', status: 'active' }],
  ]);
  const adapters = {
    requestAdapter: {
      async getObservedHost() {
        requestCalls.push({ adapter: 'host', host: observedHost });
        return observedHost;
      },
    },
    sessionAdapter: {
      async getAuthenticatedIdentity() {
        requestCalls.push({ adapter: 'auth', host: observedHost });
        const session = createAuthSession({
          clock: () => new Date('2026-08-26T01:00:00.000Z'),
          initialIdentity: identity,
        });
        const decision = session.requireAuthorization({ permissions: ['files:write'] });
        assert.equal(decision.allowed, true);
        assert.deepEqual(Object.keys(decision.identity), [
          'subjectId', 'permissions', 'issuedAt', 'expiresAt',
        ]);
        return decision.identity;
      },
    },
    directory: {
      async findMerchantByHost({ host }) {
        requestCalls.push({ adapter: 'merchant', host });
        return merchants.get(host) ?? null;
      },
      async findMembership(scope) {
        requestCalls.push({ adapter: 'membership', host: observedHost, scope: { ...scope } });
        if (scope.projectId !== projectId || scope.sellerId !== sellerId) return null;
        return {
          subjectId: scope.subjectId,
          projectId,
          sellerId,
          role: 'admin',
          status: 'active',
        };
      },
    },
  };
  const resolver = createMerchantContextResolver(adapters);

  const context = await resolver.resolve();
  assert.deepEqual(context, {
    projectId,
    sellerId,
    host: 'alpha.example.test',
    subjectId: identity.subjectId,
    role: 'admin',
    merchantStatus: 'active',
  });

  const storage = {
    async headObject({ key }) {
      storageCalls.push({ key });
      return storedObjects.get(key) ?? null;
    },
  };
  const metadata = {
    async confirmUpload(input) {
      metadataInputs.push(structuredClone(input));
      scopedCalls.push({ adapter: 'metadata.confirm', scope: [input.scope.projectId, input.scope.sellerId], key: input.objectKey });
      const record = { id: `confirmed_${confirmedFiles.length + 1}`, ...input };
      confirmedFiles.push(record);
      return record;
    },
  };
  const fileService = createMerchantFileService({
    storage,
    metadata,
    projectId: context.projectId,
    sellerId: context.sellerId,
    policy: { allowedMimeTypes: ['image/webp'], maxBytes: 5_000 },
  });
  const effectStore = createEffectStore(scopedCalls);
  const handlerCounts = new Map();
  const countHandler = (effect) => {
    externalCalls.set(effect.idempotencyKey, (externalCalls.get(effect.idempotencyKey) ?? 0) + 1);
    handlerCounts.set(effect.type, (handlerCounts.get(effect.type) ?? 0) + 1);
    scopedCalls.push({ adapter: `handler.${effect.type}`, scope: [effect.projectId, effect.sellerId], key: effect.idempotencyKey });
  };
  const executor = createUploadEffectExecutor({
    projectId: context.projectId,
    sellerId: context.sellerId,
    effectStore,
    handlers: {
      async validate_file(effect) {
        countHandler(effect);
        if (effect.attemptId === 'attempt_failed') {
          const error = new Error('FILE_VALIDATION_FAILED');
          error.code = 'FILE_VALIDATION_FAILED';
          throw error;
        }
        return { valid: true };
      },
      async upload_object(effect) {
        countHandler(effect);
        const objectKey = buildMerchantObjectKey({
          projectId: effect.projectId,
          sellerId: effect.sellerId,
          entityType: 'products',
          entityId: 'product_1',
          variant: 'original',
          objectId: effect.itemId,
          extension: 'webp',
        });
        storedObjects.set(objectKey, {
          contentType: effect.payload.type,
          size: effect.payload.size,
          etag: `etag_${effect.itemId}`,
        });
        return { objectKey };
      },
      async confirm_upload(effect) {
        countHandler(effect);
        const objectKey = buildMerchantObjectKey({
          projectId: effect.projectId,
          sellerId: effect.sellerId,
          entityType: 'products',
          entityId: 'product_1',
          variant: 'original',
          objectId: effect.itemId,
          extension: 'webp',
        });
        const file = await fileService.confirmUpload({
          objectKey,
          entityType: 'products',
          entityId: 'product_1',
          variant: 'original',
          originalFilename: effect.payload.name,
        });
        return { fileId: file.id, objectKey: file.objectKey };
      },
    },
  });

  const queue = createUploadQueue({
    projectId: context.projectId,
    sellerId: context.sellerId,
    idGenerator: idSequence({
      item: ['file_primary', 'file_retry'],
      attempt: ['attempt_primary', 'attempt_failed', 'attempt_retry'],
    }),
    clock: () => new Date('2026-08-26T02:00:00.000Z'),
  });

  queue.select({ name: 'primary.webp', size: 1_200, type: 'image/webp' });
  const validating = queue.transition({ itemId: 'file_primary', event: 'start_validation' });
  await executor.execute(validating.effects[0]);
  const uploading = queue.transition({
    itemId: 'file_primary', event: 'validation_succeeded', attemptId: 'attempt_primary',
  });
  await executor.execute(uploading.effects[0]);
  await executor.execute(uploading.effects[0]);
  const confirming = queue.transition({
    itemId: 'file_primary', event: 'upload_succeeded', attemptId: 'attempt_primary',
  });
  const confirmingReplay = queue.transition({
    itemId: 'file_primary', event: 'upload_succeeded', attemptId: 'attempt_primary',
  });
  assert.equal(confirmingReplay.effects[0].effectId, confirming.effects[0].effectId);
  await executor.execute(confirming.effects[0]);
  await executor.execute(confirmingReplay.effects[0]);
  const ready = queue.transition({
    itemId: 'file_primary', event: 'confirmation_succeeded', attemptId: 'attempt_primary',
  });
  const readyReplay = queue.transition({
    itemId: 'file_primary', event: 'confirmation_succeeded', attemptId: 'attempt_primary',
  });
  assert.deepEqual(readyReplay, ready);
  assert.deepEqual(ready.effects, []);
  assert.equal(ready.snapshot.items[0].state, 'ready');
  assert.equal(confirmedFiles.length, 1);
  const expectedObjectPrefix = `projects/${projectId}/sellers/${sellerId}/`;
  assert.equal(storageCalls.length, 1);
  assert.ok(storageCalls[0].key.startsWith(expectedObjectPrefix));
  assert.equal(metadataInputs.length, 1);
  assert.deepEqual(metadataInputs[0].scope, { projectId, sellerId });
  assert.ok(metadataInputs[0].objectKey.startsWith(expectedObjectPrefix));
  assert.equal(metadataInputs[0].entityType, 'products');
  assert.equal(metadataInputs[0].entityId, 'product_1');

  const snapshotBeforeStaleProgress = queue.snapshot();
  assert.throws(
    () => queue.setProgress({
      itemId: 'file_primary', attemptId: 'attempt_stale', loaded: 900, total: 1_200,
    }),
    (error) => error.code === 'UPLOAD_QUEUE_STALE_ATTEMPT',
  );
  assert.deepEqual(queue.snapshot(), snapshotBeforeStaleProgress);

  queue.select({ name: 'retry.webp', size: 800, type: 'image/webp' });
  const firstAttempt = queue.transition({ itemId: 'file_retry', event: 'start_validation' });
  await assert.rejects(
    () => executor.execute(firstAttempt.effects[0]),
    (error) => error.code === 'FILE_VALIDATION_FAILED',
  );
  queue.transition({
    itemId: 'file_retry',
    event: 'validation_failed',
    attemptId: 'attempt_failed',
    data: { errorCode: 'FILE_VALIDATION_FAILED' },
  });
  const retry = queue.retry({ itemId: 'file_retry' });
  assert.notEqual(retry.effects[0].effectId, firstAttempt.effects[0].effectId);
  assert.equal(retry.effects[0].attemptId, 'attempt_retry');
  await executor.execute(retry.effects[0]);
  await executor.execute(retry.effects[0]);

  for (const [key, calls] of externalCalls) {
    assert.equal(calls, 1, `external effect must run once for ${key}`);
  }
  for (const call of scopedCalls) {
    assert.deepEqual(call.scope, [projectId, sellerId], `${call.adapter} received another scope`);
  }

  const effectsBeforeForbiddenRequest = scopedCalls.length;
  const objectsBeforeForbiddenRequest = storedObjects.size;
  const confirmsBeforeForbiddenRequest = confirmedFiles.length;
  observedHost = 'beta.example.test';
  await assert.rejects(
    () => resolver.resolve(),
    (error) => error.code === 'MERCHANT_CONTEXT_FORBIDDEN' && error.statusCode === 403,
  );
  assert.equal(scopedCalls.length, effectsBeforeForbiddenRequest);
  assert.equal(storedObjects.size, objectsBeforeForbiddenRequest);
  assert.equal(confirmedFiles.length, confirmsBeforeForbiddenRequest);

  assert.deepEqual(
    requestCalls.map(({ adapter }) => adapter),
    ['host', 'auth', 'merchant', 'membership', 'host', 'auth', 'merchant', 'membership'],
  );
  assert.deepEqual(
    requestCalls.filter(({ adapter }) => adapter === 'merchant').map(({ host }) => host),
    ['alpha.example.test', 'beta.example.test'],
  );
  assert.deepEqual(
    requestCalls.filter(({ adapter }) => adapter === 'membership').map(({ scope }) => scope.sellerId),
    ['seller_alpha', 'seller_beta'],
  );
});
