---
name: buyna-testing-quality
description: "Run Buyna.ai fast-release or explicitly requested full verification. Use for minimum release safety, build and health evidence, tenant isolation, optional exhaustive testing, and evidence-backed readiness reporting."
---

# Buyna.ai Testing Quality

Check the real system and report evidence, not assumptions.

## Verification Modes

Use `FAST_RELEASE` by default. Use `FULL_VERIFICATION` only when the user
explicitly requests complete verification, says `要完整验证`, or the current
task is specifically a quality audit rather than a normal release.

### FAST_RELEASE (default)

Run only the checks needed to publish safely and prove basic operability:

1. A runtime artifact exists, contains no secret/local environment file,
   `node_modules`, cache, or obvious development-only content, and its normal
   build/start command succeeds.
2. The release uses the registered target and approved architecture; it does
   not invent a resource, database, Bucket, or port.
3. Authentication and tenant isolation protect applicable writes using the
   server-owned `project_id + seller_id` context.
4. The homepage or primary route and one critical API/route return healthy
   results after deployment.
5. A concrete rollback version, command, or path exists before traffic changes.

Record `FAST_RELEASE: PASS` when those checks pass. Do not require a clean
dependency reinstall, exhaustive package size report, top-20 listing, image
size review, duplicate assets scan, unused font/template/package audit, full
mobile/cross-browser regression, performance test, or complete payment journey
in this default mode. Record applicable unrun checks as `DEFERRED`; they do not
block the website release.

When the user will test payment, record
`PAYMENT_VERIFICATION: USER_OWNED_PENDING`. This does not block the website
release, but the result must not call payment live, verified, or usable. Keep
payment disabled or visibly unverified until trusted notify/query and exact
amount/currency evidence is available.

### FULL_VERIFICATION (explicit only)

Run the applicable fixed-module and project tests, build/type/lint/migration
checks, backend/API/permission cases, frontend states, desktop/mobile and
cross-browser journeys, payment success/failure and refund boundaries,
performance checks, and the complete package size and duplicate assets audit.
This mode may block its own `FULL_VERIFICATION: PASS` result, but an optional
full audit must not be silently promoted into the normal release gate.

## Result Labels

Use only: planned, implemented, locally verified, staging verified, or production verified.

Do not call a payment live from a build result. Do not call a page usable without opening the relevant route and testing its actions.

## Output

List passed checks, failed checks, evidence, risks, and the smallest next fix.
For `FAST_RELEASE`, report the artifact path, build/start evidence, target,
health, rollback, payment verification ownership, and `DEFERRED` items. For
`FULL_VERIFICATION`, also report the complete test and package-audit evidence.

Create or update automated test files for applicable behavior and report their
paths. Run the tests and record results. When a check can only be manual,
record why; a checklist without executed evidence is not delivery.
