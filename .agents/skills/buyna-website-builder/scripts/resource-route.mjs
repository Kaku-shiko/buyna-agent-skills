// Routing advice only; tool readiness and authorization remain runtime checks.
const stages = {
  design_and_structure: ['design-direction', 'section-selection'],
  frontend_code: ['component-resolution', 'build-preview'],
  dashboard_integration: ['existing-dashboard-components'],
  testing_upload_gate: ['interaction-and-visual-checks'],
};

export function resourceRoute(route) {
  if (route.action !== 'execute' || !Object.hasOwn(stages, route.targetGate)) return null;
  return {
    schemaVersion: 1,
    reference: 'references/component-resource-routing.md',
    steps: [...stages[route.targetGate]],
    policy: 'project-first-approved-registry',
    preserveExistingDesign: true,
    executionReadiness: 'verify-at-runtime',
    grantsExternalActions: false,
  };
}
