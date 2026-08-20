# Contributing

感谢为 Buyna.ai Agent Skills 提交改进。

## Workflow

1. 先建立或确认 GitHub Issue。
2. 从最新 `main` 建立短期分支。
3. 只修改本次任务需要的文件。
4. 运行 `powershell -File .\scripts\validate.ps1`。
5. 检查没有 Secret、客户资料或生产凭据。
6. 提交 Pull Request，并完成模板中的检查项。
7. 等待至少一位维护者审核后合并。

## Skill requirements

- 文件夹名称使用小写字母、数字和连字符。
- 根目录必须包含 `SKILL.md`。
- YAML frontmatter只能包含 `name` 和 `description`。
- description同时说明能力和触发条件。
- `agents/openai.yaml` 应与 Skill内容一致。
- 详细规则放入直接链接的 `references/`。
- 不创建 Skill内部 README、安装手册或更新日志。
- 不硬编码客户名称、价格、域名、密码或密钥。

## Branch names

```text
skill/<description>
fix/<description>
docs/<description>
```

## Commit messages

使用简短的动作描述，例如：

```text
add merchant admin skill
fix GlobePay YAML metadata
update team operations manual
```

完整流程见 [操作手册](docs/OPERATIONS_MANUAL.md)。

