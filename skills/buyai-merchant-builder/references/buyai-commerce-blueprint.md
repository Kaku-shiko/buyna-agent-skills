# Buyna.ai AWS Commerce Blueprint

## Purpose

Build or repair a real merchant backend on the current Buyna.ai-owned AWS environment. Inspect the repository and infrastructure before choosing implementation details. Do not assume Lovable, Supabase, or a greenfield rewrite.

## Skill Order

1. Use `buyai-merchant-builder` to classify the merchant system.
2. Use `buyai-product-merchant-backend` or `buyai-booking-service-backend` for domain records.
3. Use `buyai-checkout-address-ux` for buyer/customer forms.
4. Use `buyai-storefront-layout-ux` and `impeccable` for public UI.
5. Use `buyai-globepay-payment` for payment routing and its config, checkout, recurring, and status-sync subskills.
6. Use `aws-project-deployer` for AWS resources and deployment verification.

Do not bounce work between coordinators. The merchant builder owns classification; narrower skills own implementation rules.

## Required Discovery

Inspect and record:

- Repository, branch, framework, runtime, build/start commands, and migration tooling.
- Product, booking, or mixed business model.
- Public and seller-admin languages, currency, and timezone.
- Existing seller, product/service, order/booking, payment, and customer data.
- AWS account/profile status, region, deployment target, database engine, S3 buckets, domains, and secrets mechanism.
- Current GlobePay modes, callback URLs, enabled channels, and historical partner-code snapshots.

Preserve the existing stack and data unless the user explicitly authorizes a migration.

## AWS Architecture Rules

- Use the actual AWS database as the structured business-data source of truth. Prefer private RDS/Aurora PostgreSQL for a new AWS database unless the project specifies another managed engine.
- Use S3 for product/service images, documents, exports, and other file objects. Store object keys and metadata in the database, not binary blobs.
- Keep the database private. Only the backend runtime and controlled migration path may connect to it.
- Store database passwords, session secrets, email credentials, AWS-sensitive configuration, and GlobePay credentials in AWS Secrets Manager, SSM, or protected server environment variables.
- Never send privileged database or AWS credentials to browser code.
- Run migrations from the backend/deployment environment. Apply them to staging before production when staging exists.
- Enable production backups, retention, monitoring, and deletion protection. Define rollback before destructive schema changes.
- Use GitHub as the code source of truth when the repository is Git-backed. Keep code, business data, and secrets as separate synchronization concerns.
- Do not add Supabase clients, keys, tables, Storage, Edge Functions, or Lovable-specific workflows unless the inspected legacy system still requires them and the user explicitly chooses to retain them.

## Ownership And Isolation

- Use canonical `seller_id` as the permanent owner of products, services, variants, images, inventory, availability, orders, bookings, payments, paid customers, and settings.
- Never use login account, email, domain, AWS identity, or GlobePay partner code as the ownership key.
- Enforce seller ownership in every read and write, including exports, uploads, payment refreshes, and admin actions.
- Store `provider_partner_code` and optional provider account label as immutable payment-attempt snapshots. Credential changes must not hide historical records.

## Core Records

Use project naming, but preserve these responsibilities:

- `sellers`: canonical owner, login identity, status, contact/settings.
- `products` / `services`: seller-owned source records.
- `variants` / `availability`: SKU stock or booking capacity.
- `orders` / `bookings`: buyer data, immutable item/service snapshot, totals, currency, status, timestamps.
- `payments`: local order relation, provider identifiers, partner snapshot, amount, currency, status, raw audit data.
- `payment_events`: idempotency key, event type, processing result, raw payload.
- `paid_customers` / `paid_bookings`: one verified business record per local order/booking.
- `email_events`: recipient, template/action, result, error, timestamps.
- `site_settings` / `merchant_profile`: shared public company/footer/policy configuration.

Use foreign keys, uniqueness constraints, timestamps, and indexes for seller, status, provider id, and operational filters. Define deletion/archival behavior explicitly.

## Authentication And Sessions

- Hash passwords with a modern password hash.
- Use server-side authorization and secure cookies: `httpOnly`, production `secure`, appropriate `sameSite`, path `/`, and a stable server-only session secret.
- Keep a valid seller session when navigating between seller pages and the public storefront.
- Public routes must not clear or overwrite seller session state.
- Add rate limiting, audit logs, and CSRF protection where the framework requires them.

## Merchant MVP

Seller backend must provide the applicable features:

- Login, logout, protected navigation, and mobile layout.
- Product/service CRUD with archive rather than destructive deletion where records are referenced.
- Categories, SKU/stock or availability/capacity, images, status, featured state, and sorting.
- Orders/bookings, paid customers/paid bookings, details, filters, search, pagination, CSV, and manual email action.
- Payment configuration status with masked partner code and no credential leak.
- Shared company/footer/policy settings.
- One page-level silent payment refresh action; do not add per-row refresh buttons.

Public flows must provide the applicable list/detail, buyer or booking form, payment-method selection, verified result page, and shared policy/footer content.

## Checkout And Payment Boundary

1. Validate and persist buyer/customer data on the server.
2. Create a local `pending_payment` order or booking before calling GlobePay.
3. Store the item/service, quantity/participants, amount, currency, method, and seller/provider snapshots.
4. Call GlobePay only through the server-side adapter selected by `buyai-globepay-payment`.
5. Send the browser only the safe next action such as hosted redirect or QR display.
6. Treat return URLs as navigation, not proof of payment.
7. Verify notify signatures and/or query GlobePay from the server.
8. Use one idempotent status writer to mark paid/refunded, create business records once, and update stock/capacity once.

Keep `partner_code`, `credential_code`, signing material, tokens, and raw card data out of frontend code, URLs, logs, exports, and Notion documentation. Detailed GlobePay hosts, endpoints, signatures, recurring flow, and status transitions belong only in the `buyai-globepay-*` skills.

## Buyer Data

- Product checkout normally requires buyer name, email, phone, recipient, postal code, region, city, address, country, quantity, payment method, and any project-required notes.
- Booking flows require the contact fields needed for confirmation plus date/time or preferred dates, participants, and notes.
- Email may be optional only when the project explicitly allows a no-email flow and all database, paid-record, CSV, and notification behavior supports null safely.
- Preserve form drafts after validation, network, or payment-creation errors. Clear them only after verified success or explicit reset.

## S3 Files And Images

- Use private buckets by default. Serve public media through controlled public objects or CloudFront according to project requirements.
- Generate object keys server-side with seller and entity namespaces; never trust a browser-supplied ownership path.
- Validate MIME type, extension, size, image dimensions, and authorization before accepting uploads.
- Store bucket/key, metadata, sort order, main-image state, and owner in the database.
- Use presigned operations with short expiration when direct browser upload is appropriate.
- Define replacement and deletion behavior so database changes and object cleanup remain auditable.

## Orders, Retention, And Reporting

- Use explicit statuses appropriate to product or booking flows.
- Paid/refunded records are auditable and not user-deletable.
- Expire or archive unpaid attempts according to project policy; provider success discovered later must override local expiry.
- CSV exports must use the same active filters, seller scope, timezone, and verified payment records as the visible page.
- Dashboard totals, order lists, paid-customer pages, and exports must read the same source of truth.

## Deployment

- Choose the hosting model only after inspecting runtime needs. Follow an explicit user hosting constraint.
- Parameterize environment-specific values. Never commit production secrets.
- Validate AWS identity before claiming a connection. Preview resource/cost/risk changes before creating paid persistent infrastructure.
- Build and test locally, apply migrations safely, deploy, then verify HTTPS, health routes, database connectivity, S3 uploads, seller login, callbacks, logs, and rollback state.
- Production GlobePay notify and return URLs must use the production domain.
- Do not claim payment is live until server verification and a controlled small end-to-end payment test succeed.

## Validation Checklist

- Build/type check and migrations pass.
- Files are UTF-8 with no mojibake.
- Seller login/session and cross-seller isolation work.
- Product/service edits propagate to public pages and checkout/booking.
- Stock or capacity uses one calculation and prevents overselling/overbooking.
- S3 uploads, ownership, replacement, and display work.
- Buyer form persists and the server revalidates it.
- Local pending records precede provider calls.
- Verified payment writes paid/refunded records exactly once.
- Orders/paid customers or bookings, filters, CSV, email, and totals agree.
- Secrets remain server-side and logs are safe.
- Mobile seller backend has reachable actions and no clipped content.
- AWS backups, monitoring, callback URLs, and deployed health are verified.
