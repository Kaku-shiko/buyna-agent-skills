# Checkout Address Rules

Use these detailed rules when implementing or repairing buyer/customer forms.

## Product Checkout Fields

Recommended structured product order fields:

- `buyer_name`
- `buyer_email`
- `phone`
- `recipient_name`
- `postal_code`
- `prefecture`
- `city`
- `town`
- `address_line1`
- `address_line2`
- `country`
- `notes`
- `quantity`
- `payment_method`

For Chinese buyer UI, use clear labels for name, email, phone, postal code, country/region, prefecture/city/town, street/building/room, notes, and payment method. For Japan-based shipping, default country can be Japan when the project asks for Japan sales.

If the merchant chooses the single-box mobile form, make one large textarea required and explain the expected format: name, phone, postal code, country/region, full address, and optional email. Store the raw text and display it in seller order detail and CSV. Parse optional fields only as a helper; never lose the original text.

For simplified China-facing product orders, the single-box form may be the preferred MVP. Tell buyers they can separate fields with spaces, commas, or line breaks. The checkout still creates a local pending order before payment and keeps the raw field after payment errors.

## Form Persistence

Do not clear form fields after:

- validation error;
- missing required field;
- GlobePay create-order rejection;
- network/server error;
- payment page failed to open.

Use React state plus `sessionStorage` or equivalent draft storage. Clear only after verified paid success or explicit buyer reset.

If the buyer clicks a payment method and GlobePay creation fails, keep selected quantity, SKU, payment method, and address draft. The page should allow retry without retyping.

## Japan Postal Code Auto-Fill

Accept `1234567` or `123-4567`, normalize to seven digits, and call a local endpoint such as:

```text
GET /api/address/jp-postal-code?postalCode=1234567
```

The local endpoint may wrap `https://zipcloud.ibsnet.co.jp/api/search?zipcode=...` for MVP. Map `address1` to prefecture, `address2` to city, and `address3` to town. Keep street, building, and room editable. Do not overwrite buyer-edited values unless the buyer explicitly requests a relookup.

If lookup returns no result, multiple results, timeout, or error, allow manual entry and keep checkout usable.

## Backend And Seller Visibility

The checkout action must pass validated form data to the server before payment. Seller order detail, paid-customer detail, CSV export, and manual email prefill must show the same saved fields. If buyer email is optional, backend storage must allow null or a safe fallback and must not fail paid-customer creation.

Persist an immutable `customer_submission_snapshot` (or equivalent normalized child records) when creating the local pending order/booking. Include every customer-visible field actually submitted: stable key, submitted label, value, field type, display order, form/schema version, and locale. Include approved custom questions and preserve the original raw value for combined/free-text forms. Do not reconstruct old submissions only from the current form definition.

The authorized seller order/booking detail must render all snapshot entries in their submitted order without silently dropping unknown or later-removed fields. Lists may remain summaries, but detail, applicable CSV export, and manual-email context must expose all safe submitted customer information. Never store or display passwords, authentication/session tokens, full card data, CVV, provider secrets, or unapproved hidden technical fields.

## Validation Checklist

Verify mobile layout, required-field errors, optional email behavior, field persistence after failed payment, postal lookup fallback, server-side validation before payment, complete snapshot round-trip, order-detail rendering of custom and legacy fields, safe CSV export, and manual email body prefill.
