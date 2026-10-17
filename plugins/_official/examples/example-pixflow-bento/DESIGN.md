---
name: Bento
colors:
  primary: "#FAD4C0"
  secondary: "#80A1C1"
  success: "#16A34A"
  warning: "#D97706"
  danger: "#DC2626"
  surface: "#FFF5E6"
  text: "#111827"
  neutral: "#FFF5E6"
typography:
  h1:
    fontFamily: "Inter"
    fontSize: 2rem
  body-md:
    fontFamily: "Inter"
    fontSize: 1rem
  label-caps:
    fontFamily: "JetBrains Mono"
    fontSize: 0.75rem
  sourceScale: "12/14/16/20/24/32"
  weights: "100, 200, 300, 400, 500, 600, 700, 800, 900"
rounded:
  sm: 4px
  md: 8px
spacing:
  sm: 4px
  md: 8px
  sourceScale: "4/8/12/16/24/32"
---

# Bento Fallback Design Reference

## Overview

Bento pages use modular card boards, weighted hierarchy, soft spacing, and quiet contrast to make complex product information scannable. This file is a fallback reference for recipe authoring and compatibility. During Stage A, the active Pixflow Design design system is the primary source for color, typography, spacing, radius, surfaces, and component styling.

## Style Foundations

- Visual style: modern and clean.
- Typography scale: 12/14/16/20/24/32.
- Typography fonts: primary Inter, display Inter, mono JetBrains Mono.
- Typography weights: 100, 200, 300, 400, 500, 600, 700, 800, 900.
- Color palette: primary, neutral, success, warning, danger.
- Spacing scale: 4/8/12/16/24/32.

## Colors

- Primary `#FAD4C0`: peach tint for soft emphasis, badges, and warm cards.
- Secondary `#80A1C1`: muted blue for supporting UI, calm highlights, and secondary accents.
- Success `#16A34A`: status and positive progress only.
- Warning `#D97706`: caution states only.
- Danger `#DC2626`: destructive or error states only.
- Surface `#FFF5E6`: warm page background and broad neutral surfaces.
- Text `#111827`: primary readable ink.
- Neutral `#FFF5E6`: large background base.

## Usage

- Start from the active design system's background and surface tokens. If no active design system is available, use the warm surface token, then add white or near-white cards for contrast.
- Use peach and muted blue as soft card tints, not as heavy full-page color fields.
- Keep body text on text or muted ink values with accessible contrast.
- Use status colors only for status meaning.
- Maintain consistent spacing rhythm and avoid local card-specific spacing improvisation.
