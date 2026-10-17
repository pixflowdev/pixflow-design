# Bento Checklist

Before finalizing Stage A, check:

- The first viewport is a weighted bento board, not a normal split hero or equal-card grid.
- The hero card is clearly the largest and contains the main H1, lead, and actions.
- Every card has a specific job: hero, capability, metric, proof, checklist, quote, community, or CTA.
- Card spans communicate hierarchy; the grid is not chaotic masonry.
- The active Pixflow Design design system is the visual token source. `method-design-system.md` and `method-tokens.css` are fallback references only.
- No visible desktop card in the main bento board is squeezed into a 1/12 or 2/12 column span.
- Any text-heavy, quote, checklist, action, badge-heavy, or product UI card spans at least 4/12 columns or moves into a nested layout.
- If the board needs more content, it adds rows or a second board instead of adding extra skinny columns.
- The page uses the active design system's palette with one dominant accent and soft supporting tints.
- The page uses the active design system's typography and readable body copy.
- Saturated or gradient cards with light text own an explicit high-contrast background on mobile, not only a desktop gradient.
- CSS does not include `body` in a `font: inherit` reset; the body font-family must render correctly in screenshots.
- Product UI fragments contain real labels, rows, statuses, controls, or states relevant to the brief.
- Metrics and testimonials are not fabricated as real facts unless the user supplied them.
- The lower sections preserve the bento language instead of turning into generic feature rows.
- Product-proof boards do not leave an orphan support card on its own lower row when a right-rail row is available.
- Tall product mockup cards span the same number of rows as their adjacent support stack, so the board reads as packed rather than accidental.
- Mobile layout stacks cards in priority order and avoids horizontal overflow.
- Pills, labels, and metric chips do not protrude past card edges.
- The visible page does not mention external recipe sources, test harnesses, Bricks conversion, or internal file names.
- Stage A output is standalone HTML/CSS and does not include Bricks JSON.

Final critique before handoff:

- Would the recipe be recognizable from a cropped screenshot of the first viewport?
- Does each card earn its space, or are any tiles decorative filler?
- Is the hero card strong enough without needing text outside the board?
- Does the lower page still feel modular and product-specific?
- Are card radii, spacing, and shadows consistent enough to feel authored?
- Is the artifact strong enough to use as a Pixflow iframe preview without explanation?
