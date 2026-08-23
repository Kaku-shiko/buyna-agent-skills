# Buyna Unified GlobePay Gateway Design

Date: 2026-08-23
Status: Approved architecture, implementation not started

## 1. Decision

Buyna merchant websites will stop generating or copying a complete GlobePay implementation into every project. A shared server-side payment gateway will own provider signing, device routing, provider verification, amount and currency validation, idempotency, audit, and reliable event delivery.

Each merchant project keeps only a thin settlement adapter that reads its own payable order and applies a verified payment or refund inside that merchant's database transaction. Skills install and configure these fixed modules; Skills do not regenerate payment security logic.

## 2. Goals

- Give all current and future merchants one consistent GlobePay implementation.
- Route wallet browsers to JSAPI, ordinary mobile browsers to H5, and desktop browsers to the approved hosted or QR flow.
- Prevent browser returns, forged callbacks, wrong amounts, wrong currencies, and duplicate notifications from marking an order paid.
- Preserve merchant isolation through `project_id` and `seller_id`.
- Allow one merchant to migrate or roll back without changing other merchants.
- Reuse approved Buyna AWS resources unless a separate resource change is explicitly approved.

## 3. Non-goals

- Global Accelerator is not a payment correctness mechanism and is outside this design.
- This service does not own merchant products, carts, orders, coupons, inventory, or GMV totals.
- This design does not create a new EC2 instance, RDS instance, database, S3 bucket, or public application port.
- The frontend never supplies the authoritative payable amount or currency.

## 4. Runtime architecture

```text
Buyer browser
    |
    v
Merchant website/backend
    |  authenticated checkout request
    v
Buyna Payment Gateway (shared server-side runtime)
    |  signed GlobePay request
    v
GlobePay
    |  notify + provider query result
    v
Buyna Payment Gateway
    |  signed, replay-protected settlement event
    v
Merchant settlement adapter
    |  one local transaction
    +--> order/payment state
    +--> inventory/coupon effects
    +--> GMV outbox
```

The gateway runs on the approved existing Buyna compute resource. Dynamic merchant applications on the same EC2 host may use a Unix socket or private loopback listener. Serverless merchants call the authenticated HTTPS endpoint at `pay.buyna.ai`. Nginx exposes only the required public routes; unknown hosts remain isolated.

Gateway records use an isolated `payment_gateway` schema in the existing shared `buyna_merchants` PostgreSQL database. Merchant business tables stay in their merchant schemas.

## 5. Trust and identity

Every request carries `project_id`, `seller_id`, a timestamp, nonce, and body hash. The gateway authenticates the caller with a merchant-specific HMAC secret whose source is stored in AWS Secrets Manager. Secret values never enter Git, Skills, browser code, logs, chat, or database records.

Requests are rejected when:

- the project and seller pair is not registered and enabled;
- the timestamp is outside the permitted clock window;
- the nonce was already used;
- the signature or body hash is invalid;
- the requested order belongs to another project or seller;
- the return domain, provider host, currency, or payment channel is not allowed.

Gateway-to-merchant settlement events use a separate signed envelope with event ID, timestamp, nonce, payload hash, and delivery attempt. The merchant adapter stores the event ID before acknowledging it.

## 6. Merchant configuration

The gateway stores only references and policy:

- `project_id`
- `seller_id`
- optional `payment_account_id` when one merchant has more than one approved GlobePay contract
- GlobePay credential secret source name
- gateway mode: disabled, test, or production
- enabled channels
- allowed currencies
- allowed merchant return domains
- allowed official GlobePay hosts
- merchant adapter endpoint or Unix socket target
- HMAC secret source name

Configuration does not contain raw credentials. `Alipay` and `Alipay+` are distinct case-sensitive channels and cannot be substituted automatically.

The gateway resolves the merchant's own `partner_code`, `credential_code`, and signing secret from that registered secret source after authenticating `project_id + seller_id`. Shared runtime code never means shared merchant credentials. A browser cannot select or override `payment_account_id`; the server chooses it from the order's registered merchant configuration. A credential resolved for one merchant scope is never usable for another merchant scope.

## 7. Checkout contract

Merchant backend calls `POST /internal/v1/checkouts` with:

- `project_id`, `seller_id`, `order_id`
- requested payment method
- device context derived from server-observed headers
- approved return path identifier
- idempotency key

The request does not include an authoritative total. The gateway calls the merchant adapter's `getPayableOrder(order_id)` operation and receives an immutable order snapshot containing ownership, pending state, payable amount in the currency's correct minor unit, currency, and allowed methods.

The gateway then:

1. validates merchant scope and order state;
2. validates amount, currency, channel, and return domain policy;
3. selects the device-specific route;
4. signs the GlobePay request using the exact provider rule;
5. records the payment attempt before returning an action;
6. returns only a normalized `next_action` object to the merchant backend.

Supported normalized actions are `redirect`, `jsapi`, `qr`, and `hosted_page`. Provider payloads and secrets are not exposed unnecessarily.

## 8. Device routing

| Client context | WeChat | Alipay | Card |
| --- | --- | --- | --- |
| WeChat in-app browser | JSAPI | Explicitly supported provider route only | Hosted page |
| Alipay in-app browser | Approved H5/redirect route | JSAPI or approved wallet route | Hosted page |
| Ordinary mobile browser | H5 redirect | H5 redirect | Hosted page |
| Desktop browser | Hosted or QR route | Hosted or QR route | Hosted page |

A mobile client receiving a desktop-only QR result is a blocking routing error, not a successful checkout response. Route selection is centralized and covered by contract tests.

## 9. Provider verification and settlement

The public notify endpoint accepts the provider notification but never trusts it alone. The gateway:

1. validates notification authenticity;
2. queries GlobePay using the stored provider order reference;
3. requires the provider state to be successful;
4. compares paid amount and currency with the immutable local order snapshot;
5. normalizes the event and stores it idempotently;
6. enqueues delivery to the correct merchant adapter;
7. retries until the merchant acknowledges the event.

Browser return routes show pending or current status but never mark an order paid. Refund events follow the same provider verification, normalization, idempotency, delivery, and audit rules.

The merchant adapter applies each verified event exactly once in one local transaction. That transaction updates payment and order state, applies inventory and coupon effects when required, and writes the GMV outbox record. The gateway does not directly edit merchant order tables.

## 10. Gateway data model

The `payment_gateway` schema contains:

- `merchant_payment_configs`: registered identity and policy references;
- `payment_attempts`: checkout attempt, local order reference, provider reference, amount, currency, channel, and state;
- `provider_events`: immutable normalized provider notifications and query evidence;
- `payment_deliveries`: merchant delivery attempts, acknowledgements, and retry schedule;
- `idempotency_keys`: scoped request keys and replay protection;
- `payment_audit_logs`: security-relevant decisions without secrets or sensitive customer data.

All records include `project_id`, `seller_id`, timestamps, and stable identifiers. Database constraints prevent a provider event or idempotency key from being applied twice within its scope.

## 11. Fixed module boundaries

The fixed payment package owns:

- GlobePay host and API-version construction;
- exact signing and verification;
- channel and device routing;
- amount and currency normalization;
- official provider URL allowlist;
- provider notify/query reconciliation;
- payment state machine, idempotency, retry, and audit;
- signed settlement-event delivery.

The generated project adapter owns only:

- `getPayableOrder(order_id)`;
- `applyVerifiedPayment(event)`;
- `applyVerifiedRefund(event)`;
- framework-specific database transaction wiring;
- merchant-specific inventory, coupon, and GMV outbox mapping.

Visual design, product fields, and merchant-specific business rules remain project configuration. They cannot override payment security invariants.

## 12. Skill behavior after migration

The GlobePay Skills become installation and configuration guides for fixed runtime modules. They must:

1. inspect the merchant architecture and existing resource registration;
2. install the matching thin adapter;
3. register merchant identity and secret-source names;
4. configure enabled channels, domains, and currencies;
5. run the minimum contract and route tests;
6. leave production activation and real-payment testing to an explicitly approved release action.

Skills must not create an alternative payment service, copy a full provider implementation into a merchant, invent AWS resources, or treat a browser return as payment proof.

## 13. Failure handling

- Provider timeout: keep the order pending and reconcile by provider query.
- Duplicate notify: return an idempotent acknowledgement without reapplying settlement.
- Merchant adapter unavailable: retain the verified event and retry with backoff.
- Amount or currency mismatch: quarantine the event, do not mark paid, and alert operations.
- Disallowed provider URL: reject the action and record a security audit event.
- Configuration disabled: refuse checkout without falling back to another merchant's configuration.
- Unknown outcome: remain pending until query reconciliation establishes a verified state.

## 14. Migration order

1. Build and test the shared gateway, fixed package, adapter contract, and observability without routing production traffic.
2. Connect MEDINANCE in shadow mode as the most complete reference implementation; compare routing and verification results without changing order state.
3. Migrate `shop.sanwa.life`, adding mobile H5/JSAPI routing and amount/currency verification before production activation.
4. Migrate Xinghe and add missing amount/currency verification.
5. Repair and migrate EduPay Japan staging; restrict signed URLs to the official allowlist before any production use.
6. Migrate MEDINANCE and enforce the strict provider URL allowlist.
7. Repair Sanwa's old QR-only flow and verification before enabling its currently disabled payment mode.
8. Migrate BlueSequoia after confirming whether its merchant agreement requires `Alipay` or `Alipay+`.
9. Require all new merchants to use the gateway and thin adapter; do not create new project-local GlobePay cores.

Merchants without an active GlobePay adapter are not activated merely by registration.

## 15. Rollback

Migration is controlled per merchant by a server-side feature flag. During rollout, the merchant may switch between the gateway and its retained legacy adapter only when that legacy adapter passes the required safety checks. An unsafe or disabled legacy implementation is not an acceptable rollback target; rollback then means disabling new checkout while continuing reconciliation for already-created payment attempts.

Rollback never deletes provider references, pending orders, verified events, or audit records. Settlement delivery resumes from stored event and delivery IDs after recovery.

## 16. Acceptance criteria

- Wallet, mobile H5, and desktop routing tests pass for each enabled channel.
- A mobile request cannot receive a desktop-only QR action.
- Browser return alone cannot mark an order paid.
- Successful settlement requires provider query confirmation and exact amount/currency match.
- Duplicate checkout, notify, query, and delivery events do not duplicate order, inventory, coupon, refund, or GMV effects.
- Cross-merchant project/seller access is rejected.
- Unapproved provider and return domains are rejected.
- Merchant adapter outage is recoverable without losing a verified payment.
- Logs and database records contain no raw payment credentials.
- Each migrated merchant has a tested feature flag, reconciliation path, and rollback record.
- No new EC2, RDS, database, S3 bucket, or public port is created without separate explicit approval.
