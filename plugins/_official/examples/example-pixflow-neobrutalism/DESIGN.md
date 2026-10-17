---
name: Neobrutalism
colors:
  primary: "#FDC800"
  secondary: "#432DD7"
  success: "#16A34A"
  warning: "#D97706"
  danger: "#DC2626"
  surface: "#FBFBF9"
  text: "#1C293C"
  neutral: "#FBFBF9"
typography:
  h1:
    fontFamily: "Inter"
    fontSize: 2.1875rem
  body-md:
    fontFamily: "Inter"
    fontSize: 0.9375rem
  label-caps:
    fontFamily: "JetBrains Mono"
    fontSize: 0.8125rem
  sourceScale: "13/15/17/21/27/35"
  weights: "400, 500, 600, 700, 800, 900"
rounded:
  sm: 0px
  md: 4px
  lg: 8px
spacing:
  sm: 4px
  md: 8px
  lg: 16px
  xl: 24px
  sourceScale: "4/8/12/16/24/32"
---

# Neobrutalism Design System

## Overview

Neobrutalism is a loud but disciplined Pixflow design system for high-contrast pages with thick black borders, hard offset shadows, vivid color, flat surfaces, and intentionally direct hierarchy.

## Style Foundations

- Visual style: raw, graphic, high-contrast, bold, modern, useful.
- Typography scale: 13 / 15 / 17 / 21 / 27 / 35, with larger responsive display allowed for heroes.
- Typography fonts: Inter for display/body; JetBrains Mono for labels and technical metadata.
- Color palette: yellow primary, violet secondary, off-white surface, deep navy-black text, semantic status colors.
- Spacing scale: 4px base with enough gap for hard shadows.

## Colors

- Primary `#FDC800`: primary CTA, highlight blocks, selected cards, offer badges.
- Secondary `#432DD7`: contrast panels, secondary CTA, link emphasis, graphic accents.
- Surface `#FBFBF9`: main page background and card surface.
- Text `#1C293C`: main readable text.
- Success `#16A34A`: positive state only.
- Warning `#D97706`: caution or queued state only.
- Danger `#DC2626`: error, destructive, or urgent state only.

## Typography

- H1/H2: heavy Inter, 800 or 900, tight but not negative letter spacing.
- Body: 15px to 17px, 1.45 to 1.65 line height.
- Labels: mono uppercase, 12px to 13px, used for badges, metadata, counters, and small section labels.
- Avoid decorative display fonts. Let borders, shadows, and flat color carry the personality.

## Shape And Depth

- Border: 2px to 3px solid near-black.
- Shadow: 4px to 8px hard offset, normally `6px 6px 0 #1C293C`.
- Radius: 0px to 8px. Use small radius if the page needs a friendlier product feel.
- Surfaces: flat fills only. Do not use gradients, transparency, or blur.

## Interaction States

- Hover: element shifts slightly or shadow increases/decreases by 1px to 2px.
- Active: element compresses toward the shadow.
- Focus-visible: thick outline or secondary-colored ring with enough offset.
- Disabled: keep border visible but reduce fill contrast and add text label if needed.
- Loading/error states must be explicit; never rely on color alone.

## Responsive Behavior

- Reduce hard shadow offsets on mobile if they cause overflow.
- Preserve minimum touch targets of 44px.
- Stack cards in importance order.
- Keep decorative shapes outside the content flow and remove them on small screens if needed.
- Long labels wrap; no horizontal scrolling.
