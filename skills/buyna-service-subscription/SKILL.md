---
name: buyna-service-subscription
description: "Connect or standardize BUYNA service subscriptions in an existing merchant backend using the official API and fixed module. Use for subscription panels, canonical reads, renewal/cancellation integration or staged merchant migration; not storefront customer payments or automatic production rollout."
---

# Buyna Service Subscription

Use one official subscription authority, with merchant-local UI and authenticated server adapters. Read [the API and release contract](references/api-and-release.md) before implementation.

## First Move

For reusable installation, read `shared-modules/README.md` and the reviewed
`shared-modules/registry.json`. Use `node shared-modules/cli.mjs install service-subscription --project PROJECT --version VERSION` with an explicit
version; never regenerate fixed UI logic or follow a remote `latest` pointer.
Verify the project lock before build. Installation is not payment activation or
deployment approval. Version 0.5.2 supports the merchant-subscription-v1
compatibility contract; historical releases retain their original rollout rules.

Use the same entrypoint with `verify`, `upgrade --version VERSION`, or `rollback`.
Installation and upgrade do not build or deploy. Never approve another project by
editing `validatedProjects` merely to pass a denied installation; first complete
identity/API compatibility and the separately authorized rollout acceptance.

For cloud component delivery, read `shared-modules/RELEASE-API.md`. A verified
merchant adapter may enroll in a project channel. Publishing an explicit version
updates design, copy and UI together on the next page load, without rebuilding
the merchant website. Keep enrollment separate from package compatibility.
Sanwa and BlueSequoia are enrolled; verify live channel state before publishing.
Never enroll additional merchants implicitly.
Backend changes require a coordinated compatible API release; the HTTP release
endpoint verifies prebuilt artifacts and is not a general remote build runner.

For updates to multiple already enrolled merchants, use
`shared-modules/release.mjs` and `shared-modules/BATCH-RELEASE.md`. Select explicit
projects and a version; do not regenerate merchant adapters or deploy each site.
The batch API requires a genuine EC acceptance receipt bound to the exact
delivery digest. Never manufacture that receipt from unit-test success alone.
Keep the request ID on retry; inspect partial results and use batch rollback.
Business dates, plans, payment authorization and data are outside channel writes.

Inspect the existing merchant resource record, trusted session/host identity, subscription adapter, module version and actual deployed official API. Do not infer project or shop identity from a domain or browser field. Consume unchanged evidence from an approved Builder work package; do not repeat its completed onboarding or resource inspection.

The module has a bounded official API and EC pilot release, not an all-merchant production release. Check current artifact evidence and live compatibility before enabling it for another merchant. Do not silently fall back to sample prices, CRM start dates or cached rights when the official API fails. Preserve a confirmed mutation response if revalidation fails, and recover ambiguous writes by reading before retrying.

## Fixed Workflow

1. Use `packages/buyna-service-subscription-core`: server snapshot projection and browser client. Keep provider credentials and the scoped service token on the merchant server.
2. Prepare project configuration with `scripts/plan-integration.mjs`. It validates configuration only, never grants authority, writes business data, sends mail, charges a card or deploys.
3. Add the merchant's authenticated same-origin read proxy. Proxy the official state API using a registered, server-owned identity. Reject unsupported tenants; do not expand the production allowlist without verified registration.
4. Render plans, amounts, service dates, authorization, next debit and billing from the returned snapshot. Unknown expiry means review and preserved existing rights, never an inferred three-month term or new debit.
5. For cancellation use fresh state, record version and request ID. Publish the returned snapshot then revalidate. Recover ambiguous results by reading state; never automatically issue a new payment or extend twice.
6. For checkout, extensions, admin edits and scheduled renewal, reuse the existing official payment services. A read/projection module is not a new billing engine. Do not activate any operation until its ledger, rights, schedule and audit transaction has been verified.
7. Verify the requested scope, record source/artifact digests and deploy only the approved pilot. Compare real state in official and merchant views; retain rollback. Other merchants and the new-site template are subsequent approved batches.

## Boundaries

- BUYNA subscription receipts are separate from the merchant's storefront revenue.
- No full card data, credentials or raw customer data in browser snapshots or events.
- Never enable enforcement, notification sends, auto-debits or new infrastructure merely by installing this Skill.
- Existing unknown terms remain `MIGRATION_REVIEW`; flags for enforcement and notifications default off.
- Change a paid-through date only through the verified atomic CRM expiry/schedule coordinator. Do not update a parallel display-only deadline. Do not blindly resubmit a provider-ambiguous renewal; only persisted unsubmitted claims may resume automatically.
- Browser focus/online and bounded polling currently revalidate external changes. They are not proof of real-time provider callback push or complete alert delivery.
- Execute only the requested connected steps. Reuse unchanged approved evidence and continue through them; stop at a real missing decision, expanded authority or immediate data/payment safety blocker.

## Validate

Run module tests and changed project tests. Verify tenant spoofing, stale versions, parallel requests, duplicated callbacks, month-end/6/12-month dates, pending versus paid, cancelled renewals, stale refresh responses, unknown legacy dates and read outages. Production acceptance additionally requires provider/user-owned payment tests, mail/PDF receipt, admin/scheduler reconciliation, migration dry run and actual rollback evidence.

Report local, deployed, browser-verified and provider-verified results separately. Installation or a configuration plan never means the merchant has subscribed.
