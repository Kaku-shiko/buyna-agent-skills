# Phase 7: Testing And Upload Gate

Deliver or update applicable automated tests and run them. For product
commerce, first verify and test the fixed Dashboard, catalog, cart, order,
PostgreSQL, and file modules. Verify desktop/mobile, permission, persistence,
error handling, UTF-8, critical journeys, and package size.

### Minimum delivery checks（默认优先）

- 只测最小阻塞项：  
  1) 站点主链路可用（首页/列表/详情/下单或预约主路径）  
  2) 关键权限与租户隔离（基础写保护）  
  3) 支付成功/失败关键状态流转（非全渠道全异常）  
  4) 运行包体与依赖清理（禁用本地环境文件、缓存、未过滤的大文件）  
  5) 可部署证据（构建产物路径、依赖恢复命令、部署目标）
- 通过后记录 `PASS_MIN`，并给出明确 `DEFERRED` 清单（谁负责/截止时间）。
- 仅在用户确认后启动“完整覆盖测试”：全量 UI 回归、全渠道异常码回放、性能压力、跨浏览器、端到端长链路。

Hard-test checks must pass before upload in minimal mode; deferred items become explicit follow-up tasks.
Non-blocking quality checks can be `DEFERRED` with explicit approval and a
scheduled follow-up.
Require an executed pre-upload report, exclusions, restore/build commands, and
`PASS` for required checks; do not upload dependencies, caches, local
 environments, or unexplained oversized assets.
