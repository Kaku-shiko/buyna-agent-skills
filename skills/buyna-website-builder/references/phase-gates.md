# Website Assistant Phase Gates

Use these minimum completion conditions. Ask one question at a time.

## Phase 1: Customer Information

Require a recorded answer or explicit deferral for:

- website type;
- primary and additional languages;
- company or brand name and address;
- public price display, currency, and price source;
- logo, company introduction, product or service information, media, and
  reference links.

Allow unavailable materials only when the user explicitly chooses
`之后补全`. Then present the complete customer-information record for approval.

## Phase 2: Website Design

Require:

- frontend preference or design-compatible framework recommendation;
- visual direction, colors, typography, and UI/UX feeling;
- motion-library decision;
- at least one reference website/template, or explicit `无参考`;
- design-system image or an explicit request to postpone it.

Present the design record and available visual output for approval.

## Phase 3: Page Structure

Require:

- header, navigation, hero, main sections, calls to action, and footer;
- desktop and mobile structure;
- required business pages;
- privacy-policy placement and other applicable policy pages;
- product/service content and admin-data dependencies.

Present one desktop/mobile structure record for approval.

## Phase 4: Frontend And Merchant Dashboard Prototype

Require complete, reviewable public pages for every site and merchant Dashboard
management interfaces for merchant projects, on desktop and mobile. Include
approved navigation, page layouts, forms, tables, actions,
loading/empty/error/permission states, and interactions.
Use clearly marked mock data and record the required API contract. Do not claim
that mock actions persist or connect to production.

For a merchant site, require one explicit scope choice: product,
booking/service, or mixed. Use `buyai-merchant-builder` only for this routing
decision before building the corresponding Dashboard.

## Phase 5: Project Framework

Require an inspected or approved frontend, backend, database, storage,
environment, build/start, migration, test, and release decision based on the
approved Phase 4 interface. Do not force a framework or silently override the
approved design direction.

## Phase 6: Data And Storage

Require approved schemas/migrations for structured data and approved S3
ownership/upload rules for files. Mark either branch `不适用` when it is not
needed.

## Phase 7: Domain Backend

Require real project implementation and verification for the selected product
or booking/service domain. Complete mixed domains one at a time.

## Phase 8: Commerce Input And Payment

Require approved buyer/customer fields before payment. When payment applies,
require a local pending record and server-side verified status flow. Mark this
phase `不适用` for sites without commerce.

## Phase 9: Frontend Integration

Require real project files, approved API contracts, and loading, empty, error,
permission, desktop, and mobile behavior. Replace Phase 4 mock data and verify
that merchant actions persist through the real backend. A visual mockup is not
API integration.

## Phase 10: Testing

Require recorded checks and evidence. Do not promote planned or implemented
work to verified status without running the applicable checks.

## Phase 11: Release

Require an approved target, migration plan, secrets plan, cost/risk preview,
rollback path, and live verification evidence. Never treat a prepared plan as
a deployed or production-verified result.
