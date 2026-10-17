---
name: Paper
colors:
  primary: "#1F2937"
  accent: "#5F8FE8"
  accentSoft: "#EAF2FF"
  paper: "#FCFCF8"
  paperSoft: "#F2F1EA"
  surface: "#FFFFFF"
  text: "#242424"
  muted: "#6F746F"
  border: "#E4E2D8"
typography:
  h1:
    fontFamily: "Montserrat"
    fontSize: "clamp(48px, 5vw, 76px)"
  body-md:
    fontFamily: "Roboto"
    fontSize: "1rem"
  label-caps:
    fontFamily: "PT Mono"
    fontSize: "0.75rem"
  sourceScale: "12/14/16/18/24/32/48/64/76"
rounded:
  sm: 10px
  md: 18px
  lg: 28px
  xl: 36px
spacing:
  sourceScale: "4/8/12/16/24/32/48/64/96/128"
---

# Paper Design System

## Overview

Paper is a light document-workspace system: warm page canvas, white sheets, soft blue active states, thin paper rules, readable product miniatures, and generous quiet spacing.

## Token Intent

- `paper` is the body background. It should feel warm and clean, not beige or aged.
- `surface` is for cards, nav, editor shells, pricing plans, and document sheets.
- `paperSoft` is for inner editor canvases, preview strips, code wells, and miniature UI panels.
- `text` is primary ink.
- `muted` is secondary copy and metadata, but never below accessible contrast.
- `accent` is one soft blue for CTAs, selected states, focus, and small labels.
- `border` is the default paper rule.

## Typography

- Display: Montserrat-style, medium weight, rounded and calm.
- Body: Roboto/Inter-style sans, open counters, high readability.
- Mono: PT Mono-style labels for document metadata, paths, version text, and tiny UI snippets.
- Hero headings should be large but not stretched edge-to-edge. Preserve readable line breaks.
- Body copy should sit between 58ch and 72ch unless intentionally in a compact card.

## Surfaces

- White cards on warm paper are the main material.
- Editor shells should use a slightly larger radius and very low shadow.
- Inner document surfaces use muted paper fields with borders, rows, and small blue active states.
- Avoid heavy glassmorphism, harsh shadows, and saturated gradients.

## Motion

Motion is optional. Prefer subtle reveal, soft hover lift, border-color shift, or active row transition. Respect reduced motion. Do not require JavaScript for layout or content visibility.

## Maintenance Notes

- Keep the recipe light by default even if the user's operating system prefers dark.
- If a brand color is supplied, let it replace the blue accent only when it remains restrained.
- If the prompt is not document/product related, use the Paper material and spacing, but keep the content aligned to the user brief.
