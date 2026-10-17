# WordPress content

Use `wordpress.posts.list` and `wordpress.posts.get` to inspect standard posts and
pages. `wordpress.posts.create` creates drafts by default. For
`wordpress.posts.update`, read the current post first and pass its `modifiedGmt`
as `expectedModifiedGmt` with the requested `fields`. Use returned IDs, never
guess them. Preserve unrelated content, publication status and relationships.
`wordpress.posts.trash` and `wordpress.posts.restore` use native WordPress trash
behaviour and permissions; do not permanently delete posts as a substitute.

Build and edit block documents through the connected live Gutenberg editor:
read the current document, inspect its schema, apply native edit commands and
save. Do not replace that live workflow with raw metadata, HTML or database
writes. Preserve existing shared references and unrelated blocks.

Use `wordpress.terms.list`, `wordpress.terms.get`, `wordpress.terms.create`,
`wordpress.terms.update` and `wordpress.terms.delete` for supported taxonomies.
Read current values and use the returned fingerprint for changes. Respect the
taxonomy's native capability checks and relationship behaviour.

Use `wordpress.media.list` and `wordpress.media.get` to select existing
attachments. `wordpress.media.update` changes title, caption, description and
alt text with the returned fingerprint. `wordpress.media.delete` permanently
deletes a native attachment; use it only when the user requests that deletion.
It is not an installation-file tool. Use exact attachment IDs for featured media.

Safe classic content is supported. Free does not insert executable PHP, scripts,
event handlers or code through snippet custom post types, arbitrary metadata or
direct database writes. Specialist plugin content models and advanced tools are
provided by the relevant authorised Pro modules. A `pro_required` result is a
normal availability boundary: explain the upgrade option and include its Learn
more link, then continue permitted work.
