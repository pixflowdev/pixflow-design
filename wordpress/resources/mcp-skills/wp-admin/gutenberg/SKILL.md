# Pixflow Gutenberg authoring

This branch can be composed with other active Pixflow WP Admin branches in one
semantic decision and one dependency-ordered action batch. For example, when a
user requests a WPCodeBox 2 shortcode and a section in the current post that
uses it, select the required WPCodeBox 2 and Gutenberg leaves, create the
snippet first, then apply the complete resulting Gutenberg document. Do not
discard either part or require a second user prompt merely because the actions
belong to different capability families.

Use this Pixflow-owned root for ordinary posts, pages, and public custom post
types that use the WordPress Block Editor. Route first; load only the leaves
needed by the current request.

The installed WordPress registry and the actual target editor are the schema
authorities. Reference documentation is knowledge, never proof that a block is
available on this site. Read the exact current document before content-aware
work. Use the live editor state when it contains unsaved changes; retain that
work when reconciling server changes.

The typed replacement adapter represents content intent as:

- `preserve`: omit `post_content` from the write.
- `replace`: prepare one complete non-empty typed block tree.
- `clear`: deliberate deletion of all content; unsupported by this replacement
  endpoint. Direct native APIs can perform a requested clear.

The typed adapter accepts blocks as `{name, attributes, innerBlocks, mediaBindings?}`. Native WordPress block APIs can also serialize blocks for Direct writes. The target editor creates, mounts, settles,
serializes, parses, and validates the proposal; the server independently
verifies the result, binds a receipt, commits atomically, reads back, and rolls
back the complete prior state on mismatch.

Load focused leaves by intent:

- routing and content intent: `wordpress-gutenberg-route-intent`
- exact evidence: `wordpress-gutenberg-context-exact-read`
- live schemas: `wordpress-gutenberg-registry-block-schema`
- complete articles: `wordpress-gutenberg-author-create-article`
- local edits: `wordpress-gutenberg-author-contextual-edit`
- metadata-only changes: `wordpress-gutenberg-author-metadata-preservation`
- block families: `wordpress-gutenberg-blocks-*`
- existing media: `wordpress-gutenberg-media-bindings`
- preparation and repair: `wordpress-gutenberg-prepare-*`
- verified commit: `wordpress-gutenberg-apply-transaction`
- support claims: `wordpress-gutenberg-compatibility-*`
- cross-resource work: `wordpress-gutenberg-resources-boundary`
- Builder-specific block guidance is supplied by active Pixflow Pro integrations; discover available skills before using third-party blocks.

Questions and planning requests do not authorize unrequested edits. Editing sessions can use native editor and
WordPress APIs through Direct tools, including work beyond the typed catalogue.
