# Website Skill Routing Map

Use dependency readiness, not phase number.

Route rule:
- `ready(nodes) = hard dependencies done` + `capability allows`
- Never start a node whose hard dependencies are not satisfied.
- If a later node is ready and user asks for it, route to that node directly.
- Keep each run to one gate or a compatible slice with delivery evidence.

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
