# Energetic Recipe System

## Overview

Energetic is a bold, expressive, and high-contrast recipe designed for active brands, creator launches, and dynamic products. It features thick 4px borders, hard drop shadows, a vibrant orange and purple color palette, and geometric layouts that convey motion and vitality.

## Token Direction

- `--ene-bg`: soft peach or warm cream background to keep the page inviting.
- `--ene-surface`: vibrant orange or purple panel, or solid white with a heavy border.
- `--ene-surface-soft`: soft orange/peach tint for secondary cards.
- `--ene-text`: deep purple/indigo or near-black for high-contrast reading.
- `--ene-muted`: readable secondary text, maintaining strong contrast.
- `--ene-border`: thick, solid 4px border in primary orange (`#EA580B`) or deep purple (`#1d1836`).
- `--ene-accent`: vibrant amber/orange (`#F59E0B`) or electric purple (`#6733FF`).
- `--ene-shadow`: flat offset solid shadow (`4px 4px 0px 0px`).

## Typography

- Display type should be bold, expressive, and geometric (e.g., Limelight or bold sans-serif).
- Free font options: Limelight, Outfit, Inter, JetBrains Mono, or system sans/mono.
- Keep headlines uppercase or strongly geometric to support the expressive feel.
- Labels and secondary descriptors should use a monospaced font (like JetBrains Mono) for a technical/structural feel.

## Layout

- Use clear, thick-bordered panels and containers.
- Align grids and columns precisely, using solid offset shadows to lift elements off the background.
- At 1600px viewports, ensure columns have enough room to prevent text wrapping from squishing headlines or body copy.
- Keep the composition active: centered layouts, 2x2 grids, and prominent hero layouts featuring structural products (e.g. cans/bottles/devices).
- Incorporate subtle motion cues: springy hover states, scale-up transformations, and clean active indicators.

## Color

The recipe takes inspiration from public active/energetic designs, utilizing high-contrast tones for key brand elements:

- Primary: `#EA580B` (Vibrant Orange)
- Secondary: `#F59E0B` (Amber)
- Background: `#FFEDD5` (Warm Peach)
- Contrast Background/Text: `#1d1836` (Deep Indigo)
- Card Surface: `#FDBA74` (Peach Accent)

## Motion

- Snappy spring-like scaling on hover (`transform: scale(1.02)` or `scale(1.05)`).
- Glint animations or quick color transitions.
- Maintain fallback static layouts for accessibility.
