---
name: buyai-globepay-checkout
description: "Implement or repair responsive one-time GlobePay checkout: hosted credit card, bank card, WeChat Pay and Alipay QR, mobile H5/JSAPI app handoff and return, common cashier, QR display, and redirect behavior."
---

# Buyai GlobePay Checkout

Use for one-time payment creation and buyer next action: hosted card page, QR scan, H5, JSAPI, or common cashier. Do not mark paid here; paid status belongs to `buyai-globepay-status-sync`.

## Gold

Create a local `pending_payment` order/booking before calling GlobePay. Store buyer/customer data, item snapshot, amount, currency, payment method, provider order id, and provider partner-code snapshot. Provider order creation success is not payment success.

## First Move

Read `references/checkout-endpoints.md`. Confirm selected method, merchant enabled channels, currency, item amount, notify URL, return URL, and whether this is product or booking flow.

Run `checkout.plan` through
`buyai-globepay-payment/scripts/globepay-cli.mjs` with the explicit selected
method, trusted browser context, and enabled-method map. Use its
`endpointFamily` and `nextAction` in the project server adapter. Do not rewrite
method/channel routing or let frontend code override the result.

Use `createGlobepayService(...).createCheckout(...)` for the actual sequence.
Implement only the project store/provider adapters described in
`buyai-globepay-payment/references/service-adapter-contract.md`; do not rewrite
pending-order-first orchestration in the route handler.

## Method Rules

Before the final payment button, require a three-choice selector in this order:
`微信`, `支付宝`, `银行卡`. Map the stored selection to the approved GlobePay
channel only on the server. Do not default to or switch payment methods without
an explicit buyer selection.

Hosted card/bank card must use GlobePay-hosted card input. Never collect card
number, expiry, or CVV in the Buyna.ai frontend.

WeChat/Alipay QR must create a provider order first, then show QR or redirect to signed pay page. Channel values are case-sensitive: `Wechat`, `Alipay`, `Alipay+`.

Make payment next actions responsive. For enabled channels, use JSAPI inside
the matching wallet browser, prefer Mobile H5 on ordinary mobile browsers, and
use QR or a signed hosted page on desktop. For mobile WeChat selection, hand
off to the real enabled WeChat H5/JSAPI flow and provide a return URL to the
local order-result route. Never show QR first on mobile when a verified
H5/JSAPI route is available.

Do not claim that H5 always opens an installed wallet. If the account/channel,
browser, or device cannot perform the handoff, preserve the pending order and
selection, explain the limitation, and offer only an approved fallback such as
retry, open in the required wallet browser, or QR on another device. Use common
cashier only when merchant wants a hosted payment-method chooser. Use
UnionPay/web gateway only when the official docs and account explicitly enable
it.

## Combine With

Use `buyai-globepay-config` for signing and URL issues. Use `buyai-globepay-status-sync` for return/notify/query. Use product or booking skills for local order schema and stock/capacity.

## Validate

Check all three choices render before the payment button, unavailable channels
are disabled, the selected method is stored on the pending order, the payment
button uses validated form state, creates the local pending record first, calls
the matching server-only adapter, returns `redirect` or `show_qr`, preserves
form and selection on provider error, and never shows a fake waiting page
instead of the actual GlobePay next action.

Test at least desktop, ordinary mobile browser, matching wallet browser,
return-from-wallet, cancel/failure, wallet-not-installed or handoff-failure,
and disabled-channel behavior. On return, query the server-side payment status;
the redirect itself must never mark the order paid.

Deliver checkout source, server adapter, pending-record persistence, and
applicable tests in the real project. Report changed paths and verification
results; endpoint notes alone are not complete.
