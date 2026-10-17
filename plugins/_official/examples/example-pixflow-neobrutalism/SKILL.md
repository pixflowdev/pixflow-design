---
name: neobrutalism
description: Bold high-contrast Pixflow recipe using thick borders, hard offset shadows, flat colors, vivid yellow/violet accents, and accessible raw layout structure.
license: Pixflow
metadata:
  author: Pixflow Design
---

# Neobrutalism Design Skill

## Mission

Create implementation-ready guidance for a Pixflow Design Stage A artifact in a disciplined neobrutalist visual language. The artifact should feel loud and graphic while remaining structured, readable, responsive, and suitable for later Bricks conversion.

## Design Intent

Neobrutalism is for pages that need personality and immediate recognition: launches, guides, creator products, campaign pages, community pages, bold product pages, experimental SaaS pages, pricing surfaces, and dashboards that should not look corporate.

## Foundations

- Visual style: bold, raw, graphic, high-contrast, intentionally unsoftened.
- Typography: Inter-style sans for headings and body; JetBrains Mono-style for labels, codes, metadata, and small counters.
- Color: primary yellow `#FDC800`, secondary violet `#432DD7`, surface `#FBFBF9`, text `#1C293C`, status green/amber/red only for states.
- Borders: 2px to 3px solid near-black on cards, buttons, panels, inputs, and badges.
- Shadows: hard offset black shadows, usually 4px to 8px, no blur.
- Accessibility: WCAG AA contrast, visible focus states, semantic HTML, no color-only states.

## Rules

- The first viewport must communicate the style immediately through hard borders, saturated accents, and a chunky visual artifact.
- Use one large dominant element per section. Supporting cards can be loud, but they must not compete equally with the main message.
- Every card, button, price block, testimonial, FAQ row, and artifact should share the border/shadow grammar.
- Use flat color fills. If a section is saturated, keep text contrast high and avoid layering multiple loud colors in the same small area.
- Hover states may shift or compress the hard shadow. Active states may move the element closer to the shadow. Focus states must be obvious.
- Keep decorative shapes optional and behind content. They must not replace real product/offer proof.
- Body text must be practical and readable. The raw style is not permission for illegible spacing or tiny copy.
- Lower sections must continue the same recipe language; do not let the hero be the only styled region.

## Anti-Patterns

- Generic clean SaaS page with only a yellow button.
- Soft shadows, gradients, frosted glass, bokeh, blur blobs, glass cards, or subtle pastel-only themes.
- Thick borders applied randomly without consistent shadow direction.
- Too many colors at equal strength.
- Every card given the same size and emphasis.
- Skinny columns that cannot fit bordered content.
- Low-contrast grey text on yellow/violet.
- Fake metrics, fake logos, fake awards, or unsupported testimonials.
- Emoji icons as the primary visual system.

## Acceptance Criteria

- A cropped first-viewport screenshot reads as neobrutalist.
- Border width, hard shadow direction, accent usage, and typography are consistent.
- Main actions are obvious and accessible.
- Cards and panels have enough internal padding for their border weight.
- Mobile has no horizontal overflow from shadows or decorative shapes.
- Any state color is paired with text.
- The artifact is a full page, not a small component demo.
- Visible copy does not mention external recipe sources or internal Pixflow workflow details.
