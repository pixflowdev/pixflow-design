---
name: Enterprise
colors:
  primary: "#072C2C"
  secondary: "#FF5F03"
  success: "#16A34A"
  warning: "#D97706"
  danger: "#DC2626"
  surface: "#EDEADE"
  text: "#111827"
  neutral: "#EDEADE"
typography:
  h1:
    fontFamily: "Oswald"
    fontSize: 3rem
  body-md:
    fontFamily: "Ubuntu"
    fontSize: 1rem
  label-caps:
    fontFamily: "Ubuntu Mono"
    fontSize: 0.75rem
  sourceScale: "desktop-first expressive scale"
  weights: "400, 500, 600, 700, 800, 900"
rounded:
  sm: 4px
  md: 8px
  lg: 16px
spacing:
  sm: 8px
  md: 16px
  lg: 28px
  sourceScale: "comfortable enterprise density"
---

# Enterprise Design System

## Overview

Enterprise is a high-contrast product system for data-driven workflows, automation tools, AI operations, and serious B2B platforms. It combines deep green command surfaces, warm operational canvas, orange action states, structured product panels, and readable workflow evidence.

## Style Foundations

- Visual style: clean, structured, high-confidence, operational, enterprise-grade.
- Typography scale: desktop-first expressive headings with compact product UI labels.
- Typography fonts: display Oswald, body Ubuntu/Inter, mono Ubuntu Mono/JetBrains Mono.
- Color palette: deep green primary, orange action accent, warm stone surface, near-black text, status colors used only for state.
- Spacing scale: comfortable density, with predictable grids and enough air around dense product surfaces.

## Colors

- Primary `#072C2C`: header, hero, command surfaces, footer, dark product shells.
- Secondary `#FF5F03`: primary CTA, selected workflow node, active connector, chart highlight.
- Success `#16A34A`: completed, synced, approved, healthy status.
- Warning `#D97706`: queued, pending, needs review, caution state.
- Danger `#DC2626`: error, failed, destructive, critical status.
- Surface `#EDEADE`: warm page canvas and soft enterprise background.
- Text `#111827`: primary readable ink on light sections.
- Neutral `#EDEADE`: same as surface for recipe compatibility.

## Typography

- H1/H2: uppercase or title-case Oswald-style display, tight but readable.
- Body: Ubuntu/Inter-style sans with practical line length.
- Labels: mono uppercase for URLs, status, plan labels, run metadata, and workflow step IDs.
- Avoid overusing display type in small product panels. Product UI should be readable first.

## Shape And Depth

- Small controls: 4px to 8px radius.
- Large panels: 12px to 18px radius.
- Borders: quiet, visible, and aligned to the grid.
- Shadows: subtle product depth only. Dark sections can use glows, but never soft decorative blobs as the main design idea.

## Motion

- Entrance motion: opacity plus 8px to 48px translate. Stagger by role, not randomly.
- Hover motion: scale or translate by 1% to 2%, never enough to shift layout.
- Reduced-motion: disable transitions and reveal all content.
- Content must be visible in a static no-JS screenshot.
