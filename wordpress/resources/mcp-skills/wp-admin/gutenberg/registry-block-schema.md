# Live block registry and schema

Use `list-block-types` and `get-block-type` for the exact target post. Treat
the installed server registry as evidence for attributes, defaults, supports,
parent, ancestor, allowed-block, context, dynamic-rendering, and source data.

Use target-editor discovery for JavaScript-only registrations, variations,
styles, transforms, deprecations, and editor-context changes. A block must be
registered in the actual target editor before preparation.

Validate attributes against the current schema. Preserve attributes whose
meaning is unknown but whose current value is valid. Respect parent,
ancestor, and allowed-block constraints in both directions. Do not invent
attribute names from another block or plugin version.

The live registry decides availability. Official WordPress documentation and
matching release source explain behaviour but never override the installed
runtime.
