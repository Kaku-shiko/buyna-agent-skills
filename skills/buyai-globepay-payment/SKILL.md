---
name: buyai-globepay-payment
description: Route Buyai GlobePay Japan work to smaller payment skills. Use when the request involves GlobePay setup, card/QR checkout, payment return/notify, paid/refund sync, recurring subscription, or unclear payment bugs.
---

# Buyai GlobePay Payment

Use this as the GlobePay router. Do not implement detailed endpoint logic here; select the right payment subskill and combine it with product, booking, or checkout skills.

## Fixed Core

Locate this installed Skill directory and use `scripts/globepay-core.mjs` as the
canonical program API. Use `scripts/globepay-cli.mjs --operation <name>` for
JSON CLI execution. Run its tests before project integration:

```text
node --test scripts/globepay-core.test.mjs scripts/globepay-service.test.mjs
```

Available operations are `config.validate`, `auth.sign`, `checkout.plan`,
`status.evaluate`, and `recurring.validate`. Pass non-secret operation input as
JSON on stdin. Configuration and signing read credentials from server process
environment variables; never put credentials in stdin, command arguments, or
output. Treat the core result as validation or a proposed transition, not as a
database write or proof of payment.

For one-time checkout and status persistence, read
`references/service-adapter-contract.md`, import `createGlobepayService` from
`scripts/globepay-service.mjs`, and call `createCheckout` or
`syncPaymentStatus`. Generate only the project-specific store/provider
adapters, routes, and migration. Do not regenerate the orchestration already in
the service module.

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
