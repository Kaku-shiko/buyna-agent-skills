import assert from "node:assert/strict";
import test from "node:test";

const root = new URL("../", import.meta.url);
const { planWebsiteRoute } = await import(
  new URL("skills/buyna-website-builder/scripts/route-builder.mjs", root)
);

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
  if (capabilities.requiresPayment) configuration.paymentArchitecture = "fixed-cores";
  if (workPackageGates.length) configuration.workPackage = { gates: workPackageGates, authorizedBy: "user" };
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
  const approvedAll = routeFor({
    slice: "all",
    persisted: ["products", "orders", "media"],
    workPackage: ["dashboard_integration"],
  });
  assertStableBoundary(approvedAll, "all", ["products", "orders", "media"]);
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
