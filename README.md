# Buyna.ai Agent Skills

Buyna.ai 团队网站开发 Skill 仓库。仓库中的每个 `skills/<skill-name>/` 都是一个可以被 Codex 独立安装和调用的标准 Skill。

完整的安装、调用、更新、开发、审核、发布和新成员培训流程，请阅读 [团队操作手册](docs/OPERATIONS_MANUAL.md)。不了解目录用途时先看 [文件夹分类与说明](docs/FOLDER_GUIDE.md)。编写或审查 Skill时使用 [Skill编写规范](docs/WRITING_GUIDE.md)。提交修改前请阅读 [贡献规范](CONTRIBUTING.md) 和 [安全规则](SECURITY.md)。

## 仓库目录

| 目录 | 用途 | 是否安装到 Codex |
| --- | --- | --- |
| `.github/` | Issue、PR、CODEOWNERS和 Actions | 否 |
| `docs/` | 团队操作、写作和目录说明 | 否 |
| `scripts/` | 安装与校验脚本 | 否 |
| `skills/` | 可独立安装和调用的 Skill | 是 |

`skills/` 保持扁平结构，业务分类通过命名和文档表达，以保持稳定、简单的 GitHub安装路径。

## Skill 组成

### 网站开发主流程

1. `buyna-skill-operations`：团队安装、调用、更新、贡献和发布助手。
2. `buyna-website-builder`：总入口，按确认顺序调用其他 Skill。
3. `buyna-customer-intake`：收集网站类型、公司信息、主语言、价格和素材。
4. `buyna-website-design`：确认前端框架、设计系统、UI/UX、动画和参考网站。
5. `buyna-page-structure`：确认桌面端、手机端、页面内容和隐私政策。
6. `buyna-frontend-builder`：连接真实 API，开发公开页面和 Admin 前端。

### GlobePay 支付分支

1. `buyai-globepay-payment`：支付总路由。
2. `buyai-globepay-config`：日本接口地址、环境变量、签名和币种。
3. `buyai-globepay-checkout`：单次卡支付、二维码、H5 和跳转支付。
4. `buyai-globepay-status-sync`：notify、return、查询、支付及退款状态同步。
5. `buyai-globepay-recurring`：WorldPay Recurring、3DS、CIT 和 MIT 订阅。

## 推荐安装方式：让 Codex 从 GitHub 安装

在 Codex 中输入：

```text
请使用 $skill-installer，从 GitHub 仓库 Kaku-shiko/buyna-agent-skills 安装以下 Skill：
skills/buyna-skill-operations
skills/buyna-website-builder
skills/buyna-customer-intake
skills/buyna-website-design
skills/buyna-page-structure
skills/buyna-frontend-builder
skills/buyai-globepay-payment
skills/buyai-globepay-config
skills/buyai-globepay-checkout
skills/buyai-globepay-status-sync
skills/buyai-globepay-recurring
```

如果仓库是私有仓库，同事需要先让 Git 能访问该仓库，或者在环境中配置 `GH_TOKEN` / `GITHUB_TOKEN`。不要把 Token 写入仓库、Skill 或聊天内容。

安装后重新打开 Codex 任务，再输入：

```text
请使用 $buyna-website-builder，从客户需求收集开始，一步一步引导我建立网站。
```

支付任务可以直接输入：

```text
请使用 $buyai-globepay-payment，判断本次 GlobePay 任务应该调用哪个支付 Skill。
```

## Windows 手动安装

克隆或下载本仓库后，在仓库根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

默认安装到：

```text
C:\Users\<用户名>\.codex\skills\
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

项目安装目标为 `.agents/skills/`，适合团队项目随仓库共享；个人安装目标为 `.codex/skills/`，适合在多个项目中调用。

## 仓库规则

- 每个 Skill 必须保留根目录 `SKILL.md`。
- `agents/openai.yaml` 用于 Codex 中的显示名称和默认提示。
- 详细规则放在 `references/`，避免让 `SKILL.md` 过长。
- 不提交密码、AWS密钥、数据库凭据、GlobePay `credential_code` 或其他 Secret。
- 不在 Skill 中硬编码客户名称、真实价格、域名或生产环境凭据。
- GlobePay凭据必须保存在服务端；支付成功只能由验证后的 notify/query 确认。
- 修改 Skill 后运行 `scripts/validate.ps1`，确认全部 Skill 结构有效。

## 发布流程

1. 在 GitHub 建立仓库，例如 `buyna-agent-skills`。
2. 将本目录内容提交到默认分支 `main`。
3. 设置仓库为 Private，并邀请团队成员。
4. 确认安装说明使用 `Kaku-shiko/buyna-agent-skills`。
5. 团队成员通过 `$skill-installer` 安装。
6. 后续更新使用 Pull Request 审查，合并后通知成员重新安装或执行更新脚本。
