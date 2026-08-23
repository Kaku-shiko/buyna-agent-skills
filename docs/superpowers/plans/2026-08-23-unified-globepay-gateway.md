# Unified GlobePay Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one reusable Buyna GlobePay runtime that authenticates each merchant, selects the correct mobile or desktop payment route, verifies provider results, and reliably delivers isolated settlement events to merchant adapters.

**Architecture:** A fixed `buyna-globepay-gateway-core` package owns merchant-scoped configuration, request authentication, GlobePay routing/signing, provider verification, amount/currency checks, idempotency, and delivery state. A thin HTTP runtime exposes authenticated checkout, public provider notify, safe browser return, and operations reconciliation routes. Each merchant retains its own settlement adapter and transaction through the existing `buyna-commerce-settlement-core`.

**Tech Stack:** Node.js ESM, `node:test`, PostgreSQL, AWS Secrets Manager, Nginx/Unix socket or private loopback, existing GlobePay Japan API contract.

**Spec:** `docs/superpowers/specs/2026-08-23-unified-globepay-gateway-design.md`

## Global Constraints

- Reuse the approved existing Buyna EC2 and shared RDS; do not create EC2, RDS, database, S3 bucket, or public application port.
- Store gateway tables only in the `payment_gateway` schema of the existing `buyna_merchants` database.
- Raw GlobePay and HMAC secrets remain in AWS Secrets Manager and never enter Git, Skills, browser code, logs, chat, or database rows.
- Every operation is scoped by `project_id + seller_id`; optional `payment_account_id` is server-selected and cannot be overridden by the browser.
- `Alipay` and `Alipay+` remain distinct case-sensitive channels.
- Browser return never proves payment; verified provider query plus exact amount/currency match is required.
- Mobile wallet browser uses JSAPI, ordinary mobile browser uses H5, and desktop uses the approved hosted or QR route.
- Merchant settlement remains one local transaction that writes order/payment effects and the GMV outbox exactly once.
- No production routing, payment activation, real payment, or merchant traffic switch occurs without a separate release approval.

---

## File structure

Create `packages/buyna-globepay-gateway-core/` for pure domain behavior. Keep request authentication, routing, provider verification, and delivery state in focused source files so the HTTP runtime has no business decisions.

Create `apps/buyna-payment-gateway/` for the deployable HTTP composition root, PostgreSQL migrations/adapters, Secrets Manager adapter, GlobePay HTTP adapter, and operational scripts. No merchant business model belongs in this app.

Modify the existing GlobePay Skills to install/configure the fixed gateway and thin merchant adapter. Keep `packages/buyna-commerce-settlement-core/` as the merchant-side transaction boundary and strengthen its scope/event contract only where needed.

---

### Task 1: Merchant-scoped identity and signed request envelope

**Files:**
- Create: `packages/buyna-globepay-gateway-core/package.json`
- Create: `packages/buyna-globepay-gateway-core/src/errors.mjs`
- Create: `packages/buyna-globepay-gateway-core/src/merchant-auth.mjs`
- Create: `packages/buyna-globepay-gateway-core/src/index.mjs`
- Create: `packages/buyna-globepay-gateway-core/test/merchant-auth.test.mjs`

**Interfaces:**
- Consumes: Node `crypto`, merchant HMAC secret supplied by a runtime adapter.
- Produces: `signMerchantEnvelope({method,path,timestamp,nonce,body,secret})` and `verifyMerchantEnvelope({request,secret,now,nonceStore,maxSkewMs})`.

- [ ] **Step 1: Write failing tests for valid identity, underscore IDs, replay, expiry, and tampering**

```js
test('accepts a signed merchant request with underscore IDs', async () => {
  const request = fixtureRequest({ projectId: 'project_shop_alpha', sellerId: 'seller_shop_alpha' });
  const result = await verifyMerchantEnvelope({ request, secret: 'test-secret', now: request.timestamp, nonceStore: freshNonceStore() });
  assert.deepEqual(result.scope, { projectId: 'project_shop_alpha', sellerId: 'seller_shop_alpha', paymentAccountId: null });
});

test('rejects replay and body tampering', async () => {
  const nonceStore = freshNonceStore();
  const request = fixtureRequest();
  await verifyMerchantEnvelope({ request, secret: 'test-secret', now: request.timestamp, nonceStore });
  await assert.rejects(() => verifyMerchantEnvelope({ request, secret: 'test-secret', now: request.timestamp, nonceStore }), /AUTH_NONCE_REPLAYED/);
  await assert.rejects(() => verifyMerchantEnvelope({ request: { ...request, body: { orderId: 'changed' } }, secret: 'test-secret', now: request.timestamp, nonceStore: freshNonceStore() }), /AUTH_SIGNATURE_INVALID/);
});
```

- [ ] **Step 2: Run the test and verify the module is missing**

Run: `node --test packages/buyna-globepay-gateway-core/test/merchant-auth.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement canonical hashing and replay-safe verification**

```js
export function signMerchantEnvelope({ method, path, timestamp, nonce, body, secret }) {
  const bodyHash = createHash('sha256').update(stableJson(body)).digest('hex');
  const canonical = [method.toUpperCase(), path, String(timestamp), nonce, bodyHash].join('\n');
  return createHmac('sha256', secret).update(canonical).digest('hex');
}

export async function verifyMerchantEnvelope({ request, secret, now, nonceStore, maxSkewMs = 300000 }) {
  assertMerchantId(request.projectId, 'project');
  assertMerchantId(request.sellerId, 'seller');
  if (Math.abs(Number(now) - Number(request.timestamp)) > maxSkewMs) fail('AUTH_TIMESTAMP_EXPIRED');
  const expected = signMerchantEnvelope({ ...request, secret });
  if (!safeEqual(expected, request.signature)) fail('AUTH_SIGNATURE_INVALID');
  if (!(await nonceStore.claim({ projectId: request.projectId, sellerId: request.sellerId, nonce: request.nonce, expiresAt: Number(now) + maxSkewMs }))) fail('AUTH_NONCE_REPLAYED');
  return { scope: { projectId: request.projectId, sellerId: request.sellerId, paymentAccountId: request.paymentAccountId ?? null } };
}
```

- [ ] **Step 4: Run the package tests**

Run: `node --test packages/buyna-globepay-gateway-core/test/*.test.mjs`

Expected: all tests PASS.

- [ ] **Step 5: Commit the identity boundary**

```bash
git add packages/buyna-globepay-gateway-core
git commit -m "feat(payment): add merchant request authentication core"
```

### Task 2: Fixed device and channel routing

**Files:**
- Create: `packages/buyna-globepay-gateway-core/src/checkout-routing.mjs`
- Create: `packages/buyna-globepay-gateway-core/test/checkout-routing.test.mjs`
- Modify: `packages/buyna-globepay-gateway-core/src/index.mjs`

**Interfaces:**
- Consumes: `{ method, clientContext, enabledChannels }` where method is `wechat`, `alipay`, or `card` and context is `wechat_browser`, `alipay_browser`, `mobile`, or `desktop`.
- Produces: `selectCheckoutRoute(input) -> { channel, endpointFamily, nextAction }`.

- [ ] **Step 1: Write the complete routing matrix tests**

```js
const cases = [
  ['wechat', 'wechat_browser', 'Wechat', 'jsapi_gateway', 'jsapi'],
  ['wechat', 'mobile', 'Wechat', 'h5_payment', 'redirect'],
  ['wechat', 'desktop', 'Wechat', 'gateway', 'qr'],
  ['alipay', 'alipay_browser', 'Alipay', 'jsapi_gateway', 'jsapi'],
  ['alipay', 'mobile', 'Alipay', 'h5_payment', 'redirect'],
  ['alipay', 'desktop', 'Alipay', 'gateway', 'qr'],
  ['card', 'mobile', 'Card', 'pre_card_orders', 'hosted_page'],
];
for (const [method, clientContext, channel, endpointFamily, nextAction] of cases) {
  test(`${method}/${clientContext}`, () => assert.deepEqual(selectCheckoutRoute({ method, clientContext, enabledChannels: [channel] }), { channel, endpointFamily, nextAction }));
}
test('never returns desktop QR to mobile', () => assert.notEqual(selectCheckoutRoute({ method: 'wechat', clientContext: 'mobile', enabledChannels: ['Wechat'] }).nextAction, 'qr'));
test('does not substitute Alipay+ for Alipay', () => assert.throws(() => selectCheckoutRoute({ method: 'alipay', clientContext: 'mobile', enabledChannels: ['Alipay+'] }), /CHANNEL_NOT_ENABLED/));
```

- [ ] **Step 2: Run the routing tests and observe failure**

Run: `node --test packages/buyna-globepay-gateway-core/test/checkout-routing.test.mjs`

Expected: FAIL because `selectCheckoutRoute` is not exported.

- [ ] **Step 3: Implement the table-driven router**

```js
const routes = new Map([
  ['wechat:wechat_browser', ['Wechat', 'jsapi_gateway', 'jsapi']],
  ['wechat:mobile', ['Wechat', 'h5_payment', 'redirect']],
  ['wechat:desktop', ['Wechat', 'gateway', 'qr']],
  ['alipay:alipay_browser', ['Alipay', 'jsapi_gateway', 'jsapi']],
  ['alipay:mobile', ['Alipay', 'h5_payment', 'redirect']],
  ['alipay:desktop', ['Alipay', 'gateway', 'qr']],
  ['card:wechat_browser', ['Card', 'pre_card_orders', 'hosted_page']],
  ['card:alipay_browser', ['Card', 'pre_card_orders', 'hosted_page']],
  ['card:mobile', ['Card', 'pre_card_orders', 'hosted_page']],
  ['card:desktop', ['Card', 'pre_card_orders', 'hosted_page']],
]);
export function selectCheckoutRoute({ method, clientContext, enabledChannels }) {
  const route = routes.get(`${method}:${clientContext}`);
  if (!route) fail('PAYMENT_ROUTE_UNSUPPORTED');
  const [channel, endpointFamily, nextAction] = route;
  if (!enabledChannels.includes(channel)) fail('CHANNEL_NOT_ENABLED');
  return { channel, endpointFamily, nextAction };
}
```

- [ ] **Step 4: Run all gateway-core tests**

Run: `node --test packages/buyna-globepay-gateway-core/test/*.test.mjs`

Expected: all tests PASS.

- [ ] **Step 5: Commit routing**

```bash
git add packages/buyna-globepay-gateway-core
git commit -m "feat(payment): centralize mobile and desktop routing"
```

### Task 3: Provider-verified payment event core

**Files:**
- Create: `packages/buyna-globepay-gateway-core/src/provider-verification.mjs`
- Create: `packages/buyna-globepay-gateway-core/src/payment-events.mjs`
- Create: `packages/buyna-globepay-gateway-core/test/provider-verification.test.mjs`
- Modify: `packages/buyna-globepay-gateway-core/src/index.mjs`

**Interfaces:**
- Consumes: `provider.verifyNotification(payload)`, `provider.queryOrder({ providerOrderId, account })`, and immutable order snapshot.
- Produces: `verifyAndNormalizeProviderEvent({ notification, attempt, order, account, provider }) -> VerifiedPaymentEvent`.

- [ ] **Step 1: Write failing verification tests**

```js
test('normalizes paid only after query and exact money match', async () => {
  const event = await verifyAndNormalizeProviderEvent({
    notification: { providerOrderId: 'gp-1' },
    attempt: { id: 'attempt-1', providerOrderId: 'gp-1' },
    order: { id: 'order-1', projectId: 'project_a', sellerId: 'seller_a', amount: 1200, currency: 'JPY' },
    account: { id: 'account-1' },
    provider: trustedProvider({ resultCode: 'PAY_SUCCESS', amount: 1200, currency: 'JPY' }),
  });
  assert.equal(event.status, 'paid');
  assert.equal(event.amount, 1200);
});
test('rejects mismatched amount and currency', async () => {
  await assert.rejects(() => verifyFixture({ amount: 1199 }), /PROVIDER_AMOUNT_MISMATCH/);
  await assert.rejects(() => verifyFixture({ currency: 'CNY' }), /PROVIDER_CURRENCY_MISMATCH/);
});
test('rejects unverified notification and browser return', async () => {
  await assert.rejects(() => verifyFixture({ notificationTrusted: false }), /PROVIDER_NOTIFICATION_INVALID/);
  await assert.rejects(() => verifyAndNormalizeProviderEvent({ eventType: 'return' }), /UNTRUSTED_PAYMENT_EVENT/);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `node --test packages/buyna-globepay-gateway-core/test/provider-verification.test.mjs`

Expected: FAIL because the verification function is missing.

- [ ] **Step 3: Implement verification and immutable normalized events**

```js
export async function verifyAndNormalizeProviderEvent({ eventType = 'notify', notification, attempt, order, account, provider }) {
  if (eventType !== 'notify' && eventType !== 'reconcile') fail('UNTRUSTED_PAYMENT_EVENT');
  if (eventType === 'notify' && !(await provider.verifyNotification(notification, account))) fail('PROVIDER_NOTIFICATION_INVALID');
  const queried = await provider.queryOrder({ providerOrderId: attempt.providerOrderId, account });
  if (queried.resultCode !== 'PAY_SUCCESS' && !isRefundCode(queried.resultCode)) fail('PROVIDER_STATUS_NOT_SETTLED');
  if (Number(queried.amount) !== Number(order.amount)) fail('PROVIDER_AMOUNT_MISMATCH');
  if (queried.currency !== order.currency) fail('PROVIDER_CURRENCY_MISMATCH');
  return Object.freeze({ eventId: providerEventId(queried), provider: 'globepay', providerOrderId: queried.providerOrderId, orderId: order.id, projectId: order.projectId, sellerId: order.sellerId, status: isRefundCode(queried.resultCode) ? 'refunded' : 'paid', amount: order.amount, currency: order.currency, verifiedAt: queried.queriedAt });
}
```

- [ ] **Step 4: Run gateway tests**

Run: `node --test packages/buyna-globepay-gateway-core/test/*.test.mjs`

Expected: all tests PASS, including mismatch and duplicate fixtures.

- [ ] **Step 5: Commit provider verification**

```bash
git add packages/buyna-globepay-gateway-core
git commit -m "feat(payment): verify and normalize provider settlements"
```

### Task 4: PostgreSQL schema and reliable delivery store

**Files:**
- Create: `apps/buyna-payment-gateway/package.json`
- Create: `apps/buyna-payment-gateway/migrations/001-payment-gateway.up.sql`
- Create: `apps/buyna-payment-gateway/migrations/001-payment-gateway.down.sql`
- Create: `apps/buyna-payment-gateway/src/postgres-store.mjs`
- Create: `apps/buyna-payment-gateway/test/postgres-store.contract.test.mjs`

**Interfaces:**
- Consumes: a `node-postgres` compatible pool passed at composition time.
- Produces: `createPaymentGatewayStore(pool)` with `loadMerchantConfig`, `claimNonce`, `createAttempt`, `claimProviderEvent`, `enqueueDelivery`, `claimDueDeliveries`, and `ackDelivery`.

- [ ] **Step 1: Write schema assertions and store contract tests**

```js
test('migration creates isolated tables with merchant scope', () => {
  const sql = readFileSync(migrationPath, 'utf8');
  for (const table of ['merchant_payment_configs', 'payment_attempts', 'provider_events', 'payment_deliveries', 'idempotency_keys', 'payment_audit_logs']) assert.match(sql, new RegExp(`payment_gateway\\.${table}`));
  assert.match(sql, /project_id text not null/i);
  assert.match(sql, /seller_id text not null/i);
});
test('claimProviderEvent returns false for the same scoped event twice', async () => {
  const store = createPaymentGatewayStore(fakePool());
  assert.equal(await store.claimProviderEvent(event), true);
  assert.equal(await store.claimProviderEvent(event), false);
});
```

- [ ] **Step 2: Run the contract tests and verify failure**

Run: `node --test apps/buyna-payment-gateway/test/postgres-store.contract.test.mjs`

Expected: FAIL because migration and store do not exist.

- [ ] **Step 3: Add reversible schema with database constraints**

```sql
create schema if not exists payment_gateway;
create table payment_gateway.merchant_payment_configs (
  project_id text not null,
  seller_id text not null,
  payment_account_id text not null default 'default',
  credential_secret_source text not null,
  hmac_secret_source text not null,
  mode text not null check (mode in ('disabled','test','production')),
  enabled_channels jsonb not null,
  allowed_currencies jsonb not null,
  allowed_return_domains jsonb not null,
  allowed_provider_hosts jsonb not null,
  adapter_target text not null,
  primary key (project_id, seller_id, payment_account_id)
);
```

The migration also creates:

- `payment_attempts` with a unique `(project_id, seller_id, idempotency_key)` and unique provider-order reference;
- `provider_events` with a unique `(project_id, seller_id, provider, provider_event_id)`;
- `payment_deliveries` with a unique `provider_event_id`, attempt count, next-attempt time, acknowledgement time, and terminal quarantine code;
- `idempotency_keys` with a unique `(project_id, seller_id, key_kind, key_value)` and expiry time;
- `payment_audit_logs` with merchant scope, decision code, safe metadata, and creation time.

Every child table carries `project_id` and `seller_id` and uses a composite foreign key to merchant configuration. The down migration drops these six tables in dependency order and drops the `payment_gateway` schema only when empty.

- [ ] **Step 4: Implement parameterized PostgreSQL adapter methods**

```js
export function createPaymentGatewayStore(pool) {
  return {
    async loadMerchantConfig(scope) {
      return oneOrNull(await pool.query('select * from payment_gateway.merchant_payment_configs where project_id=$1 and seller_id=$2 and payment_account_id=$3', [scope.projectId, scope.sellerId, scope.paymentAccountId ?? 'default']));
    },
    async claimNonce(input) {
      const result = await pool.query('insert into payment_gateway.idempotency_keys(project_id,seller_id,key_kind,key_value,expires_at) values($1,$2,$3,$4,$5) on conflict do nothing returning key_value', [input.projectId,input.sellerId,'auth_nonce',input.nonce,input.expiresAt]);
      return result.rowCount === 1;
    },
  };
}
```

- [ ] **Step 5: Run store tests and migration lint**

Run: `node --test apps/buyna-payment-gateway/test/postgres-store.contract.test.mjs`

Expected: all tests PASS and every query uses positional parameters.

- [ ] **Step 6: Commit persistence**

```bash
git add apps/buyna-payment-gateway
git commit -m "feat(payment): add gateway persistence and delivery store"
```

### Task 5: Runtime adapters and HTTP composition

**Files:**
- Create: `apps/buyna-payment-gateway/src/secrets-adapter.mjs`
- Create: `apps/buyna-payment-gateway/src/globepay-provider.mjs`
- Create: `apps/buyna-payment-gateway/src/merchant-delivery.mjs`
- Create: `apps/buyna-payment-gateway/src/http-app.mjs`
- Create: `apps/buyna-payment-gateway/src/server.mjs`
- Create: `apps/buyna-payment-gateway/test/http-app.test.mjs`
- Create: `apps/buyna-payment-gateway/test/merchant-delivery.test.mjs`

**Interfaces:**
- Consumes: gateway core, PostgreSQL store, Secrets Manager client, HTTP fetch implementation, and merchant adapter targets.
- Produces: `createGatewayHttpApp(dependencies)` and `deliverVerifiedEvent({ delivery, target, secret })`.

- [ ] **Step 1: Write HTTP boundary tests**

```js
test('checkout ignores browser amount and uses merchant order snapshot', async () => {
  const response = await request(app).post('/internal/v1/checkouts').send(signedBody({ orderId: 'order-1', amount: 1 }));
  assert.equal(response.status, 201);
  assert.equal(provider.lastRequest.amount, 1200);
});
test('return route never settles an order', async () => {
  const response = await request(app).get('/public/v1/returns/order-1');
  assert.equal(response.status, 200);
  assert.equal(store.settlementWrites, 0);
});
test('notify queries provider before enqueueing settlement', async () => {
  await request(app).post('/public/v1/globepay/notify').send(validNotify);
  assert.deepEqual(callOrder, ['verifyNotification', 'queryOrder', 'claimProviderEvent', 'enqueueDelivery']);
});
```

- [ ] **Step 2: Run HTTP tests and verify failure**

Run: `node --test apps/buyna-payment-gateway/test/http-app.test.mjs apps/buyna-payment-gateway/test/merchant-delivery.test.mjs`

Expected: FAIL because the runtime modules are missing.

- [ ] **Step 3: Implement strict secret and provider adapters**

```js
export function createSecretsAdapter(client) {
  return { async getJson(secretSource) { const value = await client.getSecretValue({ SecretId: secretSource }); return JSON.parse(value.SecretString); } };
}
export function assertOfficialProviderUrl(value, allowedHosts) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !allowedHosts.includes(url.hostname)) throw coded('PROVIDER_URL_NOT_ALLOWED');
  return url;
}
```

The GlobePay adapter uses `https://pay.globepay.co.jp/api/v1.0` and the existing exact SHA-256 signing contract. It returns normalized fields only and never logs credentials or raw signed URLs.

- [ ] **Step 4: Implement four explicit routes**

```js
const routes = new Map([
  ['POST /internal/v1/checkouts', authenticateMerchant(createCheckout)],
  ['POST /public/v1/globepay/notify', acceptProviderNotify],
  ['GET /public/v1/returns/:attemptId', showSafeReturnStatus],
  ['POST /internal/v1/reconcile/:attemptId', authenticateOperations(reconcileAttempt)],
]);
export const handleRequest = createNodeHttpHandler(routes);
```

`createCheckout` loads merchant configuration and the merchant adapter's authoritative order snapshot before creating a provider order. `acceptProviderNotify` verifies then queries the provider before enqueueing a settlement event. `showSafeReturnStatus` performs no write. `reconcileAttempt` uses the same provider verification path as notify.

- [ ] **Step 5: Implement signed merchant delivery and retry classification**

```js
export async function deliverVerifiedEvent({ delivery, target, secret, fetchImpl }) {
  const envelope = signSettlementEnvelope({ event: delivery.event, secret });
  const response = await fetchImpl(target, { method: 'POST', headers: envelope.headers, body: JSON.stringify(envelope.body) });
  if (response.status >= 200 && response.status < 300) return { status: 'acknowledged' };
  if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) return { status: 'quarantined', code: `MERCHANT_${response.status}` };
  return { status: 'retry', code: `MERCHANT_${response.status}` };
}
```

- [ ] **Step 6: Run runtime tests**

Run: `node --test apps/buyna-payment-gateway/test/*.test.mjs`

Expected: all tests PASS; tests confirm no browser amount authority, no return settlement, strict provider host, and replay-safe delivery.

- [ ] **Step 7: Commit runtime**

```bash
git add apps/buyna-payment-gateway
git commit -m "feat(payment): add unified GlobePay gateway runtime"
```

### Task 6: Merchant settlement adapter contract

**Files:**
- Modify: `packages/buyna-commerce-settlement-core/src/index.mjs`
- Modify: `packages/buyna-commerce-settlement-core/test/settlement.test.mjs`
- Create: `packages/buyna-commerce-settlement-core/src/signed-event.mjs`
- Create: `packages/buyna-commerce-settlement-core/test/signed-event.test.mjs`
- Create: `apps/buyna-payment-gateway/docs/merchant-adapter-contract.md`

**Interfaces:**
- Consumes: signed `VerifiedPaymentEvent`, merchant HMAC secret, and existing transaction adapter.
- Produces: `verifySettlementEnvelope(input)` and merchant operations `getPayableOrder`, `applyVerifiedPayment`, `applyVerifiedRefund`.

- [ ] **Step 1: Write failing scope and exactly-once tests**

```js
test('rejects settlement for another merchant before transaction effects', async () => {
  const module = createSettlementModule(fixture({ order: { id: 'order-1', projectId: 'project_a', sellerId: 'seller_a' } }));
  await assert.rejects(() => module.settle({ projectId: 'project_b', sellerId: 'seller_b', verifiedEvent }), /MERCHANT_SCOPE_MISMATCH/);
});
test('paid event writes payment order inventory coupon and GMV once', async () => {
  const first = await module.settle(input);
  const duplicate = await module.settle(input);
  assert.equal(first.status, 'applied');
  assert.equal(duplicate.status, 'duplicate');
  assert.deepEqual(calls, ['payment','order','inventory','coupon','customer','gmv']);
});
```

- [ ] **Step 2: Run tests and verify new assertions fail**

Run: `node --test packages/buyna-commerce-settlement-core/test/*.test.mjs`

Expected: FAIL for missing scope and coupon-once behavior.

- [ ] **Step 3: Add scope validation and optional coupon effect inside the existing transaction**

```js
if (order.projectId !== input.projectId || order.sellerId !== input.sellerId) fail('MERCHANT_SCOPE_MISMATCH');
if (verified.status === 'paid' && typeof tx.applyCouponOnce === 'function') await tx.applyCouponOnce({ order, eventId: verified.eventId });
```

The signed-event verifier checks timestamp, nonce, signature, event scope, amount, currency, and event ID before calling `settle`. It does not query GlobePay because provider verification belongs to the gateway.

- [ ] **Step 4: Write the exact adapter request and response contract**

```ts
type PayableOrder = { id: string; projectId: string; sellerId: string; status: 'pending_payment'; amount: number; currency: 'JPY' | 'CNY'; allowedMethods: Array<'wechat'|'alipay'|'card'> };
type Adapter = {
  getPayableOrder(input: { projectId: string; sellerId: string; orderId: string }): Promise<PayableOrder>;
  applyVerifiedPayment(event: VerifiedPaymentEvent): Promise<{ acknowledged: true; eventId: string }>;
  applyVerifiedRefund(event: VerifiedPaymentEvent): Promise<{ acknowledged: true; eventId: string }>;
};
```

- [ ] **Step 5: Run settlement tests**

Run: `node --test packages/buyna-commerce-settlement-core/test/*.test.mjs`

Expected: all tests PASS, including duplicate delivery and cross-merchant rejection.

- [ ] **Step 6: Commit merchant adapter contract**

```bash
git add packages/buyna-commerce-settlement-core apps/buyna-payment-gateway/docs
git commit -m "feat(payment): define merchant settlement adapter contract"
```

### Task 7: Skill integration and repository validation

**Files:**
- Modify: `skills/buyai-globepay-payment/SKILL.md`
- Modify: `skills/buyai-globepay-payment/references/service-adapter-contract.md`
- Modify: `skills/buyai-globepay-checkout/SKILL.md`
- Modify: `skills/buyai-globepay-checkout/references/checkout-endpoints.md`
- Modify: `skills/buyai-globepay-status-sync/SKILL.md`
- Modify: `skills/buyai-globepay-status-sync/references/status-sync-rules.md`
- Modify: `skills/buyai-globepay-config/SKILL.md`
- Modify: `skills/buyai-globepay-config/references/config-signing-rules.md`
- Modify: `skills/buyna-website-builder/references/phase-06-payment.md`
- Modify: `scripts/validate.ps1`

**Interfaces:**
- Consumes: fixed gateway package, HTTP runtime, merchant adapter contract, registered AWS resource evidence.
- Produces: concise Skill routing that installs/configures fixed code and does not regenerate a merchant-local payment core.

- [ ] **Step 1: Add a validation test that requires the fixed gateway references**

Update `scripts/validate.ps1` to require:

```powershell
$requiredPaymentPaths = @(
  'packages/buyna-globepay-gateway-core/package.json',
  'apps/buyna-payment-gateway/package.json',
  'apps/buyna-payment-gateway/docs/merchant-adapter-contract.md'
)
```

It must also fail when a payment Skill instructs the agent to create a new EC2, RDS, database, bucket, public port, or project-local GlobePay core by default.

- [ ] **Step 2: Run validation and verify the old Skill text fails the new contract**

Run: `powershell -ExecutionPolicy Bypass -File scripts/validate.ps1`

Expected: FAIL until all payment Skills reference the gateway and adapter contract.

- [ ] **Step 3: Rewrite payment Skill routing in concise operational order**

Every relevant Skill must state this fixed sequence:

```text
Inspect registered merchant identity and architecture
-> install/configure thin adapter
-> register secret-source names, domains, currencies, and channels
-> run fixed contract and mobile-route tests
-> leave real payment and production activation for explicit release approval
```

Remove instructions that invite copying or regenerating complete provider logic. Preserve exact provider signing, official host, mobile H5/JSAPI, amount/currency verification, idempotency, and return-is-not-paid rules.

- [ ] **Step 4: Run all package and repository tests**

Run:

```powershell
Get-ChildItem packages -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'package.json') } | ForEach-Object { Push-Location $_.FullName; npm test; Pop-Location }
Push-Location apps/buyna-payment-gateway; npm test; Pop-Location
powershell -ExecutionPolicy Bypass -File scripts/validate.ps1
```

Expected: every package test and repository validation PASS.

- [ ] **Step 5: Commit Skill integration**

```bash
git add skills scripts/validate.ps1
git commit -m "docs(payment): route merchant skills through unified gateway"
```

### Task 8: Safe AWS installation without traffic switching

**Files:**
- Create: `apps/buyna-payment-gateway/deploy/install-existing-host.ps1`
- Create: `apps/buyna-payment-gateway/deploy/buyna-payment-gateway.service`
- Create: `apps/buyna-payment-gateway/deploy/nginx-pay.buyna.ai.conf`
- Create: `apps/buyna-payment-gateway/deploy/register-merchant.ps1`
- Create: `apps/buyna-payment-gateway/docs/runbook.md`
- Create: `apps/buyna-payment-gateway/test/deploy-contract.test.mjs`

**Interfaces:**
- Consumes: explicitly selected AWS profile/region, existing registered EC2/RDS, existing server secret sources, and an approved merchant registration file.
- Produces: staged service files, reversible `payment_gateway` migration, disabled-by-default merchant records, and read-only health evidence. It does not switch merchant traffic.

- [ ] **Step 1: Write deployment contract tests**

```js
test('installer forbids resource creation and public app ports', () => {
  const text = readInstallFiles();
  for (const forbidden of ['create-db-instance','run-instances','create-bucket','authorize-security-group-ingress']) assert.doesNotMatch(text, new RegExp(forbidden, 'i'));
  assert.match(text, /payment_gateway\.sock/);
});
test('new merchant registration defaults to disabled', () => {
  assert.match(readFileSync(registerScript, 'utf8'), /mode\s*=\s*['"]disabled['"]/i);
});
```

- [ ] **Step 2: Run deployment tests and verify failure**

Run: `node --test apps/buyna-payment-gateway/test/deploy-contract.test.mjs`

Expected: FAIL because deployment files are missing.

- [ ] **Step 3: Implement staged installation scripts**

The installer must require explicit `-Profile`, `-Region`, `-InstanceId`, and database secret-source name; run `sts get-caller-identity`; verify the existing resource registration; stage files under a versioned release directory; run migration preflight; install a Unix-socket systemd service; validate Nginx configuration; and stop before enabling public routing.

The registration script writes only a disabled merchant configuration after validating unique `project_id + seller_id + payment_account_id`, secret-source existence without reading or printing secret values, allowed domains, currencies, channels, and adapter target.

- [ ] **Step 4: Add the operations runbook**

The runbook contains exact commands for identity check, migration dry-run, service health, shadow-mode comparison, delivery backlog, quarantine inspection, per-merchant feature flag, rollback, and reconciliation. Each AWS command includes explicit profile and region. Production activation and DNS/Nginx traffic switching are separate approval points.

- [ ] **Step 5: Run deployment contract and complete test suite**

Run:

```powershell
node --test apps/buyna-payment-gateway/test/*.test.mjs
powershell -ExecutionPolicy Bypass -File scripts/validate.ps1
```

Expected: PASS with no resource-creation commands and disabled-by-default registration.

- [ ] **Step 6: Commit staged deployment assets**

```bash
git add apps/buyna-payment-gateway/deploy apps/buyna-payment-gateway/docs apps/buyna-payment-gateway/test
git commit -m "ops(payment): add existing-host gateway installation runbook"
```

### Task 9: Merchant-by-merchant shadow migration and release gates

**Files:**
- Create: `apps/buyna-payment-gateway/migrations/merchant-migration-matrix.yaml`
- Create: `apps/buyna-payment-gateway/scripts/compare-shadow-result.mjs`
- Create: `apps/buyna-payment-gateway/test/compare-shadow-result.test.mjs`
- Modify: `apps/buyna-payment-gateway/docs/runbook.md`

**Interfaces:**
- Consumes: redacted legacy decision, gateway decision, registered merchant identity, and audit findings.
- Produces: deterministic `match`, `blocked`, or `ready_for_release_review` evidence per merchant; never changes payment state.

- [ ] **Step 1: Write shadow comparator tests**

```js
test('blocks a mobile QR mismatch', () => assert.deepEqual(compare({ context: 'mobile', legacy: { nextAction: 'qr' }, gateway: { nextAction: 'redirect' } }).status, 'blocked'));
test('blocks amount or currency mismatch', () => assert.equal(compare({ legacy: paid(1200,'JPY'), gateway: paid(1199,'JPY') }).code, 'AMOUNT_MISMATCH'));
test('requires every configured route to match safety policy', () => assert.equal(summarizeMerchant([pass(), pass(), blocked()]).status, 'blocked'));
```

- [ ] **Step 2: Run comparator tests and verify failure**

Run: `node --test apps/buyna-payment-gateway/test/compare-shadow-result.test.mjs`

Expected: FAIL because the comparator does not exist.

- [ ] **Step 3: Implement deterministic comparison and migration matrix**

The matrix records merchant ID, current adapter state, required repair, shadow status, approved channels, feature flag, rollback target, and release approval. Initial order is MEDINANCE shadow, `shop.sanwa.life`, Xinghe, EduPay staging, MEDINANCE strict allowlist, Sanwa before enablement, then BlueSequoia channel confirmation. Merchants without active GlobePay remain disabled.

- [ ] **Step 4: Run shadow tests without real provider charges**

Run: `node --test apps/buyna-payment-gateway/test/compare-shadow-result.test.mjs`

Expected: all tests PASS; mobile QR, amount mismatch, currency mismatch, unsigned/unverified state, and disallowed provider host are blocking results.

- [ ] **Step 5: Commit migration tooling**

```bash
git add apps/buyna-payment-gateway/migrations apps/buyna-payment-gateway/scripts apps/buyna-payment-gateway/test apps/buyna-payment-gateway/docs/runbook.md
git commit -m "ops(payment): add merchant shadow migration controls"
```

At the end of implementation, stop with the gateway installed but merchant traffic unchanged. Provide test evidence and the per-merchant migration matrix. Each production merchant switch remains an independent, explicit release action.
