import assert from "node:assert/strict";
import test from "node:test";

import { planWebsiteRoute, resolveRouteDependencyClosure } from "../skills/buyna-website-builder/scripts/route-builder.mjs";
import * as workflow from "../packages/buyna-workflow-state-core/src/index.mjs";

const product = Object.freeze({
  siteType: "commerce", requiresDashboard: true, requiresCart: true,
  requiresCheckout: true, requiresPayment: false, requiresBooking: false,
  requiresCatalog: true, requiresInventory: true, requiresCoupons: false,
});
const booking = Object.freeze({
  siteType: "service", requiresDashboard: true, requiresCart: false,
  requiresCheckout: false, requiresPayment: false, requiresBooking: true,
  requiresCatalog: false, requiresInventory: false, requiresCoupons: false,
});

function approve(state, gate, delivery) {
  state = workflow.startGate({ state, gate }).state;
  state = workflow.recordDelivery({ state, gate, delivery }).state;
  state = workflow.requestApproval({ state, gate }).state;
  return workflow.approveGate({ state, gate, approvedBy: "user" }).state;
}

function stateAtDashboard(capabilities, slices, operations = []) {
  let state = workflow.createWorkflow({ projectId: `route-${capabilities.siteType}` });
  state = approve(state, "customer_intake", { record: "intake.json", capabilities });
  state = approve(state, "design_and_structure", {
    designRecord: "design.json", pageStructure: "pages.json", boardStatus: "delivered",
  });
  state = workflow.setApprovedDashboardSlices({ state, slices, approvedBy: "user" }).state;
  if (operations.length) {
    state = workflow.setApprovedNotificationOperations({ state, operations, approvedBy: "user" }).state;
  }
  state = approve(state, "frontend_code", {
    deliveredFiles: ["app.tsx"], verification: ["PASS"], interfaceContract: "contract.json",
  });
  return state;
}

function route({ capabilities = product, slices, slice, operations = [], operation = null }) {
  return planWebsiteRoute({
    capabilities,
    workflowState: stateAtDashboard(capabilities, slices, operations),
    requestedSlice: "dashboard_integration",
    dashboardSlice: slice,
    notificationOperation: operation,
  });
}

function assertStable(result, slice, slices, operation = null) {
  assert.equal(result.dashboardSlice, slice);
  assert.deepEqual(result.dashboardSlices, slices);
  assert.equal(result.notificationOperation, operation);
  assert.equal(typeof result.continueWithoutConfirmation, "boolean");
  assert.deepEqual(result.externalActions, { git: false, aws: false });
}

test("Dashboard overview alone selects the commerce read model exactly once", () => {
  const result = route({ slices: ["dashboard"], slice: "dashboard" });
  assert.equal(result.fixedModules.filter((x) => x === "buyna-commerce-read-model-core").length, 1);
  assert.ok(!result.fixedModules.includes("buyna-delivery-state-core"));
  assertStable(result, "dashboard", ["dashboard"]);
});

test("list and detail Dashboard slices do not acquire the overview read model or delivery implicitly", () => {
  for (const slice of ["inventory", "orders", "bookings", "customers", "paid_customers", "products"]) {
    const capabilities = slice === "bookings" ? booking : product;
    const result = route({ capabilities, slices: [slice], slice });
    assert.ok(!result.fixedModules.includes("buyna-commerce-read-model-core"), slice);
    assert.ok(!result.fixedModules.includes("buyna-delivery-state-core"), slice);
    assertStable(result, slice, [slice]);
  }
});

test("only explicit persisted matching notification operations select delivery once", () => {
  const order = route({ slices: ["orders"], slice: "orders", operations: ["order_notification"], operation: "order_notification" });
  assert.equal(order.fixedModules.filter((x) => x === "buyna-delivery-state-core").length, 1);
  assertStable(order, "orders", ["orders"], "order_notification");

  const appointment = route({ capabilities: booking, slices: ["bookings"], slice: "bookings", operations: ["booking_notification"], operation: "booking_notification" });
  assert.equal(appointment.fixedModules.filter((x) => x === "buyna-delivery-state-core").length, 1);
  assertStable(appointment, "bookings", ["bookings"], "booking_notification");

  const omitted = route({ slices: ["orders"], slice: "orders", operations: ["order_notification"] });
  assert.ok(!omitted.fixedModules.includes("buyna-delivery-state-core"));
  assertStable(omitted, "orders", ["orders"]);
});

test("all selects overview once but never implies delivery", () => {
  let state = stateAtDashboard(product, ["dashboard", "orders"], ["order_notification"]);
  state = workflow.authorizeWorkPackage({
    state, gates: ["dashboard_integration"], scope: "approved dashboard work", authorizedBy: "user",
  }).state;
  const noOperation = planWebsiteRoute({
    capabilities: product, workflowState: state, requestedSlice: "dashboard_integration", dashboardSlice: "all",
  });
  assert.equal(noOperation.fixedModules.filter((x) => x === "buyna-commerce-read-model-core").length, 1);
  assert.ok(!noOperation.fixedModules.includes("buyna-delivery-state-core"));
  assertStable(noOperation, "all", ["dashboard", "orders"]);

  const explicit = planWebsiteRoute({
    capabilities: product, workflowState: state, requestedSlice: "dashboard_integration",
    dashboardSlice: "all", notificationOperation: "order_notification",
  });
  assert.equal(explicit.fixedModules.filter((x) => x === "buyna-delivery-state-core").length, 1);
  assertStable(explicit, "all", ["dashboard", "orders"], "order_notification");
});

test("unapproved, unknown, mismatched, and forged notification scope blocks before dependencies", () => {
  const unapproved = route({ slices: ["orders"], slice: "orders", operation: "order_notification" });
  assert.equal(unapproved.reason, "NOTIFICATION_OPERATION_NOT_APPROVED");
  assert.deepEqual(unapproved.fixedModules, ["buyna-workflow-state-core"]);
  assertStable(unapproved, "orders", ["orders"]);

  const unknown = route({ slices: ["orders"], slice: "orders", operation: "customer_notification" });
  assert.equal(unknown.reason, "NOTIFICATION_OPERATION_NOT_APPROVED");
  assert.deepEqual(unknown.fixedModules, ["buyna-workflow-state-core"]);

  const mismatch = route({ slices: ["orders", "customers"], slice: "customers", operations: ["order_notification"], operation: "order_notification" });
  assert.equal(mismatch.reason, "NOTIFICATION_OPERATION_NOT_APPLICABLE");
  assert.deepEqual(mismatch.fixedModules, ["buyna-workflow-state-core"]);

  const forgedProduct = { ...booking, siteType: "mixed", requiresCatalog: true };
  const forged = planWebsiteRoute({
    capabilities: forgedProduct,
    workflowState: stateAtDashboard(booking, ["bookings"], ["booking_notification"]),
    requestedSlice: "dashboard_integration", dashboardSlice: "bookings",
    notificationOperation: "order_notification",
  });
  assert.equal(forged.reason, "CAPABILITY_SCOPE_CHANGE_REQUIRED");
  assert.deepEqual(forged.fixedModules, ["buyna-workflow-state-core"]);
});

test("non-Dashboard targets cannot select read or delivery modules", () => {
  let state = workflow.createWorkflow({ projectId: "non-dashboard" });
  state = approve(state, "customer_intake", { record: "intake.json", capabilities: product });
  state = approve(state, "design_and_structure", { designRecord: "design.json", pageStructure: "pages.json", boardStatus: "delivered" });
  state = workflow.setApprovedDashboardSlices({ state, slices: ["orders"], approvedBy: "user" }).state;
  state = workflow.setApprovedNotificationOperations({ state, operations: ["order_notification"], approvedBy: "user" }).state;
  const preview = planWebsiteRoute({ capabilities: product, workflowState: state, requestedSlice: "local_preview" });
  for (const name of ["buyna-commerce-read-model-core", "buyna-delivery-state-core"]) assert.ok(!preview.fixedModules.includes(name));
  assertStable(preview, null, []);
});

test("dependency closure preserves exact-once fixed module selection", () => {
  const selected = route({ slices: ["dashboard", "orders"], slice: "orders", operations: ["order_notification"], operation: "order_notification" });
  const closure = resolveRouteDependencyClosure(selected);
  assert.equal(closure.fixedModules.filter((x) => x === "buyna-delivery-state-core").length, 1);
  assert.equal(closure.fixedModules.filter((x) => x === "buyna-commerce-read-model-core").length, 0);
  assert.equal(selected.manifestVerification.verified, true);
});

test("notification operation approval is provenance-backed and bounded before frontend work", () => {
  let state = workflow.createWorkflow({ projectId: "approval" });
  assert.throws(() => workflow.setApprovedNotificationOperations({ state, operations: ["order_notification"], approvedBy: "user" }), /NOTIFICATION_OPERATION_DESIGN_APPROVAL_REQUIRED/);
  state = approve(state, "customer_intake", { record: "intake.json", capabilities: product });
  state = approve(state, "design_and_structure", { designRecord: "design.json", pageStructure: "pages.json", boardStatus: "delivered" });
  state = workflow.setApprovedDashboardSlices({ state, slices: ["orders"], approvedBy: "user" }).state;
  assert.throws(() => workflow.setApprovedNotificationOperations({ state, operations: ["unknown"], approvedBy: "user" }), /NOTIFICATION_OPERATION_INVALID/);
  assert.throws(() => workflow.setApprovedNotificationOperations({ state, operations: ["booking_notification"], approvedBy: "user" }), /NOTIFICATION_OPERATION_NOT_APPLICABLE/);
  state = workflow.setApprovedNotificationOperations({ state, operations: ["order_notification"], approvedBy: "user" }).state;
  assert.deepEqual(state.configuration.notificationOperations, ["order_notification"]);
  assert.throws(() => workflow.setApprovedNotificationOperations({ state, operations: ["order_notification", "booking_notification"], approvedBy: "user" }), /NOTIFICATION_OPERATION_SCOPE_CHANGE_REQUIRED/);

  const forged = structuredClone(state);
  forged.configuration.notificationOperations = ["booking_notification"];
  assert.throws(() => workflow.validateWorkflowReadinessEvidence(forged), /HISTORICAL_GATE_EVIDENCE_INVALID/);

  state = workflow.startGate({ state, gate: "frontend_code" }).state;
  assert.throws(() => workflow.setApprovedNotificationOperations({ state, operations: ["order_notification"], approvedBy: "user" }), /NOTIFICATION_OPERATION_SCOPE_CHANGE_REQUIRED/);
});
