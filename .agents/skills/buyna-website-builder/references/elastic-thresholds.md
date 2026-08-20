# Elastic thresholds for this workflow

## 一、硬性门槛（Hard）

下面指标任何情况下都必须满足，否则必须 `BLOCKED`：

- 未验证的数据库、S3、进程、域名、支付回调链路证据；
- 跨商家读写失败（`project_id/seller_id` 绑定不一致）；
- 支付状态写入未经过 provider notify/query 双核校验；
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

## 四、最小验收（Minimum Required）

- 支付/交易站点在默认流程下只要求：
  - 预检查通过（host/secret/env、回调路由、待支付状态）
  - 支付创建可复现（返回支付单据/跳转地址）  
  - 一次支付成功/失败边界能写入受信状态（notify/query）
- 测试上传门最小门槛：
  - 主路径可用（核心页面和核心 API）
  - 安全隔离/写入边界基本通过
  - 体积治理与敏感文件清理证据
  - 发布产物验证（构建/依赖/部署文件）
- 其余测试与质量项进入 `DEFERRED` 清单，用户确认后可补跑，不阻断最小交付。

## 五、执行规则

- 能力未满足时要写 `SKIP` + `SKIP_REASON`，不能直接返回 `PASS`。  
- 软性指标失败不能触发全局阻塞，需形成下一步补齐计划并得到确认。  
- 每个硬性门槛一旦失败仅回退到该阶段，不清空历史已通过证据。  
