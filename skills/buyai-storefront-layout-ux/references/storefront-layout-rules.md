# Storefront Layout Rules

Use these detailed layout rules when building or repairing Buyai public merchant websites.

## Header And Navigation

Every public storefront should have a clear brand/header, primary navigation, and visible login/admin entry. The visible button label is `登录`, not `商户登录` or `商家登录`, unless the user explicitly approves different copy. The entry should link to `/seller/login` or the project's actual seller route. Do not hide it only in tiny footer text.

On mobile, buyer-facing navigation buttons should be easier to tap than seller/admin controls. Merchant login remains visible but should not compete with the main buying flow.

Product navigation may include home, category tabs, all products, and about/company pages. Booking navigation may include services, booking, about, and contact. Keep labels readable on desktop and mobile.

## Backend-Driven Categories

When backend category management exists, public category tabs must be generated from backend categories. Always show `All` first. Show visible categories that have active products/services. Hide empty public categories. If seller edits a category label, description, or sort order, the public tabs and descriptions must update.

Do not keep stale fixed categories like Kids/Women/Luxury after backend categories exist unless those are actual backend records.

## Page Structure

Recommended product page order:

1. Header/navigation
2. Optional brand intro or hero
3. Collection/product section title
4. Category filters
5. Product grid or useful empty state
6. Shared company/footer
7. Legal footer row

Avoid large empty vertical areas. If no products exist, show a useful message and optionally a seller backend link.

## Product Cards And Detail Links

Product cards should show image/placeholder, product name, category, price, stock/sold-out state when relevant, and a clear view/detail action. Detail pages should show the gallery, product description, SKU/options when present, price, stock state, checkout action, and company footer.

JPY prices display without decimals. Do not show `¥3,980.00`.

Cards should avoid hard borders that make the page look rigid. Prefer soft border color, subtle shadow, image-first layout, and clear spacing. Keep luxury/minimal layouts readable; do not make product names, category labels, or prices too faint.

Product descriptions on detail pages must allow long text. Use proper wrapping, readable line-height, and expandable/scrollable sections only when necessary. Do not clip long Japanese/Chinese descriptions.

## Cart And Order Review

Use the fixed commerce sequence: cart drawer, buyer form, order review,
provider payment, server-verified result. The right-side drawer contains every
selected item and one checkout action for the whole cart. The order-review page
shows product images/details, quantities, buyer/address fields, totals, selected
payment method, and one final payment button. Do not skip review or replace it
with a QR-only page. Preserve cart/form state on validation, network, provider,
or return errors; clear only after verified success or explicit reset.

## Footer

Use one shared footer component across public pages. Content should come from `site_settings`, `merchant_profile`, or equivalent shared config. Recommended fields: logo, brand name, legal company name, postal code, address, phone, email, business hours, seller login link, privacy policy, and terms link.

The footer must be readable and mobile-friendly. Do not hard-code conflicting company names on different pages.

## Color, Contrast, And Mobile

Readable premium design is better than pale minimalism. Use strong contrast for body text, navigation, category tabs, footer, legal links, prices, and buttons. Active states must be obvious. On mobile, header should not consume too much height, nav/category filters can wrap or scroll, product cards should stack cleanly, and key actions must remain tappable.

Remove public editor, preview, or deployment-platform badges from production UI when requested.

## Motion And Anime.js

Use motion only when it improves clarity, feedback, or perceived quality. Keep merchant buying and admin workflows fast and readable.

Anime.js may be used as an optional animation library for advanced frontend polish. Current package name is `animejs`; modern V4 import style is:

```js
import { animate, stagger } from 'animejs';
```

Good Anime.js uses: tasteful product/card entrance, filter transition, image gallery change, success confirmation, small admin feedback, guided onboarding, or brand hero motion.

Do not use Anime.js to control payment state, order creation, form validation, login, inventory updates, or backend synchronization. Those must remain normal application state and server logic.

All motion must support `prefers-reduced-motion`, avoid layout-property animation, avoid distracting loops, and keep content visible even if JavaScript animation fails.

## Validation Checklist

Check desktop and mobile screenshots. Confirm header, seller login entry, backend-driven category tabs, readable product grid, working detail links, shared footer, legal links, empty state, and no clipped actions.
