---
name: buyai-globepay-recurring
description: "Implement or repair GlobePay WorldPay Recurring subscriptions: preorder, hosted 3DS, agreement status, MIT charge, configured pricing, and errors."
---

# Buyai GlobePay Recurring

Use for merchant or platform subscription billing through GlobePay Japan WorldPay Recurring. Do not use one-time card checkout for true subscription.

## Gold

WorldPay Recurring requires recurring and 3DS permission. First payment is customer-initiated CIT through hosted 3DS. Later monthly charges are server-initiated MIT. The frontend does not auto-charge monthly.

## First Move

Read `references/recurring-rules.md`. Confirm partner code, credential, 3DS/recurring permission, plan, amount, currency, billing schedule, notify/return URLs, and test vs production.

## Pricing Source

- Plan names, amounts, currency, and billing schedule must come from project configuration or database records.
- Do not hard-code a specific company's plan names or prices in this skill.
- Setup/initial fees are separate from recurring monthly orders unless the project explicitly combines them.
- Store only provider agreement/token identifiers and masked metadata.
- Never store raw card data.

## Required Flow

Create recurring preorder. Redirect customer to provider `pay_url` for hosted 3DS. Query agreement status. Only `ACTIVE` can be charged later. On schedule, server creates MIT charge with idempotent charge id, then queries status. Only `PAY_SUCCESS` marks paid.

## Combine With

Use `buyai-globepay-config` for host/signing/secrets, `buyai-globepay-status-sync` for paid records, and `buyai-lovable-project-builder` for implementation prompts.

## Validate

Check `expire` such as `30m`, no leading `=` in notify URL, hosted 3DS, `ACTIVE` agreement, server MIT charge, pending/failed/error UI, and clear missing-3DS message.
