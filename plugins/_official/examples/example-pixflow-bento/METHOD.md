# Bento Recipe

Use this recipe when the brief asks for a modular product page, launch page, feature system, dashboard-style marketing page, app toolkit, design system, plugin, or SaaS product that should feel organized, scannable, soft, and premium through a weighted card grid.

## Intent

Create a page where the grid is the main design language. The visitor should understand the product from one large hero card, then scan surrounding cards that prove speed, scale, trust, community, workflow, integrations, or product states. The method is not a generic card grid. It is a hierarchy system where each tile has a different weight and job.

This is a visual method, not a replacement for the active Pixflow Design skill or the active Pixflow Design design system. Follow the run brief, uploaded references, selected design system, craft rules, and active Pixflow skill first. Use this recipe to shape card weighting, section rhythm, hierarchy, proof density, responsive behavior, and critique. Use the active design system for color, typography, surfaces, radius, spacing, and component styling.

## Core Rules

- Build the first viewport as a deliberate bento composition, not a normal stacked landing hero.
- Use one oversized hero card as the anchor. It should span multiple rows/columns and contain the main H1, lead, and actions.
- Surround the anchor with smaller proof cards: speed, metric, checklist, quote, community, integration, or workflow card.
- Each card must have a clear role. No empty decorative tiles, random statistics, or repeated equal cards.
- Make card sizes communicate importance. Large cards carry product promise. Medium cards carry proof. Small cards carry signals.
- Use the active design system's surface and accent tokens. If no active system is available, fall back to soft cream, white, pastel, or pale product surfaces with near-black type and one high-confidence accent.
- Rounded radii should be generous and consistent, usually 24px to 36px for large cards and 18px to 24px for smaller cards, unless the active design system requires a tighter or sharper radius.
- Shadows are soft and broad. Borders are quiet but visible enough to define each tile. If the active design system is flatter, keep separation through spacing, tint, and hairline borders.
- Use simple icon marks, small badges, mini charts, check rows, status pills, or product UI fragments inside cards.
- Keep the bento grid aligned to a predictable column system. Do not use chaotic masonry.
- Do not add extra visible columns just to fit more cards. A desktop board may use 12 internal grid tracks, but any visible card in the main bento board must span at least 3 tracks, and text-heavy cards must span at least 4 tracks.
- If the content needs more than the planned slots, add another row or a second bento board. Do not squeeze cards into thin 1 or 2 track columns.
- In product-proof boards, avoid orphan cards. If a tall product mockup sits on the left and a support card sits on the right, the next support card should usually sit in the right column below it, not start a lonely new row.
- If a saturated or gradient card uses light text, give it an explicitly dark enough owned background or solid contrast layer at every breakpoint, especially mobile.
- Never include `body` in a `font: inherit` reset. If resetting controls, use `button, input, textarea, select { font: inherit; }` and keep the body font declaration intact.
- If the user selected a design system that conflicts with the recipe fallback tokens, the user-selected design system wins. Keep the bento layout and card roles, but translate the visual treatment through the selected system.

## Signature Page Rhythm

1. Compact header with brand left and one utility action on the right. Keep navigation minimal or absent.
2. First viewport bento board:
   - Large hero card spanning the left or top.
   - One speed/capability card.
   - One metric or product proof card.
   - One large accent card for the central promise.
   - One checklist/security card.
   - One quote or community card.
3. Short transition section that explains the product in one sentence or a tight two-column proof row.
4. Second bento board with product-specific cards: workflow, automation, integrations, team controls, analytics, or templates.
5. Trust or compatibility band using bento tiles rather than a generic logo strip.
6. Final CTA card that keeps the rounded-card language and does not become a separate hero page.
7. Minimal footer, aligned to the same content width as the grid.

## Visual DNA

- Background: active design-system background token, normally warm cream, soft neutral, or very pale brand tint.
- Surfaces: active design-system surface tokens, normally white, near-white, or lightly tinted cards with restrained translucent gradients.
- Ink: active design-system text token, normally near-black headings with muted support text.
- Accent: one strong brand color plus one or two very soft supporting tints. Do not turn the page into a rainbow grid.
- Typography: active design-system typography. If no system is active, use modern sans-serif with bold, tight, confident headlines and relaxed readable body copy.
- Card shape: large rounded rectangles, stable padding, no nested card clutter.
- Grid: 12-column or 4-column desktop board with fixed row rhythm. On mobile, cards stack in priority order.
- Column safety: 12 columns are for span math only. Do not create visible skinny columns; minimum card width is 3/12, and any card with a paragraph, checklist, quote, metric explanation, or actions needs at least 4/12.
- Icons: simple line icons or letter marks. Do not use emoji.
- Motion: optional subtle hover lift, glow, or reveal. The method should still work as a static screenshot.

## Copy Direction

Use concrete product language: build, launch, sync, ship, secure, automate, scale, review, publish, monitor, approve, route, connect, compose, inspect, collaborate, template, workflow, system, toolkit.

Avoid empty phrases like "revolutionary", "unlock potential", "seamless experience", "all-in-one solution", "game changer", or fake named testimonials. Claims and metrics should be clearly placeholder-like unless the user provided real data.

## Responsive Rules

- Desktop: use a weighted 12-column or 4-column board. Avoid equal-width card grids.
- Desktop: card spans must stay readable. Do not place content cards in 1/12 or 2/12 columns. Convert those into nested chips, split rows, or a new row.
- Tablet: reduce to two columns while preserving the anchor card first.
- Mobile: stack cards in importance order. The hero card comes first, then speed/metric/proof cards.
- Cards must never overflow horizontally. Long pills, badges, and metric labels should wrap or shrink cleanly.
- Preserve card padding and radius on mobile, but reduce oversized type enough to avoid awkward line breaks.
- Do not hide important proof cards on mobile just to preserve the desktop layout.
- Use min-height and aspect-ratio carefully so cards feel intentional without becoming empty.
- Re-check mobile saturated cards after stacking. Light text over peach, muted blue, mint, or pale gradients is a failure unless the card owns a dark surface behind the text.

## Bricks Awareness

Stage A should output clean HTML/CSS only. Do not plan Bricks JSON here. However, structure sections so Stage B can convert them reliably:

- Use semantic sections and clear class names such as `bento-board`, `bento-card`, `hero-card`, `metric-card`, and `proof-card`.
- Prefer CSS grid with explicit spans over absolute positioning.
- Avoid card text that depends on overlapping pseudo-elements.
- Keep decorative gradients and glows on pseudo-elements optional; content must be real HTML.
- Keep cards as convertable containers with real headings, paragraphs, lists, buttons, and spans.
- Keep the body font-family intact. Do not override it later with `font: inherit`.
- Use scoped JavaScript only if the active skill and brief require it. This recipe usually needs no JavaScript.
