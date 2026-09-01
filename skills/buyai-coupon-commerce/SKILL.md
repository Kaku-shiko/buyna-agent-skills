---
name: buyai-coupon-commerce
description: "Use when a Buyna.ai product or service checkout needs merchant coupon management, coupon codes, eligibility, reservation, redemption, release, or discount totals."
---

# Buyai Coupon Commerce

Use `packages/buyna-coupon-core` as the single fixed coupon behavior authority.
Read [the Adapter contract](references/coupon-adapter-contract.md) before
project persistence or API work.

## Route

- Require persisted `requiresCoupons=true`; otherwise return without adding
  coupon work and keep the ordinary checkout route unchanged.
- Resolve server-owned `projectId + sellerId`, then create one project Store
  Adapter. Do not accept ownership from browser fields.
- Call the fixed core for draft/active/paused/archived management and
  quote/reserve/redeem/release checkout behavior. Do not regenerate discount,
  eligibility, usage-limit, money, transition, or idempotency rules.
- Put the core's immutable payable amount in the locked checkout snapshot.
  Trusted settlement redeems exactly once; failed, expired, or cancelled
  checkout releases exactly once.
- Generate project API routes, persistence Adapter, localized copy, markup,
  components, and styles only.

When the Website Builder invokes this Skill, inherit its persisted capability,
interaction mode, bounded work package, and `executionCheckReceipt`. Reuse
module and package-test evidence for the same package source digest; do not
rerun unchanged `buyna-coupon-core` tests. Return evidence to the Builder;
do not reopen approved design, ask the same implementation confirmation, or
reinvoke sibling Skills already present in the Builder route.

Standalone invocation performs the required capability/module checks once and
creates equivalent local evidence without claiming Builder authorization.

## Visual Boundary

The fixed program may drive coupon states, validation, dialog/drawer behavior,
and semantic status data. The approved project design owns colors, fonts,
spacing, shell, components, page composition, transitions, responsive visual
treatment, and CSS. There is no shared coupon or Dashboard skin.

## Verify

Run `npm test --prefix packages/buyna-coupon-core` only when the receipt has no
PASS for the current package source digest. Always run the changed project Adapter,
checkout, settlement, refresh, permission, and retry tests. A visible discount
alone is not proof of a saved reservation or trusted redemption.
