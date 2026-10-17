---
name: bento
description: Modular product-page method using weighted card grids, soft surfaces, clear hierarchy, explicit interaction states, and scannable proof tiles.
license: Pixflow
metadata:
  author: Pixflow Design
---

# Bento Design Skill

## Mission

Create implementation-ready Bento guidance for a polished Pixflow Design Stage A artifact. The result should use a modular grid of cards with visible hierarchy, useful product evidence, clear responsive behavior, and explicit accessibility repairs.

## Design Intent

Bento pages organize information into a weighted system of cards. The large cards carry primary meaning; medium cards carry product proof; small cards carry supporting signals. The grid should feel calm, useful, and deliberate. The active Pixflow Design design system controls visual tokens; this recipe controls the bento composition method.

## Foundations

- Visual style: modern, clean, soft, modular.
- Typography: Inter-style sans for display and body; JetBrains Mono-style mono only for labels, counters, and tiny metadata.
- Type scale: 12, 14, 16, 20, 24, 32, with larger display sizes derived from the active brief.
- Spacing scale: 4, 8, 12, 16, 24, 32.
- Colors: use the active design-system tokens. If no active system is available, fall back to warm surface, near-black text, peach primary tint, muted blue secondary, and status green/warning/danger only when meaningful.
- Accessibility: WCAG 2.2 AA contrast, keyboard-first interaction states, visible focus treatment, readable labels.

## Rules

- Use semantic tokens before raw one-off values.
- Preserve visual hierarchy through card span, type size, spacing, and contrast.
- Keep default, hover, focus-visible, active, disabled, loading, and error states explicit when interactive UI is included.
- Prefer accessibility and clarity over novelty when the two conflict.
- Pair each decorative decision with a content role.
- Preserve the active design system. Do not override a user-selected design system with recipe fallback colors, fonts, radii, or shadows.
- Use a readable grid. A 12-track desktop grid is allowed, but no visible main-board card may be only 1 or 2 tracks wide.
- Text-heavy cards, quotes, checklists, actions, badge groups, and product UI fragments need at least 4 of 12 tracks, or should become nested content inside a wider card.

## Anti-Patterns

- Equal-card grids pretending to be bento.
- Chaotic masonry without a clear reading path.
- Skinny extra columns that make cards too narrow for their copy.
- Low-contrast pastel text on pastel surfaces.
- Ambiguous labels such as "Feature one" or "New workflow" without product meaning.
- Cards that exist only to hold gradients, icons, or empty abstract rectangles.

## Acceptance Criteria

- The first viewport is recognizable as a weighted bento board.
- Every card has a named job and useful content.
- The design survives a 390px mobile screenshot with no overflow.
- Product claims are believable and not fabricated as real proof unless supplied by the user.
- The final artifact can be used as an iframe preview without extra explanation.
