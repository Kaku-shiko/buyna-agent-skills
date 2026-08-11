# Buyna.ai Agent Skills

Buyna.ai 团队网站开发 Skill 仓库。当前包含 23 个可安装 Skill。仓库中的每个 `skills/<skill-name>/` 都是一个可以被 Codex 独立安装和调用的标准 Skill。

公开仓库：[https://github.com/Kaku-shiko/buyna-agent-skills](https://github.com/Kaku-shiko/buyna-agent-skills)

Git克隆地址：`https://github.com/Kaku-shiko/buyna-agent-skills.git`

完整的安装、调用、更新、开发、审核、发布和新成员培训流程，请阅读 [团队操作手册](docs/OPERATIONS_MANUAL.md)。不了解目录用途时先看 [文件夹分类与说明](docs/FOLDER_GUIDE.md)。编写或审查 Skill时使用 [Skill编写规范](docs/WRITING_GUIDE.md)。提交修改前请阅读 [贡献规范](CONTRIBUTING.md) 和 [安全规则](SECURITY.md)。

## 仓库目录

| 目录 | 用途 | 是否安装到 Codex |
| --- | --- | --- |
| `.github/` | Issue、PR、CODEOWNERS和 Actions | 否 |
| `docs/` | 团队操作、写作和目录说明 | 否 |
| `scripts/` | 安装与校验脚本 | 否 |
| `skills/` | 可独立安装和调用的 Skill | 是 |
| `packages/` | Dashboard、商品、购物车、订单、PostgreSQL、文件和GMV固定代码模块 | 由安装脚本同步 |
| `planned-skills/` | 尚未定义内容的未来 Skill占位目录 | 否 |

`skills/` 保持扁平结构，业务分类通过命名和文档表达，以保持稳定、简单的 GitHub安装路径。

当前预留：

- `planned-skills/buyna-erp/`
- `planned-skills/buyna-crm/`

预留目录没有 `SKILL.md`，因此不会被 Codex安装或调用。

## Skill 组成

### 网站开发主流程

1. `buyna-skill-operations`：团队安装、调用、更新、贡献和发布助手。
2. `buyna-website-builder`：总入口，按确认顺序调用其他 Skill。
3. `buyna-customer-intake`：收集网站类型、公司信息、主语言、价格和素材。
4. `buyna-website-design`：确认前端偏好、设计系统、UI/UX、动画和参考网站。
5. `buyna-page-structure`：确认桌面端、手机端、页面内容和隐私政策。
6. `buyna-frontend-builder`：交付公开前端和商家 Dashboard UI，再连接真实 API。
7. `buyai-dashboard-data-interaction`：逐页建立 API 基础并连接身份、数据库、S3、业务接口和前端。

### 商家后台与 AWS 分支

1. `buyna-merchant-onboarding`：在已验证的多商家后端中安全接入一个新商家。
2. `buyai-merchant-builder`：商家后台总协调与商品/服务分支选择。
3. `buyai-dashboard-data-interaction`：逐页连接 Dashboard、API、数据库和 S3。
4. `buyna-aws-data-layer`：不绑定框架的 AWS 数据库与迁移规则。
5. `buyna-s3-storage`：S3 图片和文件上传、权限及清理规则。
6. `buyai-product-merchant-backend`：单一商家登录、商品、SKU、库存、订单和客户。
7. `buyai-booking-service-backend`：单一商家的服务、预约、容量、记录和后台。
8. `buyai-checkout-address-ux`：购买人、地址、邮编和表单数据同步。
9. `buyai-storefront-layout-ux`：商城结构、商家入口、分类、页脚和移动端。
10. `buyna-testing-quality`：后台、API、权限、支付和移动端质量验证。
11. `buyna-aws-release`：AWS 发布准备、迁移、验证和回滚。
12. `aws-project-deployer`：AWS 身份检查、架构选择和实际部署操作。

### GlobePay 支付分支

1. `buyai-globepay-payment`：支付总路由。
2. `buyai-globepay-config`：日本接口地址、环境变量、签名和币种。
3. `buyai-globepay-checkout`：单次卡支付、二维码、H5 和跳转支付。
4. `buyai-globepay-status-sync`：notify、return、查询、支付及退款状态同步。
5. `buyna-gmv-commerce`：将已验证支付和已完成退款同步到 CRM GMV。
6. `buyai-globepay-recurring`：WorldPay Recurring、3DS、CIT 和 MIT 订阅。

所有开通支付的 Buyna.ai 商家必须安装 GMV 固定模块并通过 CRM 同步验证；
没有支付功能的商家保留禁用的 CRM GMV 身份，启用支付时再激活。

## 标准调用顺序

安装顺序不影响 Codex 行为。项目执行必须遵循以下逻辑顺序，并在每个阶段等待明确确认：

```text
1 客户需求
→ 2 网站设计
→ 3 页面结构
→ 4 完成公开前端与商家Dashboard代码
→ 5 Dashboard功能联动（逐页完成API、数据、S3、业务和前端连接）
→ 6 下单与支付（不适用可跳过）
→ 7 测试与上传检查
→ 8 AWS发布
```

静态企业网站可以跳过商家、数据库、S3、结账和支付步骤；商品与服务分支不能同时自动执行，混合项目也要逐个完成并确认。

## Skill-only安装方式

在 Codex 中输入：

```text
请使用 $skill-installer，从 GitHub 仓库 Kaku-shiko/buyna-agent-skills 安装以下 Skill：
skills/buyna-skill-operations
skills/buyna-website-builder
skills/buyna-customer-intake
skills/buyna-website-design
skills/buyna-page-structure
skills/buyai-merchant-builder
skills/buyna-merchant-onboarding
skills/buyai-dashboard-data-interaction
skills/buyna-aws-data-layer
skills/buyna-s3-storage
skills/buyai-product-merchant-backend
skills/buyai-booking-service-backend
skills/buyai-checkout-address-ux
skills/buyai-globepay-payment
skills/buyai-globepay-config
skills/buyai-globepay-checkout
skills/buyai-globepay-status-sync
skills/buyna-gmv-commerce
skills/buyai-globepay-recurring
skills/buyna-frontend-builder
skills/buyai-storefront-layout-ux
skills/buyna-testing-quality
skills/buyna-aws-release
skills/aws-project-deployer
```

当前仓库是 Public。任何人都可以查看、克隆和安装，不需要 GitHub邀请或 Token；向仓库提交修改仍需要授权，或通过 Fork和 Pull Request贡献。

`$skill-installer` 只安装 Skill说明，不能安装仓库根目录的固定代码模块。
商城开发请使用下面的完整安装方式。

安装后重新打开 Codex 任务，再输入：

```text
请使用 $buyna-website-builder，从客户需求收集开始，一步一步引导我建立网站。
```

支付任务可以直接输入：

```text
请使用 $buyai-globepay-payment，判断本次 GlobePay 任务应该调用哪个支付 Skill。
```

## Windows完整安装（推荐）

克隆或下载本仓库后，在仓库根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

默认安装到：

```text
C:\Users\<用户名>\.codex\skills\
C:\Users\<用户名>\.codex\packages\
```

更新已安装版本：

```powershell
git pull
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1 -Force
```

只给某个项目安装：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1 -Scope Project -ProjectPath "C:\path\to\project"
```

项目安装目标为 `.agents/skills/` 和项目 `packages/`；个人安装目标为
`.codex/skills/` 和 `.codex/packages/`。安装脚本会同步 Skill 与固定代码，
避免 AI 找不到模块后重新生成业务逻辑。

## 仓库规则

- 每个 Skill 必须保留根目录 `SKILL.md`。
- `agents/openai.yaml` 用于 Codex 中的显示名称和默认提示。
- 详细规则放在 `references/`，避免让 `SKILL.md` 过长。
- AI只执行用户当前明确要求的步骤，不主动添加、推荐或列出提示之外的功能。
- 当前步骤验证并报告后必须停止；只有用户后续明确要求才可以继续。
- 只有即时安全、数据丢失、支付或执行阻塞可以触发最小必要提醒。
- 不提交密码、AWS密钥、数据库凭据、GlobePay `credential_code` 或其他 Secret。
- 不在 Skill 中硬编码客户名称、真实价格、域名或生产环境凭据。
- GlobePay凭据必须保存在服务端；支付成功只能由验证后的 notify/query 确认。
- 修改 Skill 后运行 `scripts/validate.ps1`，确认全部 Skill 结构有效。

## 发布流程

1. 公开来源固定为 `https://github.com/Kaku-shiko/buyna-agent-skills`。
2. 默认分支使用 `main`，并保留 GitHub Actions校验。
3. 团队成员通过 `$skill-installer` 或克隆仓库安装。
4. 外部贡献者使用 Fork和 Pull Request；授权成员使用短期分支和 Pull Request。
5. 合并后通知成员重新安装或执行更新脚本。
