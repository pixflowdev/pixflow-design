---
name: Clean
colors:
  primary: "#146EF5"
  secondary: "#6F48F7"
  success: "#16A34A"
  warning: "#D97706"
  danger: "#DC2626"
  surface: "#FFFFFF"
  text: "#111318"
  neutral: "#F6F8FB"
typography:
  h1:
    fontFamily: "Lato"
    fontSize: "clamp(3rem, 7vw, 4.75rem)"
  body-md:
    fontFamily: "Lato"
    fontSize: "1rem"
  label-caps:
    fontFamily: "Inconsolata"
    fontSize: "0.75rem"
  sourceScale: "12/14/16/18/20/24/32/44/64"
  weights: "400, 500, 600, 700, 800"
rounded:
  sm: 10px
  md: 16px
spacing:
  sm: 8px
  md: 16px
  sourceScale: "8pt baseline grid"
---

# Clean Design System

## Overview

Clean pages minimize noise through whitespace, readable type, restrained color, direct hierarchy, and specific product proof.

## Style Foundations

- Visual style: minimal and clean.
- Typography scale: 12/14/16/18/20/24/32/44/64.
- Typography fonts: Poppins or Lato display, Roboto or Inter body, Inconsolata or ui-monospace for code and small labels.
- Typography weights: 400, 500, 600, 700, 800. Use extreme weights sparingly.
- Color palette: primary, neutral, surface, border, muted, success, warning, danger.
- Spacing scale: 8pt baseline grid.

## Colors

- Primary `#146EF5`: main action, active state, focus highlight, and small product accents.
- Secondary `#6F48F7`: secondary highlight only when a second accent is useful.
- Success `#16A34A`: successful state or positive progress only.
- Warning `#D97706`: caution or pending state only.
- Danger `#DC2626`: error or destructive state only.
- Surface `#FFFFFF`: main cards and page surfaces.
- Text `#111318`: readable primary ink.
- Neutral `#F6F8FB`: alternate section surface.
- Border `#E4E8F0`: structural card and divider line.

## Usage

- Keep the page mostly white or near-white.
- Use blue or violet-blue as the dominant action color.
- Use violet sparingly; do not let it become a generic purple gradient theme.
- Keep body copy on text or muted ink values with accessible contrast.
- Use status colors only when they carry state meaning.
- Let product surfaces, cards, and borders create hierarchy before adding shadows.
- Use shadows only to lift hero/product panels or pricing cards.

## Layout Philosophy

- Hero content should be centered and direct.
- Product proof should be large enough to inspect, not a tiny decoration.
- Feature cards should use real UI details, micro-copy, command rows, state chips, or product labels.
- Commercial sections should be useful and compact: pricing, testimonials, logos, integrations, security, compatibility, or support.
- Desktop content should use the available width without creating skinny cards.

## Maintenance Notes

- This recipe is Pixflow-owned. Visible output must not mention external source projects.
- Public preview screenshots are quality benchmarks only. Do not embed them in generated pages or recreate their exact section order.
- If the user supplies a brand system, keep the Clean structure and swap the accent, type, and copy tone to match.
