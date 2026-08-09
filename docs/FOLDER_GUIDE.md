# 文件夹分类与说明

## 1. 分类原则

仓库采用“两层分类”：

1. 仓库级目录按用途分类：GitHub管理、人工文档、自动化脚本、可安装 Skill。
2. `skills/` 内保持一层扁平目录，通过名称和文档进行业务分类。

不把 Skill再移动到 `skills/design/`、`skills/payment/` 等多层目录，因为扁平结构能保持稳定的 GitHub安装路径，也更容易让 `$skill-installer`、安装脚本和 Codex发现每个独立 Skill。

## 2. 仓库根目录

```text
buyna-agent-skills/
├── .github/          GitHub项目管理与自动化
├── docs/             给团队成员阅读的操作文档
├── scripts/          安装和校验仓库的自动化脚本
├── skills/           Codex可以安装和调用的 Skill
├── packages/         Skill优先调用的固定业务代码模块
├── planned-skills/   尚未确定定位的 Skill占位区
├── README.md         GitHub项目首页和快速入口
├── CONTRIBUTING.md   贡献与修改流程
├── SECURITY.md       安全和 Secret处理规则
└── .gitignore        禁止提交的本地文件类型
```

### `.github/`

只服务 GitHub项目管理，不会安装到 Codex。

| 路径 | 用途 | 主要维护者 |
| --- | --- | --- |
| `CODEOWNERS` | 指定默认审查负责人 | Owner |
| `ISSUE_TEMPLATE/` | 新 Skill和 Bug报告表单 | Maintainer |
| `PULL_REQUEST_TEMPLATE.md` | 统一 PR说明和检查项 | Maintainer |
| `workflows/` | GitHub Actions自动校验 | Maintainer |

不要在这里存放业务规则或 Skill说明。

### `docs/`

给人阅读的仓库级文档，不会作为 Skill安装。

| 文件 | 用途 |
| --- | --- |
| `OPERATIONS_MANUAL.md` | 安装、调用、更新、协作、发布和新成员培训 |
| `WRITING_GUIDE.md` | Skill命名、结构、写作、上下文和测试规范 |
| `FOLDER_GUIDE.md` | 仓库与 Skill文件夹分类 |

客户项目的需求、设计结果和价格不要放在此目录，应保存在对应客户项目中。

### `scripts/`

存放仓库级确定性操作。

| 文件 | 用途 |
| --- | --- |
| `install.ps1` | 将全部 Skill安装到个人或项目目录 |
| `validate.ps1` | 检查每个 Skill的基础结构和 metadata |

仓库脚本不应包含客户业务逻辑，也不得保存凭据。

### `skills/`

唯一会被安装到 Codex的主要目录。每个直接子目录代表一个独立 Skill。

保持：

```text
skills/<skill-name>/SKILL.md
```

不要形成：

```text
skills/<skill-name>/<skill-name>/SKILL.md
```

同名嵌套会导致重复发现、更新混乱或错误调用。

### `packages/`

存放可测试、可复用的固定代码。Skill负责判断和调用，项目只生成
Adapter、路由和配置。完整安装会同步此目录；缺少模块时必须停止，禁止
退回到重新生成核心业务规则。

### `planned-skills/`

存放已经决定未来要做、但尚未确认职责和规则的 Skill空目录。

当前预留：

```text
planned-skills/
├── buyna-erp/
└── buyna-crm/
```

此目录不会被安装脚本处理，也不会被 Codex发现。占位目录不得提前放置空白或 TODO版 `SKILL.md`；只有定位、触发条件、输入输出和边界确认后，才使用 Skill初始化器在 `skills/` 中正式创建。

## 3. Skill业务分类

虽然 `skills/` 物理结构保持扁平，但逻辑上分为五组。

### A. 团队治理与总入口

| Skill | 定位 |
| --- | --- |
| `buyna-skill-operations` | GitHub安装、更新、贡献、审核、发布和故障排查 |
| `buyna-website-builder` | 网站项目总入口，控制步骤顺序并路由其他 Skill |

### B. 客户需求与设计规划

| Skill | 定位 | 主要输出 |
| --- | --- | --- |
| `buyna-customer-intake` | 收集客户基本资料 | 客户需求记录 |
| `buyna-website-design` | 确认框架、字体、颜色、UI/UX、动画和参考 | 设计确认记录 |
| `buyna-page-structure` | 确认页面、内容、手机端和政策页面 | 页面结构记录 |
| `buyai-dashboard-data-interaction` | 逐页建立服务器/API并连接现有数据、S3、业务和前端 | 可验证的功能切片 |

这一组不负责实现支付、数据库或生产部署。

### C. 前端实现

| Skill | 定位 |
| --- | --- |
| `buyna-frontend-builder` | 根据已确认需求和设计连接真实 API，开发公开页面和 Admin前端 |

商家 Admin、商品后端和服务后端由下一组独立 Skill负责，不塞入前端 Skill。

### D. 商家后台与 AWS

| Skill | 定位 |
| --- | --- |
| `buyna-merchant-onboarding` | 在现有多商家后端中分阶段注册、验证并启用一个新商家 |
| `buyai-merchant-builder` | 单一商家后台总协调器和商品/服务分支选择 |
| `buyna-aws-data-layer` | 框架无关的 AWS 数据库、迁移和商家隔离 |
| `buyna-s3-storage` | S3 图片与文件上传、授权、替换和删除 |
| `buyai-product-merchant-backend` | 单一商家登录、商品、SKU、库存、订单、客户和 CSV |
| `buyai-booking-service-backend` | 单一商家登录、服务、档期、容量、预约和记录 |
| `buyai-checkout-address-ux` | 购买人、地址、邮编、表单保存和后台同步 |
| `buyai-storefront-layout-ux` | 商城结构、商家入口、分类、页脚和移动端 |
| `buyna-testing-quality` | 后台、API、权限、数据、支付和移动端测试 |
| `buyna-aws-release` | AWS 发布准备、迁移、验证和回滚 |
| `aws-project-deployer` | AWS 身份检查、架构、资源操作和部署验证 |

### E. GlobePay支付

| Skill | 定位 |
| --- | --- |
| `buyai-globepay-payment` | 支付总路由 |
| `buyai-globepay-config` | 主机、环境变量、签名、币种和错误诊断 |
| `buyai-globepay-checkout` | 单次卡支付、二维码、H5和跳转 |
| `buyai-globepay-status-sync` | notify、return、查询、paid和refund同步 |
| `buyai-globepay-recurring` | WorldPay Recurring、3DS、CIT和MIT订阅 |

支付子 Skill只保存规则，不保存真实 `partner_code` 或 `credential_code`。

## 4. 单个 Skill内部结构

```text
skill-name/
├── SKILL.md
├── agents/
│   └── openai.yaml
├── references/
├── scripts/
└── assets/
```

除 `SKILL.md` 外，其余目录只在确实需要时创建。

### `SKILL.md`

Codex触发后读取的核心文件。

应包含：

- `name` 和 `description` frontmatter
- 第一检查动作
- 核心工作流或路由
- 职责边界
- 完成验证

不应包含：

- 安装手册
- 更新日志
- 客户真实资料
- 密钥
- 大量可延迟读取的详细规则

### `agents/openai.yaml`

用于 Codex界面展示：

- `display_name`
- `short_description`
- `default_prompt`

它不是业务规则文件。修改 `SKILL.md` 定位后，应检查此文件是否仍然一致。

### `references/`

存放只在特定任务中读取的详细知识：

- API规则
- 数据结构
- 检查清单
- 框架差异
- 政策要求

`SKILL.md` 必须直接说明什么时候读取相应 reference。

### `scripts/`

存放重复、脆弱或必须确定执行的自动化：

- 校验
- 转换
- 打包
- 数据生成

脚本必须实际运行测试，不应只是示例代码。

### `assets/`

存放供最终输出复制或修改的资源：

- 前端模板
- 图片
- Logo
- 字体
- 文档模板

Codex通常不需要把 assets内容全部读入上下文。

## 5. 文件放置判断

新增内容时按以下顺序判断：

1. 这是给团队成员阅读的吗？放入根目录文档或 `docs/`。
2. 这是 Codex每次执行都必须知道的吗？放入 `SKILL.md`。
3. 这是某些情况才需要的详细规则吗？放入 `references/`。
4. 这是重复且需要稳定执行的操作吗？放入 `scripts/`。
5. 这是最终输出需要复制的模板或素材吗？放入 `assets/`。
6. 这是客户项目数据吗？不要放入通用 Skill仓库。

## 6. 不允许的混放

- 不把 GitHub操作手册放入每个 Skill。
- 不把支付规则放入设计 Skill。
- 不把设计风格写进后端 Skill。
- 不把客户价格和域名写进通用 reference。
- 不把 Secret写进任何目录。
- 不让路由 Skill复制所有子 Skill内容。
- 不创建同名嵌套 Skill目录。
