# Fixed Cart And Order Cores

Use these packages instead of regenerating cart and order business rules:

- `packages/buyna-cart-core`
- `packages/buyna-order-core`

## Cart composition

Use the fixed commerce flow as the default storefront behavior:

```text
加入购物车 → 购物车抽屉交互 → 买家资料 → 订单确认 → 支付 → 服务端验证结果
```

购物车抽屉交互状态、关闭/遮罩/Escape 退出、数量更新、删除、结算动作和安全的
购物车/订单转换为固定行为；每个项目生成自己的标记、主题、布局和 CSS。Cart drawer
open/closed state and dismissals are behavior only. Generate labels, images,
and presentation components in the project; do not import a cart React
component or stylesheet from the fixed core.

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
`createOrdersCsv` for the seller backend. `archiveUnpaidOrder` is a legacy
internal retention operation, not a default merchant button and not a delete
implementation. If unpaid-order deletion is requested, implement its scoped
delete contract before enabling it; never expose archive as a substitute.

Do not mark an order paid or refunded through the order core. Route trusted
provider notify/query results to the existing GlobePay service/status core.

## Tests

```powershell
npm test --prefix packages\buyna-cart-core
npm test --prefix packages\buyna-order-core
```

## Durable order creation and checkout composition

`createPendingOrder` requires a stable server-issued `idempotencyKey` (reuse the
checkout review submission ID). It uses `claimIdempotency` and
`completeIdempotency` on the same Store transaction as `createPendingOrder`.
Use the existing PostgreSQL Adapter's implementations with operation
`create_order`, unique `(project_id,seller_id,idempotency_key,operation)`, and
its `result_json` column. Bind the order insert and these methods to the same
transaction connection; do not implement the claim with a process-local Set.

The core persists `{fingerprint,order}`. A repeated matching key returns that
order; a different checkout/submission/method under that key fails with
`ORDER_IDEMPOTENCY_CONFLICT`. A technical failure rolls back the claim and insert.
The claim survives HTTP response loss and process restart. Do not delete order
creation claims while requests can replay. Existing Adapters must implement the
two claim methods before upgrading order-core to 0.2; missing methods fail closed.

Pass `createCheckoutOrderAdapter({orders:orderService,mapSubmission})` into
`createCheckoutFlow`. The adapter maps `checkoutSnapshot` to `checkout` and calls
the project's approved server-side field-schema mapper to produce the full
`submission` array with keys, labels and values. It preserves the stable key.
Do not pass orderService directly: the two public input shapes are different.
Keep expiry and customer schema stable for the same reviewed submission.

Map the saved order `total` to settlement `amount`; do not substitute a fresh
cart total during payment verification. Test the real checkout/order composition,
concurrent same-key submission, changed-payload conflict, transaction rollback,
and replay after losing the HTTP response.
