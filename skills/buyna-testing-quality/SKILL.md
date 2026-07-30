---
name: buyna-testing-quality
description: "Verify Buyna.ai websites before delivery or deployment. Use for build checks, backend tests, API behavior, permissions, data flows, UTF-8, responsive UI, payment boundaries, smoke tests, and evidence-backed readiness reporting."
---

# Buyna.ai Testing Quality

Check the real system and report evidence, not assumptions.

## Test Order

1. Build, type, lint, and migration checks.
2. Backend unit/API and permission checks.
3. Frontend loading, empty, success, and error states.
4. Main user journey with real backend data.
5. Mobile viewport, touch targets, overflow, and safe areas.
6. Secrets, seller isolation, payment verification, and audit records.

## Result Labels

Use only: planned, implemented, locally verified, staging verified, or production verified.

Do not call a payment live from a build result. Do not call a page usable without opening the relevant route and testing its actions.

## Output

List passed checks, failed checks, evidence, risks, and the smallest next fix.

Create or update automated test files for applicable behavior and report their
paths. Run the tests and record results. When a check can only be manual,
record why; a checklist without executed evidence is not delivery.
