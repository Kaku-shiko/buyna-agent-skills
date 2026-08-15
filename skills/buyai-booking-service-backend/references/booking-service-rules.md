# Booking Service Rules

## Recommended Modules

For the current application and AWS backend, keep these responsibilities in separate modules:

- `seller-identity`: account login, session, canonical seller.
- `service-catalog`: services, packages, images, sorting.
- `availability`: dates, time slots, capacity, holds, releases.
- `booking-checkout`: booking form, pending booking, payment start.
- `payment-ledger`: payment attempts, status transitions, paid booking creation.
- `seller-backoffice`: dashboard, bookings, paid bookings, CSV, settings.
- `globepay-adapter`: server-only GlobePay calls.

## Minimal Data Model

`services`:

- `id`
- `project_id`
- `seller_id`
- `name`
- `description`
- `short_description`
- `location`
- `duration_label`
- `price`
- `deposit_price`
- `currency`
- `payment_mode`
- `main_image_id`
- `sort_order`
- `featured`
- `status`
- `deleted_at`
- `created_at`
- `updated_at`

`service_images`:

- same pattern as product images
- max 5 images per service unless merchant requests more

`service_slots`:

- `id`
- `project_id`
- `seller_id`
- `service_id`
- `starts_at`
- `ends_at`
- `timezone`
- `capacity`
- `reserved_count`
- `confirmed_count`
- `status`

`bookings`:

- `id`
- `project_id`
- `seller_id`
- `service_id`
- `slot_id`
- service snapshot
- date/time snapshot
- participant count
- customer name/email/phone
- notes
- total amount
- deposit amount
- currency
- payment method
- status
- provider order id
- provider transaction id
- `paid_at`
- `expires_at`
- `created_at`
- `updated_at`

`payments`:

- use the same `project_id + seller_id` payment ledger pattern as product commerce

`paid_customers` or `paid_bookings`:

- project id
- seller id
- booking id
- customer details
- service name
- booking date/time
- amount paid
- payment method
- paid time
- provider transaction id
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

## Money Display

- Use a shared currency formatter for service list, service detail, booking form, seller backend, booking records, paid customers, CSV export, and manual email actions.
- JPY has zero decimal places. Display `¥12,000`, not `¥12,000.00`.
- CNY has two decimal places.
- Keep stored/API amount units separate from display formatting.
- Service price edits must update every public and backend display location using the same formatter.

## Availability Rules

- Store service time in UTC internally.
- Display booking and seller times in service/merchant timezone, default `Asia/Tokyo`.
- Use timezone-aware month/date filters.
- Prevent overselling by re-checking capacity server-side immediately before creating payment.
- Use temporary holds for pending payment bookings.
- Release holds when payment expires, fails, or is cancelled.
- Confirm booking only once after verified payment success.

## Booking Form Rules

Required fields:

- customer name
- customer email
- phone when useful
- service
- date/time or preferred date
- participant count

Optional fields:

- hotel/pickup point
- age/experience level
- special notes
- emergency contact
- equipment sizes

Only add domain-specific fields when merchant asks or the service requires them.

Store every completed customer-visible booking field as an immutable submission snapshot with stable key, submitted label, value, field type, display order, form/schema version, and locale. Preserve approved custom questions and free-text raw values even if the form changes later. The seller-authorized booking detail, applicable CSV, and manual-email context must display every safe snapshot entry. Never store or expose card data, CVV, passwords, auth/session tokens, provider secrets, or unapproved hidden fields.

## Seller Backoffice Filters

Bookings page should support:

- status
- month
- service
- payment method
- search by booking id, customer name, email, service name

Paid bookings/customers CSV must respect active filters.

## Company Footer

Public booking/service pages should include one shared company/brand footer component.

- Use one `site_settings` / `merchant_profile` source for footer content.
- Show footer on homepage, service list, service detail, booking form, checkout, confirmation/success, and policy pages.
- Do not duplicate hard-coded company text in each page.
- Policy links should include Privacy Policy and Terms of Service when configured.
- Store policy links in settings fields such as `privacy_url` and `terms_url`.
- Seller backend should let the merchant edit company/footer information when self-management is in scope.
- If the merchant has provided real company information, remove placeholders and old imported/demo store details.
- The footer must be responsive and should not overlap sticky booking/payment UI on mobile.

## Service Packages

For package services such as "5 days 4 nights Okinawa/Hawaii":

- Use service records for each package/location.
- Store package duration as label and description.
- If dates are fixed departures, use slots.
- If dates are custom inquiry, use preferred dates in booking form.
