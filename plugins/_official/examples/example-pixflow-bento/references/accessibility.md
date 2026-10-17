# Bento Accessibility Rules

## Contrast

- Body copy, labels, metric captions, and checklist rows must meet WCAG 2.2 AA contrast against their card surfaces.
- Muted text must remain readable at 14px and above. Do not use pale grey text on warm cream cards.
- Peach, mint, pale blue, and gradient cards usually need dark text. Use light text only on intentionally dark cards.
- Status colors must be paired with labels or icons. Do not rely on green, amber, or red alone.

## Semantics

- Use semantic `header`, `main`, `section`, `nav`, and `footer`.
- Use one `h1`, placed inside the hero card.
- Keep heading order logical across cards. Card headings can be `h2` or `h3` depending on section structure.
- Buttons are actions; links are navigation. Do not use clickable divs for card actions.
- Product UI mockups are illustrative content, so labels should be real text instead of background images.

## Keyboard And Focus

- Every link and button needs a visible `:focus-visible` state.
- Focus rings must be visible on white, tinted, and saturated card surfaces.
- Do not remove outlines globally.
- Touch targets should be at least 44px high for primary actions, icon buttons, and compact CTA pills.
- If a card is fully clickable, it must have a clear accessible label and must not contain conflicting nested interactive elements.

## Motion

- Bento does not require JavaScript motion.
- Hover lift, glow, or card reveal motion should be subtle and must not be the only way to understand hierarchy.
- Include `prefers-reduced-motion: reduce` when transitions, animation, or scroll reveals are used.
- Content must be visible and usable with JavaScript disabled.

## Product Mockups

- Mockup labels, rows, tabs, and status pills must be large enough to read in the iframe preview.
- Mini charts should include text labels, not only colored bars.
- Code or terminal fragments should use readable contrast and should not rely on color alone.
- Do not show fake compliance, security, finance, health, or revenue claims as real facts unless supplied by the user.

## Copy

- Claims and metrics must be clearly generic placeholders unless the user supplied real data.
- Avoid fabricated named testimonials, customer logos, certifications, or awards.
- Use concise labels that explain the role of each card: speed, sync, approval, analytics, templates, routing, security, docs, or support.
- Keep card copy short enough that cards do not become text blocks pretending to be bento tiles.
