# Execution Check Policy

The Builder performs reusable static checks once for one approved execution
slice. Child Skills consume the resulting `executionCheckReceipt`; they do not
turn the same evidence into another gate or confirmation.

## Receipt

Create the receipt only from the verified workflow state, routing output,
repository manifest, installed files, and applicable resource evidence. A chat
claim or browser field cannot create or modify it.

```json
{
  "workflowRevision": 1,
  "projectId": "project-id",
  "sellerId": "seller-id",
  "gate": "dashboard_integration",
  "slice": "products",
  "frontendContractDigest": "sha256",
  "manifestDigest": "sha256",
  "resourceEvidenceDigest": "sha256-or-null",
  "fixedModules": [],
  "testEvidence": [{"package":"name","packageSourceDigest":"sha256","result":"PASS"}]
}
```

The receipt is evidence reuse, not new authorization. A check is not a confirmation.
The approved work package continues to control implementation;
production release, paid activation, new cost, destructive work, and scope
expansion retain their existing explicit authorization.

## Reuse

- Reuse frontend/API approval while `frontendContractDigest` is unchanged.
- Reuse fixed-module presence while `manifestDigest` and the selected module
  set are unchanged.
- Reuse resource inspection while `projectId`, `sellerId`, architecture, and
  `resourceEvidenceDigest` are unchanged.
- Reuse a passing package test only for the same package source digest.
- When a child finds missing or inconsistent receipt evidence, return one
  structured missing-evidence result to the Builder. Do not run a second gate
  or ask the user again.

Invalidate only the affected receipt field after a scope expansion, owner or
host binding change, frontend/API contract change, selected-module change,
resource-record change, or package source digest change. Unchanged evidence is
reused across selected child Skills and consecutive gates in the same approved
work package.

## Checks That Stay Fresh

- Every protected request obtains fresh trusted auth and resolves the current
  server-observed host into a request-local merchant context.
- Every changed migration is validated before execution; destructive execution
  still needs its backup and rollback authorization.
- Every changed runtime artifact receives the default `FAST_RELEASE` checks.
- Payment may be called live only from trusted provider verification with exact
  local order, amount, currency, and idempotency evidence.

## Immediate Blockers

Only these classes interrupt an already approved implementation slice:

- `SECRET_EXPOSURE`
- `TENANT_WRITE_ISOLATION`
- `UNREGISTERED_OR_NEW_COST_TARGET`
- `DESTRUCTIVE_CHANGE_WITHOUT_ROLLBACK`
- `UNVERIFIED_PAYMENT_LIVE_CLAIM`

All other checks are automatic evidence collection or `DEFERRED`. `DEFERRED`
work does not create another confirmation, approval, or stop an otherwise
executable slice. Record it once and continue the authorized work.

## Standalone Invocation

A child Skill invoked outside the Builder performs only the checks required for
its requested action, once. It may construct equivalent local evidence for the
current run, but it must not imply a work-package approval or production
release authorization.
