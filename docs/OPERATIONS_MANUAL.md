# Buyna.ai Agent Skills 操作手册

## 1. 手册目的

本仓库是 Buyna.ai 团队的 Codex Skill 单一来源。GitHub负责版本、权限、安装、审核和发布；Notion只负责索引、培训和业务说明。

任何人看到 Notion 页面或 GitHub 文件，不代表 Skill 已被 Codex 安装。只有完整文件夹进入个人 `.codex/skills/` 或项目 `.agents/skills/`，并重新开启 Codex 任务后，Skill 才能被发现。

## 2. 团队角色

| 角色 | GitHub权限 | 责任 |
| --- | --- | --- |
| Owner | Admin | 仓库、安全、成员和最终发布 |
| Maintainer | Maintain/Write | 审核 Skill、合并 PR、维护版本 |
| Developer | Write | 建分支、修改 Skill、提交 PR |
| User | Read | 下载、安装和调用 Skill |

建议使用 Private Organization 仓库，通过 Team 分配权限。不要共享一个 GitHub账号。

## 3. 系统结构

```text
buyna-agent-skills/
├── README.md
├── CONTRIBUTING.md
├── SECURITY.md
├── docs/
│   └── OPERATIONS_MANUAL.md
├── scripts/
│   ├── install.ps1
│   └── validate.ps1
├── .github/
│   ├── CODEOWNERS
│   ├── ISSUE_TEMPLATE/
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── workflows/validate-skills.yml
└── skills/
    └── <skill-name>/
        ├── SKILL.md
        ├── agents/openai.yaml
        └── references/
```

## 4. 当前调用路线

```mermaid
flowchart TD
    O[buyna-skill-operations] --> I[安装、更新、贡献和发布]
    B[buyna-website-builder] --> C[buyna-customer-intake]
    C --> D[buyna-website-design]
    D --> P[buyna-page-structure]
    P --> F[buyna-frontend-builder]
    B --> G[buyai-globepay-payment]
    G --> GC[config]
    G --> GO[checkout]
    G --> GS[status-sync]
    G --> GR[recurring]
```

## 5. 第一次安装

### 方法 A：让 Codex 安装

```text
请使用 $skill-installer，从 GitHub 私有仓库
Kaku-shiko/buyna-agent-skills 安装 skills/ 下的全部 Skill。
```

私有仓库要求当前电脑已登录有权限的 GitHub账号。

### 方法 B：克隆后安装

```powershell
git clone https://github.com/Kaku-shiko/buyna-agent-skills.git
cd buyna-agent-skills
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

完成后关闭当前 Codex 任务并新建任务。

## 6. 日常调用

新网站从总入口开始：

```text
请使用 $buyna-website-builder，从客户需求收集开始，一步一步引导我。
```

安装或仓库操作：

```text
请使用 $buyna-skill-operations，帮我检查、安装或更新团队 Skill。
```

支付任务：

```text
请使用 $buyai-globepay-payment，先判断本次支付任务应该进入哪个子 Skill。
```

不要跳过客户确认步骤，也不要把设计、页面结构和业务后端一次性混在同一个 Skill 中。

## 7. 更新已安装 Skill

```powershell
git pull
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1 -Force
```

更新后新建 Codex 任务。团队在交付记录中保存使用的 Git commit 或 Release版本。

## 8. 新增或修改 Skill

1. 创建 Issue，记录触发场景、输入、输出和边界。
2. 从最新 `main` 建立分支。
3. 使用官方 Skill初始化器创建新 Skill。
4. 按 [Skill编写规范](WRITING_GUIDE.md) 保持 `SKILL.md` 精简，将细节放入 `references/`。
5. 运行本地校验。
6. 检查差异和敏感信息。
7. 推送分支并建立 Pull Request。
8. 审核通过后合并，不直接修改 `main`。

推荐分支：

```text
skill/add-merchant-admin
skill/update-design-routing
fix/globepay-yaml
docs/update-team-manual
```

## 9. Issue管理

使用仓库模板：

- Skill request：新增或扩展 Skill。
- Bug report：Skill无法触发、规则错误或安装失败。

Issue必须包含：

- 使用者想说什么来触发 Skill
- 当前行为
- 期望行为
- 涉及的 Skill
- 是否影响生产、安全、支付或客户数据

## 10. Pull Request管理

每个 PR应尽量只有一个目的。PR必须写明：

- 改了什么
- 为什么修改
- 对团队调用方式有什么影响
- 如何验证
- 是否包含 breaking change
- 是否涉及凭据、支付、数据库或客户数据

主分支建议开启 Ruleset：

- Require a pull request before merging
- Require at least one approval
- Require status checks to pass
- Block force pushes
- Block deletions

## 11. 版本与发布

使用语义化版本：

- Patch：修复文字、规则或兼容问题，例如 `v0.1.1`
- Minor：增加向后兼容的新 Skill，例如 `v0.2.0`
- Major：删除或重命名 Skill、改变调用契约，例如 `v1.0.0`

每次 Release列出：

- Added
- Changed
- Fixed
- Removed
- Team action required

## 12. 安全规则

禁止提交：

- GitHub Token
- AWS Access Key和Secret
- 数据库密码或连接字符串
- GlobePay `credential_code`
- 客户个人信息
- 私有证书、Cookie、Session或真实银行卡资料

支付凭据只能进入服务端 Secret管理。Skill 中使用变量名和占位符，不保存真实值。

发现泄露时：

1. 立即撤销或轮换凭据。
2. 私下通知 Owner。
3. 不在公开 Issue中粘贴 Secret。
4. 清理 Git历史并审计访问记录。
5. 发布修复版本并通知团队更新。

## 13. 故障排查

### Codex找不到 Skill

- 检查文件夹是否安装到正确根目录。
- 检查是否出现同名文件夹嵌套。
- 检查 `SKILL.md` YAML。
- 新建 Codex 任务。
- 使用 `$skill-name` 显式调用。

### 私有仓库无法安装

- 检查同事是否被邀请。
- 检查邀请是否已接受。
- 检查当前电脑 GitHub登录账号。
- 使用 `gh auth status` 验证授权。

### 更新后行为没变化

- 拉取最新 `main`。
- 使用安装脚本的 `-Force`。
- 确认安装目录中旧文件已替换。
- 新建 Codex 任务。

## 14. 新成员入职清单

- 接受 GitHub仓库邀请
- 安装 Git 和 GitHub CLI
- 完成 `gh auth login`
- 克隆仓库
- 安装全部 Skill
- 新建 Codex任务
- 成功调用 `$buyna-skill-operations`
- 成功调用 `$buyna-website-builder`
- 阅读安全规则
- 了解 Issue和 Pull Request流程
