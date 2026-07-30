---
name: buyna-frontend-builder
description: "Build or repair Buyna.ai public and merchant-admin frontends using the approved project framework. Use in frontend code mode before backend implementation for complete runnable desktop/mobile interfaces with explicit mock data and API contracts, or in integration mode after backend implementation for real API connectivity."
---

# Buyna.ai Frontend Builder

Build the approved public frontend and merchant Dashboard in one of two explicit
modes. Never mix the completion claims of the two modes.

## Frontend Code Mode: Phase 4

1. Read the approved customer record, the complete output from `buyna-website-design`, and the approved page/content plan from `buyna-page-structure`.
2. Inspect existing routes/components and preserve approved project patterns.
3. Implement the public pages and merchant Dashboard as actual runnable project source code, including navigation, dashboard, lists, details, forms, tables, actions, settings, loading, empty, success, validation, permission, and failure states required by the approved scope.
4. Implement all approved desktop and mobile interactions with clearly marked mock data.
5. Record the fields, operations, validation, ownership, and response states required from the later API.
6. Run the applicable frontend build and type checks, then verify desktop and real mobile widths.
7. Record implemented paths/routes, verification commands/results, and the API contract location. Report the interface as frontend code using mock data, not as persisted or backend-connected.

## Integration Mode: Phase 9

1. Read the approved Phase 4 interface and API contract.
2. Inspect the implemented backend endpoints and ownership rules.
3. Replace mock repositories and handlers with the approved real APIs without redesigning the confirmed interface.
4. Verify loading, empty, success, validation, permission, failure, refresh, and persistence behavior.
5. Confirm that merchant changes appear in the public frontend where required.

For product or service layouts, keep visual presentation in frontend components while reading backend-managed names, categories, prices, images, stock or availability, visibility, featured flags, and sort order from the approved API. Define loading, empty, unavailable, and error layouts before calling the integration complete.

## Boundaries

- Do not place database, AWS, or payment secrets in frontend code.
- In frontend code mode, label mock data and simulated actions clearly. Do not claim
  they persist or connect to a backend.
- A design image, wireframe, screenshot, or specification without runnable
  project source code cannot complete Phase 4.
- In integration mode, remove mock business data and disconnected demo actions.
- Treat the written font names and HEX values as the source of truth; the generated style-board image is a visual confirmation aid.
- Use `buyai-storefront-layout-ux` for storefront-specific structure and `impeccable` when visual design quality is in scope.
- Send missing API or business-rule work back to `buyna-website-builder`, which selects the applicable project or merchant backend skill.

## Done

Require build/type checks, keyboard/touch usability, no horizontal overflow, readable errors, and verified API behavior.

Report changed project-relative paths, routes, commands, and verification
results. Code shown only in chat, screenshots, or design artifacts do not count
as frontend delivery.
