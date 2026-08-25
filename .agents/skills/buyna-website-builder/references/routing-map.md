# Website Skill Routing Map

Use dependency readiness and recorded capabilities to choose the minimum route.

Route recipe:

1. Read the approved brief and recorded capability values.
2. Compute `ready(nodes) = hard dependencies done + capability allows`.
3. Select the smallest ready node that satisfies the request.
4. Check `repository-manifest.json` and the installed package root for every fixed module selected by that node.
5. Load only the selected Skill and phase references.
6. Generate project Adapters, configuration, presentation, and missing project wiring around the fixed modules.
7. Run the minimum applicable fixed-module and project tests.
8. Continue ready included nodes inside an approved work package; otherwise return the one current decision point.

Dependency nodes:

- customer_intake
  - depends: none
  - next: design_and_structure
- design_and_structure
  - depends: customer_intake(DONE)
  - next: frontend_code
- frontend_code
  - depends: design_and_structure(DONE)
  - next: dashboard_backend, checkout_payment (按能力拆分)
- dashboard_backend
  - depends: frontend_code(DONE)
  - only if `requiresDashboard=true`
- checkout_payment
  - depends: frontend_code(DONE)
  - only if `requiresCheckout=true && requiresCart=true && requiresPayment=true`
  - fixed: `buyna-checkout-flow-core`, `buyna-commerce-settlement-core`
- optional_media_or_enhancement
  - depends: frontend_code(DONE)
  - always optional unless explicitly requested
- testing_and_upload
  - depends: frontend_code(DONE) + dashboard_backend( DONE | SKIP ) + checkout_payment(DONE | SKIP) + quality_thresholds
- aws_release
  - depends: testing_and_upload(PASS) + release_evidence

Code-block rule:
- 进入前端/后台可执行阶段前，确认 `fixed module` 或已可复用代码块是否存在；
- 没有可复用代码块时才允许生成新代码；
- 交付必须包含真实文件路径/模块名，不要只给提示/方案。

Practical flow:
- 允许顺序示例 A: 前端交付 -> 商品/订单/支付代码化接入 -> 测试 -> 发布。
- 允许顺序示例 B: 前端交付 -> 仪表盘代码化 -> 资源确认与测试 -> 发布。
- 不允许顺序示例 C: 未完成前端交付先调用发布、数据库迁移或新增端口。

Do not call every Skill every time.
Merchant file/image actions: route through `buyna-s3-storage` under the approved path; if no new schema/process changes are required, do not route infra provision skills.

Check [elastic thresholds](elastic-thresholds.md) first so hard gates are not confused with soft checkpoints.

## Scenario recipes

### Static showcase

- Capabilities: static pages and local preview; Dashboard, cart, checkout, payment, and booking are false.
- Route: `buyna-frontend-builder` for project presentation and local preview.
- State: `dashboard_backend = NOT_APPLICABLE`; `checkout_payment = NOT_APPLICABLE`.
- Tests: the frontend build and the smallest applicable responsive/locale checks.

### Product commerce without payment

- Capabilities: product catalog, merchant Dashboard, `requiresCart=true`, `requiresCheckout=false`, and `requiresPayment=false`.
- Route: `buyna-frontend-builder`, `buyai-product-merchant-backend`, and applicable Dashboard integration.
- Fixed modules: `buyna-cart-core` and `buyna-order-core`.
- State: `checkout_payment = NOT_APPLICABLE` with the recorded no-payment capability reason.
- Tests: the selected catalog/cart/order package tests plus project integration tests.

### Product commerce with GlobePay

- Capabilities: product catalog, cart, checkout, and GlobePay payment are true.
- Route: `buyai-product-merchant-backend`, `buyai-checkout-address-ux`, `buyai-globepay-payment`, `buyai-globepay-status-sync`, and `buyna-gmv-commerce`.
- Fixed modules: `buyna-cart-core`, `buyna-order-core`, `buyna-checkout-flow-core`, and `buyna-commerce-settlement-core`.
- Generate project Adapters, configuration, presentation, and provider/database wiring around those modules.
- Tests: both fixed commerce-state packages and the minimum project checkout/notify/query tests.

### Dependency-ready checkout repair

- Capabilities: checkout repair; frontend and backend dependencies are asserted complete.
- Evidence recovery: inspect existing delivery files, API contracts, and verification output; import verified delivery evidence through the workflow-state API and recompute readiness. Request one grouped evidence input only when a dependency cannot be verified.
- Route: enter `checkout_payment` directly when ready, using `buyai-checkout-address-ux`, the approved payment provider Skill, `buyai-globepay-status-sync`, and `buyna-gmv-commerce`.
- Fixed modules: `buyna-checkout-flow-core` and `buyna-commerce-settlement-core` plus existing cart/order modules.
- Generate only the targeted project Adapter, configuration, presentation, or wiring repair and its minimum tests.
