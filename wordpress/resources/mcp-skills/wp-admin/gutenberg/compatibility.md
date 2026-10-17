# Gutenberg compatibility and support levels

Use the exact target post because block availability can depend on post type, editor context, active plugins, and plugin versions.

The server registry is useful for attributes, supports, parent/ancestor rules, and server-rendered definitions. It is not complete evidence: some blocks register only in JavaScript or change attributes after mounting.

For editor validity, create and mount blocks in the target editor context, let lifecycle effects settle, and check serialization with the WordPress block API. Also verify plugin-specific identifiers, generated styles, caches and cross-resource references when the change depends on them. Use the plugin's native APIs and relevant references for that verification.

Article markup alone does not update synced patterns, templates, template parts, navigation entities, forms, commerce records, or global styles. Preserve those references. Specialist authoring requires the available Pro integration; do not replace missing tools with generic writes. WordPress native editing is unaffected.
