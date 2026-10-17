---
name: buyna-pwa
description: "Add, repair or retire installable PWA capabilities on an existing Buyna website: branded manifest/icons, installation guidance, public offline fallback and safe updates. Use for explicit PWA or home-screen installation requests and paid capability planning; not ordinary responsive design, native apps or automatic billing activation."
---

# Buyna PWA

Deliver an installable website using its existing application, authentication,
hosting and release process. Keep branding and business data project-local.

## First move

Inspect the frontend/build, HTTPS/base path, manifest, registered workers, cache
namespaces, protected routes, draft/upload state and subscription authority.
Separate requested scope from verified production behavior. Do not copy another
merchant's domains, assets, accounts, billing state or infrastructure.

## Workflow

1. Record approved project configuration: stable app ID, name, start URL, scope,
   brand assets/colors, languages, installation entry, public cache allowlist and
   update behavior. Default scope is installation, public offline notice and safe
   updates. Push, offline business writes and app-store/native packaging are separate.
2. Read [implementation.md](references/implementation.md). Reuse existing framework
   integration; do not register a competing worker. Preserve normal browser access.
3. For a paid capability, read [commercial.md](references/commercial.md). Separate
   the offer, server-owned entitlement and technical readiness. Do not choose
   prices, Basic/Pro membership or activate billing. Record missing commercial
   decisions without blocking authorized local implementation.
4. Verify the acceptance matrix below. Use buyna-testing-quality and
   buyna-aws-release for an authorized Buyna release. Execute all connected steps
   in the approved work package, reuse unchanged evidence and avoid repeated
   approvals. Do not add unrequested features. Stop only for a real missing
   decision, expanded scope/authority, unapproved external mutation or immediate
   security, data-loss, payment or execution blocker; report the resolving action.

## Acceptance

- Validate manifest/icon URLs, MIME, stable identity and scope under the hosted path.
- Test available/unavailable install prompt, dismissal, already-installed state,
  manual instructions, dialog focus/keyboard, mobile viewport and safe areas.
- Offline navigation shows only the public fallback. API/auth/order/payment,
  private HTML, uploads/downloads and signed/query URLs never enter worker caches.
- Logout, expiry and account switching preserve access controls. Reconnection
  revalidates protected state without replaying a business write.
- Test a waiting update with two tabs, dirty forms, pending upload and a failed save;
  no forced activation/reload or lost draft.
- Corrupt assets, wrong MIME, registration failure and partial installation preserve
  online service. Retirement removes only this application's worker/cache scope.
- For actual entitlement integration, test tenant spoofing, duplicate/out-of-order
  events, expiry, renewal and cancellation against the approved billing contract.
  A written contract is not proof that these tests passed.

## Delivery

Report changed files, resolved configuration, implemented capabilities, entitlement
integration status, tested browser/device matrix, release/rollback evidence and
unverified items. Distinguish local, deployed, browser-verified and real-device-
verified. A Skill installation is not activation of a customer's paid service.
