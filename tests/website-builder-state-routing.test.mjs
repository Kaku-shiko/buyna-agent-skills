import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const routerPath = fileURLToPath(new URL("skills/buyna-website-builder/scripts/route-builder.mjs", root));
const gates = [
  "customer_intake",
  "design_and_structure",
  "frontend_code",
  "dashboard_integration",
  "checkout_payment",
  "testing_upload_gate",
  "aws_release",
];

const stateAt = (currentGate, { workPackageGates = [] } = {}) => {
  const currentIndex = gates.indexOf(currentGate);
  return {
    currentGate,
    gates: Object.fromEntries(gates.map((gate, index) => [gate, index < currentIndex
      ? { status: "approved", delivery: { verified: true }, approvedBy: "user" }
      : { status: index === currentIndex ? "ready" : "locked" }])),
    configuration: workPackageGates.length
      ? { workPackage: { gates: workPackageGates, authorizedBy: "user" } }
      : {},
  };
};

const runRoute = (input) => {
  const result = spawnSync(process.execPath, [routerPath], {
    input: JSON.stringify(input),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
};

const runRouteError = (input) => {
  const result = spawnSync(process.execPath, [routerPath], {
    input: JSON.stringify(input),
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0, result.stdout);
  return result.stderr.trim();
};

const staticCapabilities = {
  siteType: "content",
  requiresDashboard: false,
  requiresCart: false,
  requiresCheckout: false,
  requiresPayment: false,
  requiresBooking: false,
};
const productNoPayment = {
  siteType: "commerce",
  requiresDashboard: true,
  requiresCart: true,
  requiresCheckout: true,
  requiresPayment: false,
  requiresBooking: false,
};
const productGlobepay = { ...productNoPayment, requiresPayment: true };
const paidBooking = {
  siteType: "service",
  requiresDashboard: false,
  requiresCart: false,
  requiresCheckout: true,
  requiresPayment: true,
  requiresBooking: true,
};
const mixedProductBooking = {
  siteType: "mixed",
  requiresDashboard: true,
  requiresCart: true,
  requiresCheckout: true,
  requiresPayment: true,
  requiresBooking: true,
};

const approvedGate = (delivery) => ({
  status: "approved",
  delivery,
  approvedBy: "user",
  approvedAt: "2026-08-25T01:00:00.000Z",
});

const nativeNotApplicableGate = (reason) => ({
  status: "not_applicable",
  reason,
  completedAt: "2026-08-25T01:00:00.000Z",
  notApplicableEvidence: {
    source: "native_transition",
    event: "gate_not_applicable",
    recordedAt: "2026-08-25T01:00:00.000Z",
  },
});

const completedWorkflow = (capabilities) => {
  const paid = capabilities.requiresPayment;
  const staticSite = !capabilities.requiresDashboard && !capabilities.requiresCheckout;
  const configuration = { capabilities, dashboardSlices: [] };
  if (paid) configuration.paymentArchitecture = "fixed-cores";
  return {
    projectId: "completed-shop",
    currentGate: null,
    status: "complete",
    configuration,
    gates: {
      customer_intake: approvedGate({record: "intake.json", capabilities, ...(paid ? {paymentArchitecture: "fixed-cores"} : {})}),
      design_and_structure: approvedGate({designRecord: "design.json", pageStructure: "pages.json", boardStatus: "delivered"}),
      frontend_code: approvedGate({deliveredFiles: ["app.tsx"], verification: ["PASS"], interfaceContract: "contract.json"}),
      dashboard_integration: staticSite
        ? nativeNotApplicableGate("static site has no dashboard")
        : approvedGate({completedSlices: [], frontendFiles: ["dashboard.tsx"], backendFiles: ["server.mjs"], verification: ["PASS"]}),
      checkout_payment: staticSite
        ? nativeNotApplicableGate("static site has no checkout")
        : approvedGate({
          paymentArchitecture: "fixed-cores",
          scope: {projectId: "completed-shop", sellerId: "seller-1"},
          pendingOrder: true,
          checkoutFlowVerified: true,
          amountCurrencyReconciled: true,
          routingVerified: true,
          statusSyncVerified: true,
          idempotencyVerified: true,
          gmvOutboxVerified: true,
          verification: ["PASS"],
        }),
      testing_upload_gate: approvedGate({result: "PASS", verification: ["PASS"]}),
      aws_release: approvedGate({
        architectureType: "external_legacy",
        releaseVersion: "v1",
        newEc2Instances: 0,
        newDatabases: 0,
        newBuckets: 0,
        newPorts: 0,
        verifiedTarget: "existing-target",
        verifiedUrls: ["https://example.com"],
        health: "passed",
        rollback: "release-v0",
      }),
    },
  };
};

test("static local preview selects only frontend behavior and canonical N/A gates", () => {
  assert.deepEqual(runRoute({
    capabilities: staticCapabilities,
    workflowState: stateAt("frontend_code"),
    requestedSlice: "local_preview",
    releaseIntent: false,
  }), {
    action: "execute",
    targetGate: "frontend_code",
    requestedSlice: "local_preview",
    skills: ["buyna-frontend-builder"],
    fixedModules: ["buyna-workflow-state-core"],
    notApplicableGates: ["dashboard_integration", "checkout_payment"],
    continueWithoutConfirmation: false,
    commerceArchitecture: null,
    externalActions: { git: false, aws: false },
  });
});

test("product commerce without provider payment executes checkout-flow and skips only provider settlement", () => {
  assert.deepEqual(runRoute({
    capabilities: productNoPayment,
    workflowState: stateAt("checkout_payment", { workPackageGates: ["checkout_payment"] }),
    requestedSlice: "checkout_payment",
    releaseIntent: false,
  }), {
    action: "execute",
    targetGate: "checkout_payment",
    requestedSlice: "checkout_payment",
    skills: ["buyai-product-merchant-backend", "buyai-checkout-address-ux"],
    fixedModules: ["buyna-workflow-state-core", "buyna-cart-core", "buyna-order-core", "buyna-checkout-flow-core"],
    notApplicableGates: [],
    continueWithoutConfirmation: true,
    commerceArchitecture: "checkout-flow-only",
    externalActions: { git: false, aws: false },
  });
});

test("product GlobePay executes fixed checkout then transport adapters then settlement", () => {
  assert.deepEqual(runRoute({
    capabilities: productGlobepay,
    workflowState: stateAt("checkout_payment"),
    requestedSlice: "checkout_payment",
    releaseIntent: false,
  }), {
    action: "execute",
    targetGate: "checkout_payment",
    requestedSlice: "checkout_payment",
    skills: ["buyai-product-merchant-backend", "buyai-checkout-address-ux", "buyai-globepay-payment", "buyai-globepay-status-sync", "buyna-gmv-commerce"],
    fixedModules: ["buyna-workflow-state-core", "buyna-cart-core", "buyna-order-core", "buyna-checkout-flow-core", "buyna-commerce-settlement-core"],
    notApplicableGates: [],
    continueWithoutConfirmation: false,
    commerceArchitecture: "checkout-flow+transport-adapters+settlement",
    externalActions: { git: false, aws: false },
  });
});

test("paid booking routes checkout and payment without a cart dependency", () => {
  const route = runRoute({
    capabilities: paidBooking,
    workflowState: stateAt("checkout_payment"),
    requestedSlice: "checkout_payment",
    releaseIntent: false,
  });
  assert.deepEqual(route, {
    action: "execute",
    targetGate: "checkout_payment",
    requestedSlice: "checkout_payment",
    skills: ["buyai-booking-service-backend", "buyai-checkout-address-ux", "buyai-globepay-payment", "buyai-globepay-status-sync", "buyna-gmv-commerce"],
    fixedModules: ["buyna-workflow-state-core", "buyna-checkout-flow-core", "buyna-commerce-settlement-core"],
    notApplicableGates: ["dashboard_integration"],
    continueWithoutConfirmation: false,
    commerceArchitecture: "checkout-flow+transport-adapters+settlement",
    externalActions: { git: false, aws: false },
  });
  assert.ok(!route.fixedModules.includes("buyna-cart-core"));
});

test("mixed product and booking commerce routes both backends exactly once", () => {
  const route = runRoute({
    capabilities: mixedProductBooking,
    workflowState: stateAt("checkout_payment"),
    requestedSlice: "checkout_payment",
    releaseIntent: false,
  });
  assert.deepEqual(route.skills, [
    "buyai-product-merchant-backend",
    "buyai-booking-service-backend",
    "buyai-checkout-address-ux",
    "buyai-globepay-payment",
    "buyai-globepay-status-sync",
    "buyna-gmv-commerce",
  ]);
  assert.equal(new Set(route.skills).size, route.skills.length);
  assert.deepEqual(route.fixedModules, [
    "buyna-workflow-state-core",
    "buyna-cart-core",
    "buyna-order-core",
    "buyna-checkout-flow-core",
    "buyna-commerce-settlement-core",
  ]);
});

test("dependency-ready checkout repair enters checkout directly without replaying earlier Skills", () => {
  assert.deepEqual(runRoute({
    capabilities: productGlobepay,
    workflowState: stateAt("checkout_payment", { workPackageGates: ["checkout_payment", "testing_upload_gate"] }),
    requestedSlice: "checkout_payment",
    releaseIntent: false,
    mode: "repair",
  }), {
    action: "execute",
    targetGate: "checkout_payment",
    requestedSlice: "checkout_payment",
    skills: ["buyai-checkout-address-ux", "buyai-globepay-payment", "buyai-globepay-status-sync", "buyna-gmv-commerce"],
    fixedModules: ["buyna-workflow-state-core", "buyna-cart-core", "buyna-order-core", "buyna-checkout-flow-core", "buyna-commerce-settlement-core"],
    notApplicableGates: [],
    continueWithoutConfirmation: true,
    commerceArchitecture: "checkout-flow+transport-adapters+settlement",
    externalActions: { git: false, aws: false },
  });
});

test("completed deployed workflow returns an explicit checkout repair reopen action", () => {
  assert.deepEqual(runRoute({
    capabilities: productGlobepay,
    workflowState: completedWorkflow(productGlobepay),
    requestedSlice: "checkout_payment",
    releaseIntent: false,
    mode: "repair",
  }), {
    action: "reopen_repair",
    targetGate: "checkout_payment",
    requestedSlice: "checkout_payment",
    skills: ["buyai-checkout-address-ux", "buyai-globepay-payment", "buyai-globepay-status-sync", "buyna-gmv-commerce"],
    fixedModules: ["buyna-workflow-state-core", "buyna-cart-core", "buyna-order-core", "buyna-checkout-flow-core", "buyna-commerce-settlement-core"],
    notApplicableGates: [],
    continueWithoutConfirmation: false,
    commerceArchitecture: "checkout-flow+transport-adapters+settlement",
    repairTransition: { type: "openRepairSlice", gate: "checkout_payment" },
    externalActions: { git: false, aws: false },
  });
});

test("completed static dashboard repair routes to capability scope change before reopen", () => {
  assert.deepEqual(runRoute({
    capabilities: staticCapabilities,
    workflowState: completedWorkflow(staticCapabilities),
    requestedSlice: "dashboard_integration",
    releaseIntent: false,
    mode: "repair",
  }), {
    action: "blocked",
    targetGate: "dashboard_integration",
    requestedSlice: "dashboard_integration",
    reason: "CAPABILITY_SCOPE_CHANGE_REQUIRED",
    skills: [],
    fixedModules: ["buyna-workflow-state-core"],
    notApplicableGates: ["dashboard_integration", "checkout_payment"],
    continueWithoutConfirmation: false,
    commerceArchitecture: null,
    externalActions: {git: false, aws: false},
  });
});

test("completed static checkout repair routes to capability scope change before reopen", () => {
  assert.deepEqual(runRoute({
    capabilities: staticCapabilities,
    workflowState: completedWorkflow(staticCapabilities),
    requestedSlice: "checkout_payment",
    releaseIntent: false,
    mode: "repair",
  }), {
    action: "blocked",
    targetGate: "checkout_payment",
    requestedSlice: "checkout_payment",
    reason: "CAPABILITY_SCOPE_CHANGE_REQUIRED",
    skills: [],
    fixedModules: ["buyna-workflow-state-core"],
    notApplicableGates: ["dashboard_integration", "checkout_payment"],
    continueWithoutConfirmation: false,
    commerceArchitecture: null,
    externalActions: {git: false, aws: false},
  });
});

test("completed route rejects hand-built approved statuses without full evidence", () => {
  const invalid = {
    projectId: "invalid-complete",
    currentGate: null,
    status: "complete",
    configuration: {capabilities: productGlobepay, paymentArchitecture: "fixed-cores", dashboardSlices: []},
    gates: Object.fromEntries(gates.map((gate) => [gate, {status: "approved"}])),
  };
  assert.match(runRouteError({capabilities: productGlobepay,workflowState: invalid,requestedSlice: "checkout_payment",releaseIntent: false,mode: "repair"}),/COMPLETED_GATE_EVIDENCE_INVALID/);
});

test("local preview never acquires Git or AWS intent", () => {
  const route = runRoute({capabilities: staticCapabilities,workflowState: stateAt("frontend_code"),requestedSlice: "local_preview",releaseIntent: false});
  assert.deepEqual(route.externalActions, { git: false, aws: false });
});

test("static optional current gates return a canonical not-applicable transition", () => {
  for (const currentGate of ["dashboard_integration", "checkout_payment"]) {
    assert.deepEqual(runRoute({capabilities: staticCapabilities,workflowState: stateAt(currentGate),requestedSlice: "testing_upload_gate",releaseIntent: false}), {
      action: "mark_not_applicable",
      targetGate: currentGate,
      requestedSlice: "testing_upload_gate",
      reason: "CAPABILITY_NOT_REQUIRED",
      skills: [],
      fixedModules: ["buyna-workflow-state-core"],
      notApplicableGates: ["dashboard_integration", "checkout_payment"],
      continueWithoutConfirmation: false,
      commerceArchitecture: null,
      externalActions: { git: false, aws: false },
    });
  }
});

test("release routing requires explicit release intent", () => {
  assert.deepEqual(runRoute({capabilities: staticCapabilities,workflowState: stateAt("aws_release"),requestedSlice: "aws_release",releaseIntent: false}), {
    action: "blocked",
    targetGate: "aws_release",
    requestedSlice: "aws_release",
    reason: "RELEASE_INTENT_REQUIRED",
    skills: [],
    fixedModules: ["buyna-workflow-state-core"],
    notApplicableGates: ["dashboard_integration", "checkout_payment"],
    continueWithoutConfirmation: false,
    commerceArchitecture: null,
    externalActions: { git: false, aws: false },
  });
});

test("Builder structural surfaces keep trigger, authority, legacy boundary, and synchronization integrity", () => {
  const builder = read("skills/buyna-website-builder/SKILL.md");
  const routingMap = read("skills/buyna-website-builder/references/routing-map.md");
  const workflowContract = read("skills/buyna-website-builder/references/workflow-state-contract.md");
  const phasePayment = read("skills/buyna-website-builder/references/phase-06-payment.md");
  const checkout = read("skills/buyai-checkout-address-ux/SKILL.md");
  const product = read("skills/buyai-product-merchant-backend/SKILL.md");
  const payment = read("skills/buyai-globepay-payment/SKILL.md");
  const legacyServiceContract = read("skills/buyai-globepay-payment/references/service-adapter-contract.md");
  const status = read("skills/buyai-globepay-status-sync/SKILL.md");
  assert.match(builder.match(/^description:\s*["']?([^\r\n"']+)/m)?.[1] ?? "", /^Use when\b/i);
  assert.match(builder, /scripts\/route-builder\.mjs/);
  assert.match(builder, /routing-map\.md/);
  assert.doesNotMatch(routingMap, /dashboard_backend|testing_and_upload/);
  assert.match(workflowContract, /importVerifiedHistory/);
  assert.match(workflowContract, /openRepairSlice/);
  assert.match(workflowContract, /completeRepairSlice/);
  assert.match(workflowContract, /outcome.*not_applicable/is);
  assert.match(workflowContract, /legacy-globepay-service/);
  assert.match(routingMap, /mixed.*product.*booking|mixed.*both backends/is);
  assert.match(workflowContract, /completed.*valid delivery.*not.applicable.*evidence/is);
  assert.match(routingMap, /repair.*capability.*scope change/is);
  assert.match(phasePayment, /trusted provider.*notify\/query.*exact amount.*currency/is);
  assert.match(phasePayment, /paymentArchitecture.*fixed-cores/is);
  assert.match(checkout, /booking.*buyna-checkout-flow-core|buyna-checkout-flow-core.*booking/is);
  assert.match(product, /inherit.*configuration\.workPackage|configuration\.workPackage.*inherit/is);
  assert.match(payment, /createGlobepayService.*legacy-only|legacy-only.*createGlobepayService/is);
  assert.match(status, /createGlobepayService.*legacy-only|legacy-only.*createGlobepayService/is);
  assert.match(payment, /legacy-globepay-service/);
  assert.match(status, /legacy-globepay-service/);
  assert.match(legacyServiceContract, /legacy-only/i);
  for (const path of ["SKILL.md", "agents/openai.yaml", "references/routing-map.md", "references/phase-06-payment.md", "references/workflow-state-contract.md", "scripts/route-builder.mjs"]) {
    assert.equal(read(`.agents/skills/buyna-website-builder/${path}`),read(`skills/buyna-website-builder/${path}`),`${path} matches the canonical Builder`);
  }
});
