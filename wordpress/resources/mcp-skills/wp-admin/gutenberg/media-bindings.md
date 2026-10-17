# Gutenberg Media Library bindings

Use `list-media` and `get-media`. Select by attachment ID from current evidence.
Never guess an ID, upload path, or URL.

A binding contains `role`, `attachmentId`, `sizeSlug`, and `altPolicy`.
Allowed alt policies are `use-library-alt`, `decorative`, `empty`, and
`custom`; `custom` requires `altText`. Pixflow maps the binding to the exact
registered block attributes.

Check MIME type, title, filename, alt text, caption, description, width,
height, orientation, aspect ratio, registered sizes, selected-size URL, and
review thumbnail. Use the smallest suitable registered rendition.

Media import/upload is a separate operation. Existing-library authoring must
not silently fetch or sideload external media.
