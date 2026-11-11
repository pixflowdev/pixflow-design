# Layout and call-to-action blocks

Use live schemas for group, row/stack variations, columns/column, separator,
spacer, buttons/button, and related layout blocks.

Respect parent, ancestor, and allowed-block constraints. Keep child order
explicit. Prefer semantic grouping over deep decorative nesting, and avoid
fixed heights or spacer-heavy layouts unless requested.

Variations are runtime evidence, not separate block names. Create the
registered base block with the variation’s evidenced attributes and allowed
children. Preserve responsive, alignment, spacing, class, and style attributes
that remain valid and were not requested for change.

Check computed typography and foreground/background colours in the rendered page. A group's text colour may be overridden by theme rules on its headings and paragraphs; use supported child block colour attributes where necessary. Do not dismiss a measured contrast failure merely because the saved parent markup declares the intended colour. Verify the correction in the actual preview. Read the site's root font size before choosing rem values, and keep changes local to the requested content.

Inspect the current palette for reserved-name collisions: a preset whose slug is `text` generates `.has-text-color { color: ... !important }`, the same class Gutenberg adds for custom text colours. In that case an inline white colour is not proof of white text. Use an appropriate existing native palette preset and verify the child's computed colour, or use a page-scoped native style; never change a site-wide palette to repair one card. Image/gradient overlays cannot be signed off using contrast against an ancestor's plain background. If you cannot visually verify text against the actual image and overlay, put the copy in a solid-colour panel beside or below the image and verify that panel instead.
