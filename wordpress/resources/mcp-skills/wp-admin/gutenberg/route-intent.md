# Gutenberg routing and content intent

Classify the target and mutation before choosing a write.

Use `preserve` for title, excerpt, slug, status, taxonomy, or featured-image
changes that do not alter blocks. Route those through the matching metadata
capability and omit content entirely.

Use `replace` only when the user explicitly asks to author or alter document
prose, structure, blocks, or inline media. Read the complete exact document,
produce the complete resulting tree, and preserve every unrequested block and
attribute.

Use `clear` only for an unmistakable request to delete all post content. The
typed Gutenberg replacement endpoint does not support clear; a Direct native
write can perform the requested deletion. Never reinterpret failed or empty serialization
as clear.

Distinguish the active post from an explicitly named different post. An
implicit follow-up remains bound to the active object; a different explicit
target requires a fresh authorised read and its own context binding.
