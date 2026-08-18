# Fixed Cart And Order Cores

Use these packages instead of regenerating cart and order business rules:

- `packages/buyna-cart-core`
- `packages/buyna-order-core`

## Cart composition

Use the fixed commerce flow as the default storefront behavior:

```text
加入购物车 → 右侧购物车抽屉 → 买家资料 → 订单确认 → 支付 → 服务端验证结果
```

The drawer shows item count, product image, name/SKU, unit price, quantity
decrease/increase, removal, line total, cart total, and one checkout action for
all items. Use the fixed `./react` components and `./styles.css`; configure
brand tokens and translated labels rather than regenerating the drawer.

Create `createCartService` with a server-owned `projectId`, `sellerId`, and a
trusted `cartId`. Generate only:

- a catalog Adapter implementing `resolvePurchasableItem`;
- a Store Adapter implementing `load` and `save` for local, session, or
  PostgreSQL persistence;
- approved `shipping`, `discount`, and `tax` pricing callbacks;
- API/UI wiring.

Call `addItem`, `updateQuantity`, `removeItem`, `getCart`, and
`createCheckoutSnapshot`. Default to at most 10 units per line and 20 distinct
lines unless the approved project explicitly configures different limits.
Never trust browser price, stock, totals, currency,
or merchant ownership.

For a guest browser cart, prefer the included `./local-storage` Adapter. It
persists only product id, variant id, and quantity; all display and checkout
values are resolved again through the trusted catalog Adapter.

Keep the cart through form validation, network/provider errors, payment-page
opening, and provider return. Call `clearCart` only with `verified_payment`
after trusted server verification, or `explicit_reset` after a buyer-confirmed
reset. A redirect is never permission to clear it.

## Order composition

Create `createOrderService` with the same server-owned merchant scope and an
unpredictable order-id generator. Generate only the PostgreSQL Store Adapter,
routes, approved custom-field mapping, and notification templates.

Call `createPendingOrder` only with a fresh fixed-cart checkout snapshot and
the complete safe customer submission. Use `listOrders`, `getOrderDetail`,
`archiveUnpaidOrder`, and `createOrdersCsv` for the seller backend.

Do not mark an order paid or refunded through the order core. Route trusted
provider notify/query results to the existing GlobePay service/status core.

## Tests

```powershell
npm test --prefix packages\buyna-cart-core
npm test --prefix packages\buyna-order-core
```
