# Product Merchant Dashboard UI

Use this reference after the public website design and page structure are
approved and the merchant branch is confirmed as `product`.

## Required Navigation

Keep these six top-level pages in this order:

1. `仪表盘`
2. `商品管理`
3. `分类管理`
4. `订单`
5. `付费客户`
6. `支付设置`

Do not add platform administration, merchant switching, multi-merchant
management, ERP, CRM, reports, or other navigation unless the user explicitly
changes the approved scope.

## Page Composition

### 仪表盘

- Summary cards: products on sale, pending payment, paid orders, paid customers.
- Quick-entry cards linking to product management, orders, paid customers, and
  payment settings.
- Loading, empty, error, and permission presentation.

### 商品管理

- Product list with image, name, category, price, stock, visibility, and order.
- Search and approved status/category filters.
- Create, edit, archive, visibility, image, inventory, and sorting UI.
- Loading, empty, validation, success, error, and permission presentation.

### 分类管理

- Category list with name, visibility, product count, and order.
- Create, edit, archive, visibility, and sorting UI.
- Loading, empty, validation, success, error, and permission presentation.

### 订单

- Order list with order number, customer, amount, payment status, and time.
- Search and approved status/month filters.
- Order detail, payment-status presentation, reset, pagination, CSV action, and
  one page-level refresh action.
- Loading, empty, error, and permission presentation.

### 付费客户

- Paid-customer list with customer identity, contact summary, paid amount/order,
  and paid time.
- Search, approved filters, detail, CSV action, and contact action.
- Loading, empty, error, and permission presentation.

### 支付设置

- GlobePay connection/status presentation.
- Merchant portal shortcut.
- Public display of supported payment methods when approved.
- Never expose credentials or imply that a local input activates production
  payment.
- Loading, unconfigured, configured, error, and permission presentation.

## Responsive Structure

- Desktop: persistent sidebar and content workspace.
- Mobile: sidebar becomes an accessible drawer; keep the same six-page order.
- Convert wide tables to approved card/list or controlled horizontal layouts.
- Keep primary actions reachable without horizontal page overflow.

## UI And Logic Boundary

Build these pages with mock repositories and mock responses only during
Dashboard UI delivery. Record fields, actions, validation, ownership, and
response states in the API contract.

Do not implement login services, authorization decisions, database writes,
inventory mutations, order transitions, payment verification, S3 ownership, or
production APIs in this UI step.

## Approval Gate

Before writing Dashboard UI code:

1. present the six-page navigation and page-composition record;
2. confirm that it inherits the approved website design system;
3. confirm desktop and mobile navigation behavior;
4. ask for explicit approval.

After approval, deliver runnable Dashboard UI source code and verification
evidence. Do not start backend logic in the same phase.
