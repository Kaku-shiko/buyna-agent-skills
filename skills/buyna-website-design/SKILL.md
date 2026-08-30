---
name: buyna-website-design
description: "Produce the design half of a combined website design-and-structure package after customer intake. Use as Skill 2 to choose the frontend and motion approach, analyze only user-supplied references, define UI/UX and responsive direction, and generate a design-system board without an intermediate approval."
---

# Buyna.ai Website Design

Turn confirmed customer information into a website design direction, then pass it directly to `buyna-page-structure`. Do not write production code or request an intermediate approval.

## Workflow

1. Read the confirmed output from `buyna-customer-intake` and inspect every customer logo, image, current website, or reference link. For each reference screenshot or full-page image, run the reference-image audit in `references/design-method.md` before proposing a direction.
2. Read `references/design-method.md` and `references/motion-and-skill-routing.md`. Recommend one frontend framework, one primary motion approach, and the frontend skills needed for the project, with short reasons.
3. Analyze only reference links, screenshots, or templates supplied by the user. If none is supplied, continue with a custom direction; do not search for or recommend references.
4. Define the UI/UX feeling, typography, color tokens, component style, responsive approach, and one distinctive design signature. Compare the proposed structure against every audited reference and record intentional differences.
   For merchant projects, apply the same visual system to the Dashboard UI
   without defining database, permission, order, inventory, or payment logic.
5. Produce the written record from `references/design-fields.md`.
6. Read `references/design-system-board.md`, select its generation mode, and use `imagegen` to create one landscape design-system board image. When the user supplied any design image, use `REFERENCE_FAITHFUL` and attach the actual design image to the generation request; a textual audit alone is never sufficient.
7. Pass the written record and image directly to `buyna-page-structure` for one combined approval package.

## Rules

- Recommend a default instead of making nontechnical team members compare every library.
- Use customer assets when provided. Do not invent logos, slogans, company history, testimonials, clients, prices, or team members.
- Use `frontend-design` principles: ground decisions in the real business, make typography intentional, choose one distinctive signature, and avoid generic AI-style decoration.
- Treat reference websites as inspiration, not content to copy.
- When a supplied design image is the approved direction, reproduce its visual system and page composition as closely as allowed while replacing protected brand assets and content. Do not force that reference into the fallback three-column composition.
- For `imagegen`, include all target design images through exactly one supported mechanism: use `referenced_image_paths` when every target has a local file path; otherwise use the smallest `num_last_images_to_include` that contains every target. Never pass both. If neither mechanism can include every target, ask the user to attach the missing images again instead of silently generating from text.
- Do not reduce a reference image to visual style alone. Count and identify its visible sections, inspect the information and components inside each section, and distinguish observed facts from inferred or unreadable content.
- Before adopting an external template, record its URL, author/provider, license or price status, framework compatibility, and allowed modifications.
- Do not claim that an external template is free, licensed, or compatible without checking its current page.
- Select animation tools by use case. Do not add every library to one project or use Three.js for ordinary interface motion.
- Respect `prefers-reduced-motion`; motion must support comprehension or brand character.
- Treat written font names, tokens, and HEX values as the source of truth if generated image text is imperfect.
- Do not select databases, implement backend logic, deploy the site, or begin frontend coding.
- Treat Dashboard UI design and Dashboard business logic as separate
  deliverables. This Skill owns appearance and interaction direction only.

## Completion

Skill 2 completes when its written record and board are included in the Phase 3 combined package. Approval occurs once after page structure is complete.
