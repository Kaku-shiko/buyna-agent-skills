---
name: buyai-storefront-layout-ux
description: "Standardize Buyna.ai storefront UX: header, navigation, seller login, backend categories, footer, policy links, contrast, empty states, grids, mobile, motion, and design review."
---

# Buyai Storefront Layout UX

Use for public storefront structure and usability. Owns header, nav, category tabs, seller login entry, footer, policy links, empty states, contrast, grid readability, and mobile layout. Does not own CRUD, booking, payment, or order sync.

## First Move

Inspect page or screenshot. Find weak header, nav, seller login, categories, empty state, footer, policy links, contrast, grid, and mobile behavior.

Read `references/storefront-layout-rules.md` for patterns and prompts.

## Combine Skills

Use `impeccable` for visual critique, polish, layout, color, type, responsive, motion, and anti-AI-slop review. Anime.js is optional for advanced motion only. Use product/booking skills for the data source and checkout UX for forms.

## Gold

Readable beats decorative. Do not ship pale text, hidden seller login, giant blanks, hard-coded categories after backend categories exist, or inconsistent footers.

Storefront needs brand/header, visible seller login/admin entry, meaningful nav, backend-driven categories when available, product/service grid or useful empty state, tappable links, shared footer/legal links, and mobile layout without clipped actions.

When backend exists, labels and sections read from database/settings. Tabs show `All` first, then visible categories with active items. New active categories appear automatically; empty categories hide. Footer/company info reads from settings.

## Validate

Check desktop/mobile screenshots, seller login, backend-driven tabs, footer/policy links, empty state, JPY no decimals, no public editor/deployment badges, and Impeccable polish/audit when visual quality is the request.
