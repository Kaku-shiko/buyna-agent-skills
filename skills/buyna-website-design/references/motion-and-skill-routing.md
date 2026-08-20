# Motion Libraries And Frontend Skill Routing

Choose the smallest tool that can implement the approved design. Record the chosen tool and the exact sections that use it. Do not install libraries during Skill 2.

## Animation Choice

| Need | Default choice | Typical use |
| --- | --- | --- |
| Simple UI feedback | CSS | Hover, focus, button, menu, small reveal |
| React component motion | Motion | Page transitions, layout changes, gestures, modal and accordion |
| Focused DOM, SVG, or text animation | Anime.js | Hero text, SVG drawing, staggered elements, small timelines |
| Complex timelines or scroll choreography | GSAP | Storytelling pages, pinned sequences, controlled brand animation |
| 3D or WebGL scenes | Three.js | 3D product, particles, interactive background, spatial experience |
| Sliders and carousels | Swiper / Swiper Studio | Hero slider, product gallery, testimonials, touch carousel |

`Three.js` is the correct library name; treat `tree.js` as a likely spelling error. Use it only when the approved experience truly needs 3D or WebGL, and require a static or lightweight fallback.

## Required Motion Rules

- Prefer one primary animation library. Add a second only for a distinct need such as Three.js plus ordinary UI motion.
- Keep business logic, payment, authentication, forms, and API state independent from decorative animation.
- Support keyboard and touch interaction.
- Respect `prefers-reduced-motion` and provide a usable non-animated state.
- Check mobile performance, loading cost, cleanup on route changes, and behavior when JavaScript or WebGL is unavailable.
- Do not copy an external site's animation, assets, or code without checking its license.

## Frontend Skill Routing

| Project need | Skill to use |
| --- | --- |
| Decide the customer's visual direction | `buyna-website-design` |
| Apply intentional visual design principles | `frontend-design` |
| Build React/TypeScript pages and connect APIs | `buyna-frontend-builder` |
| Improve or audit visual quality and motion | `impeccable` |
| Build storefront header, navigation, seller entry, and responsive layout | `buyai-storefront-layout-ux` |
| Improve checkout and customer address forms | `buyai-checkout-address-ux` |
| Verify build, mobile behavior, accessibility, and delivery quality | `buyna-testing-quality` |

Select only the skills required by the approved website. Skill 2 records the routing decision; implementation happens after design approval.
