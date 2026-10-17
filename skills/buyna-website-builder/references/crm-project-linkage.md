# CRM linkage in website delivery

## Identity and ownership

Record the approved CRM customer ID separately from project ID, seller ID and shop ID. A customer may own multiple projects. Reuse the registered project identity; never infer ownership from company name, email or domain. Preserve an existing binding and stop only on an actual conflicting owner. Internal test customers use a distinct record category excluded from commercial customer and revenue statistics.

## Connected workflow

1. During intake, resolve the existing CRM customer and project association through the trusted official CRM adapter. Capture the approved customer ID in project delivery evidence. A missing owner requires a real ownership decision; do not create a guessed association.
2. During provisioning, register the association using a conditional, idempotent server-side write. Record customer ID, project ID, seller ID, shop ID, primary domain, admin URL, category, binding version, operator, reason and timestamp. Persist an audit event atomically. Repeat the same request safely; reject reassignment or duplicate ownership.
3. During subscription integration, read the official canonical subscription using the verified project scope. CRM is the ownership and operations entrypoint; payment/service dates remain owned by the official subscription service. Website creation does not establish payment, a three-month term, automatic debit authorization or enforcement.
4. During release, append the actual repository revision/artifact digest, deployed module version, release timestamp and rollback reference to the project's delivery evidence. Re-read CRM and the merchant API to verify matching identities. Do not mark linkage complete from a local configuration file alone.
5. On a failed or ambiguous write, read the association before retrying with the same request ID. Keep customer rights and paid dates intact. Unknown legacy periods remain pending review.

## Adapter availability and completion

Inspect the currently deployed CRM adapter before execution. There is not yet a universal production provisioning-to-CRM registration API. Do not invent an endpoint or represent installing this Skill as automatic registration. Where the requested bounded integration has an approved project-specific adapter, execute and verify that adapter; otherwise implement the missing adapter within the authorized project work and report its actual deployment status.

Acceptance evidence must contain the persisted CRM association, canonical subscription identity, statistics exclusion for internal tests, duplicate-write behavior, and the actual delivery version. Keep real customer records and credentials out of the public Skill repository.

