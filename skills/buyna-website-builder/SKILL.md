---
name: buyna-website-builder
description: "Guide a Buyna.ai team member through one approved website gate at a time. Use for the eight-phase intake, combined design/structure approval, frontend, Dashboard integration, payment, testing, and AWS release workflow without automatically continuing."
---

# Buyna.ai Website Builder

Use the fixed `packages/buyna-workflow-state-core` state machine. Execute only the current gate or approved interaction slice and stop.

## First interaction

Before Phase 1, ask only this question and stop:

```text
请选择使用方式：
1. 团队成员模式（推荐）— 只显示当前结果、需要操作的内容和下一步。
2. 开发者模式 — 显示状态码、技术证据、资源信息和验证详情。

请回复“团队成员模式”或“开发者模式”。
```

Do not ask customer requirements in the same response. After the explicit choice, create the workflow with `interactionMode: team|developer`, or call `setInteractionMode` for an existing workflow and persist the event. Default legacy workflows with no recorded mode to `team`, but ask once before their next gate. Read [interaction modes](references/interaction-modes.md) for response rules.

## Method

1. Resolve `buyna-workflow-state-core` from the project installation, then the user installation. Stop with `BLOCKED: WORKFLOW_STATE_CORE_NOT_INSTALLED` when absent.
2. Load `workflow/workflow-state.json`. Once `project_id` is known, initialize it with the explicitly selected interaction mode when absent. For an existing project, initialize only from verified records; never infer approval from chat.
3. Call `getInteractionPolicy({state})` after every load or mode change. Use it to render the response and pass `interactionMode` to every child Skill. Child Skills return structured evidence; they do not choose what the user sees.
4. Treat `currentGate` as authoritative. Never edit state JSON directly; call module transitions and persist every event.
5. Read only `references/phase-0N-*.md` for the current phase and [the state contract](references/workflow-state-contract.md).
6. Deliver the smallest valid result, then record its evidence and request approval.
7. Stop. Approve and unlock the next gate only after the user's explicit later confirmation.

## Eight Phases

1. Customer information → `buyna-customer-intake`
2. Website design → `buyna-website-design`; continue directly into Phase 3
3. Page structure and combined design approval → `buyna-page-structure`
4. Frontend and Dashboard UI code → `buyna-frontend-builder` UI mode
5. Dashboard functional integration → `buyai-dashboard-data-interaction`
6. Checkout and payment → `buyai-checkout-address-ux`, `buyai-globepay-payment`, and mandatory `buyna-gmv-commerce`; allow `NOT_APPLICABLE`
7. Testing and upload gate → `buyna-testing-quality`
8. AWS release → `buyna-aws-release`

Phase 5 owns the former framework, identity, database, S3, product/service backend, and frontend API-integration phases. Complete one Dashboard page or closely related slice at a time; do not implement the whole backend in one turn.

## Approval Gate

Execute exactly one approval gate or one Phase 5 interaction slice at a time. Phases 2 and 3 form one combined gate: run design directly into page structure without an intermediate approval, then request one approval for the combined package. Unlock only the immediately following gate or slice after explicit later approval. Corrections, questions, silence, or a broad request are not approval.

In `developer` mode, end with:

```text
PHASE_STATUS: WAITING_FOR_USER_CONFIRMATION
CURRENT_PHASE: <number and name>
NEXT_PHASE: <number and name>
请检查本阶段结果。只有回复“确认并进入下一步”后，我才会继续。
```

In `team` mode, show `当前步骤`, `状态`, `已经完成`, `需要你操作`, and the three choices `确认并进入下一步 / 需要修改 / 暂停`. Keep the same internal state code but do not print it.

## Delivery Record

For code phases 4-8, report `DELIVERED_FILES`, `IMPLEMENTED_SCOPE`, `VERIFICATION`, `NOT_CONNECTED`, and `PHASE_RESULT`. A plan, screenshot, prompt, or chat-only code is not delivery.

## Guardrails

- Do not invent information, credentials, files, checks, or approval.
- Do not mix requirement, design, implementation, testing, or release phases.
- Do not proceed automatically or recommend optional features.
- Mention only immediate security, data-loss, payment, or execution blockers.
- Keep secrets out of chat, frontend code, project files, and Skill files.
- Do not treat local preview as production delivery.
- Interaction mode changes presentation only. It never changes required evidence, approval, security, payment, database, or release gates.
