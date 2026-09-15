# GlobePay Code 安全录入：edu 复用方案

## 当前实现与证据

本方案来自 2026-09-15 对本机项目源码和发布记录的检查；没有读取密钥值，也没有进行实时 AWS 或真实支付验证。

edu 项目位置由当前项目登记或用户提供的源码确定；不要依赖开发者本机绝对路径。

| 现有文件（相对 edu 根目录） | 已实现职责 |
| --- | --- |
| `tools/globepay-secret-input/config.mjs` | 两个 Code 的输入校验、渠道校验、配置组装；保存时关闭收款 |
| `tools/globepay-secret-input/server.mjs` | 本机回环地址录入服务、Host/Origin 与 CSRF 检查、AWS SDK 更新已有 Secret；状态接口不回传 Code |
| `tools/globepay-secret-input/app.js` | 保存反馈、防重复点击、保存成功后清空输入 |
| `tools/globepay-secret-input/washinjyuku-server.mjs` | 和心塾独立 Secret 创建流程，已有 Secret 拒绝覆盖，固定商家身份 |
| `tools/start-washinjyuku-secret-input.ps1` | 启动隐藏后台进程，可打开本地录入页面 |
| `releases/washinjyuku-onboarding-20260915/release-manifest.md` | 记录配置已存在、租户隔离与 104 项测试通过；收款仍关闭，真实支付/退款尚未验收 |

这些是可参考源码，不是可直接用于任意商家的通用安装包。`config.mjs` 中的 edu 回调地址、各 server 的 Secret 名称、商家标识和端口都必须按目标资源登记配置。其他机器应从项目仓库取得对应文件，不能依赖上述本机路径存在。

旧 `tools/ut-globepay-secret-input.mjs` 通过 AWS CLI 的命令参数传入 Secret 内容，不作为通用模块基础；采用新版 AWS SDK 在服务端内存中提交的方式。

## Skill 调用关系

`buyai-globepay-payment` → `buyai-globepay-config` → 安全录入模块 → 固定配置检查 → checkout / status-sync。

本流程收束在现有配置子技能中。AI 负责定位商家和启动正确入口，用户在专门的表单中输入两个 Code；AI 只接收保存、验证与启用状态。不得让用户把 Code 发到聊天，也不得通过浏览器自动化读取表单值。

## 操作顺序

1. 从当前任务与服务端资源登记解析目标 `projectId + sellerId + environment`；只有身份仍不明确时才询问目标商家。历史成功案例不代表本次目标。
2. 检查 AWS profile、region、账户身份和目标 Secret 授权。使用选定 profile 执行 STS 身份确认；不读取凭据明文用于诊断。
3. 启动安全录入入口。运维本机版绑定 `127.0.0.1`，使用随机 CSRF、同源校验、禁止缓存；不要将开发录入服务暴露到公网。Builder 商家版必须位于认证后的 HTTPS 设置页，服务端检查商家归属和配置权限。
4. 表单显示商家、环境、渠道和“保存后待验证”；输入 Partner Code、Credential Code。Secret ARN、商家身份和回调地址由服务端登记决定，不能接受客户端任意指定。
5. AWS SDK 保存到该商家的 Secret。创建与轮换是明确区分的操作：创建遇到已有资源返回冲突；轮换校验当前版本并保存可追溯的版本信息，禁止两个会话静默覆盖。
6. 成功后清空输入，仅返回 `configured`、`versionId`、`validationStatus` 等非敏感状态。错误区分权限不足、资源冲突、网络失败和输入问题；不返回原始异常、请求体、签名或密钥。
7. 服务端装载配置后运行现有 `globepay-cli.mjs` 的 `config.validate`；签名复用 `buildAuthParams`。本地配置检查不等同于渠道认证成功。
8. 按商家授权与渠道能力执行接入验证，再进入受控订单、可信通知/查询、结算验收。保存成功不自动开启收款；启用使用当前凭据版本对应的有效验证结果。

## 拟抽取的固定模块

以下是待实现的通用模块边界；本次并未声称已将 edu 工具改造为 Builder 在线模块。

| 模块 | 固定职责 |
| --- | --- |
| `credential-target` | 解析已登录用户/运维授权对应的商家、环境和 Secret 引用；先检查归属，再查询配置 |
| `credential-input` | 本机录入页或后台设置表单，密码输入、防重复提交、明确的保存反馈 |
| `credential-store` | SDK 创建/轮换，租户限定权限，版本冲突处理，审计元数据，绝不记录值 |
| `credential-validation` | 复用现有配置/签名核心，区分本地配置检查、渠道接入验证、真实交易验收 |
| `credential-status` | 输出给前端和 AI 的非敏感配置状态；验证结果绑定商家、环境与凭据版本 |

前端录入字段：两个 Code 与允许选择的渠道。服务端上下文：`projectId`、`sellerId`、`environment`、`secretRef`、`region`、`notifyUrl`、`returnUrl`、`allowedMethods`。部署时使用角色权限，运维本地版使用明确的 AWS profile。

建议状态分别保存：`storageStatus`（未配置/已保存）、`validationStatus`（待验证/通过/失败/过期）、`collectionEnabled`（收款开关）。避免把单一“已配置”标签误当成能收款。凭据轮换后验证失效，重新验证当前版本。

并发隔离按商家和环境进行；不同商家可以并行，同一商家的配置轮换需要版本检查。只在浏览器防重复点击不能解决多会话覆盖问题。

## 验收重点

- A 商家不能读取、写入或验证 B 商家的配置，未登录请求被拒绝。
- Code 不进入日志、聊天、Git、命令参数、浏览器持久存储或状态响应；录入字段只短暂存在于当前安全表单。
- 非法 Origin、CSRF 缺失、未知渠道、超长输入被拒绝。
- 创建冲突和版本冲突清晰反馈；保存失败不显示已配置，重复提交不产生错误启用。
- 更换凭据后不能复用旧验证结果；过期验证不能启用收款。
- 本地配置验证、渠道验证、真实付款/退款各自记录证据，不互相替代。
