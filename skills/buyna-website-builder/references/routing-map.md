# Website Skill Routing Map

Use the smallest set of skills needed for the current approved phase.

This is the canonical execution order, not a list to run in one turn:

1. Customer information: `buyna-customer-intake`.
2. Design direction: `buyna-website-design`.
3. Desktop/mobile pages and content: `buyna-page-structure`.
4. Technical foundation: `buyna-project-framework`.
5. Business branch:
   - static/company site: skip merchant Skills;
   - product commerce: enter `buyai-merchant-builder`, then select product;
   - booking/service: enter `buyai-merchant-builder`, then select booking;
   - mixed commerce: enter `buyai-merchant-builder` and record both domains.
6. Frontend prototype: call `buyna-frontend-builder` in prototype mode.
   Complete the approved public pages for every site and, for merchant
   projects, the merchant Dashboard management interface with desktop/mobile
   interactions, explicit mock data, and a written API contract.
7. Data and storage foundations, only when required:
   - structured data: `buyna-aws-data-layer`;
   - files/images: `buyna-s3-storage`.
8. Domain backend:
   - product: `buyai-product-merchant-backend`;
   - booking/service: `buyai-booking-service-backend`;
   - mixed: complete each domain separately.
9. Commerce input and payment, only when required:
   - buyer/customer forms: `buyai-checkout-address-ux`;
   - payment: `buyai-globepay-payment` and only the subskill it selects.
10. Frontend/API integration: call `buyna-frontend-builder` in integration
    mode to replace mock data with approved APIs; add
    `buyai-storefront-layout-ux` for storefront usability.
11. Verification: `buyna-testing-quality`.
12. AWS release: `buyna-aws-release`; it may call `aws-project-deployer` only
    for approved live AWS operations.

Do not call every skill for every request. Finish one phase, emit
`PHASE_STATUS: WAITING_FOR_USER_CONFIRMATION`, and stop. Route forward only
after explicit approval in a later user message.
