# Merchant Dashboard Functional Core

Use `packages/buyna-merchant-dashboard-core` for the required capabilities and
state contracts. Use `packages/buyna-merchant-dashboard-headless` for reusable
interaction behavior. This fixes program behavior without fixing appearance.

## Fixed Program

- Canonical menu capabilities, field contracts, filters, actions, and states.
- Drawer open/close state, close-on-navigation, backdrop close, accessible
  labels, and `aria-expanded` behavior.
- Table mapping, loading/empty/error/permission states, pagination, status
  semantics, confirmation-dialog behavior, and mobile-safe interaction.
- API/router adapters and the separation between UI and backend rules.

## Project-Owned Design

Every merchant delivery must contain an **approved project dashboard theme**.
Derive it from the approved website design when no separate Dashboard design is
provided; this does not require another approval round. Record its theme ID,
source `approved_project_design`, project stylesheet path, shell presentation,
and density through `validateDashboardTheme`.

The project owns colors, fonts, spacing, radii, borders, shadows, icon set,
navigation appearance, page composition, card treatment, table presentation,
motion, imagery, and brand expression. A sidebar may look like a rail, panel,
topbar, or hybrid according to the approved design while preserving the fixed
navigation and mobile drawer behavior.

The project **must not import a fixed Dashboard stylesheet**. Style the
headless `data-dashboard-part`, `data-state`, `data-status`, `data-active`, and
`data-drawer-open` hooks or pass project class names. The Headless package has
no colors, fonts, spacing, or layout CSS to fall back to.

## Delivery Contract

Deliver all three:

1. Fixed core and Headless imports.
2. Project-owned Dashboard theme contract and stylesheet/component styles.
3. Desktop, tablet, and 375px verification covering drawer, tables, keyboard,
   touch, empty/error/permission states, and no page-level overflow.

If the project theme is missing, the Dashboard UI delivery is incomplete. Do
not substitute a previous merchant screenshot, copied case stylesheet, or a
shared default skin.
