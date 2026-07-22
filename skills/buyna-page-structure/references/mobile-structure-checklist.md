# Mobile Structure Checklist

Plan mobile behavior before frontend development. Do not defer all decisions to CSS.

## Global Structure

- Define the mobile header: logo size, menu trigger, primary action, language/login controls, close behavior, and navigation depth.
- Define which desktop navigation items move into the menu and whether any action remains visible.
- Define the mobile footer order, collapsible groups when needed, policy links, contact details, and safe-area spacing.
- Keep the main purpose and primary action visible without crowding the header.

## Page Content

- Record the mobile section order; reorder content when desktop columns do not make sense on a narrow screen.
- Define how hero text, media, and actions stack.
- Identify decorative content that can be simplified or omitted without losing meaning.
- Define readable text hierarchy and avoid long unbroken content blocks.
- Define image crops and aspect ratios rather than relying on desktop images to shrink.

## Interaction

- Define touch-friendly buttons, links, tabs, menus, accordions, and form controls.
- Define swipe, buttons, pagination, and fallback behavior for carousels and galleries.
- Avoid hover-only information or actions.
- Define sticky/fixed actions carefully so they do not cover content or conflict with device safe areas.
- Keep forms short, choose appropriate input types, show inline errors, preserve entered data after recoverable errors, and define success feedback.

## Handoff Requirements

Record these as acceptance requirements for `buyna-testing-quality`:

- Verify at a real 375px viewport.
- No horizontal overflow or clipped actions.
- Mobile navigation opens, closes, and remains keyboard/touch usable.
- Touch targets, carousels, forms, and safe areas work.
- Content remains understandable without decorative animation.
