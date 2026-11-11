# Gutenberg Media Library selection

Select existing media using `pixflow/wp-admin/list-media` and `pixflow/wp-admin/get-media`. Use attachment IDs from returned evidence; never guess an upload URL or attachment ID.

Use a block `mediaBindings` entry when a block needs media. Include the semantic role, attachment ID, requested registered image size, and alt policy. Pixflow resolves the binding into the live block attributes expected by the adapter.

Available alt policies are:

- `use-library-alt`
- `decorative`
- `empty`
- `custom` with an explicit `altText`

Check MIME type, dimensions, orientation, available sizes, caption, description, and accessibility before selection. Authoring consumes real attachment receipts; generation and import are separate capabilities, not permission to invent attachment IDs.

For design imagery, vision-capable agents search `wordpress.media.list` and visually inspect candidates using `wordpress.media.inspect`. Reuse suitable images first. If none suit the design, use the advertised `media.generate` capability when available; it selects the configured provider or isolated Codex fallback. Without vision, skip autonomous library selection but generation remains available. If generation is unavailable or fails, use `wordpress.media.placeholders` without repeated retries. For an authentic person or product without a real supplied image, use a placeholder rather than fabricate a likeness. Bundled placeholders are URL assets, not attachments: create a native `core/image` block with its returned URL, dimensions and honest placeholder alt text; omit `id` and `mediaBindings` rather than inventing an ID. Keep its planned aspect ratio and identify the needed replacement. User-selected images remain authoritative.
