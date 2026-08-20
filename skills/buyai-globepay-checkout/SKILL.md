---
name: buyai-globepay-checkout
description: "Implement or repair responsive one-time GlobePay checkout: mandatory mobile WeChat Pay and Alipay H5/JSAPI redirects, desktop QR, hosted credit/bank card, app handoff and return, common cashier, and device-aware next actions."
---

# Buyai GlobePay Checkout

Use for one-time payment creation and buyer next action. Do not mark paid here;
paid status belongs to `buyai-globepay-status-sync`.

## Gold

Create a local `pending_payment` order or booking before calling GlobePay. Store
buyer/customer data, item snapshot, amount, currency, payment method, provider
order id, and provider partner-code snapshot. Provider order creation is not
payment success.

## First Move

Read [references/checkout-endpoints.md](references/checkout-endpoints.md).
Confirm the selected method, enabled merchant channels, trusted browser context,
currency, amount, notify URL, return URL, and product or booking flow.

Run `checkout.plan` through
`buyai-globepay-payment/scripts/globepay-cli.mjs` with the explicit selected
method, trusted browser context, and enabled-method map. Use its
`endpointFamily` and `nextAction` in the project server Adapter. Do not rewrite
method/channel routing or let frontend code override the result.

Use `createGlobepayService(...).createCheckout(...)` for the actual sequence.
Implement only the project store/provider Adapters described in
`buyai-globepay-payment/references/service-adapter-contract.md`.

When a pending order contains a coupon snapshot, call `@buyna/coupon-core`
`resolveCouponPaymentAmount({quote, orderTotal})` before provider order creation.
Send only its positive integer result to GlobePay.

## Method Rules

Before the final payment button, require a three-choice selector in this order:
`微信`, `支付宝`, `银行卡`. Map the stored selection to the approved GlobePay
channel only on the server. Never default to or change the buyer's selection.

Use GlobePay-hosted card input for bank/card payment. Never collect card number,
expiry, or CVV in the Buyna.ai frontend.

Create the provider order before presenting any WeChat/Alipay next action.
Channel values are case-sensitive: `Wechat`, `Alipay`, `Alipay+`.

Route wallet payments by trusted browser context on the server:

- Matching wallet browser: use enabled JSAPI and return `invoke_jsapi`.
- Ordinary mobile browser: use Mobile H5 and return `redirect`.
- Desktop browser: use QR or an approved signed hosted page; return `show_qr`
  when displaying a QR code.

Mobile WeChat and Alipay are redirect-based, not QR-based. Returning or
rendering `show_qr` on the same phone is a release-blocking failure. Always send
the H5/JSAPI buyer back to an HTTPS local order-result route. Do not use viewport
width alone; send a bounded browser-context classification to the server and
validate it there.

If H5/JSAPI is not enabled for the merchant account or cannot hand off, preserve
the pending order and selected method. Report the configuration blocker and
offer only an approved retry or instruction to open the matching wallet browser.
Do not silently downgrade to a same-device QR or another payment method.

Use common cashier only when explicitly requested. Use UnionPay/web gateway
only when the official documentation and merchant account enable it.

## Combine With

Use `buyai-globepay-config` for signing and URL issues,
`buyai-globepay-status-sync` for return/notify/query, and the product or booking
Skill for local records and stock/capacity.

## Validate

Verify all three choices, disabled-channel behavior, explicit selection,
pending-order-first persistence, matching server Adapter, provider error
recovery, and this routing matrix:

- wallet browser = `invoke_jsapi`
- ordinary mobile browser = H5 `redirect`
- desktop wallet payment = `show_qr` or approved signed hosted page
- card on every device = hosted-card `redirect`

Fail when mobile WeChat or Alipay returns or renders `show_qr`. Test desktop,
ordinary mobile, matching wallet browser, return from wallet, cancellation,
missing wallet/handoff failure, and disabled channel. On return, query status on
the server; redirect parameters must never mark an order paid.

Deliver checkout source, server Adapter, pending persistence, and applicable
tests in the real project. Documentation alone is not complete.
