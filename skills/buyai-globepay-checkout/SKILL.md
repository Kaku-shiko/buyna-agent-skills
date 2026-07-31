---
name: buyai-globepay-checkout
description: "Implement or repair one-time GlobePay checkout: hosted credit card, bank card, WeChat Pay QR, Alipay QR, AlipayPlus, Mobile H5, JSAPI, common cashier, QR display, and redirect behavior."
---

# Buyai GlobePay Checkout

Use for one-time payment creation and buyer next action: hosted card page, QR scan, H5, JSAPI, or common cashier. Do not mark paid here; paid status belongs to `buyai-globepay-status-sync`.

## Gold

Create a local `pending_payment` order/booking before calling GlobePay. Store buyer/customer data, item snapshot, amount, currency, payment method, provider order id, and provider partner-code snapshot. Provider order creation success is not payment success.

## First Move

Read `references/checkout-endpoints.md`. Confirm selected method, merchant enabled channels, currency, item amount, notify URL, return URL, and whether this is product or booking flow.

## Method Rules

Before the final payment button, require a three-choice selector in this order:
`微信`, `支付宝`, `银行卡`. Map the stored selection to the approved GlobePay
channel only on the server. Do not default to or switch payment methods without
an explicit buyer selection.

Hosted card/bank card must use GlobePay-hosted card input. Never collect card
number, expiry, or CVV in the Buyna.ai frontend.

WeChat/Alipay QR must create a provider order first, then show QR or redirect to signed pay page. Channel values are case-sensitive: `Wechat`, `Alipay`, `Alipay+`.

Use Mobile H5 only when the user flow requires it. Use JSAPI only inside WeChat/Alipay app-browser contexts. Use common cashier only when merchant wants a hosted payment-method chooser. Use UnionPay/web gateway only when the official docs and account explicitly enable it.

## Combine With

Use `buyai-globepay-config` for signing and URL issues. Use `buyai-globepay-status-sync` for return/notify/query. Use product or booking skills for local order schema and stock/capacity.

## Validate

Check all three choices render before the payment button, unavailable channels
are disabled, the selected method is stored on the pending order, the payment
button uses validated form state, creates the local pending record first, calls
the matching server-only adapter, returns `redirect` or `show_qr`, preserves
form and selection on provider error, and never shows a fake waiting page
instead of the actual GlobePay next action.

Deliver checkout source, server adapter, pending-record persistence, and
applicable tests in the real project. Report changed paths and verification
results; endpoint notes alone are not complete.
