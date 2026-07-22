# Website Skill Routing Map

Use the smallest set of skills needed for the current phase.

1. Customer information collection: `buyna-customer-intake`.
2. Website design confirmation: `buyna-website-design`.
3. Foundation and architecture: `buyna-project-framework`.
4. Public/admin frontend: `buyna-frontend-builder`, then `buyai-storefront-layout-ux` when storefront UX applies.
5. AWS database and migrations: `buyna-aws-data-layer`.
6. Images and files: `buyna-s3-storage`.
7. Product commerce and its backend: `buyai-product-merchant-backend`.
8. Booking/service commerce and its backend: `buyai-booking-service-backend`.
9. Broad merchant backend coordination: `buyai-merchant-builder`.
10. Buyer forms: `buyai-checkout-address-ux`.
11. GlobePay: `buyai-globepay-payment` and the subskill it selects.
12. Verification: `buyna-testing-quality`.
13. AWS release: `buyna-aws-release`, which may use `aws-project-deployer` for live AWS operations.

Do not call every skill for every request. Finish and verify one phase before starting the next.
