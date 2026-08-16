# Interaction modes

## Team mode

Use plain language for colleagues who do not need AWS, database, payment-provider, or code internals. Return only:

1. `当前步骤`
2. `状态`: 正在处理 / 等待补充资料 / 等待确认 / 需要修改 / 已完成
3. `已经完成`
4. `需要你操作`
5. One next action

Translate internal evidence instead of printing it. For example, render RDS `available`, Schema verification, and zero new-resource counters as `数据库运行正常，并且没有创建额外收费资源`. Keep endpoints, ARNs, instance IDs, Schemas, ports, raw commands, validation JSON, and internal error codes out of the main response.

When approval is ready, present exactly:

```text
你可以选择：
1. 确认并进入下一步
2. 需要修改：请说明修改内容
3. 暂停当前项目
```

Show technical detail only for an immediate security, data-loss, payment, cost, or execution blocker, and explain the required user action in plain language.

## Developer mode

Return the same plain-language summary plus `PHASE_STATUS`, `CURRENT_PHASE`, `NEXT_PHASE`, delivered files, verification, not-connected boundaries, relevant resource identifiers, and rollback evidence. Never reveal credentials, secrets, payment payloads, or customer data.

## Confirmation mapping

| User action | Internal transition |
|---|---|
| `确认并进入下一步` | `approveGate` only from `waiting_for_approval` |
| a concrete correction | `rejectGate`, return to `in_progress` |
| `暂停当前项目` | no gate transition; stop |

`好的`, questions, silence, `继续讲`, or a broad request are not approval. Interaction mode never bypasses this rule.
