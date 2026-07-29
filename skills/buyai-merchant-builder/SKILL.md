---
name: buyai-merchant-builder
description: Coordinate or repair Buyna.ai merchant and seller backends on the current AWS-owned stack when product, booking, payment, checkout, storefront, database, storage, and deployment work overlap.
---

# Buyai Merchant Builder

Use as the high-level coordinator for "merchant backend", "seller backend", or a broad Buyna.ai merchant build. Route detailed work to narrower skills; do not duplicate their rules.

## First Move

Read `references/buyai-commerce-blueprint.md` when starting, migrating, or repairing a broad backend.

Inspect the real repository and deployed environment. Confirm product, booking, or mixed; frontend/admin languages; currency; AWS region; backend runtime; database engine; S3 buckets; deployment target; and existing data. Do not assume Lovable or Supabase.

## Skill Routing

Use `buyai-product-merchant-backend` for products, SKU, images, stock, categories, orders, and paid customers.

Use `buyai-booking-service-backend` for services, availability, capacity, bookings, deposits, and paid bookings.

Use `buyai-globepay-payment` for GlobePay setup, payment creation, notify/query, refunds, and subscriptions.

Use `buyai-checkout-address-ux` for forms, address, phone/email, postal code, persistence, and mobile input.

Use `buyai-storefront-layout-ux` plus `impeccable` for storefront UI, mobile, readability, and design polish.

Use `aws-project-deployer` for AWS identity checks, architecture, RDS/Aurora, S3, secrets, deployment, domains, and live verification.

## Gold

Every Buyai merchant MVP collects buyer/customer data before payment, creates local pending order/booking before provider payment, calls GlobePay server-side, marks paid only after verified notify/query, creates paid records once, and shows seller records with filters, CSV, and email.

Use canonical `seller_id` as permanent owner. Never use admin account, email, or GlobePay partner code. Changing GlobePay credentials must not hide old products/orders.

Use the configured AWS database as the business-data source of truth and S3 for files/images. Keep database, AWS, session, email, and payment credentials server-side. Do not introduce Supabase or Lovable unless an inspected legacy project still depends on them and the user explicitly keeps that dependency.

## Validate

Check build/type, migrations, UTF-8, login/session, seller isolation, buyer form, pending payment, verified paid sync, orders/paid customers, CSV, manual email, S3 upload, backups, no hard-coded secrets, no mojibake, and mobile backend. Verify deployed behavior before calling the system live.
