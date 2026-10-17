# Bento Anti-Patterns

## Layout Failures

- Equal feature grids with identical cards.
- Masonry layouts where card order feels accidental.
- A normal split hero followed by cards below it.
- 1-column or 2-column visible cards in a 12-column desktop board.
- Dense card boards with no clear hero or primary reading path.
- Lonely final cards sitting on their own row because the grid was not planned.
- Product mockups that are too small to inspect.

## Visual Failures

- Random pastel tiles with no token discipline.
- Rainbow bento boards where every card uses a different accent.
- Pale text on pale peach, mint, blue, cream, or gradient backgrounds.
- Harsh shadows, heavy borders, or glass effects that fight the active design system.
- Nested cards inside cards unless they represent real UI within a product mockup.
- Decorative empty tiles that exist only for gradients, icons, or abstract blobs.

## Content Failures

- Cards titled "Feature one", "Powerful tools", "Everything you need", or similar filler.
- Metrics with no context or invented certainty.
- Named testimonials, customer logos, security certifications, or usage numbers not provided by the user.
- Repeated cards saying the same thing with different icons.
- Product UI fragments with unreadable tiny labels.
- CTA cards that repeat the hero without adding a next step.

## Responsive Failures

- Desktop cards that only work because the viewport is very wide.
- Mobile stacks that put minor decorative cards before the main product promise.
- Pill rows and badge groups that protrude past card edges.
- Gradient pseudo-elements covering text after cards stack.
- H1 copy wrapping into one-word vertical stacks.
- Product mockups that shrink into illegible thumbnails.

## System Conflicts

- Overriding a user-selected Pixflow Design design system with recipe fallback colors or fonts.
- Treating `method-design-system.md` as more important than the active design system.
- Forcing rounded soft cards when the active design system intentionally uses sharper, flatter, or more editorial surfaces.
- Using Bricks JSON, Bricks build skills, or conversion references during Stage A.
