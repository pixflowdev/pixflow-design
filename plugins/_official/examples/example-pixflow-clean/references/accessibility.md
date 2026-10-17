# Clean Accessibility Rules

## Contrast

- Body copy must meet WCAG 2.2 AA contrast on white, soft grey, and accent surfaces.
- Muted text should remain readable. Avoid pale grey copy below 14px.
- Dark bands require high-contrast text and visible focus states.

## Semantics

- Use semantic `header`, `main`, `section`, `nav`, and `footer`.
- Use one `h1`.
- Keep heading order logical.
- Buttons are actions; links are navigation.

## Keyboard And Focus

- All links and buttons need visible focus states.
- Focus rings should use the accent color or a high-contrast outline.
- Do not remove outlines globally.
- Touch targets should be at least 44px high for primary interactions.

## Motion

- Clean rarely needs JavaScript motion.
- If reveal or hover motion is used, include `prefers-reduced-motion: reduce` support.
- Content must be visible without JavaScript.

## Product Mockups

- Mockup labels must be large enough to read in the screenshot.
- Code blocks should not rely on color alone.
- Status chips should combine text and color.

## Copy

- Avoid fake compliance, security, finance, health, or investment claims.
- If placeholders are used, make them clearly generic.
- Do not invent real customer endorsements.
