# 03 支付与退款 SOP

ID：commerce-payment-refund · 版本：1.0.0 · 负责人：技术执行者；交易争议由授权操作员决策。

适用：接入配置、购买进入支付页失败、订单状态核对、退款及 GMV。输入为项目身份、有效能力、受保护凭据引用、实际订单和渠道证据。遵守[统一执行规则](execution-contract.md)。

## 状态必须分开记录

商户渠道开通、网站凭据配置、接口验证和真实交易验证是四项独立事实。提供 code 后不再无依据说“渠道未开通”；说明具体缺失字段或接口响应。凭据存在不等于接口验证通过，也不等于付款成功。凭据只从受保护配置读取，不回显。

## 执行步骤

| stepId | 动作与角色 | 输出和完成检查 |
| --- | --- | --- |
| configure | 技术执行者核对商户绑定、配置引用、环境、币种、签名与回调地址 | 分项配置状态和脱敏验证结果；不在公开记录存 code／credential |
| create_order | 技术执行者追踪购买→本地订单→渠道请求→支付页读取 | 稳定重试标识全链路传递；同请求不重复建单；金额、币种、商户及订单匹配 |
| reconcile | 技术执行者用服务端 notify／query 核验付款 | 已验证渠道证据、幂等状态变化；浏览器返回页不能单独确认付款 |
| late_payment | 技术执行者补记已失败／过期但渠道后来确认的真实付款 | 保留已收款事实；重新检查库存或预约名额，不能直接承诺履约 |
| refund | 授权操作员确定范围，技术执行者提交／查询同一退款请求 | 待处理与完成区分；按已确认累计金额判部分／全额退款；累计不超实付 |
| ledger | 技术执行者发送已确认付款和完成退款事件，验证者核对 CRM | 稳定事件 ID、原始币种及金额；原 GMV 流水保留，退款追加调整 |
| verify | 验证者核对一致性与交接 | 订单、渠道、退款、库存及账务证据对应；未执行真实交易明确列出 |

## 确定性业务约束

商品显示币种与实际付款币种分别记录；按对应币种最小单位计算，不能把人民币数值标成日元，也不能混加不同币种 GMV。如涉及兑换，必须记录真实报价来源和规则；不能由 AI 随意换算。商户销售概览按币种统计，CRM 的汇总规则由其账务契约决定。

付款和退款请求使用稳定幂等标识。渠道超时先查询同一请求，不能立即新建一笔。迟到付款先登记事实，再按库存／容量判断履约、替代方案或退款，需业务选择时交授权操作员。

退款申请不等于成功退款。完成退款事件才用于对应账务处理；禁止为退款删除原 GMV 流水。历史异常流水单独列出，不无证据补写。优惠券和库存释放／恢复由适用结算规则决定，不能每次重复通知都执行一次。

## Skill 与模块

使用[支付入口](../skills/buyai-globepay-payment/SKILL.md)、[配置](../skills/buyai-globepay-config/SKILL.md)、[结账](../skills/buyai-globepay-checkout/SKILL.md)、[状态同步](../skills/buyai-globepay-status-sync/SKILL.md)、[GMV](../skills/buyna-gmv-commerce/SKILL.md)；订阅场景再用[周期支付](../skills/buyai-globepay-recurring/SKILL.md)。

固定模块：[订单](../packages/buyna-order-core/package.json)、[结账](../packages/buyna-checkout-flow-core/package.json)、[结算](../packages/buyna-commerce-settlement-core/package.json)、[库存](../packages/buyna-inventory-core/package.json)、[优惠券](../packages/buyna-coupon-core/package.json)、[GMV](../packages/buyna-gmv-core/package.json)、[回执](../packages/buyna-integration-receipt-core/package.json)。项目采用 `fixed-cores` 或现有 `legacy-globepay-service` 时须记录实际路径，不混用两套状态更新规则。

## 验收与恢复

覆盖 CNY／JPY、重复建单、支付页订单读取、失败／过期后到账、重复通知、部分及全额退款、重复退款回调、金额或币种不匹配、无效回执有效期。回执只有来源、版本、摘要和有效期均满足既有校验时才能复用。

付款或退款结果不明进入[故障恢复](incident-and-recovery.md)，保留本地和渠道证据。操作员取消页面不等于渠道取消。真实支付或退款未做时明确“未验证”，不能用单元测试代替。
