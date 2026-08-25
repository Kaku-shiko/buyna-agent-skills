import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workflowCoreUrls = [
  new URL("../../../packages/buyna-workflow-state-core/src/index.mjs", import.meta.url),
  new URL("../../../../packages/buyna-workflow-state-core/src/index.mjs", import.meta.url),
];
const workflowCoreUrl = workflowCoreUrls.find((candidate) => existsSync(fileURLToPath(candidate)));
if (!workflowCoreUrl) throw new Error("WORKFLOW_STATE_CORE_REQUIRED");
const {
  isTrustedWorkflowState,
  normalizeWebsiteCapabilities,
  validateWorkflowReadinessEvidence,
  websiteCapabilitiesEqual,
} = await import(workflowCoreUrl.href);

const manifestUrls = [
  new URL("../../../buyna/repository-manifest.json", import.meta.url),
  new URL("../../../repository-manifest.json", import.meta.url),
  new URL("../../../../repository-manifest.json", import.meta.url),
];
const manifestUrl = manifestUrls.find((candidate) => existsSync(fileURLToPath(candidate)));
if (!manifestUrl) throw new Error("REPOSITORY_MANIFEST_REQUIRED");
const repositoryManifest = JSON.parse(readFileSync(manifestUrl, "utf8"));
const websiteBuilderProfile = repositoryManifest.profiles?.["website-builder"];
if (!websiteBuilderProfile) throw new Error("WEBSITE_BUILDER_PROFILE_REQUIRED");

const gates = Object.freeze([
  "customer_intake",
  "design_and_structure",
  "frontend_code",
  "dashboard_integration",
  "checkout_payment",
  "testing_upload_gate",
  "aws_release",
]);
const requestedSlices = Object.freeze([...gates, "local_preview"]);
const repairSlices = Object.freeze(["frontend_code", "dashboard_integration", "checkout_payment", "testing_upload_gate"]);
const paymentArchitectures = Object.freeze(["fixed-cores", "legacy-globepay-service"]);
const fileCapableDashboardSlices = Object.freeze(["products", "services", "media", "page_editor"]);
const dependencyRules = Object.freeze({
  "buyai-product-merchant-backend": () => ({
    skills: [],
    fixedModules: [],
    legacyServices: [],
    paymentSafety: [],
  }),
  "buyai-checkout-address-ux": ({ commerceArchitecture }) => ({
    skills: [],
    fixedModules: [],
    legacyServices: commerceArchitecture === "legacy-globepay-service" ? ["createGlobepayService"] : [],
    paymentSafety: commerceArchitecture === "legacy-globepay-service"
      ? ["provider-query", "exact-amount-currency", "idempotency"]
      : [],
  }),
  "buyai-coupon-commerce": () => ({
    skills: [],
    fixedModules: [],
    legacyServices: [],
    paymentSafety: [],
  }),
  "buyai-dashboard-data-interaction": () => ({
    skills: [],
    fixedModules: [],
    legacyServices: [],
    paymentSafety: [],
  }),
  "buyai-globepay-payment": ({ commerceArchitecture }) => ({
    skills: [],
    fixedModules: [],
    legacyServices: commerceArchitecture === "legacy-globepay-service" ? ["createGlobepayService"] : [],
    paymentSafety: ["provider-query", "exact-amount-currency", "idempotency"],
  }),
  "buyai-globepay-status-sync": ({ commerceArchitecture }) => ({
    skills: [],
    fixedModules: [],
    legacyServices: commerceArchitecture === "legacy-globepay-service" ? ["createGlobepayService"] : [],
    paymentSafety: ["provider-query", "exact-amount-currency", "idempotency"],
  }),
});

function requiredObject(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  return value;
}

function addUnique(target, values) {
  for (const value of values) if (!target.includes(value)) target.push(value);
}

function assertSelectedDependencyContract(selected) {
  const skills = new Set(selected.skills);
  const modules = new Set(selected.fixedModules);
  if (skills.has("buyai-product-merchant-backend")) {
    if (["frontend_code", "dashboard_integration"].includes(selected.targetGate)
      && !["buyna-merchant-catalog-core", "buyna-inventory-core"].some((name) => modules.has(name))) {
      throw new Error("PRODUCT_DASHBOARD_DEPENDENCY_INCOMPLETE");
    }
    if (selected.targetGate === "checkout_payment"
      && !["buyna-cart-core", "buyna-order-core"].every((name) => modules.has(name))) {
      throw new Error("PRODUCT_CHECKOUT_DEPENDENCY_INCOMPLETE");
    }
  }
  if (skills.has("buyai-coupon-commerce") && !modules.has("buyna-coupon-core")) {
    throw new Error("COUPON_DEPENDENCY_INCOMPLETE");
  }
  if (skills.has("buyai-dashboard-data-interaction") && !modules.has("buyna-merchant-dashboard-core")) {
    throw new Error("DASHBOARD_DEPENDENCY_INCOMPLETE");
  }
  if (skills.has("buyai-dashboard-data-interaction")
    && !["buyna-auth-session-core", "buyna-merchant-context-core"].every((name) => modules.has(name))) {
    throw new Error("DASHBOARD_SECURITY_DEPENDENCY_INCOMPLETE");
  }
  if (skills.has("buyai-checkout-address-ux")
    && selected.commerceArchitecture !== "legacy-globepay-service"
    && !modules.has("buyna-checkout-flow-core")) {
    throw new Error("CHECKOUT_DEPENDENCY_INCOMPLETE");
  }
}

function lifecycleModules(capabilities, { dashboard = false } = {}) {
  const modules = [];
  if (capabilities.requiresCatalog) modules.push("buyna-merchant-catalog-core");
  if (capabilities.requiresInventory) modules.push("buyna-inventory-core");
  if (capabilities.requiresCoupons) modules.push("buyna-coupon-core");
  if (dashboard && capabilities.requiresDashboard) modules.push("buyna-merchant-dashboard-core");
  return modules;
}

function withManifestVerification(route) {
  for (const skill of route.skills ?? []) {
    if (!repositoryManifest.skills?.includes(skill) || !websiteBuilderProfile.skills?.includes(skill)) {
      throw new Error(`WEBSITE_BUILDER_SKILL_NOT_REGISTERED:${skill}`);
    }
  }
  for (const fixedModule of route.fixedModules ?? []) {
    if (!repositoryManifest.packages?.includes(fixedModule) || !websiteBuilderProfile.packages?.includes(fixedModule)) {
      throw new Error(`WEBSITE_BUILDER_MODULE_NOT_REGISTERED:${fixedModule}`);
    }
  }
  return {
    ...route,
    dashboardSlice: route.dashboardSlice ?? null,
    dashboardSlices: Array.isArray(route.dashboardSlices) ? [...route.dashboardSlices] : [],
    manifestVerification: { profile: "website-builder", verified: true },
  };
}

export function resolveRouteDependencyClosure(route) {
  const selected = requiredObject(route, "ROUTE_REQUIRED");
  if (!Array.isArray(selected.skills) || !Array.isArray(selected.fixedModules)) throw new Error("ROUTE_DEPENDENCIES_REQUIRED");
  assertSelectedDependencyContract(selected);
  const skills = [];
  const fixedModules = [...selected.fixedModules];
  const legacyServices = [];
  const paymentSafety = [];
  const queue = [...selected.skills];
  while (queue.length) {
    const skill = queue.shift();
    if (skills.includes(skill)) continue;
    skills.push(skill);
    const rule = dependencyRules[skill]?.(selected);
    if (!rule) continue;
    addUnique(queue, rule.skills);
    addUnique(fixedModules, rule.fixedModules);
    addUnique(legacyServices, rule.legacyServices);
    addUnique(paymentSafety, rule.paymentSafety);
  }
  return { skills, fixedModules, legacyServices, paymentSafety };
}

function verifyReadiness(workflowState) {
  const state = requiredObject(workflowState, "WORKFLOW_STATE_REQUIRED");
  validateWorkflowReadinessEvidence(state);
  return state;
}

function authorizationEvidenceFailure(error) {
  const allowed = new Set([
    "WORK_PACKAGE_AUTHORIZATION_EVIDENCE_INVALID",
    "REPAIR_AUTHORIZATION_EVIDENCE_INVALID",
    "DASHBOARD_SLICE_APPROVAL_EVIDENCE_INVALID",
  ]);
  let current = error;
  while (current instanceof Error) {
    if (allowed.has(current.message)) return current.message;
    current = current.cause;
  }
  return null;
}

function notApplicableGates(capabilities) {
  const result = [];
  if (!capabilities.requiresDashboard) result.push("dashboard_integration");
  if (!capabilities.requiresCheckout) result.push("checkout_payment");
  return result;
}

function legacyMixedMigration(rawCapabilities) {
  if (!rawCapabilities || typeof rawCapabilities !== "object") return null;
  const hasLifecycleEvidence = ["requiresCatalog", "requiresInventory", "requiresCoupons"]
    .some((key) => Object.prototype.hasOwnProperty.call(rawCapabilities, key));
  if (String(rawCapabilities.siteType ?? "").trim().toLowerCase() !== "mixed"
    || rawCapabilities.requiresCart !== false
    || hasLifecycleEvidence) return null;
  return {
    code: "EXPLICIT_PRODUCT_CAPABILITY_MIGRATION_REQUIRED",
    action: "return_to_customer_intake_before_product_work",
  };
}

function capabilityScopeChangeRoute({ workflowState, requestedGate, requestedSlice, capabilities }) {
  return withManifestVerification({
    action: "blocked",
    targetGate: workflowState.currentGate ?? requestedGate,
    requestedSlice,
    reason: "CAPABILITY_SCOPE_CHANGE_REQUIRED",
    skills: [],
    fixedModules: ["buyna-workflow-state-core"],
    notApplicableGates: notApplicableGates(capabilities),
    continueWithoutConfirmation: false,
    commerceArchitecture: null,
    externalActions: { git: false, aws: false },
  });
}

function normalizeDashboardSelection({ targetGate, dashboardSlice, persistedSlices, workPackageGates }) {
  if (targetGate !== "dashboard_integration") {
    if (dashboardSlice !== null && dashboardSlice !== undefined) {
      return { blocked: "DASHBOARD_SLICE_NOT_APPLICABLE", dashboardSlice: null, dashboardSlices: [] };
    }
    return { dashboardSlice: null, dashboardSlices: [] };
  }
  if (!Array.isArray(persistedSlices) || persistedSlices.length === 0) {
    return { blocked: "DASHBOARD_SLICES_NOT_CONFIGURED", dashboardSlice: null, dashboardSlices: [] };
  }
  if (!persistedSlices.every((value) => typeof value === "string" && value.trim() && value === value.trim())
    || new Set(persistedSlices).size !== persistedSlices.length) {
    throw new Error("DASHBOARD_SLICES_INVALID");
  }
  if (dashboardSlice === null || dashboardSlice === undefined) {
    if (persistedSlices.length !== 1) {
      return { blocked: "DASHBOARD_SLICE_REQUIRED", dashboardSlice: null, dashboardSlices: [] };
    }
    return { dashboardSlice: persistedSlices[0], dashboardSlices: [persistedSlices[0]] };
  }
  if (dashboardSlice === "all") {
    if (!workPackageGates.includes("dashboard_integration")) {
      return { blocked: "DASHBOARD_FULL_SCOPE_APPROVAL_REQUIRED", dashboardSlice: null, dashboardSlices: [] };
    }
    return { dashboardSlice: "all", dashboardSlices: [...persistedSlices] };
  }
  if (typeof dashboardSlice !== "string" || !persistedSlices.includes(dashboardSlice)) {
    return { blocked: "DASHBOARD_SLICE_NOT_APPROVED", dashboardSlice: null, dashboardSlices: [] };
  }
  return { dashboardSlice, dashboardSlices: [dashboardSlice] };
}

function routeForGate({ gate, capabilities, paymentArchitecture, mode, dashboardSelection }) {
  const fixedModules = ["buyna-workflow-state-core"];
  if (gate === "customer_intake") return { skills: ["buyna-customer-intake"], fixedModules, commerceArchitecture: null };
  if (gate === "design_and_structure") return { skills: ["buyna-website-design", "buyna-page-structure"], fixedModules, commerceArchitecture: null };
  if (gate === "frontend_code") {
    addUnique(fixedModules, lifecycleModules(capabilities, { dashboard: true }));
    return { skills: ["buyna-frontend-builder"], fixedModules, commerceArchitecture: null };
  }
  if (gate === "dashboard_integration") {
    const skills = [];
    if (capabilities.requiresCatalog || capabilities.requiresInventory || capabilities.requiresCart) {
      skills.push("buyai-product-merchant-backend");
    }
    if (capabilities.requiresBooking) skills.push("buyai-booking-service-backend");
    if (capabilities.requiresCoupons) skills.push("buyai-coupon-commerce");
    skills.push("buyai-dashboard-data-interaction");
    addUnique(fixedModules, lifecycleModules(capabilities, { dashboard: true }));
    addUnique(fixedModules, ["buyna-auth-session-core", "buyna-merchant-context-core"]);
    if (dashboardSelection.dashboardSlices.some((slice) => fileCapableDashboardSlices.includes(slice))) {
      addUnique(fixedModules, ["buyna-merchant-file-core"]);
    }
    return { skills, fixedModules, commerceArchitecture: null };
  }
  if (gate === "testing_upload_gate") return { skills: ["buyna-testing-quality"], fixedModules, commerceArchitecture: null };
  if (gate === "aws_release") return { skills: ["buyna-aws-release"], fixedModules, commerceArchitecture: null };

  const skills = [];
  if (mode !== "repair") {
    if (capabilities.requiresCart) skills.push("buyai-product-merchant-backend");
    if (capabilities.requiresBooking) skills.push("buyai-booking-service-backend");
  }
  if (capabilities.requiresCoupons) skills.push("buyai-coupon-commerce");
  addUnique(fixedModules, lifecycleModules(capabilities));
  if (capabilities.requiresCart) addUnique(fixedModules, ["buyna-cart-core", "buyna-order-core"]);
  const fixedCorePayment = capabilities.requiresPayment && paymentArchitecture === "fixed-cores";
  if (capabilities.requiresCheckout && (!capabilities.requiresPayment || fixedCorePayment)) {
    skills.push("buyai-checkout-address-ux");
    fixedModules.push("buyna-checkout-flow-core");
  } else if (capabilities.requiresCheckout) {
    skills.push("buyai-checkout-address-ux");
  }
  if (capabilities.requiresPayment) {
    skills.push("buyai-globepay-payment", "buyai-globepay-status-sync", "buyna-gmv-commerce");
    if (fixedCorePayment) fixedModules.push("buyna-commerce-settlement-core");
  }
  return {
    skills,
    fixedModules,
    commerceArchitecture: capabilities.requiresPayment
      ? fixedCorePayment ? "checkout-flow+transport-adapters+settlement" : "legacy-globepay-service"
      : capabilities.requiresCheckout ? "checkout-flow-only" : null,
  };
}

export function planWebsiteRoute({ capabilities: rawCapabilities, workflowState: rawState, requestedSlice, releaseIntent = false, mode = "build", dashboardSlice = null } = {}) {
  if (!requestedSlices.includes(requestedSlice)) throw new Error("REQUESTED_SLICE_INVALID");
  if (!["build", "repair", "resume"].includes(mode)) throw new Error("ROUTE_MODE_INVALID");
  const requestedGate = requestedSlice === "local_preview" ? "frontend_code" : requestedSlice;
  const authorizationBearing = Boolean(
    rawState?.configuration?.workPackage
    || rawState?.activeRepair,
  );
  if (authorizationBearing && !isTrustedWorkflowState(rawState)) {
    let capabilities;
    try { capabilities = normalizeWebsiteCapabilities(rawCapabilities); } catch { capabilities = null; }
    return withManifestVerification({
      action: "blocked",
      targetGate: rawState?.currentGate ?? requestedGate,
      requestedSlice,
      reason: "WORKFLOW_STATE_PROVENANCE_UNTRUSTED",
      skills: [],
      fixedModules: ["buyna-workflow-state-core"],
      notApplicableGates: capabilities ? notApplicableGates(capabilities) : [],
      continueWithoutConfirmation: false,
      commerceArchitecture: null,
      externalActions: { git: false, aws: false },
    });
  }
  let workflowState;
  try {
    workflowState = verifyReadiness(rawState);
  } catch (error) {
    const reason = authorizationEvidenceFailure(error);
    if (!reason) throw error;
    let capabilities;
    try { capabilities = normalizeWebsiteCapabilities(rawCapabilities); } catch { capabilities = null; }
    return withManifestVerification({
      action: "blocked",
      targetGate: rawState?.currentGate ?? requestedGate,
      requestedSlice,
      reason,
      skills: [],
      fixedModules: ["buyna-workflow-state-core"],
      notApplicableGates: capabilities ? notApplicableGates(capabilities) : [],
      continueWithoutConfirmation: false,
      commerceArchitecture: null,
      externalActions: { git: false, aws: false },
    });
  }
  const persistedRawCapabilities = workflowState.configuration?.capabilities;
  const capabilityMigration = legacyMixedMigration(persistedRawCapabilities);
  const persistedCapabilities = persistedRawCapabilities
    ? normalizeWebsiteCapabilities(persistedRawCapabilities)
    : null;
  let requestedCapabilities;
  try {
    requestedCapabilities = normalizeWebsiteCapabilities(rawCapabilities);
  } catch (error) {
    if (persistedCapabilities) return capabilityScopeChangeRoute({ workflowState, requestedGate, requestedSlice, capabilities: persistedCapabilities });
    throw error;
  }
  const capabilities = persistedCapabilities ?? requestedCapabilities;
  if (persistedCapabilities && !websiteCapabilitiesEqual(requestedCapabilities, persistedCapabilities)) {
    return capabilityScopeChangeRoute({ workflowState, requestedGate, requestedSlice, capabilities: persistedCapabilities });
  }
  const paymentArchitecture = capabilities.requiresPayment
    ? String(workflowState.configuration?.paymentArchitecture ?? "").trim()
    : null;
  if (capabilities.requiresPayment && !paymentArchitecture) throw new Error("PAYMENT_ARCHITECTURE_REQUIRED");
  if (capabilities.requiresPayment && !paymentArchitectures.includes(paymentArchitecture)) throw new Error("PAYMENT_ARCHITECTURE_UNSUPPORTED");
  const completed = workflowState.currentGate === null;
  if (completed && mode !== "repair") throw new Error("WORKFLOW_COMPLETE");
  if (completed && !repairSlices.includes(requestedGate)) throw new Error("REPAIR_SLICE_INVALID");
  const activeRepair = completed && workflowState.activeRepair?.gate === requestedGate && ["ready", "in_progress"].includes(workflowState.activeRepair.status);
  const skippedGates = notApplicableGates(capabilities);
  if (completed && workflowState.gates[requestedGate].status === "not_applicable") {
    return withManifestVerification({
      action: "blocked",
      targetGate: requestedGate,
      requestedSlice,
      reason: "CAPABILITY_SCOPE_CHANGE_REQUIRED",
      skills: [],
      fixedModules: ["buyna-workflow-state-core"],
      notApplicableGates: skippedGates,
      continueWithoutConfirmation: false,
      commerceArchitecture: null,
      externalActions: { git: false, aws: false },
    });
  }
  const requestedStatus = workflowState.gates[requestedGate].status;
  const targetGate = completed ? requestedGate : ["ready", "in_progress"].includes(requestedStatus) ? requestedGate : workflowState.currentGate;
  const workPackageGates = workflowState.configuration?.workPackage?.gates ?? [];
  if (skippedGates.includes(targetGate)) {
    return withManifestVerification({
      action: "mark_not_applicable",
      targetGate,
      requestedSlice,
      reason: "CAPABILITY_NOT_REQUIRED",
      skills: [],
      fixedModules: ["buyna-workflow-state-core"],
      notApplicableGates: skippedGates,
      continueWithoutConfirmation: false,
      commerceArchitecture: null,
      externalActions: { git: false, aws: false },
    });
  }
  const dashboardSelection = normalizeDashboardSelection({
    targetGate,
    dashboardSlice,
    persistedSlices: workflowState.configuration?.dashboardSlices,
    workPackageGates,
  });
  if (dashboardSelection.blocked) {
    return withManifestVerification({
      action: "blocked",
      targetGate,
      requestedSlice,
      reason: dashboardSelection.blocked,
      skills: [],
      fixedModules: ["buyna-workflow-state-core"],
      notApplicableGates: skippedGates,
      continueWithoutConfirmation: false,
      commerceArchitecture: null,
      dashboardSlice: dashboardSelection.dashboardSlice,
      dashboardSlices: dashboardSelection.dashboardSlices,
      externalActions: { git: false, aws: false },
    });
  }
  const selected = routeForGate({ gate: targetGate, capabilities, paymentArchitecture, mode, dashboardSelection });
  const base = {
    targetGate,
    requestedSlice,
    skills: selected.skills,
    fixedModules: selected.fixedModules,
    notApplicableGates: skippedGates,
    continueWithoutConfirmation: activeRepair || workPackageGates.includes(targetGate),
    commerceArchitecture: selected.commerceArchitecture,
    dashboardSlice: dashboardSelection.dashboardSlice,
    dashboardSlices: dashboardSelection.dashboardSlices,
    ...(capabilityMigration ? { capabilityMigration } : {}),
    externalActions: { git: false, aws: targetGate === "aws_release" && releaseIntent === true },
  };
  if (completed && !activeRepair) return withManifestVerification({ action: "reopen_repair", ...base, repairTransition: { type: "openRepairSlice", gate: targetGate } });
  if (targetGate === "aws_release" && releaseIntent !== true) return withManifestVerification({ action: "blocked", ...base, reason: "RELEASE_INTENT_REQUIRED", skills: [], externalActions: { git: false, aws: false } });
  return withManifestVerification({ action: "execute", ...base });
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    const input = JSON.parse(readFileSync(0, "utf8"));
    process.stdout.write(`${JSON.stringify(planWebsiteRoute(input))}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
