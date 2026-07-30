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
   API contract, and passed frontend build/type checks. Do not implement real
   Dashboard business logic in this step.
5. Dashboard data-interaction foundation: immediately after the Dashboard UI
   code record is approved, call `buyai-dashboard-data-interaction`. It routes
   the current slice to `buyna-project-framework` for an executable server/API
   foundation.
6. Data and storage interaction, only when required:
   - structured data: `buyna-aws-data-layer`;
   - files/images: `buyna-s3-storage`.
7. Domain API and business interaction:
   - product: `buyai-product-merchant-backend`;
   - booking/service: `buyai-booking-service-backend`;
   - mixed: complete each domain separately.
   Implement logic behind the approved Dashboard contract without redesigning
   its UI.
8. Commerce input and payment, only when required:
   - buyer/customer forms: `buyai-checkout-address-ux`;
   - payment: `buyai-globepay-payment` and only the subskill it selects.
9. Complete frontend/API data interaction: call `buyna-frontend-builder` in
    integration mode through `buyai-dashboard-data-interaction` to replace mock
    adapters with verified APIs; add
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
