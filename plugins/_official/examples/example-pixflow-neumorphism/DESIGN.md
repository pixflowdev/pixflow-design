---
name: Neumorphism
colors:
  primary: "#006666"
  secondary: "#F1F2F5"
  success: "#00A63D"
  warning: "#FE9900"
  danger: "#FF2157"
  surface: "#E7E5E4"
  text: "#1E2938"
  neutral: "#E7E5E4"
typography:
  h1:
    fontFamily: "Space Mono"
    fontSize: 3rem
  body-md:
    fontFamily: "Space Mono"
    fontSize: 1rem
  label-caps:
    fontFamily: "JetBrains Mono"
    fontSize: 0.75rem
  sourceScale: "desktop-first expressive scale"
  weights: "400, 500, 600, 700, 800"
rounded:
  sm: 16px
  md: 22px
  lg: 30px
spacing:
  sm: 8px
  md: 16px
  lg: 28px
  sourceScale: "compact density with shadow-safe gaps"
---

# Neumorphism Design System

## Overview

Neumorphism uses one continuous stone-gray material, shaped by light. Cards, buttons, inputs, and panels share the same base surface while paired shadows create raised or inset depth.

## Style Foundations

- Visual style: tactile, technical, minimal, clean, quietly futuristic.
- Typography scale: desktop-first expressive headings, compact readable UI text.
- Typography fonts: primary Space Mono, display Space Mono, mono JetBrains Mono.
- Color palette: deep teal primary, warm stone surface, navy-charcoal text, status colors only when meaningful.
- Spacing scale: compact density with enough gap for shadows to render separately.

## Colors

- Primary `#006666`: primary actions, selected states, focus rings, and active navigation.
- Secondary `#F1F2F5`: subtle raised panels only when a slight surface lift is needed.
- Success `#00A63D`: positive status and confirmations.
- Warning `#FE9900`: caution, pending, or attention state.
- Danger `#FF2157`: destructive or error state.
- Surface `#E7E5E4`: the page background and default material for cards/controls.
- Text `#1E2938`: primary readable ink.
- Neutral `#E7E5E4`: same as surface for one-material consistency.

## Shadows

- Raised: light top-left and dark bottom-right shadows.
- Inset: dark top-left and light bottom-right shadows.
- Light source must stay top-left. Mixed shadow direction breaks the physical model.
- Use visible focus rings and fallback borders when shadow-only boundaries are not enough.

## Usage

- Start with `--neo-bg` and use the same surface on cards and controls.
- Use shadows and state changes to distinguish components, not white fills or hard outlines.
- Keep teal sparse and purposeful.
- Give interactive controls a clear active/inset state.
- Avoid low-contrast body text, especially on small cards and mobile.
