# Security Policy

## Reporting

不要在公开 Issue、Pull Request或讨论中提交密钥、Token、密码、客户资料或支付数据。

如发现安全问题，请直接联系仓库 Owner，并提供：

- 受影响的文件或 Skill
- 风险说明
- 是否存在已提交的 Secret
- 建议的修复方式

## Secret handling

本仓库禁止保存：

- GitHub、AWS、数据库和邮件服务凭据
- GlobePay `credential_code`
- 私钥、证书、Cookie和Session
- 客户个人资料或银行卡数据

所有示例只能使用明显的占位符。发现 Secret后必须立即轮换，并从 Git历史中清理。

## Supported versions

默认只支持 `main` 和最新 GitHub Release。团队成员应记录当前安装的 commit或版本。

