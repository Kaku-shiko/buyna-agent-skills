---
name: buyna-website-builder
description: "Guide a Buyna.ai team member through a fast, safe website workflow: capability-driven phases, grouped outputs, and fewer turns."
---

# Buyna.ai Website Builder

Use the fixed `packages/buyna-workflow-state-core` state machine. Execute only the current gate or approved interaction slice and stop.  
Fast mode is default: group compatible tasks to reduce turns without reducing safety.

## Interaction mode

Default new and legacy workflows to `team` and begin customer intake in the
same response. Mention optional `developer` mode only when the user requests
commands, resource identifiers, internal status codes, or detailed technical
evidence. Persist an explicit later switch through `setInteractionMode`. Read
[interaction modes](references/interaction-modes.md) for response rules.

## Method

1. Resolve `buyna-workflow-state-core` from the project installation, then the user installation. Stop with `BLOCKED: WORKFLOW_STATE_CORE_NOT_INSTALLED` when absent.
2. Load `workflow/workflow-state.json`. Once `project_id` is known, initialize it in `team` mode when absent. For an existing project, initialize only from verified records; never infer approval from chat.
3. Call `getInteractionPolicy({state})` after every load or mode change. Use it to render the response and pass `interactionMode` to every child Skill. Child Skills return structured evidence; they do not choose what the user sees.
4. Treat `currentGate` as authoritative. Never edit state JSON directly; call module transitions and persist every event.
5. Read only `references/phase-0N-*.md` for the current phase and [the state contract](references/workflow-state-contract.md).
6. Deliver the smallest valid result, then record its evidence and request approval.
7. Stop. Approve and unlock the next gate only after the user's explicit later confirmation.

## Elastic Workflow (preferred)

Build with a **mandatory core** + **capability-driven optional slices**.  

### Mandatory core (must pass)

1. 客户信息收集（站点类型/能力）
2. 设计与页面结构（合并一并确认）
3. 前端交付（页面/API联动）
4. 能力型后端交付（按站点能力自动裁剪）
5. 验收与发布（测试/发布）

### Capability-driven optional slices

- `requiresDashboard: true` 才执行 Dashboard 后端与登录态/权限 slice
- `requiresCart/requiresCheckout/requiresPayment: true` 才执行订单、支付、GMV slice
- `requiresBooking: true` 执行服务型预约 slice
- 非必需能力可以记录 `skipped_by_capability`，不阻塞流程

### Rules for elasticity

- 同一阶段内的相关任务可一次提交，减少“硬切片”。
- 有可复用结果的阶段不重复确认（例如：用户资料中已确认了站点类型，则相关能力判定沿用到后续阶段）。
- 仅在安全、数据、支付、环境、发布存在硬风险时阻塞；体验建议类不阻塞。
- 任何阶段失败只回滚到该阶段，不回到项目起点。

1. 客户信息 + 网站定位（类型、功能）→ `buyna-customer-intake`
2. 设计与页面结构一并确认（`buyna-website-design` + `buyna-page-structure`）  
   （合并一次确认）
3. 前端交付（`buyna-frontend-builder`）  
   同时提交可执行文件、API对接点
4. 后端交易能力（按能力合并）  
   商城：`buyai-product-merchant-backend` / `buyai-dashboard-data-interaction`  
   服务：`buyai-booking-service-backend`  
   订单与支付：`buyai-checkout-address-ux` + `buyai-globepay-payment` + `buyna-gmv-commerce`  
   不需要的能力可 `SKIP`
5. 最后验收与发布（`buyna-testing-quality` + `buyna-aws-release`）

## 七阶段（兼容内核）

1. Customer information → `buyna-customer-intake`
2. Website design and page structure → `buyna-website-design`, then `buyna-page-structure`, with one combined approval
3. Frontend and Dashboard interface code → `buyna-frontend-builder` UI mode
4. Capability-selected backend integration → `buyai-dashboard-data-interaction`; skip only when the intake capability record permits it
5. Capability-selected checkout and payment → `buyai-checkout-address-ux`, `buyai-globepay-payment`, and mandatory `buyna-gmv-commerce`; skip only when the intake capability record permits it
6. Testing and upload gate → `buyna-testing-quality`
7. Architecture-aware AWS release → `buyna-aws-release`

Gate 4 owns framework, identity, database, S3, product/service backend, and frontend API integration. Complete one Dashboard page or closely related slice at a time; do not implement the whole backend in one turn. Existing `phase-0N` reference filenames remain compatibility labels and do not add approval gates.

## Approval Gate

Execute one internal gate or one compatible interaction slice at a time.  
Design and structure are merged into one approval; checkout/payment backend-related gates can be merged when delivery evidence is complete.  
Unlock only the immediately following gate or slice after explicit user confirmation.  
Corrections, questions, silence, or a broad request are not approval.

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
