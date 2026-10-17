---
name: energetic
description: Bold, high-contrast expressive recipe with vibrant orange/purple accents, thick 4px borders, hard drop shadows, and modern geometric styling.
license: Pixflow-owned
---

# Energetic Recipe Skill

## Mission

Create a polished, active web prototype that feels vibrant, energetic, and powerful without becoming cluttered, illegible, or hard to navigate.

## Required Behavior

- Start with a recognizable energetic first viewport: large bold headline (ideally in Limelight), small monospaced label/badge, centered product mockup, and a solid-shadowed CTA button.
- Use thick 4px borders on all primary panels, buttons, inputs, and container grids.
- Contrast deep indigo/purple (`#1D1836`) with warm peach/cream (`#FFEDD5`) background bands.
- Use solid offset shadows (`4px 4px 0px 0px`) on interactive elements and containers.
- Structure lower sections with clear grid feature blocks, testimonial quotes inside thick borders, and a final energetic CTA.
- Keep interactive states snappy, applying a hover transform scale (`scale(1.05)`) to buttons and cards.
- Support responsive layout stack changes: if display headings wrap awkwardly on narrow screens, reduce font sizes or stack the layout.

## Component Expectations

- Navigation has a bold, thick-bordered border structure.
- Buttons use solid offset shadows, thick borders, and snappy scale transformations.
- Cards use 4px borders, soft peach background fills, and solid shadows.
- Typography is clean, bold, and uses monospaced elements for details.
- Dividers are solid, clean lines.
- Footer has a clean layout with monospaced metadata labels.

## Accessibility

- Maintain strong color contrast between text and backgrounds (WCAG 2.2 AA).
- Ensure focus-visible states are highly prominent with thick borders.
- Keep body text legible by avoiding display fonts for paragraph blocks.
- Respect reduced motion settings by avoiding scaling transitions.

## Anti-Drift

Do not drift into:
- generic minimalist SaaS
- soft, fuzzy shadows or gradients
- low-contrast text on bright backgrounds
- thin, delicate borders
- chaotic layout alignments without a clear grid
- corporate or passive language
