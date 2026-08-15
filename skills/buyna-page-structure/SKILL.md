---
name: buyna-page-structure
description: "Plan and confirm a customer website's desktop and mobile pages and content sections before frontend development. Use as Skill 3 after website design to define the header, footer, navigation, page list, section order, responsive structure, content and asset requirements, page states, privacy-policy placement, and template changes."
---

# Buyna.ai Page Structure

Turn the customer information and completed Skill 2 design record into one combined design-and-structure package. Do not write production code or final legal text.

## Workflow

1. Read the confirmed outputs from `buyna-customer-intake` and `buyna-website-design`.
2. Determine whether Skill 2 selected a reusable template.
3. If no template was selected, use the full planning mode in `references/structure-method.md`.
4. If a template was selected, use the template review mode: confirm what to keep, remove, add, and replace.
5. When supplied images show page layouts, consume the approved reference-image audit from `buyna-website-design`. Recount the visible top-level sections, verify each section's components and represented information, and resolve any count or composition mismatch before defining the shared header, footer, and every page's ordered content sections.
6. Read `references/mobile-structure-checklist.md` and define the mobile order, navigation, primary action, touch interactions, and content reductions for each page.
7. Define required page states and functional pages: loading, empty, validation, success, error, permission when applicable, and 404.
   For merchant projects, separately list Dashboard navigation, screens,
   visible fields, actions, and states as UI requirements. Record data and API
   needs as contracts only; do not design their backend implementation here.
   For the product branch, consume the canonical Dashboard navigation and page composition from `buyna-frontend-builder/references/product-merchant-dashboard-ui.md`; do not restate or fork it here.
8. Add the privacy-policy requirement using `references/privacy-policy-checklist.md` and identify any conditional commerce, booking, account, cookie, or legal pages.
   For product commerce, record the fixed MEDINANCE flow as UI structure:
   right-side cart drawer → buyer form → order review → payment → verified
   result. Do not collapse the order-review page into the cart or payment page.
9. Record missing copy, images, translations, links, SEO metadata, legal details, and other customer materials as `待补充`.
10. Present one concise desktop/mobile page-structure table for customer approval, then stop.

## Rules

- Use defaults and present one combined package; ask only when a choice changes business behavior or conflicts with supplied information.
- Keep only pages that support the website's audience and purpose.
- Treat mobile as an explicit structure, not a smaller desktop layout.
- Include responsive header behavior, mobile navigation, section order, touch actions, forms, carousels, and safe-area considerations.
- Include a footer link to the privacy policy by default.
- Add other policy pages only when the website's functions or applicable requirements justify them.
- Do not copy template text, company information, testimonials, images, or legal terms.
- Do not silently drop or merge reference-image sections. Record every intentional keep, adapt, remove, merge, split, or add decision and its information impact.
- Do not invent missing customer content; mark it `待补充`.
- Do not provide legal conclusions or claim compliance. Request jurisdiction and business details before drafting policy text, and require qualified review where appropriate.
- Do not begin frontend development, backend design, database selection, or deployment.
- Keep Dashboard UI structure separate from business logic. An action such as
  “save product” belongs in the UI plan, while authorization, persistence,
  stock updates, and payment effects belong to later backend phases.

## Completion

Skill 3 is complete only when the customer approves:

1. Shared header and footer.
2. Final page list.
3. Ordered content sections for each page.
4. Mobile structure and primary action for each page.
5. Loading, empty, success, error, and 404 requirements where applicable.
6. Template keep/remove/add/replace decisions when applicable.
7. Privacy-policy placement, conditional policy pages, and the list of information still required.
8. Merchant Dashboard page composition and mobile navigation when applicable.
