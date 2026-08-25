---
name: buyai-checkout-address-ux
description: "Use when buyer or customer checkout forms need address fields, Japan postal fill, field validation or persistence, order review, or payment-method selection."
---

# Buyai Checkout Address UX

Use for buyer/customer forms, shipping UX, Japan postal auto-fill, mobile input, and form persistence after validation/payment errors. Do not use for catalog, capacity, GlobePay, or seller dashboard.

## First Move

Confirm buyer language, admin language, seller country, shipping/service country, flow type, and required fields. Inspect form state, validation, checkout/payment actions, order schema, order detail, and CSV.

For every approved product or booking checkout, resolve
`buyna-checkout-flow-core` from the project `packages/` or
`$env:USERPROFILE/.codex/packages/`. Product commerce also resolves
`buyna-cart-core` and `buyna-order-core`; paid booking uses its booking Adapter
and does not require cart. Return `BLOCKED: FIXED_COMMERCE_MODULES_NOT_INSTALLED`
when a selected core is missing.

Read `references/checkout-address-rules.md` for labels, schemas, and postal-code behavior.

## Combine Skills

Use `buyai-product-merchant-backend` for product checkout, `buyai-booking-service-backend` for booking forms, `buyai-globepay-payment` for payment, and `buyai-storefront-layout-ux` for mobile/readability.

For product commerce, use `packages/buyna-cart-core` for cart state. For product
or booking, use `packages/buyna-checkout-flow-core` for the fixed progression: minimum fields
valid → payment method selected → order review → submitting → `order_locked`.
The checkout core creates the immutable submission snapshot and locks the local
`pending_payment` order/booking through the selected order or booking Adapter
before provider payment begins. Generate only project presentation, field/configuration
mapping, persistence Adapter, routes, and approved shipping/discount/tax
configuration.

Preserve the fixed commerce sequence: right-side cart → buyer form → order review →
provider payment → server-verified result. The review step must show all items,
quantities, buyer/address information, totals, payment method, and one payment
button. Do not clear cart/form state on provider redirect or error.

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

At order/booking creation, send and persist an immutable submission snapshot of every customer-visible field the customer actually completed, including approved custom fields and the original raw text when a combined field is used. Preserve field key, display label, value, display order, form/schema version, and locale so later form changes do not hide old answers. Never include passwords, session/auth tokens, card number, expiry, CVV, or provider secrets.

For Japan shipping, accept `1234567` and `123-4567`, normalize to seven digits, and auto-fill prefecture/city/town through a server endpoint. Do not overwrite edited fields. Lookup failure must not block checkout.

## Validate

Check mobile usability, project-required fields, payment-method selection,
disabled-button behavior, selection persistence after errors, email nullability
only when explicitly allowed, postal fallback, server revalidation, seller
order-detail display of every saved customer answer, CSV, and email prefill.

## Code Delivery

Deliver the changed form components, validation, server handlers, persistence
mapping, and applicable tests in the real project. Report changed paths and
verification results. Field lists or UI descriptions alone are not complete.
