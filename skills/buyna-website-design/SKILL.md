---
name: buyna-website-design
description: "Define and confirm a customer website design before development. Use as Skill 2 after customer intake to recommend the frontend framework and animation approach, research external design references or templates, confirm the UI/UX direction, and generate a complete website design-system board image for approval."
---

# Buyna.ai Website Design

Turn confirmed customer information into an approved website design direction. Do not write production code.

## Workflow

1. Read the confirmed output from `buyna-customer-intake` and inspect any customer logo, images, current website, or reference links.
2. Read `references/design-method.md` and `references/motion-and-skill-routing.md`. Recommend one frontend framework, one primary motion approach, and the frontend skills needed for the project, with short reasons.
3. Research current external inspiration and template sources using `references/reference-sources.md`. Give 3–5 relevant links, explain what to study in each, and note whether the item is inspiration or a reusable template.
4. Confirm the UI/UX feeling, page structure, typography, color tokens, component style, responsive approach, and one distinctive design signature.
5. Produce the written design record defined in `references/design-fields.md` and ask for approval.
6. After written approval, read `references/design-system-board.md` and use `imagegen` to create one landscape design-system board image.
7. Show the written record and image together. Ask for approval or one focused revision, then stop.

## Rules

- Ask one section at a time in plain Chinese.
- Recommend a default instead of making nontechnical team members compare every library.
- Use customer assets when provided. Do not invent logos, slogans, company history, testimonials, clients, prices, or team members.
- Use `frontend-design` principles: ground decisions in the real business, make typography intentional, choose one distinctive signature, and avoid generic AI-style decoration.
- Treat reference websites as inspiration, not content to copy.
- Before adopting an external template, record its URL, author/provider, license or price status, framework compatibility, and allowed modifications.
- Do not claim that an external template is free, licensed, or compatible without checking its current page.
- Select animation tools by use case. Do not add every library to one project or use Three.js for ordinary interface motion.
- Respect `prefers-reduced-motion`; motion must support comprehension or brand character.
- Treat written font names, tokens, and HEX values as the source of truth if generated image text is imperfect.
- Do not select databases, implement backend logic, deploy the site, or begin frontend coding.

## Completion

Skill 2 is complete only when the team member approves:

1. Frontend framework and animation approach.
2. Reference/template direction.
3. Written UI/UX design record.
4. Website design-system board image.
