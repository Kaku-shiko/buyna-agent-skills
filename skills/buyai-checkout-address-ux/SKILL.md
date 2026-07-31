---
name: buyai-checkout-address-ux
description: "Improve Buyna.ai buyer and customer forms: address, Japan postal auto-fill, multilingual checkout UI, mobile input, form persistence, and backend synchronization."
---

# Buyai Checkout Address UX

Use for buyer/customer forms, shipping UX, Japan postal auto-fill, mobile input, and form persistence after validation/payment errors. Do not use for catalog, capacity, GlobePay, or seller dashboard.

## First Move

Confirm buyer language, admin language, seller country, shipping/service country, flow type, and required fields. Inspect form state, validation, checkout/payment actions, order schema, order detail, and CSV.

Read `references/checkout-address-rules.md` for labels, schemas, and postal-code behavior.

## Combine Skills

Use `buyai-product-merchant-backend` for product checkout, `buyai-booking-service-backend` for booking forms, `buyai-globepay-payment` for payment, and `buyai-storefront-layout-ux` for mobile/readability.

## Gold

Buyer forms must reduce typing and never lose data. Validate before payment. Show inline errors, not raw JSON/Zod. Preserve values after validation failure, GlobePay rejection, network error, or failed payment creation. Clear drafts only after verified success or reset.

## Payment Method Selector

Place one payment-method selector immediately before the final payment button.
For product checkout, present exactly these three customer-facing choices in
this order:

1. `微信`
2. `支付宝`
3. `银行卡`

Require an explicit selection. Keep the payment button disabled until the
buyer form is valid and one enabled method is selected. Preserve the selection
after validation, network, or payment-creation errors.

Show a method as enabled only when the merchant's GlobePay account and current
environment have that channel configured. Keep unavailable required methods
visible but disabled with a short explanation; do not silently route them to a
different channel.

Product orders store structured fields: name, email, phone, postal code, prefecture, city, town, address lines, country, notes, quantity, payment method, and item snapshot. Single-field quick forms must keep raw text visible to seller.

For Japan shipping, accept `1234567` and `123-4567`, normalize to seven digits, and auto-fill prefecture/city/town through a server endpoint. Do not overwrite edited fields. Lookup failure must not block checkout.

## Validate

Check mobile usability, project-required fields, payment-method selection,
disabled-button behavior, selection persistence after errors, email nullability
only when explicitly allowed, postal fallback, server revalidation, seller
address display, CSV, and email prefill.

## Code Delivery

Deliver the changed form components, validation, server handlers, persistence
mapping, and applicable tests in the real project. Report changed paths and
verification results. Field lists or UI descriptions alone are not complete.
