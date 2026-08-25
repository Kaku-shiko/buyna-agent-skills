---
name: buyna-website-builder
description: "Use when starting, continuing, or repairing a Buyna.ai static, product, booking, Dashboard, checkout, payment, testing, or release website project."
---

# Buyna.ai Website Builder

This is the single team entrypoint. `packages/buyna-workflow-state-core` owns
workflow state and `scripts/route-builder.mjs` deterministically selects the
minimum ready Skills and fixed modules. Project code owns Adapters,
configuration, framework wiring, and visual presentation.

## Start Or Resume

- New build: create/load the workflow and begin at `customer_intake`.
- Repair or resume: load the existing workflow first. When verifiable delivery
  and approval records are supplied for missing history, call
  `importVerifiedHistory` once, persist its event batch, recompute readiness,
  and enter the requested ready slice directly.
- Completed/deployed repair: when `currentGate=null`, run the router in `repair`
  mode. On `reopen_repair`, authorize one bounded repair scope through
  `openRepairSlice`, persist the transition, and rerun the router. The repair
  slice is separate; canonical completed gates and release evidence stay intact.
- Chat statements identify evidence to inspect; the workflow advances from the
  verified records returned to the import Interface.

Default presentation is `team`. Use `developer` only when the user requests
commands, resource identifiers, internal status codes, or detailed technical
evidence. Read [interaction modes](references/interaction-modes.md).

## Execution Recipe

1. Resolve the project installation, then the user installation. Load
   `repository-manifest.json`, `buyna-workflow-state-core`, and the saved state.
2. For repair/resume, import supplied verifiable missing history through
   `importVerifiedHistory`; if a required record is unavailable, request one
   grouped evidence input.
3. Run `scripts/route-builder.mjs` with recorded capabilities, the loaded
   readiness/evidence state, requested slice, release intent, and
   `build | repair | resume` mode.
   When it returns `reopen_repair`, record the separately authorized repair
   slice with `openRepairSlice` and run the same input against the new state.
4. Treat the script output as routing authority. Read
   [routing-map.md](references/routing-map.md), the selected phase reference,
   and only the returned child Skills.
5. Verify every returned fixed module in the manifest and installed package
   root. Generate only project Adapters, configuration, framework wiring,
   presentation, and missing project code.
6. Run the returned fixed-module tests and minimum applicable project tests.
7. Persist delivery evidence through the workflow core. If
   an `activeRepair` is ready, validate and close it through
   `completeRepairSlice`; canonical completed gates remain unchanged. Otherwise, if
   `continueWithoutConfirmation=true`, call `completeAuthorizedGate` and
   continue to the next ready included gate. Otherwise render the current
   decision point once.

The routing script accepts JSON on stdin and returns JSON on stdout:

```powershell
node skills/buyna-website-builder/scripts/route-builder.mjs < route-input.json
```

## Fixed Versus Project-Owned

- `buyna-workflow-state-core`: gate state, approvals, work packages, verified
  history import.
- `buyna-cart-core` and `buyna-order-core`: product cart/order behavior.
- `buyna-checkout-flow-core`: minimum fields, method selection, review,
  submission, snapshot, and local order lock.
- `buyna-commerce-settlement-core`: trusted result reconciliation, legal
  paid/refund transitions, idempotency, and transactional effects.
- Project: database/provider Adapters, routes, labels, pricing configuration,
  forms, components, theme, layout, CSS, and other presentation.

Payment-capable new builds use the fixed checkout core, GlobePay transport and
verification Adapters, then the settlement core. Every new-path request carries
server-owned `projectId + sellerId`; settlement reconciles exact order, amount,
and currency before applying effects. Payment-capable intake records one
explicit supported architecture: `fixed-cores` for this new path or
`legacy-globepay-service` for an already recorded legacy project. An omitted or
unknown architecture is a blocker, not an implicit legacy selection.

## Approvals And External Actions

Explicit approval remains required for customer scope, combined
design/structure, production release or traffic switching, paid activation,
new cost, destructive work, and scope expansion.

After design approval, one bounded work package may include `frontend_code`,
`dashboard_integration`, `checkout_payment`, and `testing_upload_gate`. Each
gate still validates delivery evidence, while ready included gates continue
without repeated confirmation.

Local preview runs in the current checkout/project. GitHub is selected only for
an approved repository publication/contribution request. AWS is selected only
for an approved `aws_release` or infrastructure request with explicit release
intent.

## Response And Delivery

After each state load/mode change, call `getInteractionPolicy({state})`.
Child Skills return structured evidence to this Builder.

In team mode show `当前步骤`, `状态`, `已经完成`, `需要你操作`, and `下一步`.
Show `确认并进入下一步 / 需要修改 / 暂停` at a real decision point. For code
gates report `DELIVERED_FILES`, `IMPLEMENTED_SCOPE`, `VERIFICATION`,
`NOT_CONNECTED`, and `PHASE_RESULT`.

Secrets stay outside chat, frontend code, project files, and Skill files.
Local preview is local evidence, while production delivery requires the
separate release gate.
