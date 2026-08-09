---
name: buyai-product-merchant-backend
description: "Build or repair a single-merchant Buyna.ai product ecommerce backend: merchant login, products, SKU, images, stock, sorting, checkout, orders, paid customers, and CSV."
---

# Buyai Product Merchant Backend

Use for product ecommerce: jewelry, apparel, goods, SKU catalogs, and shippable products. Owns products, inventory, categories, variants, images, orders, and paid customers. Does not own payment, booking capacity, or styling.

## First Move

Read the approved Phase 4 frontend code completion record and API contract.
Inspect the actual public product frontend and merchant Dashboard source and
confirm that the applicable frontend build/type checks passed. If the record,
source code, API contract, verification, or user approval is missing, stop and
return to `buyna-frontend-builder` Phase 4. Do not create database models,
migrations, storage rules, APIs, or backend business logic.

After the gate passes, read `references/product-commerce-rules.md`. Confirm languages, currency, product source, variants/SKUs, image limit.

For 商品管理 or 分类管理, also read
`references/merchant-catalog-fixed-core.md` and call
`packages/buyna-merchant-catalog-core`. Do not regenerate its field policies,
filter/sort rules, stock/visibility/archive operations, or transactional
ordering. Generate only the project route and database Adapter required by the
approved API contract.

For shopping-cart, checkout-order creation, seller Orders, order detail, or
order CSV, read `references/cart-order-fixed-cores.md`. Call
`packages/buyna-cart-core` and `packages/buyna-order-core`; generate only the
project Store/Database Adapters, routes, pricing configuration, custom-field
mapping, and notification templates.

Before models, migrations, uploads, or persistence code, run the `buyna-aws-data-layer` Existing Resource Gate. Reuse the recorded database and S3 bucket through `buyna-s3-storage`. Stop instead of creating a database, SQLite file, DynamoDB table, bucket, or replacement AWS resource.

## Dashboard Contract Boundary

Implement authentication, authorization, persistence, products, stock, orders,
and payment-related state behind the approved Dashboard API contract. Do not
redesign Dashboard navigation, layouts, forms, visible fields, or interactions.
If backend correctness requires an interface change, stop and return a focused
change request to `buyna-frontend-builder` for user approval.

Require the approved product Dashboard UI to contain exactly these default
top-level pages: 仪表盘、商品管理、分类管理、订单、付费客户、支付设置. Treat these
as frontend routes; this Skill implements their server-side behavior only.

## Combine Skills

Use with `buyai-globepay-payment`, `buyai-checkout-address-ux`, `buyai-storefront-layout-ux`, and `aws-project-deployer` when AWS infrastructure or deployment is in scope.

## Gold

Product data is source of truth. Backend changes to name, price, category, status, images, stock, variants, featured flag, and sort order update public pages, checkout, and seller preview.

Checkout requires buyer/shipping form and local `pending_payment` before GlobePay. No disconnected payment buttons.

## MVP

Single-merchant backend: one merchant administrator, login, session, product CRUD/archive, images/main image, categories, stock/variants, drag sorting, orders, paid customers, CSV, email, payment settings, and GlobePay portal. Do not create a platform administrator, cross-merchant console, merchant switcher, or merchant-account management API.

Public site: backend list, category tabs, detail, checkout, payment methods, verified success, shared footer settings.

Images default max is 5 unless changed. If variants exist, detail shows options/gallery; checkout stores variant snapshot and uses SKU price/stock.

## Orders

Statuses: `pending_payment`, `paid`, `refunded`, `failed`, `expired`, `cancelled`. Orders/Paid Customers need filters, search, month, URL params, reset, pagination, CSV, and timezone. Expire unpaid older than 24h; never delete paid/refunded records. Use one silent page refresh button.

Create the pending order with the complete safe customer submission snapshot defined by `buyai-checkout-address-ux`. Return every saved entry from the seller-authorized order-detail API and display it in the approved Dashboard order detail, including custom and legacy fields. Order lists may remain summaries. Never return another project/seller's answers or payment/security secrets.

## Validate

Check build, UTF-8, login, `seller_id`, product/category/stock/SKU/image/sort sync, complete customer snapshot storage and order-detail rendering, verified paid once, refund sync, CSV, cleanup, mobile backend.

When catalog behavior is in scope, run
`npm test --prefix packages/buyna-merchant-catalog-core` before project tests.
When cart or order behavior is in scope, also run the matching fixed-package
tests before project integration tests.

## Code Delivery

Deliver backend source, routes/APIs, migrations, authorization/ownership
checks, and applicable automated tests in the real project. Report changed
paths and verification results. A backend specification or generated prompt
alone is not complete.
