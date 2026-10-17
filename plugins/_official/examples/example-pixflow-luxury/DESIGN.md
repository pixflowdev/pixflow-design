# Luxury Recipe System

## Overview

Luxury is a dark, image-led recipe for premium brands and refined product/service pages. It uses expressive uppercase type, off-white contrast, restrained accenting, curated imagery, and slow editorial pacing.

## Token Direction

- `--lux-bg`: deep ink or blue-black page background.
- `--lux-surface`: slightly lifted dark panel.
- `--lux-surface-soft`: dark grey-violet or graphite for image mats and section bands.
- `--lux-text`: ivory/off-white text.
- `--lux-muted`: readable secondary text, never faint grey.
- `--lux-line`: low-opacity ivory hairline.
- `--lux-accent`: muted champagne or soft metallic accent.
- `--lux-accent-ink`: dark text on light CTA.

## Typography

- Display type should be uppercase, large, and architectural.
- Free font options: Geist Mono, Oswald, Archivo, Inter Tight, JetBrains Mono, or system sans/mono depending on brand.
- Do not combine too many font families. One display/mono-led family plus body fallback is usually enough.
- Letter spacing can be slightly positive for labels and slightly tight for huge headings, but must not break readability.

## Layout

- Use generous section padding.
- Prefer selective two-column editorial rhythm, image stacks, and large panels.
- Desktop compositions are judged at 1600px viewport width with about 1440px primary content width.
- A split section should only remain split when both tracks have enough usable width. If large display type or body copy becomes squeezed, change the section structure rather than accepting awkward wrapping.
- Use hairline dividers instead of heavy boxes.
- Keep catalog/product cards few and large.
- Use strong crops and image aspect ratios: 4:5, 3:4, 16:10, or square.

## Color

The recipe may take broad inspiration from public luxury previews, but shipped tokens must be Pixflow-owned. Match mood and contrast logic, not exact hex palettes.

Recommended baseline:

- Deep blue-black page background.
- Soft ivory text.
- Graphite raised surfaces.
- Champagne accent for rule, tag, or secondary metadata.
- White or ivory primary CTA.

## Motion

- Subtle opacity/translate reveal is acceptable.
- Image masks may be used if static content remains visible without JavaScript.
- No bounce, parallax overload, cursor toys, or decorative-only motion.
