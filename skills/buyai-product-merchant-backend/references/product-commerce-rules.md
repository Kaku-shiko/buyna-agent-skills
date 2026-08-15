# Product Commerce Rules

## Recommended Modules

For the current application and AWS backend, keep these responsibilities in separate modules:

- `seller-identity`: account login, session, canonical seller.
- `catalog`: products, variants, images, inventory, sorting.
- `checkout`: buyer form, shipping form, pending order, payment start.
- `payment-ledger`: payment attempts, status transitions, paid customer creation.
- `seller-backoffice`: dashboard, orders, paid customers, CSV, settings.
- `globepay-adapter`: server-only GlobePay calls.

Follow the repository's module conventions. Avoid putting all behavior into one giant route, service, or server-functions file.

## Minimal Data Model

`sellers`:

- `id`
- `project_id`
- `account` or `username`
- `name`
- `email`
- `password_hash`
- `status`
- `created_at`
- `updated_at`

`products`:

- `id`
- `project_id`
- `seller_id`
- `name`
- `description`
- `short_description`
- `price`
- `currency`
- `stock`
- `main_image_id`
- `sort_order`
- `featured`
- `status`
- `deleted_at`
- `created_at`
- `updated_at`

`product_variants` when SKUs exist:

- `id`
- `project_id`
- `seller_id`
- `product_id`
- `sku_code`
- `external_sku_id`
- options
- `price`
- `currency`
- `stock_quantity`
- `status`

`product_images`:

- `id`
- `project_id`
- `seller_id`
- `product_id`
- `storage_path`
- `public_url`
- `alt_text`
- `position`
- `is_main`
- `file_size`
- `mime_type`

`orders`:

- `id`
- `project_id`
- `seller_id`
- `product_id`
- `variant_id`
- product/variant/price snapshots
- quantity
- amount
- currency
- buyer name/email/phone
- shipping fields
- payment method
- provider order id
- provider transaction id
- status
- `paid_at`
- `expires_at`
- `archived_at` or `deleted_at`

Product checkout buyer form fields:

- `buyer_name`
- `buyer_email`
- `buyer_phone`
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

Checkout form rules:

- Product checkout must collect buyer and shipping information before payment.
- Immediately before the final payment button, show one single-selection
  control with exactly these choices in order: `微信`, `支付宝`, `银行卡`.
- Require explicit selection and a valid buyer form before enabling payment.
- Persist the selected method on the local `pending_payment` order.
- Keep unconfigured GlobePay channels visible but disabled with a clear
  explanation; never silently substitute another method.
- Preserve the selected method after validation, network, or provider errors.
- Map the selected method to the approved GlobePay channel server-side.
- Bank card checkout must use GlobePay-hosted card entry; never collect card
  number, expiry, or CVV in the Buyna.ai frontend.
- Payment buttons must use the validated form state; do not leave payment buttons disconnected from the order form.
- Create a local `pending_payment` order before calling GlobePay.
- Store buyer fields, shipping fields, product snapshot, quantity, amount, currency, and payment method on the order.
- Preserve form state after validation errors, payment creation errors, and GlobePay rejection.
- Show inline validation errors, not raw schema/JSON errors.
- Seller order detail, Paid Customers page, CSV export, and manual email action must show the buyer form and shipping information.
- Store every completed customer-visible checkout field as an immutable submission snapshot with key, submitted label, value, type, order, schema version, and locale. Preserve custom/removed fields and combined-form raw text. The seller-authorized order-detail API and UI must show every safe snapshot entry; never include card data, CVV, credentials, tokens, provider secrets, or hidden technical fields.

`payments`:

- `id`
- `project_id`
- `seller_id`
- `order_id`
- `provider`
- `provider_order_id`
- `provider_partner_code`
- `provider_account_label`
- `payment_method`
- `amount_requested`
- `amount_paid`
- `real_fee`
- `currency`
- `status`
- raw response/event JSON

`paid_customers`:

- `id`
- `project_id`
- `seller_id`
- `order_id`
- customer name/email/phone
- product/service name
- quantity
- amount
- real fee
- currency
- payment method
- paid time
- provider transaction id
- shipping fields
- manual email status

`site_settings` or `merchant_profile`:

- `project_id`
- `seller_id`
- `brand_name`
- `brand_story_heading`
- `tagline`
- `logo_url`
- `legal_company_name`
- `postal_code`
- `address`
- `telephone`
- `fax`
- `email`
- `business_hours`
- social links
- legal/policy links
- `privacy_url`
- `terms_url`
- `updated_at`

## Product Price Source

- Use prices from customer-supplied product materials when present.
- When a price is absent, default `price_source` to `merchant_dashboard` without asking for confirmation.
- Allow the merchant to create or import the product as a draft and maintain its price in 商品管理.
- Never invent, estimate, or silently substitute a price. Do not publish or enable checkout until the effective product/SKU price is valid.
- After a Dashboard price update, use the same catalog source for public list, detail, cart, checkout, and order snapshots.

## Money Display

- Use a shared currency formatter for product list, product detail, checkout, seller product table, orders, paid customers, CSV export, and manual email actions.
- JPY has zero decimal places. Display `¥5,980`, not `¥5,980.00`.
- CNY has two decimal places.
- Keep stored/API amount units separate from display formatting.
- Product price edits must update every public and backend display location using the same formatter.

## Public Product Ordering

Default order:

1. `featured desc`
2. `sort_order asc`
3. recent `updated_at` or `created_at`

Seller backend should let seller reorder products using drag-and-drop by default. Compact move up/down buttons or an editable position number may exist only as fallback controls.

Newly published active products should appear first by default unless the seller has already saved a custom sort order. A new active product must appear immediately on public storefront and seller preview.

## Product Images And Storage

The original MVP supported up to 5 images per product. Current richer product sites may support up to 10 images per product. Keep the limit configurable, for example `MAX_PRODUCT_IMAGES`, and do not hard-code old limits in only one component.

- Main image appears on listing cards.
- Detail page shows all product images as a carousel/gallery.
- SKU/variant images appear when that variant is selected.
- Upload, delete, reorder, and set-main actions update the same `product_images` source.
- Use the configured S3 bucket and project storage adapter; do not store image binaries in product rows.
- Current Buyai storage quota target: 500MB per merchant when quota is requested.
- Seller backend should show storage usage: used MB, quota MB, and remaining percent.
- If quota is exceeded, block new uploads with a friendly message and keep existing images visible.
- If signing fails after upload, roll back the object and show a friendly retry message instead of raw `Object not found`.

## Product Table UI

Keep the product management table dense and practical.

- The position/sort column should be narrow.
- Avoid oversized up/down controls on the far left.
- Use drag-and-drop as the default interaction.
- Show a compact drag handle in each row/card.
- Keep compact up/down icons or a narrow position number input only as fallback controls.
- Do not make the merchant manually understand strange raw numbering if a simpler order UI is possible.
- Actions such as image, edit, delete, and stock edit must stay visible and reachable on desktop and mobile.

## Company Footer

Public product-commerce pages should include one shared company/brand footer component.

- Use one `site_settings` / `merchant_profile` source for footer content.
- Show footer on homepage, product list, product detail, checkout, payment result/success, and policy pages.
- Do not duplicate hard-coded company text in each page.
- Policy links should include Privacy Policy and Terms of Service when configured.
- Store policy links in settings fields such as `privacy_url` and `terms_url`.
- Seller backend should let the merchant edit company/footer information when self-management is in scope.
- If the merchant has provided real company information, remove placeholders and old imported/demo store details.
- The footer must be responsive and should not overlap sticky checkout/payment UI on mobile.

## Stock Display And Editing

Use one stock source and one stock calculation across all product surfaces.

- Simple product: use `products.stock`.
- Variant/SKU product: use sum of active `product_variants.stock_quantity` as displayed total.
- Do not let seller list, edit modal, product detail, and checkout each calculate stock differently.
- If the product list/table correctly shows variant total stock, the edit modal must show the same total or clearly explain that stock is managed per variant.
- The edit modal must not show stale `0` when the product table shows correct available stock.
- Inline table stock editing should persist to the same backend fields as modal editing.
- If variants exist, inline stock editing should either:
  - open a variant stock editor, or
  - update variant stock through a clear deterministic rule chosen by the project.
- Never create per-product special cases. If one row has correct stock linkage, extract that logic and apply it to all products.
- Product stock updates must immediately affect:
  - seller product table
  - edit modal
  - public listing
  - product detail
  - checkout quantity limit
  - backend checkout validation

## SKU / Variant Detail Page

When one product has multiple sizes/colors/prices:

- store each SKU in `product_variants`;
- selected SKU controls price, stock, image, and checkout snapshot;
- product detail page must show selectable options clearly;
- selected variant must be passed to checkout;
- verified payment deducts only selected SKU stock;
- Orders, Paid Customers, CSV, and manual email must show selected SKU/options.

Do not let product-level price or stock override selected SKU price/stock after the buyer chooses a variant.

## CSV Export

Paid customer CSV must respect current filters:

- month
- search
- payment method
- product id

Include buyer, product, amount, payment method, paid time in merchant timezone, provider transaction id, and shipping address.

## Orders And Paid Customers Filters

Orders page must support:

- status filter: All, Paid, Pending Payment / 正在支付, Failed, Expired, Cancelled
- month filter using `YYYY-MM`
- default current month or recent records
- search by order id, customer name, customer email, product name
- payment method filter
- reset filters action
- pagination or load more
- URL query params reflecting active filters
- unpaid-order delete/archive action only for unpaid statuses
- one page-level silent payment-status refresh action; no per-row refresh buttons for MVP
- refresh repairs `pending_payment/expired/failed + PAY_SUCCESS -> paid`
- refresh repairs paid orders refunded in GlobePay -> `refunded`
- repaired `paid_at` uses provider/local payment time, not refresh-click time

Paid Customers page must support:

- month filter using `paid_at`
- search by customer name, customer email, order id, product name
- payment method filter
- product filter
- reset filters action
- CSV export respecting active filters

Backend/API should support:

- `GET /api/seller/orders?status=&month=&search=&paymentMethod=&page=`
- `GET /api/seller/paid-customers?month=&search=&paymentMethod=&productId=&page=`
- `GET /api/seller/paid-customers.csv` with the same filters as the Paid Customers page

## Mobile Admin

Seller backend must work on phone screens.

- Convert dense tables to cards/stacked rows or horizontal scroll with reachable actions.
- Do not rely on hover for essential actions.
- Keep add/edit/delete/archive/send-email buttons touchable.
- Dialogs must fit screen height and scroll internally when needed.
