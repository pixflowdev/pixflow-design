# Text and structured-content blocks

Use live schemas for paragraph, heading, list/list-item, quote, pullquote,
table, code, preformatted, verse, details, footnotes, and related text blocks.

Use `core/list` with nested `core/list-item` blocks when required by the
installed version. `core/table` uses `head`, `body`, and `foot` row arrays;
each row contains `cells`. Do not invent a `rows` convenience attribute.

Use `core/shortcode` with `attributes.text` containing the complete bracketed
shortcode whenever the shortcode must execute in post content. A paragraph
containing shortcode text is not an equivalent block.

Keep heading order semantic, lists genuinely list-shaped, quotes distinct from
ordinary emphasis, and code literal. Preserve inline formatting in the
registered rich-text attribute rather than flattening it to plain text.

Validate every emitted attribute against the target registration.
