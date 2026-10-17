# Neobrutalism Component Roles

## Hard Shadow Card

- Border: 2px to 3px solid near-black.
- Shadow: 4px to 8px hard offset, no blur.
- Fill: off-white, yellow, violet, or status fill.
- Padding must account for border weight and shadow bulk.

## Button

- Primary: yellow fill, near-black text, thick border, hard shadow.
- Secondary: off-white or violet fill depending on section background.
- Hover: translate by `-1px -1px` or increase shadow slightly.
- Active: translate toward the shadow and reduce offset.
- Focus-visible: thick outline, usually violet or near-black, with visible offset.

## Badge

- Small uppercase label with thick border and flat fill.
- Use mono or heavy sans.
- Keep labels short: New, Live, Launch, Proof, Step 01, Kit, Sprint.

## Artifact Card

- Represents a real object: book cover, dashboard preview, checklist, pricing card, command panel, template kit, or report slab.
- Must include labels and text, not just decoration.
- May be tilted or offset only if the content stays readable.

## Data Or Proof Block

- Use square marks, counters, short quotes, package rows, or status labels.
- Status colors need text labels.
- Avoid fake named logos or unsupported statistics.

## Input Or Form Row

- Thick border, flat fill, high-contrast placeholder/label.
- Focus state is obvious.
- Error state pairs red border/fill with explicit text.

## Decorative Shape

- May use yellow/violet/red squares or circles behind content.
- Must be pointer-events none and optional.
- Hide or simplify on mobile if it causes overflow.

## Shadow System

- Every shadow should use the same direction.
- Use smaller shadows inside dense sections.
- Do not mix soft shadow with hard shadow.
- Do not apply hard shadow to tiny text chips if it harms readability.
