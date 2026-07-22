# Buyna.ai Skill 编写规范

本规范综合参考 OpenAI Codex Skill/Plugin示例、Anthropic Agent Skills示例和 GitHub社区项目约定，并针对 Buyna.ai 团队的分步建站、AWS和 GlobePay场景进行收敛。

## 1. 编写目标

一个 Skill应当让另一个完全不了解当前聊天历史的 Codex实例，能够：

1. 判断什么时候应调用该 Skill。
2. 知道第一步要检查什么。
3. 按稳定流程完成任务。
4. 知道哪些事情不属于该 Skill。
5. 用明确标准判断任务是否完成。

Skill不是项目说明书、聊天记录或所有知识的集合。

## 2. 仓库文档与 Skill文档分工

| 内容 | 放置位置 |
| --- | --- |
| 项目用途、快速安装和目录导航 | 根目录 `README.md` |
| 团队操作流程 | `docs/OPERATIONS_MANUAL.md` |
| Skill编写规则 | `docs/WRITING_GUIDE.md` |
| 贡献流程 | `CONTRIBUTING.md` |
| 安全报告和 Secret规则 | `SECURITY.md` |
| Codex执行指令 | `skills/<name>/SKILL.md` |
| 详细领域规则 | `skills/<name>/references/` |
| 确定性自动化 | `skills/<name>/scripts/` |
| 输出模板和静态资源 | `skills/<name>/assets/` |

不要在每个 Skill 内重复建立 README、安装手册和更新日志。

## 3. 标准目录

```text
skill-name/
├── SKILL.md
├── agents/
│   └── openai.yaml
├── references/  # 需要时创建
├── scripts/     # 需要确定性自动化时创建
└── assets/      # 需要复制到输出时创建
```

只创建真正会使用的目录。

## 4. 命名

- 使用小写字母、数字和连字符。
- 文件夹名必须与 frontmatter中的 `name` 一致。
- 名称应表达动作或明确职责。
- 避免 `helper`、`tool`、`misc` 等模糊名称。
- 同一领域使用稳定前缀，例如 `buyna-` 和 `buyai-globepay-`。

## 5. YAML frontmatter

`SKILL.md` 只保留：

```yaml
---
name: buyna-example
description: "说明它做什么，以及用户在什么场景下必须使用它。"
---
```

description是主要触发机制，应同时包含：

- 能力：Skill负责什么。
- 触发：哪些请求或上下文需要它。
- 边界：必要时说明容易混淆但不属于它的任务。

不要只写“帮助开发网站”这种宽泛描述。

## 6. SKILL.md正文结构

根据职责选择最小结构。Buyna.ai默认推荐：

```markdown
# Skill Title

一句话说明执行目标。

## First Move

说明首次检查的资料、文件或状态。

## Workflow

1. 按顺序执行。
2. 每一步都有输入和结果。

## Boundaries

- 不负责什么。
- 应转给哪个 Skill。

## Validate

- 可验证的完成条件。
```

路由型 Skill可以使用：

```markdown
## Route To

- 条件 A：调用 `skill-a`
- 条件 B：调用 `skill-b`
```

## 7. 写作风格

- 使用祈使句，例如“检查”“读取”“确认”“保存”。
- 先写结果和决策，再写背景。
- 解释规则背后的原因，避免堆叠没有理由的强制语句。
- 使用短段落和可扫描列表。
- 同一个事实只保留一个来源。
- 示例要真实、简短，并帮助区分正确与错误行为。
- 不把通用编程知识重复写给 Codex。
- `SKILL.md` 尽量少于 500行。

## 8. 渐进加载

采用三层结构：

1. `name + description`：始终可见，用于触发。
2. `SKILL.md`：触发后读取，保存核心流程。
3. `references/scripts/assets`：只有任务需要时加载。

`SKILL.md` 必须直接链接需要读取的 reference，并说明什么时候读取。避免 reference再链接更深层 reference。

超过约 100行的 reference建议加入目录；接近 300行时应考虑拆分。

## 9. 上下文限制

- 不把所有框架、业务和客户资料塞进一个 Skill。
- 将商品、服务、支付、设计、部署分成独立 Skill。
- 路由 Skill只负责选择，不复制子 Skill详细规则。
- 客户名称、价格、域名和环境配置放在项目文件，不写死在通用 Skill。
- 只读取当前任务所需的 reference。

## 10. 跨 Skill调用

明确写出：

- 进入条件
- 调用的 Skill名称
- 传递的已确认输出
- 返回后继续执行的位置

例如：

```markdown
Use `buyna-page-structure` only after the customer and design records are approved.
Pass the confirmed language, pricing-display decision, design system, and page goals.
```

不要让两个 Skill同时拥有同一业务规则。

## 11. 示例和测试

每个新 Skill至少准备：

- 2个应该触发的真实请求
- 2个不应该触发的相邻请求
- 1个正常流程
- 1个缺少输入或错误状态

重点测试：

- 是否正确触发
- 是否调用正确的下游 Skill
- 是否保持边界
- 是否产生预期输出
- 是否泄露或请求不应收集的 Secret

## 12. 完成标准

一个 Skill只有在以下条件满足后才可合并：

- 名称、frontmatter和目录一致
- description可区分相邻 Skill
- 正文没有 TODO和模板残留
- 所有相对链接存在
- 没有同名嵌套目录
- 本地验证通过
- 安装到干净目录后可被发现
- 真实调用示例得到预期结果
- 不包含 Secret或客户隐私

## 13. 高风险领域

支付、身份认证、AWS和数据库规则应使用较低自由度：

- 写明不可违反的安全边界
- 使用真实检查和状态验证
- 不猜测 API、权限或生产配置
- 将凭据保留在服务端
- 区分“代码完成”“部署完成”和“生产验证完成”

设计和文案类 Skill可以保留更高自由度，但仍需输出确认记录。

## 14. 参考项目

- [OpenAI Plugins](https://github.com/openai/plugins)：当前 Codex Plugin与 Skill组合示例。
- [OpenAI Agent Skills（已弃用，保留安装模式参考）](https://github.com/openai/skills)
- [Anthropic Skills](https://github.com/anthropics/skills)：Skill结构、渐进加载和示例写法参考。
- [GitHub Community Health Files](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/creating-a-default-community-health-file)：README、贡献、安全和模板约定。

OpenAI已将旧 `openai/skills` 仓库标记为弃用，并建议新的 Codex分发使用 Plugin。当前仓库先使用 GitHub公开 Skill安装方式；当团队需要统一插件安装、命令或 MCP依赖时，再升级为 skill-only plugin。

