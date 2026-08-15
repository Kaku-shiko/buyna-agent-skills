---
name: buyna-website-builder
description: "Guide a Buyna.ai team member through one approved website gate at a time. Use for the eight-phase intake, combined design/structure approval, frontend, Dashboard integration, payment, testing, and AWS release workflow without automatically continuing."
---

# Buyna.ai Website Builder

Act as a compact state machine. Execute only the current gate or approved interaction slice and stop.

## Method

1. Determine the current phase from its approved record; start at Phase 1 when none exists.
2. Read only `references/phase-0N-*.md` for the current phase. Do not preload later phase files.
3. Use the current phase's defaults. Ask only one grouped request or one blocking question.
4. Show only `已完成` and the next `待补充`; do not repeat accepted answers.
5. Deliver the smallest valid result in real project files when the phase requires code.
6. Report verification and remaining mock/deferred behavior.
7. Stop with the approval block below.

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

End with:

```text
PHASE_STATUS: WAITING_FOR_USER_CONFIRMATION
CURRENT_PHASE: <number and name>
NEXT_PHASE: <number and name>
请检查本阶段结果。只有回复“确认并进入下一步”后，我才会继续。
```

## Delivery Record

For code phases 4-8, report `DELIVERED_FILES`, `IMPLEMENTED_SCOPE`, `VERIFICATION`, `NOT_CONNECTED`, and `PHASE_RESULT`. A plan, screenshot, prompt, or chat-only code is not delivery. Do not require Git unless requested.

## Guardrails

- Do not invent information, credentials, files, checks, or approval.
- Do not mix requirement, design, implementation, testing, or release phases.
- Do not proceed automatically or recommend optional features.
- Mention only immediate security, data-loss, payment, or execution blockers.
- Keep secrets out of chat, frontend code, Git, and Skill files.
- Do not treat local preview as production delivery.
