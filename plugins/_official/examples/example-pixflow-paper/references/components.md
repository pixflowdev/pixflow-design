# Paper Components

## Navigation

- Use a thin light bar, small document mark, short links, and a compact primary CTA.
- Active or hover states are text color, underline/rule, or soft blue background.
- On mobile, keep brand plus one CTA or menu button. Hide decorative center links.

## Buttons

Variants:

- Primary: soft blue or near-black filled pill.
- Secondary: white pill with warm border.
- Text: no border, muted text, visible focus.

Rules:

- Minimum height 42px desktop, 44px touch.
- Use one primary per section.
- Labels must not overflow; allow wrapping or shorten copy.

## Editor Shell

Required anatomy:

- Chrome row with three dots or document title.
- Sidebar with workspace groups.
- Main document area with title, metadata, content rows, and at least one live-product detail.
- Suggestion/comment/collaborator/status detail.

States:

- Active document row uses accent-soft background and accent dot.
- Comment or AI suggestion card uses white surface, blue marker, and readable text.
- Disabled or archived rows use muted text and lower opacity.

Responsive:

- Hide or reduce sidebar on mobile.
- Preserve the main document title and at least three content rows.
- Remove floating cards if they overlap.

## Feature Cards

- White surface, 22px to 28px radius, soft border, low shadow.
- Include title, body, and a miniature product UI plate.
- Use simple CSS marks instead of emoji.
- Card miniatures should support the copy: search, version history, AI suggestion, permissions, collaboration, code, publishing.

## Miniature UI Plates

Use pale paper-soft backgrounds with low-contrast rows and a small accent detail.

Examples:

- Search input with result rows.
- Version timeline with dots.
- Permission list with role pills.
- AI suggestion card with accept/dismiss actions.
- Code block with a mono endpoint.
- Campaign checklist with status chips.

Do not create unreadable fake screenshots or random chart widgets.

## Badges And Eyebrows

- Use mono or small uppercase text.
- Optional tiny blue dot before the label.
- Keep labels short: Features, Workflow, Use cases, Pricing, Why Paper.
- Do not use large colorful badges.

## Cards And Panels

- Use borders before shadows.
- Radius should be consistent.
- Avoid nested card-in-card stacks unless the inner element is a product UI miniature.
- Keep body copy readable and aligned to the grid.

## Pricing Cards

- Three cards max unless user asks for more.
- One highlighted plan is allowed with dark ink background and white button.
- Feature list uses check marks or small dots, not emojis.
- Pricing copy must be realistic but non-binding.

## Forms And Inputs

- Inputs should look like document fields: white or paper-soft, thin border, visible focus ring.
- Placeholder text must have adequate contrast.
- Error state uses danger token plus clear text.

## Footer

- Light footer by default with top border.
- Multi-column links and a brand summary.
- Social/legal row remains small but readable.
- Dark footer is optional only when the page needs a stronger close.
