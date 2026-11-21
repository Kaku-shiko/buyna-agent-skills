# Selected Merchant Releases

The batch API changes only cloud channel pointers. It cannot change merchant
plans, service dates, payment credentials, invoices, or scheduled debits.
Frontend rollback does not reverse business transactions or database changes.

## Entry Point

Use the existing administrator session in `BUYNA_ADMIN_COOKIE`, never a URL or
command-line argument. The operator must be authenticated to the official API.

```powershell
node shared-modules/release.mjs preflight --version 0.5.10 --projects asuka-shop,medinance
node shared-modules/release.mjs publish --version 0.5.10 --projects asuka-shop,medinance --request-id <UUID>
node shared-modules/release.mjs status --batch-id <UUID>
node shared-modules/release.mjs rollback --batch-id <UUID> --request-id <NEW-UUID>
```

Publication runs preflight for every selected merchant before writing channels.
A failed merchant stops the remainder. Successful merchants are reported, not
presented as a globally atomic deployment. Retry the same immutable request to
recover after an interrupted response. Do not invent a new request ID for a
provider-ambiguous operation (these APIs never call payment providers).

## EC Gate

The trusted release runner must first store a real acceptance receipt at
`shared-modules/service-subscription/acceptance/ec/<version>.json`.
It must contain `project: ectecshop`, the exact version and SHA-256 of the
serialized delivery manifest, `status: PASSED`, an actual `checkedAt`,
`realCharges: 0`, and true checks for `identity`, `expiryPreserved`,
`renewalPreview`, `upgradePreview`, and `rollback`.

Uploading a package or passing unit tests is not EC browser acceptance. Never
create this receipt without those checks. The runtime has read-only access to
receipts; the HTTP API cannot approve its own release. A missing or mismatched
receipt returns `EC_ACCEPTANCE_REQUIRED` and writes no merchant channel.

## HTTP API

- POST `/api/admin/module-batches/preflight`: projects and explicit version.
- POST `/api/admin/module-batches`: additionally expectedDeploymentIds,
  requestId and confirm=true.
- GET `/api/admin/module-batches/<id>`: immutable batch plan and child IDs.
- POST `/api/admin/module-batches/rollback`: batchId, new requestId, confirm.

Existing single-merchant endpoints remain for recovery/compatibility. The batch
endpoint is the normal selected-merchant release path. Backend changes still
require a separately tested compatible deployment. No merchant follows an
unverified latest version automatically.
