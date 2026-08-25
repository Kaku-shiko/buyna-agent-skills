import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const { planWebsiteRoute, resolveRouteDependencyClosure } = await import(
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

const productCapabilities = (overrides = {}) => ({
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

const staticCapabilities = {
  siteType: "content",
  requiresDashboard: false,
  requiresCart: false,
  requiresCheckout: false,
  requiresPayment: false,
  requiresBooking: false,
  requiresCatalog: false,
  requiresInventory: false,
  requiresCoupons: false,
};

const approved = (delivery) => ({
  status: "approved",
  delivery,
  approvedBy: "user",
  approvedAt: "2026-08-25T01:00:00.000Z",
});

const deliveryFor = (gate, capabilities, paymentArchitecture) => ({
  customer_intake: {
    record: "intake.json",
    capabilities,
    ...(paymentArchitecture ? { paymentArchitecture } : {}),
  },
  design_and_structure: {
    designRecord: "design.json",
    pageStructure: "pages.json",
    boardStatus: "delivered",
  },
  frontend_code: {
    deliveredFiles: ["app.tsx"],
    verification: ["PASS"],
    interfaceContract: "contract.json",
  },
  dashboard_integration: {
    completedSlices: [],
    frontendFiles: ["dashboard.tsx"],
    backendFiles: ["server.mjs"],
    verification: ["PASS"],
  },
  checkout_payment: {
    pendingOrder: true,
    checkoutFlowVerified: true,
    verification: ["PASS"],
  },
  testing_upload_gate: { result: "PASS", verification: ["PASS"] },
  aws_release: {
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
  },
}[gate]);

function stateAt(currentGate, capabilities, workPackageGates = []) {
  const currentIndex = gates.indexOf(currentGate);
  const paymentArchitecture = capabilities.requiresPayment ? "fixed-cores" : undefined;
  const configuration = { capabilities, dashboardSlices: [] };
  if (paymentArchitecture) configuration.paymentArchitecture = paymentArchitecture;
  if (workPackageGates.length) {
    configuration.workPackage = { gates: workPackageGates, authorizedBy: "user" };
  }
  return {
    projectId: "route-test",
    currentGate,
    configuration,
    gates: Object.fromEntries(gates.map((gate, index) => [
      gate,
      index < currentIndex
        ? approved(deliveryFor(gate, capabilities, paymentArchitecture))
        : { status: index === currentIndex ? "ready" : "locked" },
    ])),
  };
}

function assertManifestEvidence(route) {
  assert.deepEqual(route.manifestVerification, {
    profile: "website-builder",
    verified: true,
  });
}

test("stock and SKU Dashboard selects catalog, inventory, and operation state exactly once", () => {
  const capabilities = productCapabilities();
  const route = planWebsiteRoute({
    capabilities,
    workflowState: stateAt("dashboard_integration", capabilities, ["dashboard_integration"]),
    requestedSlice: "dashboard_integration",
  });

  assert.deepEqual(route.skills, [
    "buyai-product-merchant-backend",
    "buyai-dashboard-data-interaction",
  ]);
  assert.deepEqual(route.fixedModules, [
    "buyna-workflow-state-core",
    "buyna-merchant-catalog-core",
    "buyna-inventory-core",
    "buyna-merchant-dashboard-core",
  ]);
  assert.equal(new Set(route.skills).size, route.skills.length);
  assert.equal(new Set(route.fixedModules).size, route.fixedModules.length);
  assert.equal(route.continueWithoutConfirmation, true);
  assert.deepEqual(route.externalActions, { git: false, aws: false });
  assertManifestEvidence(route);
});

test("catalog management selects the product backend even when the mixed site has no cart", () => {
  const capabilities = {
    ...productCapabilities(),
    siteType: "mixed",
    requiresCart: false,
    requiresCheckout: false,
    requiresInventory: false,
    requiresBooking: true,
  };
  const route = planWebsiteRoute({
    capabilities,
    workflowState: stateAt("dashboard_integration", capabilities),
    requestedSlice: "dashboard_integration",
  });

  assert.ok(route.skills.includes("buyai-product-merchant-backend"));
  assert.ok(route.skills.includes("buyai-booking-service-backend"));
  assert.ok(route.fixedModules.includes("buyna-merchant-catalog-core"));
});

test("coupon capability selects the one coupon Skill and fixed coupon module", () => {
  const capabilities = productCapabilities({ requiresCoupons: true });
  const route = planWebsiteRoute({
    capabilities,
    workflowState: stateAt("checkout_payment", capabilities),
    requestedSlice: "checkout_payment",
  });

  assert.equal(route.skills.filter((name) => name === "buyai-coupon-commerce").length, 1);
  assert.equal(route.fixedModules.filter((name) => name === "buyna-coupon-core").length, 1);
  assert.ok(route.fixedModules.includes("buyna-inventory-core"));
  assert.ok(route.fixedModules.includes("buyna-merchant-catalog-core"));
  assert.equal(route.action, "execute");
  assertManifestEvidence(route);
});

test("absence of coupons skips only coupon while checkout remains executable", () => {
  const capabilities = productCapabilities({ requiresCoupons: false });
  const route = planWebsiteRoute({
    capabilities,
    workflowState: stateAt("checkout_payment", capabilities, ["checkout_payment"]),
    requestedSlice: "checkout_payment",
  });

  assert.equal(route.action, "execute");
  assert.equal(route.continueWithoutConfirmation, true);
  assert.ok(route.fixedModules.includes("buyna-checkout-flow-core"));
  assert.ok(route.fixedModules.includes("buyna-merchant-catalog-core"));
  assert.ok(route.fixedModules.includes("buyna-inventory-core"));
  assert.ok(!route.fixedModules.includes("buyna-coupon-core"));
  assert.ok(!route.skills.includes("buyai-coupon-commerce"));
  assertManifestEvidence(route);
});

test("every interactive Dashboard frontend and repair route selects operation state", () => {
  const capabilities = productCapabilities();
  for (const requestedSlice of ["frontend_code", "dashboard_integration"]) {
    const route = planWebsiteRoute({
      capabilities,
      workflowState: stateAt(requestedSlice, capabilities, [requestedSlice]),
      requestedSlice,
      mode: "repair",
    });
    assert.ok(route.fixedModules.includes("buyna-merchant-dashboard-core"));
    assert.equal(route.continueWithoutConfirmation, true);
    assertManifestEvidence(route);
  }
});

test("persisted lifecycle capabilities remain authoritative", () => {
  const persisted = productCapabilities({ requiresCoupons: true });
  const requested = productCapabilities({ requiresCoupons: false });
  const route = planWebsiteRoute({
    capabilities: requested,
    workflowState: stateAt("dashboard_integration", persisted),
    requestedSlice: "dashboard_integration",
  });

  assert.equal(route.action, "blocked");
  assert.equal(route.reason, "CAPABILITY_SCOPE_CHANGE_REQUIRED");
  assert.deepEqual(route.skills, []);
  assertManifestEvidence(route);
});

test("static local work skips all commerce lifecycle modules and external actions", () => {
  const route = planWebsiteRoute({
    capabilities: staticCapabilities,
    workflowState: stateAt("frontend_code", staticCapabilities),
    requestedSlice: "local_preview",
  });

  assert.deepEqual(route.skills, ["buyna-frontend-builder"]);
  assert.deepEqual(route.fixedModules, ["buyna-workflow-state-core"]);
  assert.deepEqual(route.externalActions, { git: false, aws: false });
  assertManifestEvidence(route);
});

test("dependency closure preserves exactly one selected lifecycle dependency", () => {
  const capabilities = productCapabilities({ requiresCoupons: true });
  const route = planWebsiteRoute({
    capabilities,
    workflowState: stateAt("dashboard_integration", capabilities),
    requestedSlice: "dashboard_integration",
  });
  const closure = resolveRouteDependencyClosure(route);

  assert.equal(closure.fixedModules.filter((name) => name === "buyna-coupon-core").length, 1);
  assert.equal(closure.fixedModules.filter((name) => name === "buyna-inventory-core").length, 1);
  assert.equal(closure.fixedModules.filter((name) => name === "buyna-merchant-catalog-core").length, 1);
  assert.equal(closure.fixedModules.filter((name) => name === "buyna-merchant-dashboard-core").length, 1);
});

test("canonical coupon Skill and generated-UI boundary are repository-visible", () => {
  const manifest = JSON.parse(read("repository-manifest.json"));
  assert.ok(manifest.skills.includes("buyai-coupon-commerce"));
  assert.ok(manifest.profiles["website-builder"].skills.includes("buyai-coupon-commerce"));
  assert.match(read("skills/buyai-coupon-commerce/SKILL.md"), /^description:\s*["']?Use when\b/im);
  assert.match(read("skills/buyai-coupon-commerce/SKILL.md"), /references\/coupon-adapter-contract\.md/);
  for (const path of [
    "skills/buyna-frontend-builder/SKILL.md",
    "skills/buyna-frontend-builder/references/merchant-dashboard-functional-core.md",
    "skills/buyai-dashboard-data-interaction/SKILL.md",
  ]) {
    const content = read(path);
    assert.match(content, /buyna-merchant-dashboard-core/);
    assert.match(content, /project-owned|project-specific/i);
  }
});

test("project installation carries the authoritative manifest used by the installed router", () => {
  const target = mkdtempSync(join(tmpdir(), "buyna-route-install-"));
  try {
    const installer = new URL("scripts/install.ps1", root);
    const install = spawnSync("powershell", [
      "-ExecutionPolicy", "Bypass",
      "-File", installer.pathname.slice(1),
      "-Scope", "Project",
      "-ProjectPath", target,
    ], { encoding: "utf8" });
    assert.equal(install.status, 0, install.stderr || install.stdout);
    assert.doesNotThrow(() => JSON.parse(readFileSync(join(target, "repository-manifest.json"), "utf8")));

    const installedRouter = join(target, ".agents", "skills", "buyna-website-builder", "scripts", "route-builder.mjs");
    const capabilities = staticCapabilities;
    const run = spawnSync(process.execPath, [installedRouter], {
      input: JSON.stringify({
        capabilities,
        workflowState: stateAt("frontend_code", capabilities),
        requestedSlice: "local_preview",
      }),
      encoding: "utf8",
    });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    assertManifestEvidence(JSON.parse(run.stdout));
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});
