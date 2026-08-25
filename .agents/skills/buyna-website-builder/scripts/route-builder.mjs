import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
const capabilityKeys = Object.freeze([
  "requiresDashboard",
  "requiresCart",
  "requiresCheckout",
  "requiresPayment",
  "requiresBooking",
]);

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

function verifyReadiness(workflowState) {
  const state = requiredObject(workflowState, "WORKFLOW_STATE_REQUIRED");
  if (!gates.includes(state.currentGate)) throw new Error("CURRENT_GATE_INVALID");
  const gateStates = requiredObject(state.gates, "GATE_STATE_REQUIRED");
  for (const gate of gates) requiredObject(gateStates[gate], "GATE_STATE_REQUIRED");
  const currentIndex = gates.indexOf(state.currentGate);
  for (const gate of gates.slice(0, currentIndex)) {
    const prior = gateStates[gate];
    const approved = prior.status === "approved" && prior.delivery && prior.approvedBy;
    const skipped = prior.status === "not_applicable" && String(prior.reason ?? "").trim();
    if (!approved && !skipped) throw new Error("VERIFIED_READINESS_EVIDENCE_REQUIRED");
  }
  return state;
}

function notApplicableGates(capabilities) {
  const result = [];
  if (!capabilities.requiresDashboard) result.push("dashboard_integration");
  if (!capabilities.requiresCheckout) result.push("checkout_payment");
  return result;
}

function routeForGate({ gate, capabilities, mode }) {
  const fixedModules = ["buyna-workflow-state-core"];
  if (gate === "customer_intake") return { skills: ["buyna-customer-intake"], fixedModules, commerceArchitecture: null };
  if (gate === "design_and_structure") return { skills: ["buyna-website-design", "buyna-page-structure"], fixedModules, commerceArchitecture: null };
  if (gate === "frontend_code") return { skills: ["buyna-frontend-builder"], fixedModules, commerceArchitecture: null };
  if (gate === "dashboard_integration") {
    const skills = ["buyai-dashboard-data-interaction"];
    if (capabilities.requiresBooking) skills.unshift("buyai-booking-service-backend");
    else if (capabilities.siteType === "commerce" || capabilities.siteType === "mixed") skills.unshift("buyai-product-merchant-backend");
    return { skills, fixedModules, commerceArchitecture: null };
  }
  if (gate === "testing_upload_gate") return { skills: ["buyna-testing-quality"], fixedModules, commerceArchitecture: null };
  if (gate === "aws_release") return { skills: ["buyna-aws-release"], fixedModules, commerceArchitecture: null };

  const skills = [];
  if (mode !== "repair") {
    if (capabilities.requiresBooking) skills.push("buyai-booking-service-backend");
    else if (capabilities.requiresCart) skills.push("buyai-product-merchant-backend");
  }
  if (capabilities.requiresCheckout) {
    skills.push("buyai-checkout-address-ux");
    fixedModules.push("buyna-checkout-flow-core");
  }
  if (capabilities.requiresCart) fixedModules.splice(1, 0, "buyna-cart-core", "buyna-order-core");
  if (capabilities.requiresPayment) {
    skills.push("buyai-globepay-payment", "buyai-globepay-status-sync", "buyna-gmv-commerce");
    fixedModules.push("buyna-commerce-settlement-core");
  }
  return {
    skills,
    fixedModules,
    commerceArchitecture: capabilities.requiresPayment
      ? "checkout-flow+transport-adapters+settlement"
      : capabilities.requiresCheckout ? "checkout-flow-only" : null,
  };
}

export function planWebsiteRoute({ capabilities: rawCapabilities, workflowState: rawState, requestedSlice, releaseIntent = false, mode = "build" } = {}) {
  const capabilities = normalizeCapabilities(rawCapabilities);
  const workflowState = verifyReadiness(rawState);
  if (!requestedSlices.includes(requestedSlice)) throw new Error("REQUESTED_SLICE_INVALID");
  if (!["build", "repair", "resume"].includes(mode)) throw new Error("ROUTE_MODE_INVALID");
  const requestedGate = requestedSlice === "local_preview" ? "frontend_code" : requestedSlice;
  const requestedStatus = workflowState.gates[requestedGate].status;
  const targetGate = ["ready", "in_progress"].includes(requestedStatus) ? requestedGate : workflowState.currentGate;
  const selected = routeForGate({ gate: targetGate, capabilities, mode });
  const skippedGates = notApplicableGates(capabilities);
  const workPackageGates = workflowState.configuration?.workPackage?.gates ?? [];
  const base = {
    targetGate,
    requestedSlice,
    skills: selected.skills,
    fixedModules: selected.fixedModules,
    notApplicableGates: skippedGates,
    continueWithoutConfirmation: workPackageGates.includes(targetGate),
    commerceArchitecture: selected.commerceArchitecture,
    externalActions: { git: false, aws: targetGate === "aws_release" && releaseIntent === true },
  };
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
