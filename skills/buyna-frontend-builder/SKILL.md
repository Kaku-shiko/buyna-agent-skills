---
name: buyna-frontend-builder
description: "Build or repair Buyna.ai public and merchant-admin frontends using the approved project framework. Use in Phase 4 UI mode for runnable desktop/mobile interfaces with mock adapters and API contracts, or within Phase 5 integration slices for real API connectivity."
---

# Buyna.ai Frontend Builder

Build the approved public frontend and merchant Dashboard in one of two explicit
modes. Never mix the completion claims of the two modes.

Resolve fixed modules from the current project `packages/` first, then the user
installation at `$env:USERPROFILE/.codex/packages/`. For a product merchant,
stop with `BLOCKED: FIXED_COMMERCE_MODULES_NOT_INSTALLED` instead of
regenerating a missing Dashboard, catalog, cart, order, PostgreSQL, or file
core.

## Frontend Code Mode: Phase 4

1. Read the approved customer record, the complete output from `buyna-website-design`, and the approved page/content plan from `buyna-page-structure`.
   For a product merchant Dashboard, read
   `references/product-merchant-dashboard-ui.md` and
   `references/merchant-dashboard-fixed-ui.md`.
2. Inspect existing routes/components and preserve approved project patterns.
3. Before Dashboard coding, present its navigation, page composition,
   desktop/mobile behavior, and inherited design system for explicit approval.
4. Implement the public pages and merchant Dashboard as actual runnable project source code, including navigation, dashboard, lists, details, forms, tables, actions, settings, loading, empty, success, validation, permission, and failure states required by the approved scope.
   For product commerce, include the approved cart presentation and connect it
   to a mock Adapter matching `buyna-cart-core`. Use its fixed right-side
   `CartButton` and `CartDrawer` components as the default MEDINANCE behavior;
   do not implement cart pricing rules in components.
5. Implement all approved desktop and mobile interactions with clearly marked mock data.
6. Record the fields, operations, validation, ownership, and response states required from the later API.
7. Run the applicable frontend build and type checks, then verify desktop and real mobile widths.
8. Record implemented paths/routes, verification commands/results, and the API contract location. Report the interface as frontend code using mock data, not as persisted or backend-connected.

For a product merchant Dashboard, use
`packages/buyna-merchant-dashboard-ui` instead of regenerating its shell,
navigation, table, status, pagination, dialog, and responsive-state code.
Configure the approved design tokens and project API/router adapters. Generate
new UI only for an explicitly approved requirement not covered by the fixed
package.

## Dashboard UI Boundary

Phase 4 owns Dashboard presentation only: layout, navigation, components,
tables, forms, visible actions, responsive behavior, accessibility, and
loading/empty/success/error/permission UI states. Simulate actions through a
mock repository or adapter boundary.

Do not implement authentication services, authorization decisions, database
models, persistence, inventory/capacity mutations, order state machines,
payment verification, S3 ownership, or production APIs in Dashboard UI mode.
Express these requirements only in the API contract.

## Integration Mode: Phase 5 Slice

1. Read the approved Phase 4 interface and API contract.
2. Inspect the implemented backend endpoints and ownership rules.
3. Replace mock repositories and handlers with the approved real APIs one page
   or closely related interaction slice at a time without redesigning the
   confirmed interface.
4. Verify loading, empty, success, validation, permission, failure, refresh, and persistence behavior.
5. Confirm that merchant changes appear in the public frontend where required.
6. Report any remaining mock or unconnected behavior; do not call the
   Dashboard data interaction complete while such behavior remains.

For product or service layouts, keep visual presentation in frontend components while reading backend-managed names, categories, prices, images, stock or availability, visibility, featured flags, and sort order from the approved API. Define loading, empty, unavailable, and error layouts before calling the integration complete.

## Boundaries

- Do not place database, AWS, or payment secrets in frontend code.
- In frontend code mode, label mock data and simulated actions clearly. Do not claim
  they persist or connect to a backend.
- A design image, wireframe, screenshot, or specification without runnable
  project source code cannot complete Phase 4.
- In integration mode, remove mock business data and disconnected demo actions.
- In integration mode, connect the approved UI through adapters; do not move
  backend business rules into components or silently redesign the Dashboard.
- Treat the written font names and HEX values as the source of truth; the generated style-board image is a visual confirmation aid.
- Use `buyai-storefront-layout-ux` for storefront-specific structure and `impeccable` when visual design quality is in scope.
- Send missing API or business-rule work back to `buyna-website-builder`, which selects the applicable project or merchant backend skill.

## Done

Require build/type checks, keyboard/touch usability, no horizontal overflow, readable errors, and verified API behavior.

Report changed project-relative paths, routes, commands, and verification
results. Code shown only in chat, screenshots, or design artifacts do not count
as frontend delivery.
