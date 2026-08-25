import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const root = new URL("../", import.meta.url);
const { planWebsiteRoute } = await import(
  new URL("skills/buyna-website-builder/scripts/route-builder.mjs", root)
);
const workflowCore = await import(new URL("packages/buyna-workflow-state-core/src/index.mjs", root));
const { createVerifiedWorkflowStore } = await import(new URL("packages/buyna-workflow-state-core/src/file-store.mjs", root));

function receiptAuthority() {
  const sign = (record) => createHmac("sha256", "route-test-authority").update(JSON.stringify(record)).digest("hex");
  return {
    async createReceipt({ record }) { return { provider: "route-test", signature: sign(record) }; },
    async verifyReceipt({ record, receipt }) { return receipt?.provider === "route-test" && receipt.signature === sign(record); },
  };
}

const gates = [
  "customer_intake",
  "design_and_structure",
  "frontend_code",
  "dashboard_integration",
  "checkout_payment",
  "testing_upload_gate",
  "aws_release",
];

const product = (overrides = {}) => ({
  siteType: "commerce",
  requiresDashboard: true,
  requiresCart: true,
  requiresCheckout: true,
  requiresPayment: false,
  requiresBooking: false,
  requiresCatalog: true,
  requiresInventory: true,
  requiresCoupons: false,
  ...overrides,
});

const approved = (delivery) => ({
  status: "approved",
  delivery,
  approvedBy: "user",
  approvedAt: "2026-08-26T00:00:00.000Z",
});

function deliveryFor(gate, capabilities) {
  return {
    customer_intake: { record: "intake.json", capabilities },
    design_and_structure: { designRecord: "design.json", pageStructure: "pages.json", boardStatus: "delivered" },
    frontend_code: { deliveredFiles: ["app.tsx"], verification: ["PASS"], interfaceContract: "contract.json" },
    dashboard_integration: {
      completedSlices: ["products"],
      frontendFiles: ["dashboard.tsx"],
      backendFiles: ["dashboard-api.mjs"],
      verification: ["PASS"],
    },
  }[gate];
}

function stateAt(currentGate, capabilities, dashboardSlices = [], workPackageGates = []) {
  const currentIndex = gates.indexOf(currentGate);
  const configuration = { capabilities, dashboardSlices };
  if (dashboardSlices.length) configuration.dashboardSliceApproval = {
    slices: [...dashboardSlices], approvedBy: "user", approvedAt: "2026-08-26T00:00:00.000Z",
    authorizationEvidence: {
      source: "workflow_transition", event: "dashboard_slices_approved", slices: [...dashboardSlices],
      approvedBy: "user", approvedAt: "2026-08-26T00:00:00.000Z",
    },
  };
  if (capabilities.requiresPayment) configuration.paymentArchitecture = "fixed-cores";
  if (workPackageGates.length) configuration.workPackage = {
    gates: workPackageGates,
    scope: "approved route test package",
    authorizedBy: "user",
    authorizedAt: "2026-08-26T00:00:00.000Z",
    completedGates: [],
    authorizationEvidence: {
      source: "workflow_transition", event: "work_package_authorized", gates: [...workPackageGates],
      scope: "approved route test package", authorizedBy: "user", authorizedAt: "2026-08-26T00:00:00.000Z",
    },
  };
  return {
    projectId: "supporting-route-test",
    currentGate,
    configuration,
    gates: Object.fromEntries(gates.map((gate, index) => [
      gate,
      index < currentIndex ? approved(deliveryFor(gate, capabilities)) : { status: index === currentIndex ? "ready" : "locked" },
    ])),
  };
}

function routeFor({ capabilities = product(), slice = "products", persisted = [slice], workPackage = [] } = {}) {
  return planWebsiteRoute({
    capabilities,
    workflowState: stateAt("dashboard_integration", capabilities, persisted, workPackage),
    requestedSlice: "dashboard_integration",
    dashboardSlice: slice,
  });
}

function assertStableBoundary(route, dashboardSlice, dashboardSlices) {
  assert.equal(route.dashboardSlice, dashboardSlice);
  assert.deepEqual(route.dashboardSlices, dashboardSlices);
  assert.deepEqual(route.externalActions, { git: false, aws: false });
}

function createTrustedDashboardState() {
  const capabilities = product();
  const approve = (state, gate, delivery) => {
    state = workflowCore.startGate({ state, gate }).state;
    state = workflowCore.recordDelivery({ state, gate, delivery }).state;
    state = workflowCore.requestApproval({ state, gate }).state;
    return workflowCore.approveGate({ state, gate, approvedBy: "user" }).state;
  };
  let state = workflowCore.createWorkflow({ projectId: "real-dashboard-route" });
  state = approve(state, "customer_intake", { record: "intake.json", capabilities });
  state = approve(state, "design_and_structure", {
    designRecord: "design.json", pageStructure: "pages.json", boardStatus: "delivered",
  });
  state = workflowCore.setApprovedDashboardSlices({
    state, slices: ["products", "orders"], approvedBy: "user",
  }).state;
  state = workflowCore.authorizeWorkPackage({
    state,
    gates: ["frontend_code", "dashboard_integration"],
    scope: "approved frontend and Dashboard slices",
    authorizedBy: "user",
  }).state;
  state = workflowCore.startGate({ state, gate: "frontend_code" }).state;
  state = workflowCore.recordDelivery({
    state, gate: "frontend_code",
    delivery: { deliveredFiles: ["app.tsx"], verification: ["PASS"], interfaceContract: "contract.json" },
  }).state;
  state = workflowCore.completeAuthorizedGate({ state, gate: "frontend_code" }).state;
  return { capabilities, state };
}

test("product and booking file-capable Dashboard slices select request-local supporting modules once", () => {
  const productRoute = routeFor();
  assert.equal(productRoute.skills.filter((value) => value === "buyai-dashboard-data-interaction").length, 1);
  for (const module of ["buyna-auth-session-core", "buyna-merchant-context-core", "buyna-merchant-file-core"]) {
    assert.equal(productRoute.fixedModules.filter((value) => value === module).length, 1);
  }
  assertStableBoundary(productRoute, "products", ["products"]);

  const booking = product({
    siteType: "service",
    requiresCart: false,
    requiresCatalog: false,
    requiresInventory: false,
    requiresBooking: true,
  });
  const bookingRoute = routeFor({ capabilities: booking, slice: "services", persisted: ["services"] });
  assert.ok(bookingRoute.skills.includes("buyai-booking-service-backend"));
  for (const module of ["buyna-auth-session-core", "buyna-merchant-context-core", "buyna-merchant-file-core"]) {
    assert.equal(bookingRoute.fixedModules.filter((value) => value === module).length, 1);
  }
});

test("non-file Dashboard slices select auth and context but omit file core", () => {
  for (const slice of ["orders", "customers", "settings"]) {
    const route = routeFor({ slice, persisted: [slice] });
    assert.ok(route.fixedModules.includes("buyna-auth-session-core"));
    assert.ok(route.fixedModules.includes("buyna-merchant-context-core"));
    assert.ok(!route.fixedModules.includes("buyna-merchant-file-core"));
    assertStableBoundary(route, slice, [slice]);
  }
});

test("Dashboard selection is derived only from persisted approved slices", () => {
  const auto = routeFor({ slice: null, persisted: ["media"] });
  assertStableBoundary(auto, "media", ["media"]);

  const required = routeFor({ slice: null, persisted: ["products", "orders"] });
  assert.equal(required.action, "blocked");
  assert.equal(required.reason, "DASHBOARD_SLICE_REQUIRED");
  assertStableBoundary(required, null, []);

  const unconfigured = routeFor({ slice: null, persisted: [] });
  assert.equal(unconfigured.action, "blocked");
  assert.equal(unconfigured.reason, "DASHBOARD_SLICES_NOT_CONFIGURED");
  assertStableBoundary(unconfigured, null, []);

  const unapproved = routeFor({ slice: "products", persisted: ["orders"] });
  assert.equal(unapproved.action, "blocked");
  assert.equal(unapproved.reason, "DASHBOARD_SLICE_NOT_APPROVED");
  assertStableBoundary(unapproved, null, []);
});

test("all selects persisted slices only inside an approved Dashboard work package", () => {
  const trusted = createTrustedDashboardState();
  const approvedAll = planWebsiteRoute({
    capabilities: trusted.capabilities,
    workflowState: trusted.state,
    requestedSlice: "dashboard_integration",
    dashboardSlice: "all",
  });
  assertStableBoundary(approvedAll, "all", ["products", "orders"]);
  for (const module of ["buyna-auth-session-core", "buyna-merchant-context-core", "buyna-merchant-file-core"]) {
    assert.equal(approvedAll.fixedModules.filter((value) => value === module).length, 1);
  }

  const blocked = routeFor({ slice: "all", persisted: ["products", "orders"] });
  assert.equal(blocked.action, "blocked");
  assert.equal(blocked.reason, "DASHBOARD_FULL_SCOPE_APPROVAL_REQUIRED");
  assertStableBoundary(blocked, null, []);
});

test("non-Dashboard targets reject Dashboard selection and supporting modules remain slice-local", () => {
  const capabilities = product();
  const state = stateAt("frontend_code", capabilities, ["products"]);
  const rejected = planWebsiteRoute({
    capabilities,
    workflowState: state,
    requestedSlice: "local_preview",
    dashboardSlice: "products",
  });
  assert.equal(rejected.action, "blocked");
  assert.equal(rejected.reason, "DASHBOARD_SLICE_NOT_APPLICABLE");
  assertStableBoundary(rejected, null, []);

  const preview = planWebsiteRoute({ capabilities, workflowState: state, requestedSlice: "local_preview" });
  for (const module of ["buyna-auth-session-core", "buyna-merchant-context-core", "buyna-merchant-file-core", "buyna-storefront-gallery-core"]) {
    assert.ok(!preview.fixedModules.includes(module));
  }
  assertStableBoundary(preview, null, []);

  const checkoutState = stateAt("checkout_payment", capabilities, ["products"]);
  const checkout = planWebsiteRoute({ capabilities, workflowState: checkoutState, requestedSlice: "checkout_payment" });
  for (const module of ["buyna-auth-session-core", "buyna-merchant-context-core", "buyna-merchant-file-core", "buyna-storefront-gallery-core"]) {
    assert.ok(!checkout.fixedModules.includes(module));
  }
  assertStableBoundary(checkout, null, []);
});

test("every blocked capability route preserves stable Dashboard fields", () => {
  const persisted = product();
  const requested = { ...persisted, requiresCoupons: true };
  const route = planWebsiteRoute({
    capabilities: requested,
    workflowState: stateAt("dashboard_integration", persisted, ["products"]),
    requestedSlice: "dashboard_integration",
    dashboardSlice: "products",
  });
  assert.equal(route.reason, "CAPABILITY_SCOPE_CHANGE_REQUIRED");
  assertStableBoundary(route, null, []);
});

test("fabricated work-package and Dashboard slice configuration are blocked with stable reasons", () => {
  const capabilities = product();
  const rawWorkPackage = stateAt("dashboard_integration", capabilities, ["products"], ["dashboard_integration"]);
  delete rawWorkPackage.configuration.workPackage.authorizationEvidence;
  const workPackageRoute = planWebsiteRoute({
    capabilities, workflowState: rawWorkPackage, requestedSlice: "dashboard_integration", dashboardSlice: "all",
  });
  assert.equal(workPackageRoute.action, "blocked");
  assert.equal(workPackageRoute.reason, "WORKFLOW_STATE_PROVENANCE_UNTRUSTED");
  assertStableBoundary(workPackageRoute, null, []);

  const rawSlices = stateAt("dashboard_integration", capabilities, ["products"]);
  delete rawSlices.configuration.dashboardSliceApproval;
  const sliceRoute = planWebsiteRoute({
    capabilities, workflowState: rawSlices, requestedSlice: "dashboard_integration", dashboardSlice: "products",
  });
  assert.equal(sliceRoute.action, "blocked");
  assert.equal(sliceRoute.reason, "DASHBOARD_SLICE_APPROVAL_EVIDENCE_INVALID");
  assertStableBoundary(sliceRoute, null, []);
});

test("real workflow transitions authorize Dashboard slices and bounded all routing end to end", () => {
  const { capabilities, state } = createTrustedDashboardState();

  const route = planWebsiteRoute({
    capabilities, workflowState: state, requestedSlice: "dashboard_integration", dashboardSlice: "all",
  });
  assert.equal(route.action, "execute");
  assert.equal(route.continueWithoutConfirmation, true);
  assertStableBoundary(route, "all", ["products", "orders"]);
});

test("serialized or fully forged authorization is blocked until authoritative store load restores provenance", async () => {
  const { capabilities, state } = createTrustedDashboardState();
  const serialized = JSON.stringify(state);
  const raw = JSON.parse(serialized);
  const rawRoute = planWebsiteRoute({
    capabilities, workflowState: raw, requestedSlice: "dashboard_integration", dashboardSlice: "all",
  });
  assert.equal(rawRoute.action, "blocked");
  assert.equal(rawRoute.reason, "WORKFLOW_STATE_PROVENANCE_UNTRUSTED");
  assertStableBoundary(rawRoute, null, []);

  const projectRoot = await mkdtemp(path.join(tmpdir(), "buyna-route-verified-"));
  try {
    const store = createVerifiedWorkflowStore({ projectRoot, receiptAuthority: receiptAuthority() });
    await store.initializeWorkflow({ state: workflowCore.createWorkflow({ projectId: "real-dashboard-route" }) });
    const apply = async (makeTransition) => {
      const loaded = await store.loadVerifiedWorkflow();
      const transition = makeTransition(loaded);
      await store.saveWorkflow({ loadedState: loaded, transition });
    };
    await apply((loaded) => workflowCore.importVerifiedHistory({
      state: loaded,
      requestedGate: "frontend_code",
      imports: [
        { gate: "customer_intake", delivery: { record: "intake.json", capabilities }, approval: { record: "customer-approval.json", approvedBy: "user", approvedAt: "2026-08-26T04:00:00.000Z", decision: "approved" } },
        { gate: "design_and_structure", delivery: { designRecord: "design.json", pageStructure: "pages.json", boardStatus: "delivered" }, approval: { record: "design-approval.json", approvedBy: "user", approvedAt: "2026-08-26T04:01:00.000Z", decision: "approved" } },
      ],
      importedBy: "route-test",
    }));
    await apply((loaded) => workflowCore.setApprovedDashboardSlices({ state: loaded, slices: ["products", "orders"], approvedBy: "user" }));
    await apply((loaded) => workflowCore.authorizeWorkPackage({ state: loaded, gates: ["frontend_code", "dashboard_integration"], scope: "approved frontend and Dashboard slices", authorizedBy: "user" }));
    await apply((loaded) => workflowCore.startGate({ state: loaded, gate: "frontend_code" }));
    await apply((loaded) => workflowCore.recordDelivery({ state: loaded, gate: "frontend_code", delivery: { deliveredFiles: ["app.tsx"], verification: ["PASS"], interfaceContract: "contract.json" } }));
    await apply((loaded) => workflowCore.completeAuthorizedGate({ state: loaded, gate: "frontend_code" }));

    const verified = await store.loadVerifiedWorkflow();
    const verifiedRoute = planWebsiteRoute({
      capabilities, workflowState: verified, requestedSlice: "dashboard_integration", dashboardSlice: "all",
    });
    assert.equal(verifiedRoute.action, "execute");
    assert.equal(verifiedRoute.continueWithoutConfirmation, true);
    assertStableBoundary(verifiedRoute, "all", ["products", "orders"]);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("core-produced active repair passes while its serialized copy is blocked", () => {
  const capabilities = product();
  const approve = (state, gate, delivery) => {
    state = workflowCore.startGate({ state, gate }).state;
    state = workflowCore.recordDelivery({ state, gate, delivery }).state;
    state = workflowCore.requestApproval({ state, gate }).state;
    return workflowCore.approveGate({ state, gate, approvedBy: "user" }).state;
  };
  let state = workflowCore.createWorkflow({ projectId: "trusted-repair-route" });
  state = approve(state, "customer_intake", { record: "intake.json", capabilities });
  state = approve(state, "design_and_structure", {
    designRecord: "design.json", pageStructure: "pages.json", boardStatus: "delivered",
  });
  state = workflowCore.setApprovedDashboardSlices({ state, slices: ["products"], approvedBy: "user" }).state;
  state = approve(state, "frontend_code", {
    deliveredFiles: ["app.tsx"], verification: ["PASS"], interfaceContract: "contract.json",
  });
  state = approve(state, "dashboard_integration", {
    completedSlices: ["products"], frontendFiles: ["dashboard.tsx"],
    backendFiles: ["dashboard-api.mjs"], verification: ["PASS"],
  });
  state = approve(state, "checkout_payment", {
    pendingOrder: true, checkoutFlowVerified: true, verification: ["PASS"],
  });
  state = approve(state, "testing_upload_gate", { result: "PASS", verification: ["PASS"] });
  state = approve(state, "aws_release", {
    architectureType: "external_legacy", releaseVersion: "v1",
    newEc2Instances: 0, newDatabases: 0, newBuckets: 0, newPorts: 0,
    verifiedTarget: "existing-target", verifiedUrls: ["https://example.com"],
    health: "passed", rollback: "v0",
  });
  state = workflowCore.openRepairSlice({
    state, gate: "dashboard_integration", scope: "repair approved products slice", authorizedBy: "user",
  }).state;

  const route = planWebsiteRoute({
    capabilities, workflowState: state, requestedSlice: "dashboard_integration",
    dashboardSlice: "products", mode: "repair",
  });
  assert.equal(route.action, "execute");
  assert.equal(route.continueWithoutConfirmation, true);
  assertStableBoundary(route, "products", ["products"]);

  const rawRoute = planWebsiteRoute({
    capabilities, workflowState: JSON.parse(JSON.stringify(state)),
    requestedSlice: "dashboard_integration", dashboardSlice: "products", mode: "repair",
  });
  assert.equal(rawRoute.action, "blocked");
  assert.equal(rawRoute.reason, "WORKFLOW_STATE_PROVENANCE_UNTRUSTED");
  assertStableBoundary(rawRoute, null, []);
});
