---
name: buyna-frontend-builder
description: "Build or repair Buyna.ai public and admin frontends using the approved project framework. Use for React and TypeScript pages, components, routing, forms, API integration, responsive behavior, and accessible UI."
---

# Buyna.ai Frontend Builder

Build frontend behavior against real APIs and project data.

## Steps

1. Read the approved customer record, the complete output from `buyna-website-design`, and the approved page/content plan from `buyna-page-structure`.
2. Inspect existing routes/components and preserve approved project patterns.
3. Define the page states: loading, empty, success, validation, permission, and failure.
4. Build reusable components and connect the approved API.
5. Verify desktop and real mobile widths.

For product or service layouts, keep visual presentation in frontend components while reading backend-managed names, categories, prices, images, stock or availability, visibility, featured flags, and sort order from the approved API. Define loading, empty, unavailable, and error layouts before calling the integration complete.

## Boundaries

- Do not place database, AWS, or payment secrets in frontend code.
- Do not create disconnected demo buttons or duplicate backend source data.
- Treat the written font names and HEX values as the source of truth; the generated style-board image is a visual confirmation aid.
- Use `buyai-storefront-layout-ux` for storefront-specific structure and `impeccable` when visual design quality is in scope.
- Send missing API or business-rule work back to `buyna-website-builder`, which selects the applicable project or merchant backend skill.

## Done

Require build/type checks, keyboard/touch usability, no horizontal overflow, readable errors, and verified API behavior.
