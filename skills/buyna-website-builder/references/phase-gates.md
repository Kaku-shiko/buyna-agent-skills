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

- one approved frontend development framework and its version/rationale;
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

## Phase 4: Frontend And Merchant Dashboard Code

Require complete, reviewable, runnable frontend source code for every approved
public page and, for merchant projects, the merchant Dashboard management
interfaces. Include actual routes/components, desktop and mobile layouts,
approved navigation, forms, tables, actions, loading/empty/error/permission
states, and interactions. Use clearly marked mock data and record the required
API contract. Run the applicable frontend build and type checks. Do not claim
that mock actions persist or connect to production.

This phase owns Dashboard UI code only. Do not implement real authentication,
authorization, persistence, database, storage, inventory/capacity, order,
payment, or other backend business rules. Represent those needs in the API
contract and mock adapter.

A design-system image, wireframe, static screenshot, written specification, or
unbuilt code fragment does not complete this phase. Record the implemented
project paths, verification commands/results, API contract location, and user
approval as the frontend code completion record.

For a merchant site, require one explicit scope choice: product,
booking/service, or mixed. Use `buyai-merchant-builder` only for this routing
decision before building the corresponding Dashboard.

For a product merchant, require an approved six-page Dashboard UI record before
coding: 仪表盘, 商品管理, 分类管理, 订单, 付费客户, 支付设置. Apply the approved
website design system and define desktop/mobile navigation.

Phases 5-9 remain locked until this frontend code completion record is
approved. If it is absent or incomplete, return to Phase 4 and do not start
framework establishment, data/storage implementation, domain backend, or
payment work.

## Phase 5: Dashboard Data Interaction Foundation

Call `buyai-dashboard-data-interaction` as the coordinator for Phases 5-9. It
must route only the current approved delivery slice and stop for approval.

Preserve the frontend framework approved in Phase 2 and used in Phase 4.
Require inspected or approved backend, database, storage, environment,
build/start, migration, test, and release decisions. Deliver the required
project structure, configuration, environment example, and runnable commands
in real project files. Do not reselect or migrate the frontend framework here.
A backend-stack recommendation alone does not complete this phase. Establish an
executable server/API boundary so the next data, storage, and domain slices can
implement the approved contract.

Phase 5 must also deliver real frontend source changes for the current
Dashboard interaction slice: typed request/response contracts, an API client or
repository adapter boundary, environment-safe endpoint configuration, and the
approved loading/error wiring. Keep business data mocked until the matching
real endpoint is verified. Run frontend build/type checks and report the
changed frontend paths. Phase 5 fails when it delivers only backend,
configuration, folders, or documentation.

## Phase 6: Data And Storage

Require approved schemas/migrations for structured data and approved S3
ownership/upload rules for files. Deliver executable migrations/schema and/or
storage integration code, plus verification evidence. Mark either branch
`NOT_APPLICABLE` when it is not needed.

## Phase 7: Domain Backend

Require real project implementation and verification for the selected product
or booking/service domain. Before any backend implementation, recheck the
approved Phase 4 frontend code completion record and its API contract. If
either is missing, stop and return to Phase 4. Complete mixed domains one at a
time. Deliver backend source, APIs, authorization/ownership code, migrations
used by the domain, and applicable automated tests.

Implement behavior behind the approved API contract without silently changing
the Dashboard UI. If the contract or interface must change, stop and return a
focused change request to Phase 4 for user approval.

## Phase 8: Commerce Input And Payment

Require approved buyer/customer fields before payment. When payment applies,
require a local pending record and server-side verified status flow. Mark this
phase `NOT_APPLICABLE` for sites without commerce. Deliver buyer-form code,
server-side payment code, persistence changes, and applicable tests; provider
documentation or configuration text alone is insufficient.

## Phase 9: Frontend Integration

Require real project files, approved API contracts, and loading, empty, error,
permission, desktop, and mobile behavior. Replace Phase 4 mock data and verify
that merchant actions persist through the real backend. A visual mockup is not
API integration. Deliver the changed frontend integration files and
verification of public/admin synchronization.

This phase completes the Dashboard data-interaction sequence. Replace mock
adapters one verified page or interaction slice at a time; do not leave
disconnected demo actions while claiming completion.

## Phase 10: Testing

Require new or updated automated test files when applicable, plus recorded
commands and evidence. Do not promote planned or implemented work to verified
status without running the applicable checks. Manual checks supplement rather
than replace applicable test code.

Run the `buyna-testing-quality` pre-upload package gate. Require an executed
size report, largest-file/directory list, source-versus-runtime package
classification, verified exclusions, dependency restore command, build
command, and a `PASS` result. A package containing dependencies, generated
build/cache directories, local environment files, unexplained oversized
assets, or unnecessary runtime content cannot complete this phase.

## Phase 11: Release

Require an approved target, migration plan, secrets plan, cost/risk preview,
rollback path, and live verification evidence. Deliver required deployment,
infrastructure, or environment configuration files without secrets. Never
treat a prepared plan as a deployed or production-verified result. Upload only
the approved runtime artifact and block release when the Phase 10 pre-upload
package gate is missing or failed.
