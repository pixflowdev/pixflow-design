# Gutenberg Media Library selection

Select existing media using `pixflow/wp-admin/list-media` and `pixflow/wp-admin/get-media`. Use attachment IDs from returned evidence; never guess an upload URL or attachment ID.

Use a block `mediaBindings` entry when a block needs media. Include the semantic role, attachment ID, requested registered image size, and alt policy. Pixflow resolves the binding into the live block attributes expected by the adapter.

Available alt policies are:

- `use-library-alt`
- `decorative`
- `empty`
- `custom` with an explicit `altText`

Check MIME type, dimensions, orientation, available sizes, caption, description, and accessibility before selection. The initial authoring boundary uses existing library media only; importing or uploading is a separate capability.
