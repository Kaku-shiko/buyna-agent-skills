# Phase 7: Testing And Upload Gate

This phase keeps the compatible `testing_upload_gate` state ID but defaults to
上线优先的 `FAST_RELEASE`; it is no longer a mandatory exhaustive audit.

### FAST_RELEASE（默认，优先上线）

- 上线前只确认：运行产物可构建/启动且没有 Secret 或本地环境文件；目标资源已登记；关键写入具备租户隔离；回滚路径存在。
- 上线后立即确认：首页或主入口、一个关键 API/路由、HTTPS 和运行日志健康。
- 通过后记录 `FAST_RELEASE: PASS`。包体排行、图片阈值、重复素材、未使用依赖、全量 UI/移动端/跨浏览器/性能与长链路均记为 `DEFERRED`，不阻断本次上线。
- 用户自己测试支付时记录 `PAYMENT_VERIFICATION: USER_OWNED_PENDING`；这不阻断网站上线，但不得宣称支付已上线或已验证。

### FULL_VERIFICATION（仅明确要求）

只有用户明确说“要完整验证”或本次任务就是质量审计时，才运行固定模块与项目全测、全量 UI 回归、支付异常与退款、包体/重复资产审计、性能和跨浏览器验证。
