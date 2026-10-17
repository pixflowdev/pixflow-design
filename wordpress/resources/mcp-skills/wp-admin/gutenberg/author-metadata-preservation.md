# Preserve Gutenberg content during metadata changes

When only title, excerpt, slug, status, terms, authoring metadata, or featured
image changes, content intent is `preserve`.

Do not select full-document replacement. Do not generate a placeholder block,
empty string, copy of remembered content, or synthetic “unchanged” tree.
Omit content from the mutation payload entirely and use the relevant typed
metadata capability.

If a request combines metadata and actual block edits, use one verified
Gutenberg `replace` transaction for supported fields so title and document
persist or roll back together.
