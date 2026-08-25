# Storefront Gallery Module Decision

## Decision

Defer a shared storefront gallery package. The bounded repository scan found
no runnable storefront gallery consumer, so a fixed module would currently be
an unproven shallow abstraction. Gallery state, markup, focus wiring, motion,
and styling remain generated project code in Batch 3.

The reusable candidates below are requirements to evaluate again only after
at least two real storefront consumers have independent behavior suites. They
are not implemented by this decision record.

```json decision-record
{
  "decision": "defer",
  "failedCriterion": "INSUFFICIENT_REAL_CONSUMERS",
  "runnableConsumers": 0,
  "candidateInvariants": [
    "index_bounds",
    "open_close",
    "previous_next",
    "escape_close",
    "focus_return",
    "reduced_motion"
  ],
  "deletionExercise": {
    "possible": false,
    "reason": "NO_TWO_CONSUMER_TEST_SUITES",
    "failedAssertions": []
  },
  "nonConsumers": [
    {
      "path": "packages/buyna-workflow-state-core/src/index.mjs",
      "reason": "workflow_gate_index"
    },
    {
      "path": "tests/website-builder-state-routing.test.mjs",
      "reason": "workflow_gate_index"
    },
    {
      "path": "tests/merchant-commerce-lifecycle-routing.test.mjs",
      "reason": "workflow_gate_index"
    },
    {
      "path": "tests/supporting-interaction-skill-contract.test.mjs",
      "reason": "generated_presentation_boundary_test"
    },
    {
      "path": "tests/supporting-interaction-state-routing.test.mjs",
      "reason": "deferred_module_route_assertion"
    },
    {
      "path": "tests/supporting-interaction-state-integration.test.mjs",
      "reason": "deferred_module_integration_guard"
    }
  ],
  "forbiddenImportsChecked": true,
  "visualFiles": []
}
```

## Evidence Boundary

The scan excludes Skills and architecture documents because requirement prose
is not a runnable consumer. It excludes this decision test itself so the test
cannot become self-evidence. Current matches are unrelated workflow gate
indexes named `currentIndex` or explicit tests that keep gallery presentation
project-generated and the deferred package out of routes. None is a runnable
storefront gallery consumer.

Reconsider the module only when deleting one candidate implementation would
break at least two independent real storefront consumer test suites.
