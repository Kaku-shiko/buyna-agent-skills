import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workflowCoreUrls = [
  new URL("../../../packages/buyna-workflow-state-core/src/index.mjs", import.meta.url),
  new URL("../../../../packages/buyna-workflow-state-core/src/index.mjs", import.meta.url),
];
const workflowCoreUrl = workflowCoreUrls.find((candidate) => existsSync(fileURLToPath(candidate)));
if (!workflowCoreUrl) throw new Error("WORKFLOW_STATE_CORE_REQUIRED");
const { validateWorkflowReadinessEvidence } = await import(workflowCoreUrl.href);

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
const capabilityKeys = Object.freeze([
  "requiresDashboard",
  "requiresCart",
  "requiresCheckout",
  "requiresPayment",
  "requiresBooking",
]);
const paymentArchitectures = Object.freeze(["fixed-cores", "legacy-globepay-service"]);

function requiredObject(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  return value;
}

function normalizeCapabilities(value) {
  const input = requiredObject(value, "CAPABILITIES_REQUIRED");
  const capabilities = { siteType: String(input.siteType ?? "").trim().toLowerCase() };
  if (!["content", "commerce", "service", "mixed"].includes(capabilities.siteType)) throw new Error("SITE_TYPE_INVALID");
  for (const key of capabilityKeys) {
    if (typeof input[key] !== "boolean") throw new Error("CAPABILITIES_REQUIRED");
    capabilities[key] = input[key];
  }
  if (capabilities.requiresCart && !capabilities.requiresCheckout) throw new Error("CART_REQUIRES_CHECKOUT");
  if (capabilities.requiresPayment && !capabilities.requiresCheckout) throw new Error("PAYMENT_REQUIRES_CHECKOUT");
  return capabilities;
}

function capabilitiesEqual(left, right) {
  return left.siteType === right.siteType && capabilityKeys.every((key) => left[key] === right[key]);
}

function verifyReadiness(workflowState) {
  const state = requiredObject(workflowState, "WORKFLOW_STATE_REQUIRED");
  validateWorkflowReadinessEvidence(state);
  return state;
}

function notApplicableGates(capabilities) {
  const result = [];
  if (!capabilities.requiresDashboard) result.push("dashboard_integration");
  if (!capabilities.requiresCheckout) result.push("checkout_payment");
  return result;
}

function capabilityScopeChangeRoute({ workflowState, requestedGate, requestedSlice, capabilities }) {
  return {
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
  };
}

function routeForGate({ gate, capabilities, paymentArchitecture, mode }) {
  const fixedModules = ["buyna-workflow-state-core"];
  if (gate === "customer_intake") return { skills: ["buyna-customer-intake"], fixedModules, commerceArchitecture: null };
  if (gate === "design_and_structure") return { skills: ["buyna-website-design", "buyna-page-structure"], fixedModules, commerceArchitecture: null };
  if (gate === "frontend_code") return { skills: ["buyna-frontend-builder"], fixedModules, commerceArchitecture: null };
  if (gate === "dashboard_integration") {
    const skills = [];
    if (capabilities.requiresCart || capabilities.siteType === "commerce") skills.push("buyai-product-merchant-backend");
    if (capabilities.requiresBooking) skills.push("buyai-booking-service-backend");
    skills.push("buyai-dashboard-data-interaction");
    return { skills, fixedModules, commerceArchitecture: null };
  }
  if (gate === "testing_upload_gate") return { skills: ["buyna-testing-quality"], fixedModules, commerceArchitecture: null };
  if (gate === "aws_release") return { skills: ["buyna-aws-release"], fixedModules, commerceArchitecture: null };

  const skills = [];
  if (mode !== "repair") {
    if (capabilities.requiresCart) skills.push("buyai-product-merchant-backend");
    if (capabilities.requiresBooking) skills.push("buyai-booking-service-backend");
  }
  const fixedCorePayment = capabilities.requiresPayment && paymentArchitecture === "fixed-cores";
  if (capabilities.requiresCheckout && (!capabilities.requiresPayment || fixedCorePayment)) {
    skills.push("buyai-checkout-address-ux");
    fixedModules.push("buyna-checkout-flow-core");
  } else if (capabilities.requiresCheckout) {
    skills.push("buyai-checkout-address-ux");
  }
  if (capabilities.requiresCart) fixedModules.splice(1, 0, "buyna-cart-core", "buyna-order-core");
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

export function planWebsiteRoute({ capabilities: rawCapabilities, workflowState: rawState, requestedSlice, releaseIntent = false, mode = "build" } = {}) {
  if (!requestedSlices.includes(requestedSlice)) throw new Error("REQUESTED_SLICE_INVALID");
  if (!["build", "repair", "resume"].includes(mode)) throw new Error("ROUTE_MODE_INVALID");
  const workflowState = verifyReadiness(rawState);
  const requestedGate = requestedSlice === "local_preview" ? "frontend_code" : requestedSlice;
  const persistedCapabilities = workflowState.configuration?.capabilities
    ? normalizeCapabilities(workflowState.configuration.capabilities)
    : null;
  let requestedCapabilities;
  try {
    requestedCapabilities = normalizeCapabilities(rawCapabilities);
  } catch (error) {
    if (persistedCapabilities) return capabilityScopeChangeRoute({ workflowState, requestedGate, requestedSlice, capabilities: persistedCapabilities });
    throw error;
  }
  const capabilities = persistedCapabilities ?? requestedCapabilities;
  if (persistedCapabilities && !capabilitiesEqual(requestedCapabilities, persistedCapabilities)) {
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
    return {
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
    };
  }
  const requestedStatus = workflowState.gates[requestedGate].status;
  const targetGate = completed ? requestedGate : ["ready", "in_progress"].includes(requestedStatus) ? requestedGate : workflowState.currentGate;
  const selected = routeForGate({ gate: targetGate, capabilities, paymentArchitecture, mode });
  const workPackageGates = workflowState.configuration?.workPackage?.gates ?? [];
  const base = {
    targetGate,
    requestedSlice,
    skills: selected.skills,
    fixedModules: selected.fixedModules,
    notApplicableGates: skippedGates,
    continueWithoutConfirmation: activeRepair || workPackageGates.includes(targetGate),
    commerceArchitecture: selected.commerceArchitecture,
    externalActions: { git: false, aws: targetGate === "aws_release" && releaseIntent === true },
  };
  if (completed && !activeRepair) return { action: "reopen_repair", ...base, repairTransition: { type: "openRepairSlice", gate: targetGate } };
  if (skippedGates.includes(targetGate)) return { action: "mark_not_applicable", ...base, reason: "CAPABILITY_NOT_REQUIRED", skills: [], fixedModules: ["buyna-workflow-state-core"], commerceArchitecture: null };
  if (targetGate === "aws_release" && releaseIntent !== true) return { action: "blocked", ...base, reason: "RELEASE_INTENT_REQUIRED", skills: [], externalActions: { git: false, aws: false } };
  return { action: "execute", ...base };
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
