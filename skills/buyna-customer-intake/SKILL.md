---
name: buyna-customer-intake
description: "Create one concise customer-approved website project brief. Use as Skill 1 to collect website type, commerce or service branch, company information, language, price display, currency, and available or deferred materials in one grouped submission."
---

# Buyna.ai Customer Intake

Collect customer information before design or development. Read `references/intake-fields.md` and ask all fields once in one compact Chinese form.

## Scope

Collect only these basic categories:

1. Website type. Record `siteType` and the five booleans
   `requiresDashboard`, `requiresCart`, `requiresCheckout`,
   `requiresPayment`, and `requiresBooking`.
2. Primary language and any additional languages.
3. Company name and address information.
4. Whether prices appear on the website and the currency. Use supplied product prices when present; otherwise default price maintenance to the merchant Dashboard without asking.
5. Customer materials, including items that may be supplied later.

## Conversation Rules

- Accept partial information and record non-blocking omissions as `待补全`.
- Ask at most one follow-up only when website type, commerce/service branch, primary language, or public price-display decision cannot be determined.
- When no Logo or specific images are supplied, automatically mark them `之后补全`; do not ask for confirmation or block completion.
- For other unavailable materials, accept `之后补全` as a valid answer.
- Treat `之后补全` as a valid collection answer, not as a received material.
- Do not discuss technology, databases, design, payment implementation, AWS, project budget, or development implementation.
- Do not invent company details, prices, or customer materials. Do not treat generated or placeholder assets as approved customer materials.

## Completion

Output the Chinese customer-information record defined in the reference. Ask for one correction or approval, then stop. Do not repeat accepted answers.
Include the machine-readable capability decision so code, not free-form AI
judgment, controls later optional gates.
