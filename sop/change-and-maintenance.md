# 05 修改维护 SOP

ID：change-and-maintenance · 版本：1.0.0 · 负责人：技术执行者。

适用：已有项目的局部内容、页面、配置或业务修复。输入为具体目标、实际代码／线上基线、已授权范围和关联故障证据。遵守[统一执行规则](execution-contract.md)。

## 执行步骤

| stepId | 动作与角色 | 输出和完成检查 |
| --- | --- | --- |
| baseline | 技术执行者检查 Git、资源所有权、运行版本和已有未提交变更 | 可追踪基线；不覆盖其他任务变更或复制其他租户资料 |
| scope | 交付负责人界定受影响页面、数据、模块及授权 | 局部变更范围和验收条件；范围不变不重复审批 |
| repair | 技术执行者按适用契约打开 repair slice，实现最小完整修复 | 保留原批准历史；对应 Skill、模块及 Adapter 修改 |
| verify | 验证者运行受影响检查并检查共享依赖 | 新旧行为证据、缺陷回归；无关通过测试不重复扩大 |
| sync | 技术执行者按授权提交 PR，核对镜像／共享来源锁的受影响项 | 提交、检查及合并证据；Git 合并不等于部署 |
| release | 技术执行者在发布范围获授权时发布固定版本 | 影响、回滚、健康与业务入口证据；未发布则准确报告 |
| close | 验证者核验后按现有 API 完成 repair slice | 原历史保留，新修复证据、限制和下一步齐全 |

## Skill 与模块

用[网站 Builder](../skills/buyna-website-builder/SKILL.md)选择最少业务 Skill；仓库操作用[Skill Operations](../skills/buyna-skill-operations/SKILL.md)，架构检查用[统一架构](../skills/buyna-unified-merchant-architecture/SKILL.md)，发布用[发布 Skill](../skills/buyna-aws-release/SKILL.md)。

状态通过[Workflow core](../packages/buyna-workflow-state-core/package.json)的 `openRepairSlice`／`completeRepairSlice` 及受保护 Store 处理；具体调用遵循当前接口。仅文档修改无需制造网站 repair slice 或生产发布。

## 验收与异常

说明修复前后可复现差异、受影响范围、验证方式及实际同步目标。不为小改动重走整个入驻和设计；共享支付／文件模块变更需覆盖其消费者，不能只改一份副本便称全部同步。

同项目版本冲突重新加载基线并合并后检查；禁止覆盖其他任务。迁移前明确数据兼容和备份，代码回滚不等于数据回滚。测试失败返回修复步骤；生产异常进入[故障恢复](incident-and-recovery.md)，保留原始证据。
