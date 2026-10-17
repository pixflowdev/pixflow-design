# Enterprise Component Roles

## Dark Command Surface

- Used for header, hero, major dashboard shell, footer, or trust band.
- Background uses `--enterprise-primary`.
- Text uses white/teal tints with strong contrast.
- Orange may be used for selected states or one CTA.

## Product Dashboard Panel

- Large card or browser-frame surface showing operational state.
- Must include labels, metrics, activity rows, and status chips.
- Should feel usable from a screenshot, not just decorative.

## Workflow Node

- Represents trigger, condition, data source, AI step, approval, sync, or action.
- Has a title, short label, state chip, and optional connector.
- Selected/active nodes may use orange border or fill.
- Nodes must never be so narrow that labels wrap awkwardly.

## Metric Card

- Contains label, value, trend/status, and short context.
- Numbers use tabular or mono support where useful.
- If illustrative, keep claims plausible and clearly product-related.

## Status Chip

- Uses both color and text.
- Success, warning, danger, live, queued, and scheduled states must be visually distinct.
- Minimum height should remain readable on mobile.

## Integration Tile

- Shows tool/source name, data direction, and connection state.
- Letter marks or simple icons are acceptable.
- Avoid large logo walls that overpower product proof.

## Button

- Primary: orange fill, white label, 8px radius, clear focus ring.
- Secondary: transparent or dark-green/white outline depending on section background.
- Hover/active transitions are small and do not move layout.

## Reveal Motion

- Use `data-reveal` or equivalent scoped attributes.
- Default hidden state only applies when JavaScript is active.
- Reduced-motion reveals everything immediately.
- Motion must never be required to understand the page.
