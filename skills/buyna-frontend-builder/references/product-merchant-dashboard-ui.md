# Product Merchant Dashboard UI

Use this reference after the public website design and page structure are
approved and the merchant branch is confirmed as `product`.

## Required Navigation

This file is the canonical product-merchant Dashboard functional contract, not
a visual-design specification. It fixes required capabilities, fields,
actions, states, and ownership boundaries. Colors, typography, component
appearance, spacing style, and brand expression come from the approved project
design. Keep these seven top-level functions accessible in this order:

1. `仪表盘`
2. `商品管理`
3. `分类管理`
4. `优惠券管理`
5. `订单`
6. `付费客户`
7. `支付/订阅设置`

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

### 优惠券管理

- Coupon list with code/type, discount, quantity/amount thresholds, validity,
  status, usage count, and order.
- Create, edit, activate/deactivate, archive, and issue/claim presentation.
- Keep calculation, reservation, redemption, release, and payment amount logic
  in `buyai-coupon-commerce` and the fixed coupon core.
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

### 支付/订阅设置

- GlobePay connection/status presentation.
- Merchant portal shortcut.
- Public display of supported payment methods when approved.
- Never expose credentials or imply that a local input activates production
  payment.
- Add a separate read-only Buyna.ai subscription card showing only the current
  merchant's plan, status, start date, and bound domain.
- Loading, unconfigured, configured, error, and permission presentation.

## Responsive Structure

- Desktop: persistent sidebar and content workspace.
- Mobile: sidebar becomes an accessible drawer; keep the same seven-page order.
- Convert wide tables to approved card/list or controlled horizontal layouts.
- Keep primary actions reachable without horizontal page overflow.

## UI And Logic Boundary

Build these pages with mock repositories and mock responses only during
Dashboard UI delivery. Record fields, actions, validation, ownership, and
response states in the API contract.

Do not implement login services, authorization decisions, database writes,
inventory mutations, order transitions, payment verification, S3 ownership, or
production APIs in this UI step.

## Delivery Gate

Require the approved combined design-and-structure package to contain the
canonical navigation, page composition, inherited design system, and desktop/
mobile behavior. Then deliver runnable Dashboard UI source and verification
without another pre-code approval. Do not start backend logic in the same phase.
