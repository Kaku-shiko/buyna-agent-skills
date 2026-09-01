---
name: buyai-globepay-payment
description: "Use when a Buyna.ai request involves GlobePay configuration, one-time checkout, mobile or desktop payment selection, notify or query status, refunds, recurring billing, or an unclear payment failure."
---

# Buyai GlobePay Payment

Use this as the GlobePay router. Do not implement detailed endpoint logic here; select the right payment subskill and combine it with product, booking, or checkout skills.

When invoked by the Website Builder, consume `executionCheckReceipt`. Reuse
unchanged payment architecture, server-config boundary, selected Module, and
package-test evidence for the same package source digest; do not rerun those
static checks in payment and status-sync siblings. Every live provider request
still performs fresh signing/query and exact order, amount, currency, and
idempotency verification. Standalone invocation collects its static evidence
once without claiming Builder or production authorization.

## New Fixed-Core Path

For new builds and fixed-state repairs, use this sequence:

1. `packages/buyna-checkout-flow-core` validates checkout and locks the local
   `pending_payment` order/booking.
2. Project GlobePay transport Adapter signs and creates/queries provider
   requests with server-owned `projectId + sellerId` and server-selected
   credentials.
3. Project verification Adapter normalizes a trusted notify/query result.
4. `packages/buyna-commerce-settlement-core` reconciles exact order, amount,
   and currency, then owns transition legality, idempotency, and effects.

Generate only project transport/verification/database Adapters,
configuration, routes, and presentation around those fixed cores.

## Transport Utilities

Locate this installed Skill directory and use `scripts/globepay-core.mjs` as the
canonical program API. Use `scripts/globepay-cli.mjs --operation <name>` for
JSON CLI execution. Run its tests before project integration only when the
receipt has no PASS for the current package source digest:

```text
node --test scripts/globepay-core.test.mjs scripts/globepay-service.test.mjs
```

Available operations are `config.validate`, `auth.sign`, `checkout.plan`,
`status.evaluate`, and `recurring.validate`. Pass non-secret operation input as
JSON on stdin. Configuration and signing read credentials from server process
environment variables; never put credentials in stdin, command arguments, or
output. Treat the core result as validation or a proposed transition, not as a
database write or proof of payment.

The CLI/core operations validate transport inputs, signatures, checkout plans,
status normalization, and recurring input. Their outputs are Adapter input or a
proposed provider transition, never a database write or proof of payment.

## Legacy-Only Service

When an existing project explicitly records
`paymentArchitecture: legacy-globepay-service`,
`createGlobepayService` from `scripts/globepay-service.mjs` remains available
for legacy-only maintenance through `references/service-adapter-contract.md`.
Its paid transition verifies the notification, performs a provider Query, and
reconciles the Query's exact amount and currency to the local order before any
idempotency claim or payment effect.
That legacy path stays separate from the new fixed-core path; migration selects
one named architecture before implementation. New fixed-core work records
`paymentArchitecture: fixed-cores`; a missing or unknown value blocks payment
routing.

## Gold

GlobePay Japan host must be `https://pay.globepay.co.jp/api/v1.0`. Do not use `.co`, `.cn`, guessed hosts, or duplicated `/api/v1.0`. Keep `credential_code` server-side. Order creation is not payment success. Paid/refunded status needs verified notify/query.

## Route To

- `buyai-globepay-config`: host, env vars, signing, currencies, error classification, partner-code mistakes.
- `buyai-globepay-checkout`: one-time card, bank card, WeChat/Alipay QR, H5, JSAPI, common cashier, redirect/QR behavior.
- `buyai-globepay-status-sync`: notify URL, return URL, query fallback, paid writer, refund sync, paid time repair.
- `buyai-globepay-recurring`: credit-card subscription, WorldPay Recurring, 3DS, CIT/MIT scheduled charges.

## Combine With

Use `buyai-product-merchant-backend` for product/SKU orders, `buyai-booking-service-backend` for reservations/capacity, and `buyai-checkout-address-ux` for buyer form persistence.

## Validate

Confirm server-only secrets, correct base URL, correct endpoint family, local pending order/booking before provider call, verified return/notify before paid, paid/refund records in seller backend, and no partner-code change hiding old records.

The selected subskill must deliver real server-side source/configuration changes
without secrets and applicable tests. Report changed paths and verification
results; a payment plan or provider instructions alone are not complete.
