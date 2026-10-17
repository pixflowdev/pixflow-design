# Bento Layouts

Use these as layout patterns. Adapt copy, counts, and section order to the run brief.

## Weighted First-Viewport Board

Purpose: make the recipe recognizable immediately.

Structure:

- Header above the board with brand left and one action right.
- Main grid with 12 desktop columns and a stable row height.
- Hero card spans 7 to 8 columns and 2 rows. It contains a small badge, large H1, lead, and two actions.
- Right column contains two stacked proof cards: capability card and metric card.
- Lower row contains one large accent card, one checklist/security card, one quote card, and one community/action card.
- Valid desktop spans are usually 8, 7, 6, 5, 4, or 3 columns. Do not use 1 or 2 column visible cards in the main board.
- Text-heavy cards, action cards, checklist cards, quote cards, and cards with badges/pills need at least 4 columns.
- If there are too many cards for the row, add another row or create a second board instead of making narrow extra columns.

Rules:

- The hero card must be the largest card.
- Cards should share radius, border, and shadow language but not all look identical.
- Use background tints to distinguish card purpose, not random colors.
- Do not use a standard split hero outside the card board.
- Do not use `repeat(auto-fit, minmax(160px, 1fr))`, arbitrary 14/16-column desktop boards, or masonry-like skinny tracks for the first viewport.

## Product Proof Board

Purpose: show the product or service as a system of useful states.

Structure:

- Section heading above a second board.
- One large product mockup card with dashboard rows, editor panels, phone frame, or builder states.
- Two or three supporting cards with integrations, automation, analytics, team controls, templates, or workflow state.
- Optional wide card for timeline, approval flow, or status strip.
- Supporting cards still need readable width. On a 12-column board, use 3 columns for very short signal cards and 4 to 6 columns for anything with body copy.
- When the product mockup is visually tall on the left, make it span two rows and place the supporting cards in the right rail, one above the other.
- Do not leave a single final support card orphaned on a new row when it could sit in the right column under the first support card.

Rules:

- Product UI fragments must be readable enough to inspect in an iframe preview.
- Use status pills, rows, charts, tabs, or control groups that fit the brief.
- Avoid generic abstract rectangles without labels.
- The lower board should feel intentionally packed: avoid large blank grid cells and avoid a lonely last card at the bottom of the section.

## Checklist And Metric Tiles

Purpose: make enterprise or trust claims scannable.

Structure:

- Medium card with a direct heading such as "Enterprise controls" or "Ready for handoff".
- Four to six checklist rows with small circular check marks.
- Neighbor card with one large number, trend pill, and short explanation.

Rules:

- Metrics should be placeholders only when not supplied by the user.
- Checklist copy must be specific to the product and not generic feature filler.
- Keep row spacing generous; do not cram the card.

## Quote Or Community Tile

Purpose: add human proof without inventing fake case studies.

Structure:

- Small or medium soft-tint card.
- Use anonymous or role-based placeholder copy if no real testimonial is supplied.
- Include initials, role label, or community count only as interface placeholder content.

Rules:

- Do not invent named customers, companies, awards, or quantified proof.
- Keep quote cards visually subordinate to the product cards.

## Final CTA Card

Purpose: end the page in the same bento language.

Structure:

- Wide rounded card with heading, short lead, and one or two actions.
- Optional small adjacent tile for support, docs, or compatibility.
- Footer below the CTA remains minimal.

Rules:

- Do not switch to a full-bleed unrelated hero.
- CTA should use the recipe's card, radius, and surface system.
