---
name: neumorphism
description: Tactile product-interface method using one-material surfaces, raised and inset shadows, teal accents, monospace typography, and explicit interaction states.
license: Pixflow
metadata:
  author: Pixflow Design
---

# Neumorphism Design Skill

## Mission

Create implementation-ready guidance for a polished Pixflow Design Stage A artifact in a tactile neumorphic style. The result should feel like one continuous material surface that has been shaped into controls, cards, inputs, charts, and navigation.

## Design Intent

Neumorphism uses paired light and dark shadows to make interface elements appear raised from or pressed into the same background material. It works best for app dashboards, settings screens, AI workspaces, analytics pages, community products, and tactile product landing pages where interaction state is part of the visual identity.

## Foundations

- Visual style: soft, tactile, minimal, technical, quietly futuristic.
- Typography: Space Mono-style monospace for display and body; JetBrains Mono-style mono for technical labels and code-like metadata.
- Color: warm stone surface, deep navy-charcoal text, deep teal primary, status colors only for actual status.
- Material: background and components share the same surface color; depth comes from shadows, not separate card fills.
- Light source: top-left. Raised elements have light shadow top-left and darker shadow bottom-right. Inset elements reverse the illusion.
- Density: compact but not cramped. Shadows need breathing room so adjacent objects do not merge.

## Rules

- Use semantic tokens before raw one-off values.
- Preserve the one-material illusion across hero, controls, cards, and lower sections.
- Make default, hover, focus-visible, active, disabled, loading, and error states explicit when interactive UI is included.
- Buttons and cards are raised by default; pressed, active, selected, and input surfaces are inset.
- Use the teal accent for primary action, focus ring, active navigation, and selected state. Do not use teal as a broad background wash.
- Add fallback borders or strong focus rings where shadow-only separation would be too subtle.
- Keep labels concrete and product-specific.

## Anti-Patterns

- Low-contrast grey text that depends on shadows to be legible.
- White cards floating on a grey page; that is normal card UI, not neumorphism.
- Mixed shadow directions or random drop shadows.
- Large decorative blobs, glassmorphism, hard black shadows, or material metaphors that fight the one-surface rule.
- Overusing inset treatment until every element looks disabled.
- Cramped grids where shadows collide and controls lose their shape.

## Acceptance Criteria

- The first viewport is recognizable as a tactile one-material interface.
- Raised and inset states are both visible and purposeful.
- The primary teal action/focus state is clear without dominating the page.
- All text remains WCAG AA readable against the stone surface.
- Mobile layout keeps controls large enough to tap and shadows separated.
- The final artifact can be used as a Pixflow iframe preview without extra explanation.
