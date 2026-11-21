# 云端 Skill 与流程发布

负责人：Builder 平台维护人员。普通商家和建站 AI 不拥有全局规则发布权限。

1. 从 `/opt/buyna-builder/guidance/current.json` 确认当前版本，复制对应完整版本到操作员的暂存目录。
2. 修改需要更新的 Skill、SOP 或模块接口说明。不要直接改已发布版本，不写入密钥或客户数据。
3. 新增技能时更新 `repository-manifest.json` 的登记；需要加入现有建站能力时，在其 `builderRoutes` 中配置对应能力的 `skills` 和 `packages`。基础规则不会被这项配置移除。
4. 使用当前 Builder 程序中的 `apps/builder-api/dist/guidance-cli.js publish STORE STAGING EXPECTED_VERSION OPERATOR`。STORE 为上述 guidance 目录，EXPECTED_VERSION 为当前完整版本。
5. 发布器校验文件完整性、技能入口、模块依赖、必要 SOP 和能力路由，全部通过才切换。版本冲突时先重读当前版本并合并修改，不盲目重试覆盖。
6. 用 `guidance-cli.js status STORE` 和已登录的 `/api/codex/guidance` 核对版本。新任务自动采用该版本；已运行任务及其重试保持原版本。
7. 检查任务“流程版本与调用记录”。完成标准为发布版本与实际任务版本一致、必要技能和 SOP 出现在调用记录中，不能只凭文件上传成功宣称已同步。

异常处理：发布失败保留原版本；内容完整性错误停止新任务并由操作员处理。回滚命令为 `guidance-cli.js rollback STORE TARGET_VERSION EXPECTED_CURRENT OPERATOR`。保留旧版本和任务快照，不删除正在使用的版本。中断发布留下锁时，先核对没有发布进程，才由操作员清理该锁。

本流程只更新建站规则和接口参考，不执行模块代码、不升级已交付的网站、不改变订单和支付数据。业务代码升级、客户网站更新和正式发布分别执行其授权及验证流程。
