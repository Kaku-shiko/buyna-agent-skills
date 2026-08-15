# Frontend And Motion Decision Method

Recommend one primary choice. Mention alternatives only when they materially change the project.

## Reference Image Audit

For every supplied website screenshot or full-page reference image:

1. Count the visible top-level sections from header through footer. Treat repeated cards inside one container as components, not separate sections.
2. Give each section a stable number and descriptive name in visual order.
3. Record each section's composition: heading, copy, media, cards/list, controls, primary/secondary actions, navigation, forms, trust elements, and layout pattern.
4. Record the information represented: company claim, product/service data, proof, pricing, team, FAQ, contact, legal links, or another identifiable content type.
5. Mark text or elements that cannot be read as `unreadable`; mark interpretation as `inferred`. Never invent missing information.
6. Compare the extracted sections with the proposed design and record `keep`, `adapt`, `remove`, or `add`, with a short reason for every difference.

Output one audit row per visible section. Confirm the audit with the user before treating the reference composition as approved. Preserve design inspiration without copying protected text, branding, imagery, or proprietary assets.

## Frontend Framework

- Continue the inspected framework for an existing project unless migration is explicitly approved.
- Recommend Next.js when the website needs React, strong SEO/server rendering, many content routes, or an established Next.js template.
- Recommend React with Vite for a client-heavy SPA, dashboard, or admin application that already has a separate backend API.
- Recommend Astro for a mostly static, content-led marketing site where minimal client JavaScript is valuable.
- Recommend the repository's established TanStack stack when it is already working and matches the delivery environment.

Do not select a framework from visual preference alone. Record SEO, content, interactivity, backend boundary, hosting, team familiarity, and template compatibility.

## Motion Approach

- CSS transitions/keyframes: default for hover, focus, simple reveals, and small state changes.
- Motion for React: use for component transitions, layout changes, gestures, and normal React animation orchestration.
- GSAP: use only for complex timelines, scroll choreography, or high-control brand sequences.
- Anime.js: use for focused imperative animation when the project already uses it or its API clearly fits.
- No animation library: valid when motion adds no meaningful value.

Choose the smallest adequate approach. Define exactly where motion appears and provide a reduced-motion fallback.

## UI/UX Direction

Base the direction on the customer business, audience, content, and desired action. Define:

- Three design keywords.
- One clear hero idea.
- One distinctive signature element.
- Page density and spacing character.
- Navigation and primary call to action.
- Component treatment and responsive behavior.

Avoid copying a reference site's brand, content, layout sequence, or proprietary assets.
