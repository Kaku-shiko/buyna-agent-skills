---
name: buyna-testing-quality
description: "Verify Buyna.ai websites before delivery or deployment. Use for build checks, backend tests, API behavior, permissions, data flows, UTF-8, responsive UI, payment boundaries, upload-package size and hygiene, smoke tests, and evidence-backed readiness reporting."
---

# Buyna.ai Testing Quality

Check the real system and report evidence, not assumptions.

## Test Order

1. For product commerce, verify the six fixed modules exist and run their
   package tests before project integration tests. A missing core is
   `BLOCKED: FIXED_COMMERCE_MODULES_NOT_INSTALLED`, not permission to regenerate
   it.
2. Build, type, lint, and migration checks.
3. Backend unit/API and permission checks.
4. Frontend loading, empty, success, and error states.
5. Main user journey with real backend data.
6. Mobile viewport, touch targets, overflow, and safe areas.
7. Secrets, seller isolation, payment verification, and audit records.
8. Source-delivery and deployment-package size/hygiene checks.

## Pre-Upload Package Gate

Before any Git handoff, archive delivery, or AWS upload:

1. Identify whether the target is a source package or a runtime deployment
   artifact. Never combine them by default.
2. Measure total size and list the 20 largest files and directories.
3. Exclude dependencies and generated or local-only content from source
   delivery: `node_modules`, build outputs such as `.next`, `dist`, `.output`,
   caches, coverage, logs, temporary exports, local environment files, and
   editor metadata.
4. Keep lockfiles and dependency manifests so another developer can restore
   dependencies with the documented package-manager command.
5. Exclude tests, documentation, development-only assets, and source maps from
   the runtime artifact unless the approved runtime requires them.
6. Compress website images and move large video or downloadable media to the
   approved S3 delivery path. Flag every image over 1 MB and every repository
   file over 10 MB for explicit review; do not silently delete source media.
7. Detect duplicate assets, unused fonts, unused templates, and unused UI,
   icon, or animation packages. Remove them only when verified unused.
8. Verify ignore/package rules and build configuration, then rebuild the
   runtime artifact from a clean dependency install when practical.

Fail this gate when forbidden local/generated directories enter a source
package, secrets are present, unexplained oversized files remain, the runtime
artifact contains unnecessary development content, or no executed size report
exists. Do not upload while the gate is failed.

## Result Labels

Use only: planned, implemented, locally verified, staging verified, or production verified.

Do not call a payment live from a build result. Do not call a page usable without opening the relevant route and testing its actions.

## Output

List passed checks, failed checks, evidence, risks, and the smallest next fix.
For the pre-upload gate, also report the package type, total size, largest
items, exclusions applied, dependency restore command, build command, runtime
artifact path, and `PASS` or `FAIL`.

Create or update automated test files for applicable behavior and report their
paths. Run the tests and record results. When a check can only be manual,
record why; a checklist without executed evidence is not delivery.
