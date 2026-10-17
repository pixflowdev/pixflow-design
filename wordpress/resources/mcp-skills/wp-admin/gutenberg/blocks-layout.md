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
