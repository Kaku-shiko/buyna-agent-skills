import assert from "node:assert/strict";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { extname, join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import * as readModelApi from "../packages/buyna-commerce-read-model-core/src/index.mjs";
import * as deliveryApi from "../packages/buyna-delivery-state-core/src/index.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const readJson = (path) => JSON.parse(read(path));
const exactKeys = (value) => Object.keys(value).sort();
const MODULES = ["buyna-commerce-read-model-core", "buyna-delivery-state-core"];

const EXPECTED_EXPORTS = {
  "buyna-commerce-read-model-core": [
    "COMMERCE_READ_STATUSES", "MAX_CANDIDATE_PAGES", "MAX_CANDIDATE_ROWS",
    "MAX_DAY_BUCKETS", "MAX_FACT_PAGES", "MAX_FACT_ROWS", "MAX_MONTH_BUCKETS",
    "READ_PAGE_LIMIT", "SUPPORTED_CURRENCIES", "TREND_INTERVALS",
    "buildTimeBuckets", "createCommerceReadModel",
  ],
  "buyna-delivery-state-core": [
    "DEFAULT_DELIVERY_RETRY_POLICY", "DELIVERY_CHANNELS", "DELIVERY_KINDS",
    "DELIVERY_STATES", "DELIVERY_TRANSITIONS", "canonicalizeDeliveryIntent",
    "createDeliveryStateCore", "createNotificationSourceEvent", "digestDeliveryIntent",
  ],
};

function filesUnder(directory) {
  return readdirSync(new URL(directory, root), { withFileTypes: true }).flatMap((entry) => (
    entry.isDirectory()
      ? filesUnder(`${directory}/${entry.name}`)
      : [join(directory, entry.name).replaceAll("\\", "/")]
  ));
}

function quotedStrings(source) {
  return [...source.matchAll(/(["'`])((?:\\.|(?!\1)[\s\S])*)\1/gu)].map((match) => match[2]);
}

function moduleSpecifiers(source) {
  return [
    ...source.matchAll(/(?:from\s*|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/gu),
    ...source.matchAll(/\bimport\s*["']([^"']+)["']/gu),
  ].map((match) => match[1]);
}

function boundaryViolations(files, policy, sourceReader) {
  const violations = [];
  const styles = new Set(policy.stylesheetExtensions);
  const components = new Set(policy.componentExtensions);
  const scanned = new Set(policy.scannedSourceExtensions);
  const importRules = Object.entries(policy.forbiddenModuleSpecifiers)
    .map(([name, patterns]) => [name, patterns.map((pattern) => new RegExp(pattern, "iu"))]);
  const literalRules = [
    ["merchantIdentifier", policy.merchantIdentifierPatterns],
    ["productionIdentifier", policy.productionIdentifierPatterns],
    ["rawSecret", policy.rawSecretSignatures],
  ].map(([name, patterns]) => [name, patterns.map((pattern) => new RegExp(pattern, "iu"))]);

  for (const file of files) {
    const extension = extname(file).slice(1).toLowerCase();
    if (styles.has(extension)) violations.push({ file, boundary: "stylesheet" });
    if (components.has(extension)) violations.push({ file, boundary: "component" });
    if (styles.has(extension) || components.has(extension)) continue;
    if (!scanned.has(extension)) {
      violations.push({ file, boundary: "unscanned-extension" });
      continue;
    }
    const source = sourceReader(file);
    for (const specifier of moduleSpecifiers(source)) {
      for (const [name, patterns] of importRules) {
        if (patterns.some((pattern) => pattern.test(specifier))) violations.push({ file, boundary: name });
      }
    }
    const literals = quotedStrings(source);
    for (const [name, patterns] of literalRules) {
      if (literals.some((literal) => patterns.some((pattern) => pattern.test(literal)))) {
        violations.push({ file, boundary: name });
      }
    }
    for (const pattern of policy.forbiddenExecutablePatterns) {
      if (new RegExp(pattern, "iu").test(source)) violations.push({ file, boundary: "forbiddenExecutable" });
    }
    const secretKeys = policy.rawSecretAssignmentKeys.join("|");
    const secretAssignment = new RegExp(`\\b(?:${secretKeys})\\b\\s*[:=]\\s*["'](?!<|\\$\\{|\\{\\{|YOUR_|EXAMPLE_|TEST_|DUMMY_|PLACEHOLDER)[^"']+["']`, "iu");
    if (secretAssignment.test(source)) violations.push({ file, boundary: "rawSecret" });
  }
  return violations;
}

function runProjectInstall({ installer, repositoryRoot, projectPath }) {
  const result = spawnSync("powershell", [
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", installer,
    "-Scope", "Project", "-ProjectPath", projectPath,
  ], { cwd: repositoryRoot, encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

function assertInstalledModules(projectPath, expectedModules) {
  const installedManifest = JSON.parse(readFileSync(
    join(projectPath, ".agents", "buyna", "repository-manifest.json"), "utf8",
  ));
  for (const moduleName of expectedModules) {
    assert.equal(installedManifest.packages.filter((name) => name === moduleName).length, 1);
    assert.equal(readdirSync(join(projectPath, "packages")).filter((name) => name === moduleName).length, 1);
    assert.ok(readFileSync(join(projectPath, "packages", moduleName, "package.json"), "utf8"));
  }
}

function page(items = []) {
  return { items, nextCursor: null };
}

class DeliveryStore {
  deliveries = new Map();
  async transaction(work) {
    return work({
      getBySourceEventForUpdate: async ({ sourceEventId }) => (
        [...this.deliveries.values()].find((row) => row.sourceEventId === sourceEventId) ?? null
      ),
      createDelivery: async ({ record }) => { this.deliveries.set(record.deliveryId, structuredClone(record)); },
      getDeliveryForUpdate: async ({ deliveryId }) => structuredClone(this.deliveries.get(deliveryId) ?? null),
      saveDelivery: async ({ expectedVersion, record }) => {
        assert.equal(this.deliveries.get(record.deliveryId).version, expectedVersion);
        this.deliveries.set(record.deliveryId, structuredClone(record));
      },
    });
  }
  async getDelivery({ deliveryId }) {
    return structuredClone(this.deliveries.get(deliveryId) ?? null);
  }
}

test("manifest and complete installer expose and install both fixed modules exactly once", async () => {
  const manifest = readJson("repository-manifest.json");
  const websitePackages = manifest.profiles["website-builder"].packages;
  for (const moduleName of MODULES) {
    assert.equal(manifest.packages.filter((name) => name === moduleName).length, 1);
    assert.equal(websitePackages.filter((name) => name === moduleName).length, 1);
    const pkg = readJson(`packages/${moduleName}/package.json`);
    assert.match(pkg.scripts?.test ?? "", /^node --test\b/u);
    assert.equal(pkg.exports, "./src/index.mjs");
  }
  assert.deepEqual(Object.keys(readModelApi).sort(), [...EXPECTED_EXPORTS[MODULES[0]]].sort());
  assert.deepEqual(Object.keys(deliveryApi).sort(), [...EXPECTED_EXPORTS[MODULES[1]]].sort());
  const installer = read("scripts/install.ps1");
  assert.match(installer, /@\(\$manifest\.packages\)\s*\|\s*ForEach-Object/u);
  for (const moduleName of MODULES) assert.doesNotMatch(installer, new RegExp(moduleName, "u"));

  const temp = mkdtempSync(join(tmpdir(), "buyna-install-contract-"));
  try {
    const installedProject = join(temp, "actual-project");
    mkdirSync(installedProject, { recursive: true });
    runProjectInstall({
      installer: fileURLToPath(new URL("scripts/install.ps1", root)),
      repositoryRoot: fileURLToPath(root),
      projectPath: installedProject,
    });
    assertInstalledModules(installedProject, MODULES);

    const mutantRepository = join(temp, "mutant-repository");
    mkdirSync(join(mutantRepository, "scripts"), { recursive: true });
    mkdirSync(join(mutantRepository, "skills"), { recursive: true });
    mkdirSync(join(mutantRepository, "packages"), { recursive: true });
    for (const moduleName of MODULES) {
      cpSync(
        fileURLToPath(new URL(`packages/${moduleName}`, root)),
        join(mutantRepository, "packages", moduleName),
        { recursive: true },
      );
    }
    writeFileSync(join(mutantRepository, "repository-manifest.json"), JSON.stringify({
      skills: [], packages: MODULES,
    }));
    const mutantInstaller = installer.replace(
      "@($manifest.packages) | ForEach-Object {",
      "@($manifest.packages | Where-Object { $_ -ne 'buyna-delivery-state-core' }) | ForEach-Object {",
    );
    assert.notEqual(mutantInstaller, installer);
    const mutantInstallerPath = join(mutantRepository, "scripts", "install.ps1");
    writeFileSync(mutantInstallerPath, mutantInstaller);
    const mutantProject = join(temp, "mutant-project");
    mkdirSync(mutantProject, { recursive: true });
    runProjectInstall({ installer: mutantInstallerPath, repositoryRoot: mutantRepository, projectPath: mutantProject });
    assert.throws(() => assertInstalledModules(mutantProject, MODULES));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("shared source stays inside the read-model and delivery behavior boundary", () => {
  const policy = readJson("tests/fixtures/shared-module-boundaries.json")
    .readModelDeliverySourceBoundary;
  assert.ok(policy, "readModelDeliverySourceBoundary is repository-visible");
  const files = MODULES.flatMap((name) => filesUnder(`packages/${name}/src`));
  assert.deepEqual(boundaryViolations(files, policy, read), []);

  const temp = mkdtempSync(join(tmpdir(), "buyna-read-delivery-boundary-"));
  try {
    const cases = [
      ["unsafe.css", "body{}", "stylesheet"],
      ["unsafe.tsx", "export const View = () => <div />;", "component"],
      ["ui.mjs", "import React from 'react';", "uiOrChartImport"],
      ["preact.mjs", "import { h } from 'preact';", "uiOrChartImport"],
      ["chart.mjs", "import Chart from 'chart.js';", "uiOrChartImport"],
      ["apexcharts.mjs", "import ApexCharts from 'apexcharts';", "uiOrChartImport"],
      ["stylesheet.mjs", "import 'bootstrap/dist/css/bootstrap.css';", "stylesheetImport"],
      ["sql.mjs", "import pg from 'pg';", "sqlOrOrmImport"],
      ["aws.mjs", "import { S3Client } from '@aws-sdk/client-s3';", "awsSdkImport"],
      ["aws-v2.mjs", "import AWS from 'aws-sdk';", "awsSdkImport"],
      ["provider.mjs", "import sdk from 'stripe';", "providerTransportImport"],
      ["mailgun.mjs", "import Mailgun from 'mailgun.js';", "smtpOrSmsImport"],
      ["smtp.mjs", "import mailer from 'nodemailer';", "smtpOrSmsImport"],
      ["route.mjs", "import x from '../routes/orders.mjs';", "projectRouteImport"],
      ["merchant.mjs", "export const x = 'seller_medinance';", "merchantIdentifier"],
      ["current-merchant.mjs", "export const x = 'seller_ectecshop';", "merchantIdentifier"],
      ["current-merchant-2.mjs", "export const x = 'seller_chameleon';", "merchantIdentifier"],
      ["production.mjs", "export const x = 'https://shop.example.com';", "productionIdentifier"],
      ["secret.mjs", "export const x = 'AKIA0000000000000000';", "rawSecret"],
      ["assigned-secret.mjs", "const apiKey = 'live-value';", "rawSecret"],
      ["client-secret.mjs", "const clientSecret = 'live-value';", "rawSecret"],
      ["session-token.mjs", "const sessionToken = 'live-value';", "rawSecret"],
      ["smtp-password.mjs", "const smtpPassword = 'live-value';", "rawSecret"],
      ["database-url.mjs", "const databaseUrl = 'postgresql://user:pass@db';", "rawSecret"],
      ["fetch.mjs", "export async function send() { return fetch('/notify'); }", "forbiddenExecutable"],
      ["inline-sql.mjs", "export const query = `SELECT id FROM orders`;", "forbiddenExecutable"],
    ];
    for (const [name, source, expected] of cases) {
      const file = join(temp, name);
      writeFileSync(file, source);
      const violations = boundaryViolations([file], policy, (path) => readFileSync(path, "utf8"));
      assert.ok(violations.some(({ boundary }) => boundary === expected), `${name} must hit ${expected}`);
    }
    for (const [name, source] of [
      ["safe-request-key.mjs", "const requestKey = 'delivery-request:v1:digest';"],
      ["safe-client-placeholder.mjs", "const clientSecret = '<CLIENT_SECRET>';"],
      ["safe-database-placeholder.mjs", "const databaseUrl = '${DATABASE_URL}';"],
    ]) {
      const file = join(temp, name);
      writeFileSync(file, source);
      const violations = boundaryViolations([file], policy, (path) => readFileSync(path, "utf8"));
      assert.equal(violations.some(({ boundary }) => boundary === "rawSecret"), false, name);
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("merchant read-model has no CRM GMV ownership and delivery contains no content or credentials", () => {
  const policy = readJson("tests/fixtures/shared-module-boundaries.json")
    .readModelDeliverySourceBoundary;
  const readModelSource = filesUnder("packages/buyna-commerce-read-model-core/src")
    .map(read).join("\n");
  assert.doesNotMatch(readModelSource, /\bgmv\b/iu);
  assert.doesNotMatch(readModelSource, /buyna-gmv-core/iu);

  const deliverySource = filesUnder("packages/buyna-delivery-state-core/src").map(read).join("\n");
  for (const pattern of policy.deliveryForbiddenLiteralPatterns) {
    assert.doesNotMatch(deliverySource, new RegExp(pattern, "iu"));
  }
  const forbiddenContentMutations = [
    "buyer@example.test", "+81 90 1234 5678", "https://mail.provider.test",
    "process.env.MAIL_SECRET", "Dear customer, Thank you for your order",
  ];
  for (const mutation of forbiddenContentMutations) {
    assert.ok(policy.deliveryForbiddenLiteralPatterns.some((pattern) => (
      new RegExp(pattern, "iu").test(mutation)
    )), `delivery content mutation escaped: ${mutation}`);
  }
});

test("runtime outputs are exact, immutable, scoped, bounded, and contact-safe", async () => {
  const scope = { projectId: "project_alpha", sellerId: "seller_alpha" };
  const calls = [];
  const model = readModelApi.createCommerceReadModel({
    ...scope,
    clock: () => "2026-08-02T00:00:00.000Z",
    source: {
      async listCurrentPendingPage(input) { calls.push(input); return page([{
        ...scope, orderId: "pending_1", status: "pending_payment", payableAmount: 3000,
        currency: "JPY", createdAt: "2026-08-01T01:00:00.000Z", updatedAt: "2026-08-01T01:01:00.000Z",
      }]); },
      async listSettlementFactPage(input) { calls.push(input); return page([{
        ...scope, eventId: "capture_1", orderId: "paid_1", type: "capture", amount: 5000,
        currency: "JPY", occurredAt: "2026-08-01T02:00:00.000Z", settlementSource: "trusted_settlement",
      }]); },
      async listLowStockCandidatePage(input) { calls.push(input); return page([{
        ...scope, productId: "product_1", variantId: "variant_1", availableQuantity: 2,
        reservedQuantity: 1, updatedAt: "2026-08-01T03:00:00.000Z",
      }]); },
      async listRecentOrderCandidatePage(input) { calls.push(input); return page([{
        ...scope, orderId: "paid_1", status: "paid", payableAmount: 5000,
        capturedAmount: 5000, refundedAmount: 0, currency: "JPY", createdAt: "2026-08-01T02:00:00.000Z",
      }]); },
      async listAll() { throw new Error("must never be called"); },
    },
  });
  const overview = await model.getOverview({
    from: "2026-08-01T00:00:00.000Z", to: "2026-08-02T00:00:00.000Z",
    timeZone: "UTC", grossAmount: 999999, aggregate: { netAmount: 999999 },
  });
  assert.deepEqual(exactKeys(overview), ["currency", "lowStock", "metrics", "recentOrders", "scope", "trends", "window"]);
  assert.deepEqual(exactKeys(overview.scope), ["projectId", "sellerId"]);
  assert.deepEqual(exactKeys(overview.window), ["asOf", "from", "interval", "timeZone", "to"]);
  assert.deepEqual(exactKeys(overview.metrics), ["grossAmount", "netAmount", "paidOrders", "pendingAmount", "pendingOrders", "refundAmount", "refundedOrders"]);
  assert.deepEqual(exactKeys(overview.trends[0]), ["endUtc", "grossAmount", "key", "netAmount", "paidOrders", "refundAmount", "refundedOrders", "startUtc"]);
  assert.deepEqual(exactKeys(overview.lowStock[0]), ["availableQuantity", "productId", "reservedQuantity", "updatedAt", "variantId"]);
  assert.deepEqual(exactKeys(overview.recentOrders[0]), ["capturedAmount", "createdAt", "currency", "netPaidAmount", "orderId", "payableAmount", "refundedAmount", "status"]);
  assert.ok(calls.every((input) => input.limit === readModelApi.READ_PAGE_LIMIT && input.scope === calls[0].scope));
  assert.ok(calls.every((input) => Object.hasOwn(input, "cursor") && Object.hasOwn(input, "order")));
  assert.equal(Object.isFrozen(overview), true);
  assert.throws(() => { overview.scope.projectId = "project_other"; }, TypeError);

  const sourceEvent = deliveryApi.createNotificationSourceEvent({
    ...scope,
    domainRecordId: "order_1",
    domainEventId: "paid_1",
    occurredAt: "2026-08-01T00:00:00.000Z",
    intent: {
      kind: "order", channel: "email", templateKey: "order-paid", locale: "ja-JP",
      recipientRef: "customer:1", payload: { orderId: "order_1" },
    },
  });
  assert.deepEqual(exactKeys(sourceEvent), ["domainEventId", "domainRecordId", "intent", "occurredAt", "projectId", "sellerId", "sourceEventId"]);
  assert.deepEqual(exactKeys(sourceEvent.intent), ["channel", "kind", "locale", "payload", "recipientRef", "templateKey"]);
  assert.equal(
    deliveryApi.canonicalizeDeliveryIntent(sourceEvent.intent),
    '{"channel":"email","kind":"order","locale":"ja-JP","payload":{"orderId":"order_1"},"recipientRef":"customer:1","templateKey":"order-paid"}',
  );
  assert.equal(
    deliveryApi.digestDeliveryIntent(sourceEvent.intent),
    "6b843303f7422445eb122dc7f7491e92cb323a09428fcf3d79af39ee2401df81",
  );
  assert.equal(
    sourceEvent.sourceEventId,
    "notification-source:v1:5a19efa9af651aa139902cce484cc8b34be8b9186a857858396961b1c496fd86",
  );

  const store = new DeliveryStore();
  let deliverySequence = 0;
  let attemptSequence = 0;
  const core = deliveryApi.createDeliveryStateCore({
    ...scope, store, clock: () => "2026-08-01T00:00:00.000Z",
    deliveryIdGenerator: () => `delivery_${deliverySequence += 1}`,
    attemptIdGenerator: () => `attempt_${attemptSequence += 1}`,
  });
  const pending = await core.reconcileSourceEvent(sourceEvent);
  assert.deepEqual(exactKeys(pending), [
    "attemptCount", "attempts", "createdAt", "currentAttempt", "deliveryId", "domainEventId",
    "domainRecordId", "idempotencyKey", "intent", "intentDigest", "nextRetryAt", "projectId",
    "requestKey", "sellerId", "sourceEventId", "state", "updatedAt", "version",
  ]);
  assert.match(pending.intentDigest, /^[0-9a-f]{64}$/u);
  assert.equal(pending.version, 1);
  assert.equal(pending.createdAt, "2026-08-01T00:00:00.000Z");
  assert.equal(pending.updatedAt, "2026-08-01T00:00:00.000Z");
  const delivered = await core.dispatch({
    deliveryId: pending.deliveryId,
    workerId: "worker_1",
    recipients: { async resolve() { return { address: "buyer@example.test" }; } },
    templates: { async render() { return { subject: "private subject", text: "private body" }; } },
    providers: { email: { async send() {
      return { providerMessageId: "message_1", acceptedAt: "2026-08-01T00:00:00.000Z" };
    } } },
  });
  assert.deepEqual(exactKeys(delivered.attempts[0]), [
    "attemptId", "attemptNumber", "claimedAt", "deliveredAt", "failedAt", "failure",
    "leaseUntil", "receipt", "state", "workerId",
  ]);
  assert.equal(delivered.version, 3);
  assert.equal(delivered.attemptCount, 1);
  assert.equal(delivered.attempts[0].claimedAt, "2026-08-01T00:00:00.000Z");
  assert.equal(delivered.attempts[0].leaseUntil, null);
  assert.equal(delivered.attempts[0].deliveredAt, "2026-08-01T00:00:00.000Z");
  assert.deepEqual(exactKeys(delivered.currentAttempt), ["attemptId", "attemptNumber"]);
  assert.deepEqual(exactKeys(delivered.attempts[0].receipt), ["acceptedAt", "providerMessageId"]);
  assert.equal(delivered.attempts[0].failure, null);
  assert.equal(delivered.projectId, scope.projectId);
  assert.equal(delivered.sellerId, scope.sellerId);
  assert.equal(Object.isFrozen(delivered), true);
  assert.throws(() => { delivered.attempts[0].requestKey = "forged"; }, TypeError);
  const failedSource = deliveryApi.createNotificationSourceEvent({
    ...scope,
    domainRecordId: "order_2",
    domainEventId: "paid_2",
    occurredAt: "2026-08-01T00:00:00.000Z",
    intent: {
      kind: "order", channel: "email", templateKey: "order-paid", locale: "ja-JP",
      recipientRef: "customer:2", payload: { orderId: "order_2" },
    },
  });
  const failedPending = await core.reconcileSourceEvent(failedSource);
  const failed = await core.dispatch({
    deliveryId: failedPending.deliveryId,
    workerId: "worker_2",
    recipients: { async resolve() { throw { code: "ADDRESS_UNAVAILABLE", retryable: false, message: "buyer2@example.test" }; } },
    templates: { async render() { return { text: "must not run" }; } },
    providers: { email: { async send() { return { rawProviderResponse: "must not run" }; } } },
  });
  assert.equal(failed.state, "failed");
  assert.deepEqual(exactKeys(failed.currentAttempt), ["attemptId", "attemptNumber"]);
  assert.deepEqual(exactKeys(failed.attempts[0]), [
    "attemptId", "attemptNumber", "claimedAt", "deliveredAt", "failedAt", "failure",
    "leaseUntil", "receipt", "state", "workerId",
  ]);
  assert.deepEqual(exactKeys(failed.attempts[0].failure), ["code", "retryable"]);
  assert.equal(failed.attempts[0].receipt, null);

  const serialized = JSON.stringify({ overview, sourceEvent, pending, delivered, failed });
  for (const forbidden of [
    "password", "token", "cookie", "card", "cvv", "secret", "rawProviderResponse",
    "stack", "buyer@example", "buyer2@example", "+8190", "private subject", "private body",
  ]) assert.equal(serialized.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
});

test("repository docs state fixed behavior without fixing Dashboard visual design", () => {
  for (const path of ["README.md", "docs/OPERATIONS_MANUAL.md"]) {
    const document = read(path);
    const normalized = document.replaceAll(/\s+/gu, " ");
    for (const phrase of ["buyna-commerce-read-model-core", "buyna-delivery-state-core", "SQL/ORM", "chart", "template", "provider", "UI", "merchant Dashboard sales metrics are not Buyna CRM GMV"]) {
      assert.match(normalized, new RegExp(phrase.replaceAll("/", "\\/"), "iu"), `${path}: ${phrase}`);
    }
    assert.doesNotMatch(document, /standard Dashboard design|统一 Dashboard 设计/iu);
  }
  const combined = `${read("README.md")}\n${read("docs/OPERATIONS_MANUAL.md")}`;
  for (const phrase of [
    "metric definitions", "timezone buckets", "scoped SQL/ORM facts query", "chart mapping",
    "canonical notification intent/digest", "source-event reconciliation", "recipient lookup",
    "template copy", "email/SMS provider",
  ]) assert.match(combined, new RegExp(phrase.replaceAll("/", "\\/"), "iu"), phrase);
  assert.equal((combined.match(/\| Fixed module \| Project-generated Adapter\/presentation \|/gu) ?? []).length, 1);
});
