# Website Skill Routing Map

Use only the current approved phase:

1. Customer information → `buyna-customer-intake`
2. Design → `buyna-website-design`
3. Page structure → `buyna-page-structure`
4. Frontend and Dashboard UI → `buyna-frontend-builder` UI mode
5. Dashboard functional integration → `buyai-dashboard-data-interaction`, which selects existing-resource, merchant file layout/lifecycle, product/service, and frontend integration Skills for one slice
6. Checkout/payment → `buyai-checkout-address-ux`, `buyai-globepay-payment`, and `buyna-gmv-commerce`; add `buyai-coupon-mobile-checkout` only when the approved product checkout uses coupons, or use `NOT_APPLICABLE`
7. Testing/upload gate → `buyna-testing-quality`
8. AWS release → `buyna-aws-release`

Do not call every Skill. Code phases require real files, applicable verification, a delivery record, and explicit later approval.

The merchant file module belongs only to Phase 5: create a new local merchant
layout through `buyna-merchant-onboarding`; route approved file/image actions to
`buyna-s3-storage`. Phase 4 must not provision storage or persistence.
