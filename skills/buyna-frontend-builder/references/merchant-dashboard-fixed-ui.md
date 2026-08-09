# Merchant Dashboard Fixed UI

Use `packages/buyna-merchant-dashboard-ui` as the product-merchant Dashboard
baseline. Do not regenerate its shell, six-page navigation, common table,
pagination, status, dialog, or responsive-state components.

## Fixed Content

Keep these routes in order: 仪表盘, 商品管理, 分类管理, 订单, 付费客户, 支付设置.
Use the package table schemas and `DASHBOARD_PAGES` declarations for required
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

Override these CSS variables from the approved website design system:

```css
:root {
  --buyna-admin-bg: #f6f4ef;
  --buyna-admin-surface: #ffffff;
  --buyna-admin-sidebar: #090909;
  --buyna-admin-text: #171717;
  --buyna-admin-muted: #6c6a66;
  --buyna-admin-border: #d9d5cc;
  --buyna-admin-accent: #a65b00;
  --buyna-admin-font: system-ui, sans-serif;
  --buyna-admin-heading: Georgia, serif;
}
```

Do not copy legacy Supabase, SQLite, payment, authentication, or persistence
code from visual cases. Phase 4 uses mock repositories through the project's
API adapter seam. Phase 5 replaces only that adapter with approved server APIs.

## Required Checks

Run the package model tests, the project build/type checks, and visual checks at
desktop, tablet, and 375px mobile widths. Confirm keyboard navigation, mobile
drawer focus/labels, no page-level horizontal overflow, readable error states,
and reachable row actions.
