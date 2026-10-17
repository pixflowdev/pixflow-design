# Etch design systems

The optional Pro integration uses one shared profile library and manual/AI builder for Bricks and Etch. Applying a profile uses the active builder's adapter. Merely creating, editing or mentioning a profile does not apply site-wide styles.

## Native storage and ordering

Etch's `StylesheetService` stores an ordered map in `etch_global_stylesheets`. Creation appends a stylesheet; updating an existing ID preserves its position. Frontend output runs on `wp_head` at priority 99. Etch's editor uses its own in-memory stylesheet store instead of that frontend output.

Pixflow owns one stable `Pixflow Design` stylesheet. It calls native per-sheet create/update APIs and never replaces the entire map. Other sheets, including custom media and local font definitions, retain their contents and relative order. First application appends the owned sheet; later applications update that same ID. Normal CSS cascade and specificity still apply.

Native editor synchronization uses `window.etch.stylesheets.createAsync` and `updateAsync`. The initial blank native ID is passed to the server, preventing a duplicate sheet. If server application fails, only an untouched blank preparation is removed. If server saving succeeds but native refresh fails, the user is told that the save succeeded and to reload the editor.

## Scope and workflow

- Settings and Workspace expose the same library, manual editor and AI generation flow.
- Profiles provide colour schemes, typography, spacing, borders, radii and button presets.
- Etch output uses `--pds-*` variables and `.pds-heading`, `.pds-text`, `.pds-button`, `.pds-input`, `.pds-surface` and `.pds-scheme-2` through `.pds-scheme-6`.
- Default application supplies variables and reusable classes. Global body colours and heading/body typography require the explicit site-wide option.
- Preview is compiled by the same server compiler used for application. It does not embed the live editor or change the site.
- Selected Google fonts install locally through the Etch font integration when applied. Bricks-only custom font identifiers must be replaced with an Etch font before applying.
- `@` adds a saved design-system reference. The design-systems skill explains creation, inspection, application and rollback; attaching a reference alone does not mutate the site.
- Every apply reviews a profile revision and site fingerprint. Changed state must be reviewed again. Manual changes require explicit replacement consent and are retained in rollback history.
- Restore affects the owned stylesheet only. Up to 20 applications are retained. Restoring the first application leaves an empty sheet with the stable native ID.
- Other already-open Etch editors must reload to see changes applied elsewhere. A stale current editor is rejected rather than silently overwriting its content.

Implementation and paired builder tests are maintained in the Pro repository. Shared browser contracts remain in core.
