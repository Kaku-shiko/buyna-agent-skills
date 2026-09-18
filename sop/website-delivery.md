# 02 网站交付 SOP

ID：website-delivery · 版本：1.0.0 · 负责人：交付负责人。

适用：商品商城、预约网站或混合业务交付。输入为已明确范围的 brief、能力与资源绑定；输出为对应范围的页面、业务功能和验证证据。遵守[统一执行规则](execution-contract.md)和七个现有 gate。

## 执行步骤

| stepId／gate | 动作与角色 | 输出和完成检查 |
| --- | --- | --- |
| intake／customer_intake | 交付负责人核对资料与范围，必要时调用入驻 SOP | 已有批准及输入来源可追踪；不重做已完成入驻 |
| design／design_and_structure | 设计执行者按品牌和上传素材组合区块，确认必要／可选区块及数量 | 桌面和移动结构、素材用途和设计；已有选择不重复询问 |
| frontend／frontend_code | 技术执行者实现页面、交互并逐步给出预览 | 框架→内容→交互→数据连接的可查看版本；标明各阶段连接状态 |
| backend／dashboard_integration | 技术执行者连接固定模块与项目 Adapter | 商品、分类、Banner 等实际读写；前端可配置内容有对应后台入口 |
| checkout／checkout_payment | 技术执行者按能力调用支付或预约 SOP | 子流程证据；不适用须按既有 Workflow 规则记录 |
| verify／testing_upload_gate | 验证者执行范围内功能、权限、持久化与移动端检查 | 测试结果、缺陷闭环、构建和产物摘要；未测项明确 |
| release／aws_release | 技术执行者核对现有发布授权、发布固定产物并检查 | 实际版本、URL、健康、关键路由和回滚证据；没有发布则不能称上线 |

## 页面和后台的固定要求

- 区块数量、顺序、布局按配置调整；必要披露和结账明细不得被展示数量截断。上传图片决定视觉素材，不擅自改变商品事实。
- 购物车跟随本项目品牌独立设计，不复用 Medinance 购物车 UI；可复用无 UI 的固定业务模块。暂缓的网站可视化装修不纳入默认交付。
- 登录文案为“登录”；对外用正常营业文案，内部如实报告测试数据和未接入状态。
- 创建／编辑分类、清空商品描述、未修改直接保存、优惠券暂停后启用都应返回明确结果，刷新后与服务端一致。
- “删除”必须对应支持的删除操作，不能只把归档按钮改名。被已付款订单引用的历史数据按关联完整性规则保留，并说明不能删除的原因。
- 图片上传需验证对象持久化、数据库元数据、刷新后读取与租户权限；替换前后 object key 相同不得删除仍引用对象。失败保留草稿，说明可重试入口。
- Basic 500 MiB、Pro 2 GiB 为产品配额要求，由服务端有效权益计算和执行；界面显示单位一致，不能靠前端字段授予配额。

## Skill 与模块

入口为[网站 Builder](../skills/buyna-website-builder/SKILL.md)。按步骤使用[设计](../skills/buyna-website-design/SKILL.md)、[页面结构](../skills/buyna-page-structure/SKILL.md)、[商城区块](../skills/buyai-commerce-section-design/SKILL.md)、[前端](../skills/buyna-frontend-builder/SKILL.md)、[商品后台](../skills/buyai-product-merchant-backend/SKILL.md)、[后台交互](../skills/buyai-dashboard-data-interaction/SKILL.md)、[文件](../skills/buyna-s3-storage/SKILL.md)、[验证](../skills/buyna-testing-quality/SKILL.md)、[发布](../skills/buyna-aws-release/SKILL.md)。

固定规则对应 [catalog](../packages/buyna-merchant-catalog-core/package.json)、[dashboard](../packages/buyna-merchant-dashboard-core/package.json)、[file](../packages/buyna-merchant-file-core/package.json)、[auth](../packages/buyna-auth-session-core/package.json)、[workflow](../packages/buyna-workflow-state-core/package.json)。其他能力从清单按需选择，模块存在不等于 Adapter 已接通。

## 验收和异常

验收覆盖真实保存后重读、跨商户拒绝、空／错误／加载／成功反馈以及适用业务流程。订单含失败／过期记录不应使整个概览失败；销量和金额按币种分组。失败测试不能用 N/A 跳过。

真实付款测试由用户承担且未执行时，按现有契约记录待验证；在不虚假启用或声称已验证支付的前提下处理网站发布，不能把模拟交易当证明。上线前记录影响和回滚；上线后检查受影响站点。发布失败转[故障恢复](incident-and-recovery.md)，局部改动转[修改维护](change-and-maintenance.md)。
