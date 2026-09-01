# Elastic thresholds for this workflow

## 一、硬性门槛（Hard）

`FAST_RELEASE` 默认只保留会直接造成泄密、写错商户、发布到错误目标、无法回滚或站点不可用的阻塞项：

- 本次实际使用但未验证的数据库、S3、进程或域名目标；
- 跨商家读写失败（`project_id/seller_id` 绑定不一致）；
- 如果本次宣称支付已上线，支付状态写入必须经过 provider notify/query 与金额/币种校验；
- 回滚路径未确认；
- 未经批准的基础设施新建（取决于注册架构的零新增约束）。

## 二、架构硬指标（Architecture-specific hard metrics）

- `shared_ec2_postgresql`（共享 EC2）：通常要求 `NEW_EC2_INSTANCES=0`、`NEW_DATABASES=0`、`NEW_BUCKETS=0`、`NEW_PORTS=0`，并绑定 `RESOURCE_MODE=existing_buyna_resources`。
- `aws_serverless`：不以 EC2/端口为主路径，不强制 `NEW_EC2_INSTANCES`，但仍要求分发、函数、数据存储与记录一致。
- `aws_static`：要求静态分发/桶边界一致，不要求实例新增。

## 三、可跳过门槛（Soft / capability gates）

- Dashboard 相关：当 `requiresDashboard=false` 可跳过。
- 购物车/结账/支付：当能力判定不包含支付交易时可跳过对应 gate。
- 预约：当非服务型站点时可跳过。
- 可选优化（动效增强、额外页面、部分覆盖测试）可延期但需写入 `DEFERRED` 原因。

## 四、FAST_RELEASE 最小验收（默认）

- 测试上传门最小门槛：
  - 运行产物可构建/启动，且不含 Secret、本地环境文件、缓存或 `node_modules`
  - 登记目标、关键写入隔离和回滚已确认
  - 发布后主入口、关键 API/路由和 HTTPS 健康
- 用户负责支付实测时记录 `PAYMENT_VERIFICATION: USER_OWNED_PENDING`，不阻断网站发布，但不得宣称支付已上线。
- 包体排行、图片大小、重复资源、全量模块/UI/支付旅程、性能和跨浏览器检查进入 `DEFERRED`。

## 五、FULL_VERIFICATION（仅明确要求）

用户明确要求“要完整验证”时，才执行完整固定模块/项目测试、支付成功失败退款、包体与重复资产、移动端、跨浏览器及性能审计。

## 六、执行规则

- 能力未满足时要写 `SKIP` + `SKIP_REASON`，不能直接返回 `PASS`。
- 软性指标失败不能触发全局阻塞，需形成下一步补齐计划并得到确认。
- 每个硬性门槛一旦失败仅回退到该阶段，不清空历史已通过证据。
