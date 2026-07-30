# Website Skill Routing Map

Use the smallest set of skills needed for the current approved phase.

This is the canonical execution order, not a list to run in one turn:

1. Customer information: `buyna-customer-intake`.
2. Design direction and frontend framework: `buyna-website-design`.
3. Desktop/mobile pages and content: `buyna-page-structure`.
4. Frontend and merchant Dashboard code: call `buyna-frontend-builder`
   in frontend code mode. Implement the approved public pages as runnable
   project source code for every site. For a
   merchant site, use `buyai-merchant-builder` only to confirm product,
   booking/service, or mixed scope, then complete the corresponding merchant
   Dashboard with desktop/mobile interactions, explicit mock data, a written
   API contract, and passed frontend build/type checks.
5. Post-frontend technical foundation: only after the frontend code completion
   record is approved, call `buyna-project-framework` to preserve the frontend
   stack and deliver backend/data/storage/environment configuration.
6. Data and storage foundations, only when required:
   - structured data: `buyna-aws-data-layer`;
   - files/images: `buyna-s3-storage`.
7. Domain backend:
   - product: `buyai-product-merchant-backend`;
   - booking/service: `buyai-booking-service-backend`;
   - mixed: complete each domain separately.
8. Commerce input and payment, only when required:
   - buyer/customer forms: `buyai-checkout-address-ux`;
   - payment: `buyai-globepay-payment` and only the subskill it selects.
9. Frontend/API integration: call `buyna-frontend-builder` in integration
    mode to replace mock data with approved APIs; add
    `buyai-storefront-layout-ux` for storefront usability.
10. Verification: `buyna-testing-quality`.
11. AWS release: `buyna-aws-release`; it may call `aws-project-deployer` only
    for approved live AWS operations.

For Steps 4-11, every routed Skill must save real project files, run applicable
verification, and return the delivery record defined in
`code-delivery-standard.md`. A plan or description does not unlock the next
step.

Do not call every skill for every request. Finish one phase, emit
`PHASE_STATUS: WAITING_FOR_USER_CONFIRMATION`, and stop. Route forward only
after explicit approval in a later user message.
