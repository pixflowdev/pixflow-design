# Neumorphism Component Roles

## Raised Panel

- Default shell for cards, metric blocks, schedule panels, and modal-like surfaces.
- Uses the same surface color as the page.
- Uses paired outer shadows: light top-left and dark bottom-right.
- May include a very subtle border only as accessibility support.

## Inset Well

- Used for text inputs, active nav items, chart wells, progress tracks, toggles, selected tabs, and pressed states.
- Uses inner shadows with the same material surface.
- Must not be used for static body copy unless it communicates a carved/contained state.

## Button

- Raised by default.
- Primary button uses teal fill or teal text/accent with strong contrast.
- Active/pressed button becomes inset.
- Focus-visible uses teal ring. Do not rely on shadow shift only.
- Disabled button must visibly reduce contrast and not look selected.

## Navigation Item

- Raised or flat neutral by default.
- Current item uses inset treatment plus teal indicator.
- Icons are optional, but labels must remain visible.

## Metric Card

- Raised small card with label, value, trend/status, and short context.
- Keep numbers high contrast and large enough to scan.
- Do not invent real business claims unless supplied by the user.

## Chart Panel

- Raised outer card with inset chart surface.
- Chart marks use teal/status colors sparingly.
- Axis labels and legends must be readable.
- Avoid fake complex chart clutter; use enough structure to imply a real product state.

## Toggle And Switch

- Track is inset.
- Knob is raised and moves between states.
- Active state uses teal accent and text label, not color alone.

## Form Input

- Input body is inset.
- Label sits outside or above the inset area.
- Error state uses danger color plus message.
- Focus-visible gets teal ring or clear outline.

## Shadow Rules

- Raised: light shadow top-left, dark shadow bottom-right.
- Inset: inner dark top-left, inner light bottom-right.
- Keep offsets consistent. Do not mix hard black shadows or random directions.
- Shadow values must be strong enough to identify component boundaries without harming readability.
