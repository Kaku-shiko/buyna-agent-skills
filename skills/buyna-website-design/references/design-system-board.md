# Website Design-System Board Output

Select one mode before generation:

- `MODULAR_VARIANTS`: use when the user requests different commerce region combinations; follow `commerce-upload-design.md` and generate actual page previews from selected configurations.
- `REFERENCE_FAITHFUL`: outside requested variation mode, required whenever the user supplied a design image or screenshot as the approved direction. The raw reference image must be attached to `imagegen`; a textual audit alone is not sufficient.
- `CUSTOM_DIRECTION`: used when no actual visual design direction was supplied (product photos and text-brief screenshots alone are not layout references). This mode uses the fallback three-column board below.

## Reference Image Input Contract

For `REFERENCE_FAITHFUL`, include every actual reference image through exactly one mechanism:

- Use `referenced_image_paths` when every target image has a local file path.
- Otherwise use the smallest `num_last_images_to_include` that includes every target image.
- Never pass both mechanisms.
- If neither mechanism includes every target image, ask the user to attach the missing image again. Do not fall back to a text-only prompt.

## Reference-Faithful Composition

Follow the supplied design image as closely as permitted. Preserve and map its:

- palette and color relationships;
- typography and font character;
- spacing rhythm and visual density;
- component geometry, including button, card, and form proportions;
- radii, borders, shadows, image treatment, and navigation behavior;
- visible section count, section order, and layout composition;
- desktop-to-mobile responsive relationships.

The board must still expose the approved color, typography, components, responsive direction, and representative page sections, but its presentation should follow the reference image's own visual grammar. Do not force it into the fallback three-column layout.

Replace the reference brand, logo, names, text or copy, people, prices, claims, and proprietary artwork with approved customer material or clearly neutral placeholders. Preserve visual relationships, not protected content.

## Custom-Direction Fallback Board Structure

Only in `CUSTOM_DIRECTION`, create one high-resolution 16:9 landscape three-column board.

### Left: Design System

- Confirmed project/company name; use a plain text wordmark when no approved logo exists.
- Color swatches with exact HEX labels.
- Display, heading, body, and utility typography samples.
- Primary, secondary, and text-link buttons.
- Form inputs and textarea.
- Tags/badges and essential UI controls.
- Desktop, tablet, and mobile mini previews.

### Center: Homepage Direction

- Header/navigation.
- Hero thesis and primary call to action.
- Trust or proof area only when real content exists; otherwise use neutral labeled placeholders.
- About/positioning section.
- Main services/products/features.
- Selected work or relevant content cards.
- One additional business-relevant section.

### Right: Remaining Page System

- Additional homepage/page sections relevant to the confirmed website type.
- FAQ, contact, or conversion area when required.
- Footer structure.
- Small annotations naming each section.

## Imagegen Prompt Requirements

Use case: `ui-mockup`.

Specify:

- Asset type: website design-system presentation board.
- Exact confirmed text only; simplify text volume to improve accuracy.
- Approved font direction and HEX palette.
- Clean presentation grid, high legibility, subtle neutral canvas.
- Original composition derived from the customer brief.
- No watermark, invented logo, fake client brands, fake testimonials, fake team members, or unapproved claims.

## Fidelity Check

After a `REFERENCE_FAITHFUL` image is generated, compare it against the reference for palette, typography, density, component geometry, and layout composition. Record the result in `参考图匹配检查`. If any major category is visibly inconsistent, regenerate once with a more explicit correction prompt while keeping the actual reference image attached.

For every mode, inspect subject, layout, text, palette, component consistency, and responsive previews. If dense text is inaccurate, regenerate once with shorter labels. Keep the written design record authoritative.
