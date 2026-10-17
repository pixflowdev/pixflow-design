# Bento Responsive Rules

## Desktop

- Review at a 1600px viewport with a primary content width around 1180px to 1320px.
- Use a 12-column grid only as span math. Do not create visible 1-column or 2-column cards in the main board.
- The first viewport should read as one composed bento board, not a header plus unrelated cards.
- The hero card should span at least half the board width. It may span 7 to 8 columns and 2 rows, or become a wide top card when the brief needs a more editorial rhythm.
- Text-heavy cards, quotes, checklists, action cards, and product UI cards need at least 4 of 12 columns.
- Compact signal cards may use 3 of 12 columns only when they contain a short label, one number, or one icon plus one line.
- Avoid orphan support cards. If a product mockup spans two rows, stack adjacent support cards beside it so the board looks packed and intentional.
- Use stable row heights or `minmax()` tracks. Avoid masonry that creates accidental gaps.

## Tablet

- Collapse 12-column boards to 6 columns or 2 visible columns before copy becomes cramped.
- Keep the hero card first and largest.
- Preserve card role order: hero, proof metric, capability, product mockup, checklist, quote/community, CTA.
- Product mockups can remain wide, but reduce internal UI density before shrinking text below readable sizes.
- If a checklist card and quote card become narrow, stack them instead of keeping a compressed side rail.

## Mobile

- Stack cards in priority order. The mobile order should still explain the product without relying on desktop placement.
- Keep card padding between 20px and 28px depending on viewport width.
- Reduce display type enough to avoid one-word-per-line headings, but do not scale type with viewport width.
- Full-width CTAs are acceptable when paired buttons would become cramped.
- Badges, trend pills, integration chips, and metric labels must wrap inside the card.
- Product UI fragments should simplify into readable rows, tabs, cards, or phone-like panels.
- Do not hide essential proof cards to preserve the desktop shape.

## Overflow Checks

- No card, button row, badge group, metric chip, mockup panel, or code row may create horizontal overflow.
- Long product names should wrap or truncate only inside intentionally constrained labels.
- Saturated cards must be rechecked on mobile. Light text on pale peach, mint, blue, or gradient surfaces is a failure unless a dark contrast layer exists.
- Decorative blobs, gradients, and pseudo-elements must not cover text when cards stack.

## Repair Rules

- If the board looks like equal feature cards, enlarge the hero and one product-proof card.
- If the board becomes skinny, reduce visible columns or add another row.
- If a mobile stack feels too long, combine repeated feature cards into one wider checklist or product state card.
- If a card looks decorative, replace it with a metric, checklist, workflow state, quote, integration, or action card.
- If the active design system has sharp corners or flat shadows, keep the bento hierarchy through card weight, spacing, and tint rather than forcing rounded soft cards.
