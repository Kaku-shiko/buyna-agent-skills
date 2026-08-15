---
name: buyna-customer-intake
description: "Collect the basic customer information needed to begin a website project. Use as Skill 1 to identify the requested website type, primary language, company name and address, whether pages display prices and their source, and materials already available or to be supplied later."
---

# Buyna.ai Customer Intake

Collect customer information before design or development.

Read `references/intake-fields.md` and ask one section at a time in plain Chinese.

## Scope

Collect only these basic categories:

1. Website type.
2. Primary language and any additional languages.
3. Company name and address information.
4. Whether prices appear on the website and the currency. Use supplied product prices when present; otherwise default price maintenance to the merchant Dashboard without asking.
5. Customer materials, including items that may be supplied later.

## Conversation Rules

- Ask one short question or one closely related section at a time.
- Accept incomplete answers.
- After each answer, show the accepted item and the next missing item briefly.
- Keep the phase open while a required item has no answer.
- When no Logo or specific images are supplied, automatically mark them `之后补全`; do not ask for confirmation or block completion.
- For other unavailable materials, accept `之后补全` as a valid answer.
- Treat `之后补全` as a valid collection answer, not as a received material.
- Do not discuss technology, databases, design, payment implementation, AWS, project budget, or development implementation.
- Do not invent company details, prices, or customer materials. Do not treat generated or placeholder assets as approved customer materials.

## Completion

Output the Chinese customer-information record defined in the reference. Ask the team member to confirm or correct it, then stop.
