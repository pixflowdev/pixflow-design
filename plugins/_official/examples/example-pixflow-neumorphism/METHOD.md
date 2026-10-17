# Neumorphism Recipe

Use this recipe when the brief asks for a tactile app, dashboard, settings page, AI workspace, community product, developer tool, analytics surface, or product landing page that should feel physical, soft, and quietly technical.

## Intent

Create a page that feels like it was shaped from one continuous interface material. Raised cards and buttons appear to push out of the surface. Inputs, selected states, tracks, and active controls appear pressed into it. The style should support clarity and interaction state, not become a decorative shadow demo.

This is a visual method, not a replacement for the active Pixflow Design skill. Follow the run brief, uploaded references, selected design system, craft rules, and active Pixflow skill first. Use this recipe to shape material, hierarchy, component states, and tactile dashboard/product composition.

## Core Rules

- Use one warm stone surface as the page background and default component material.
- Raised elements use paired shadows: light top-left, dark bottom-right.
- Inset elements reverse the physical feeling with inner shadows.
- Keep one consistent light source. Do not mix shadow directions.
- Use deep teal sparingly for active states, primary actions, focus rings, and selected navigation.
- Use monospace typography intentionally. It should feel technical and machined, not cramped.
- Every raised or inset treatment must have a content role: navigation, action, input, metric, chart, schedule, status, or product state.
- Maintain readable contrast. Never rely on shadow alone for text, state, or boundaries.
- Add subtle borders or focus rings where shadow separation is not enough.
- Leave enough gap around elements so shadows do not merge into muddy grey.
- Avoid white card UI, glass effects, hard black shadows, gradients as the main style, and decorative blob backgrounds.

## Signature Page Rhythm

1. App-like header and/or left rail with raised brand control and inset active navigation.
2. First viewport dashboard/product composition:
   - A wide app shell that uses the desktop canvas, not a narrow centered column.
   - Large raised hero or dashboard surface paired with supporting metric/control panels.
   - Inset search/input or command field in the header or overview surface.
   - Raised metric cards arranged in a balanced row or side stack.
   - Chart or schedule panel with inset tracks visible in the first or second viewport.
   - Primary teal action and visible focus/active state.
3. Product proof section with tactile controls, toggles, timeline, or settings.
4. Feature section explaining the material system through real product benefits.
5. Final CTA as a raised panel with inset input or action row.
6. Minimal footer that keeps the same material and shadow language.

## Visual DNA

- Background: warm stone gray.
- Surface: same as background for cards and controls.
- Ink: deep navy-charcoal.
- Accent: deep teal, used sparingly.
- Typography: Space Mono-style for display/body; JetBrains Mono-style for technical labels.
- Shape: generous rounded rectangles and circular controls.
- Depth: paired shadows, not heavy elevation.
- Interaction: raised by default, inset on active/selected/pressed, clear teal focus ring.
- Motion: short shadow transitions only when useful.

## Responsive Rules

- Desktop should use an app/dashboard shell with side rail plus main content unless the brief strongly requires a simple landing page.
- Desktop content should occupy the available width with a stable shell grid. Avoid a skinny central dashboard with large empty right-hand whitespace.
- In the first viewport, use at least two meaningful desktop columns after the rail: one dominant overview area and one supporting status/control area.
- Tablet should collapse side rail into a top navigation or compact rail.
- Mobile should stack panels in task order: hero/status, primary action, metrics, chart, schedule/tasks, CTA.
- Cards and controls need shadow-safe gaps on every breakpoint.
- Inputs and buttons must remain at least 44px tall.
- Long monospace labels should wrap or truncate cleanly without overflowing.
- Do not hide important state panels on mobile just to preserve desktop symmetry.

## Bricks Awareness

Stage A should output clean HTML/CSS only. Do not plan Bricks JSON here. However, structure sections so Stage B can convert them reliably:

- Use semantic sections and clear classes such as `neo-shell`, `neo-panel`, `neo-card`, `neo-inset`, `neo-button`, `metric-card`, and `schedule-card`.
- Keep shadows in CSS classes or variables rather than inline one-off values.
- Avoid absolute-positioned content that Stage B cannot translate.
- Content must be real HTML: headings, paragraphs, lists, buttons, labels, and spans.
- Use scoped JavaScript only if the active skill and brief require it. This recipe usually needs no JavaScript.
