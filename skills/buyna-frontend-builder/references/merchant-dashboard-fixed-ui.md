# Merchant Dashboard Fixed Functional Scaffold

Use `packages/buyna-merchant-dashboard-ui` as the product-merchant Dashboard
functional baseline. It fixes reusable behavior and state handling, not the
project's visual design. Do not regenerate its shell behavior, canonical
functional navigation, common table behavior, pagination, status, dialog, or
responsive-state handling.

## Fixed Content

Use the navigation contract in `product-merchant-dashboard-ui.md` and the
package table schemas and `DASHBOARD_PAGES` declarations for required
columns, filters, actions, and loading/empty/ready/error/permission states.

Use `MerchantDashboardShell`, `DashboardPage`, `DashboardPageHeader`,
`DashboardMetricGrid`, `DashboardPanel`, `DashboardFilterBar`,
`DashboardDataTable`, `DashboardPagination`, `DashboardStatusBadge`, and
`DashboardConfirmDialog`. Import `styles.css` once in the approved admin entry.

## Project Configuration

Configure only the brand name, merchant name, storefront URL, current route,
logout callback, router Link adapter, CSS design tokens, API adapter, field
renderers, and explicitly approved business-specific additions. Map existing
project fields to the fixed table keys; do not move backend rules into cell
renderers.

Set the package background, surface, sidebar, text, muted text, border, accent,
body-font, and heading-font CSS variables from the approved website design
system. The package defaults are implementation fallbacks and are not an
approved design.

Do not use the package defaults as a design decision and do not make this
package choose colors, fonts, spacing style, imagery, or brand expression.

Do not copy legacy Supabase, SQLite, payment, authentication, or persistence
code from visual cases. Phase 4 uses mock repositories through the project's
API adapter seam. Phase 5 replaces only that adapter with approved server APIs.

## Required Checks

Run the package model tests, the project build/type checks, and visual checks at
desktop, tablet, and 375px mobile widths. Confirm keyboard navigation, mobile
drawer focus/labels, no page-level horizontal overflow, readable error states,
and reachable row actions.
