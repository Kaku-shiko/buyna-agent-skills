# Interaction modes

The selected mode is inherited by every child Skill. Do not ask again inside a phase. Mode controls presentation only; it never changes scope, authorization, evidence, approval, security, payment, database, AWS resource, or release rules.

Use `getInteractionPolicy({state})` from `buyna-workflow-state-core` as the executable contract. Never reproduce its booleans as independent decision logic.

## Common rules

- Ask at most one actionable question per response.
- Work only on the current gate or approved Phase 5 slice.
- Separate `planned`, `implemented`, and `verified`; never present one as another.
- Do not recommend optional features unless the user asks.
- Never reveal credentials, secrets, payment payloads, personal data, or environment values.
- Never hide immediate cost, downtime, data-loss, security, or payment risk.
- Both modes require the same delivery evidence and explicit approval.
- Both modes remain subject to existing-resource rules. A mode choice is not permission to create EC2, RDS, buckets, ports, DNS, or other infrastructure.

## Child Skill result contract

Child Skills return these fields to `buyna-website-builder`:

- `USER_SUMMARY`: plain-language outcome.
- `TECHNICAL_EVIDENCE`: sanitized files, checks, identifiers, and rollback evidence.
- `ACTION_REQUIRED`: the one user action, or `none`.
- `BLOCKER`: code, plain-language meaning, and safe resolution; or `none`.
- `NEXT_STEP`: the next locked or available step; never an instruction to auto-run it.

The Builder persists evidence first, then renders it according to the interaction policy. In team mode it summarizes `TECHNICAL_EVIDENCE`; in developer mode it may show it after the plain-language result.

## Team mode

Use these five sections and no technical appendix:

1. `当前步骤`
2. `状态`
3. `已经完成`
4. `需要你操作`
5. `下一步`

Translate internal evidence. For example, RDS `available`, verified Schema ownership, and zero new-resource counters become `数据库运行正常，并且没有创建额外收费资源`.

Do not show endpoints, ARNs, instance IDs, Schema names, ports, raw commands, stack traces, validation JSON, file inventories, or internal error codes unless one is essential to resolve an immediate blocker. When developer attention is needed, say `需要开发者处理` and give the colleague one plain-language handoff action.

## Developer mode

Show the same five-section summary first. Then add only the technical evidence relevant to the current gate:

- `PHASE_STATUS`, `CURRENT_PHASE`, and `NEXT_PHASE`.
- changed or delivered files.
- sanitized verification commands and results.
- relevant non-secret resource identifiers and connection boundaries.
- `NOT_CONNECTED`, rollback evidence, and exact blocker code when applicable.

Keep the appendix concise. Do not dump unrelated diagnostics or broaden the requested work.

## Status translation

| Internal status | Team-mode text |
|---|---|
| `ready` | 可以开始 |
| `in_progress` | 正在处理 |
| `waiting_for_approval` | 等待确认 |
| `approved` | 已完成 |
| `blocked` | 等待补充或需要开发者处理 |
| `locked` | 前一步尚未完成 |
| `not_applicable` | 本项目不需要 |

## Confirmation mapping

When approval is ready, present exactly:

```text
你可以选择：
1. 确认并进入下一步
2. 需要修改：请说明修改内容
3. 暂停当前项目
```

| User action | Internal transition |
|---|---|
| `确认并进入下一步` | `approveGate`, only from `waiting_for_approval` |
| a concrete correction | `rejectGate`, return to `in_progress` |
| `暂停当前项目` | no gate transition; stop |

`好的`, questions, silence, `继续讲`, or a broad request are not approval.

## Switching modes

Recognize only explicit requests such as `切换到团队成员模式` or `切换到开发者模式`. Persist the change through `setInteractionMode`; do not edit state JSON. A switch:

- does not restart or advance the current gate;
- does not alter existing evidence or approval;
- does not grant new permissions;
- affects subsequent rendering only.

Acknowledge the change in the newly selected format and stop unless the same request explicitly asks for work within the already-approved current gate.
