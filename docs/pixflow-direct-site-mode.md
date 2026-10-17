# Direct site mode

Bricks, WordPress admin and sitemap floating panels default to Direct mode for WordPress administrators. The
**Enable guarded mode** switch in **Settings → Pixflow Abilities** restores the existing
preflight and controlled-apply workflow. The preference is saved per user and
WordPress site. Idle panels pick up saved changes immediately, including across
settings frames and tabs. A running session retains its original mode and adopts
the new preference after that run ends. Neither composer shows a guard checkbox.

Direct mode launches the selected local CLI in a conversation-owned working directory.
The agent calls authenticated WordPress tools itself. The daemon transports
agent events and handles cancellation; it does not approve proposed changes.
All bundled Pixflow MCP skill Markdown files remain discoverable and readable.
Their implementation knowledge remains useful, while instructions requiring
the guarded apply lifecycle do not apply to Direct sessions.

Research is available in Ask, Plan, and Design independently of guarded mode.
Direct prompts instruct the agent to consult public documentation when skills
or site inspection leave uncertainty, prefer official sources, and cite pages
actually retrieved. Research never makes an Ask/Plan site connection writable.
Codex launches explicitly set `web_search="live"` for both new and resumed
sessions and for the standalone Bricks handoff/prototype runners. Other CLIs
retain their native research tools; availability also depends on their provider
and installation. Guarded panels retain their existing public-research workflow.

External Bricks Build/Clone entry points use the same Direct dispatcher as the
composer. Uploaded references retain their WordPress project IDs; the daemon
downloads their bytes through the run's site session into its local attachments
directory and supplies image paths to the CLI. Follow-up turns can reuse those
references. A missing attachment stops preparation with an explicit error.
Explicit Stop cancels the owned daemon run through its cancellation endpoint.
Losing a browser stream leaves the original run observable through authenticated
reattachment; it does not cancel or relaunch the agent.

Available tools include site file listing, reading, writing, directory creation
and deletion; database table/schema inspection and row selection, insertion,
update and deletion; skill discovery and reads; and native WordPress ability
discovery/execution. Database row tools take exact table names, column/value
objects, and equality filters. `wordpress.run` executes a complete PHP workflow
with WordPress loaded, `$wpdb` and a supplied `$args` object. It supports any
number of native WordPress/plugin operations, including database schema changes
and SQL through `$wpdb`, without a current-page binding or action allowlist.
Prefer native WordPress APIs for hooks, serialized metadata and cache updates.
Use `return` for the result; echoed output is captured separately. The convenience
file tools require WordPress's file-editing permission and reject symlink/path
escapes from the installation root. The convenience database tools are confined
to site tables. These restrictions do not sandbox native PHP execution.

Native PHP execution has the permissions of the site's PHP process, like an
installed plugin. Direct mode is trusted administrator code access, not an OS
security sandbox. The connection identifies the current WordPress site; it does
not expose an SSH login or a separate host-shell tool.

Ask and Plan sessions have read-only site connections. Design sessions can edit.
BYOK users can continue using Guarded mode; Direct currently requires a local
CLI with a supported structured stream, including Codex, Claude and OpenCode.

Direct file/database writes affect the live site. The Bricks floating panel
also connects the actual open builder to Direct tools. The agent can edit its
unsaved native element tree and CSS without HTML conversion, preflight, revision
receipts, or approval cards. It chooses when to inspect, edit, refresh, or save.
Direct mode does not create the guarded workflow's rollback receipts.

## Live Bricks tools

The Bricks composer’s Ask/Plan/Design menu includes **Design styling**:
**Use site styles** (default) reuses suitable Bricks global classes, saved CSS
variables and colour palette entries; **Custom styling** allows new design
values. Both choices instruct the agent to put layout, typography, spacing,
colours and responsive styling on native global classes. Content, images, links
and individual configuration remain on the elements. This is prompt guidance,
not an approval gate or a mutation restriction. It does not migrate existing
element styles automatically.

The preference is saved as `bricksUseSiteStyles` through the existing app-config
API, mirrored to WordPress and available through `od config set
bricksUseSiteStyles true --json` (or `false` for custom styling). The panel sends
its selected value with each Direct request; callers that omit it use the
daemon’s saved preference. Guarded panel prompts receive the same convention.
Changes apply to the next run, and selection is disabled while the panel runs.

`bricks.read` returns the live elements, selection, global classes, page settings,
history position, unsaved state, and rendered text/geometry/CSS evidence (up to
300 elements). The reported revision is informational, not a required input.
`bricks.mutate` accepts a batch of `patch`, `insert`, `move`, and `remove`
operations. It preserves native IDs and existing values, updates ordered children,
and adds one native Undo entry. CSS `%root%` placeholders are expanded as they
are in Bricks' editor. Mutations remain unsaved until Save is invoked.

Live edits display a Pixflow agent cursor, target outline, subtle shimmer, and
an action label in the builder. The cursor moves between actual changed targets;
the outline stays attached to their current bounds as layout or preview scale
changes. Unrendered/offscreen targets show a status label without a cursor.
Structured edits select the affected element through Bricks so its native
controls open. Native scripts retain their own selection and expose observed
element changes while executing. Feedback is non-interactive, respects reduced
motion, fades after completion, and is never included in saved page content.
CLI calls to the same live tools produce the same feedback in the connected tab.

`bricks.select`, `bricks.refresh`, `bricks.undo`, `bricks.redo`, and `bricks.save`
use the native builder controls/APIs. Refresh renders current reactive content;
it does not reload saved database content over unsaved work. Save waits for the
native builder to acknowledge its saved state.

`bricks.run` executes an asynchronous JavaScript body in the actual Bricks page.
It receives `builder.state`, `builder.api`, `builder.controller`, `builder.read()`,
`builder.refresh()`, and the supplied `args`. It also has ordinary `window` and
`document` access. Return JSON-serializable values. Like `wordpress.run`, this is
trusted administrator code access, not a sandbox. It does not automatically add
Undo history or save; the agent can use native APIs for the workflow it chooses.

For live image generation, `bricks.run` also exposes
`builder.mediaStatus({ id: '<native image element id>', phase: 'generating' })`.
Create the image element with its intended dimensions first, then start this
host-only placeholder before invoking image generation. It shows a soft moving
gradient and elapsed time, without fabricated completion percentages. Import
the generated file with `media.import`, assign the returned attachment through
the native element settings, and call the helper with `phase: 'ready'`. The
overlay fades after the browser decodes the actual image. `error` reports a
failed generation; `clear` dismisses the status. Missing/deleted targets clean
up their overlay, abandoned statuses expire after ten minutes, and reduced
motion disables the animations. This presentation helper adds no history entry
or saved page markup and is available to both panel and CLI agents through the
same `bricks.run` tool.

The tab registers while its Direct panel is mounted. WordPress relays commands
through `/wp-admin/direct/canvas` and `/wp-admin/direct/tools`, using the same
site/user authentication as Direct mode. Inside the panel, `site-tool.mjs`
automatically supplies its `canvasId`. External CLI agents discover tabs with
`bricks.canvases` and pass an explicit `--canvas-id`. No automatic choice is made
between different open tabs. Ask/Plan connections remain read-only.

One command at a time is delivered to each tab. A lost result is retried without
replaying the edit; expiry/disconnection reports an uncertain outcome rather
than claiming success. The agent can inspect live state and decide what to do.

## CLI

The existing site/user pairing credentials also expose these endpoints:

```sh
od wp-admin access-mode --set direct --json
od wp-admin access-mode --set guarded --json
od wp-admin site-tool --tool help --json
od wp-admin site-tool --tool files.read --arguments-json '{"path":"wp-content/example.css"}' --json
od wp-admin site-tool --tool database.tables --json
od wp-admin site-tool --tool database.update --arguments-file change.json --json
od wp-admin site-tool --tool wordpress.run --arguments-file workflow.json --json
od wp-admin site-tool --tool bricks.canvases --mode ask --json
od wp-admin site-tool --tool bricks.read --canvas-id <id> --mode ask --json
od wp-admin site-tool --tool bricks.mutate --canvas-id <id> --arguments-file edits.json --json
od wp-admin site-tool --tool bricks.run --canvas-id <id> --arguments-file workflow.json --json
od wp-admin site-tool --tool bricks.undo --canvas-id <id> --json
od wp-admin site-tool --tool bricks.save --canvas-id <id> --json
```

Supply `--site-url` and `--token`, or the existing `PIXFLOW_WP_ADMIN_SITE` and
`PIXFLOW_WP_ADMIN_TOKEN` environment variables. CLI operations and panels use the
same WordPress `/wp-admin/direct/*` endpoints. Agent sessions receive a distinct
one-hour token rather than a durable pairing token. It is site/user-bound,
revoked when the browser run ends, and removed from local storage after the
child exits. It cannot authenticate to the settings/pairing endpoints.

## Save, capture and continuation


`bricks.save` receives the current server classes, variables, category arrays and
palettes when its canvas command is delivered. It merges records changed in the
tab against the tab's baseline, retaining remote additions and unchanged-local
records that were updated or removed remotely. A record changed locally wins for
that ID. The baseline advances after native Save acknowledges completion.

Direct transport merging does not lock simultaneous native saves. Clicking native Save or invoking a native save API directly bypasses this transport merge.

Public capture evidence now includes computed foreground colour, font weight and
ancestor background layers. The layers retain images and opacity explicitly;
there is no inferred solid background or quality score. Text samples correspond
to the captured viewport, including scrolled captures. Agents choose what to
inspect and how to address the evidence.

Capture also returns `typography.documentSamples`: up to 200 rendered text nodes,
including native Basic Text divs outside the screenshot. Positions and `inViewport`
distinguish document observations from visible image content; `documentTextCount`
and `documentTruncated` expose the bound. This uses the same capture endpoint and
result through the agent helper and CLI, without a threshold or quality verdict.

Supported solid sRGB foreground/background stacks include a nominal contrast
ratio. Images, unsupported colours and compositing effects remain explicitly
unresolved. The agent helper and CLI print exact style groups with counts and
examples, plus the rendered heading outline, to reduce repeated node output.
The saved evidence JSON and raw capture API retain the complete node observations.
These measurements do not select an action, block the run or change the page.

Capture actions also support `fill`/`select` with a string `value`, `check` with a
boolean `checked`, and `waitFor` with a selector state. These execute the selected
browser interactions, including real configured form actions on submission.
Typography examples include raw element/parent bounds, making local column fit
observable even when the document itself does not overflow the viewport.

Capture also exposes `images`: up to 100 rendered image observations with
intrinsic dimensions, actual bounds and computed `objectFit`/`objectPosition`.
The count and truncation flag describe coverage. The helper and CLI retain these
observations so a root-image selector mismatch is visible without inferring a
quality verdict or automatically changing the intended crop.


Direct conversation/task/attempt identities and sequenced checkpoints persist in the Bridge. Reconnect attaches to the existing attempt without replaying edits. A restarted Bridge marks active work interrupted; an uncertain native command requires inspection before further work. Explicit Stop cancels only the owned task.

Compatible native sessions retain context across follow-ups. Agent/model/mode/instruction/history changes renew compatibility, and WordPress authorization is refreshed each turn. Managed Codex uses the normal native home. Continuation tables are additive; back up runtime data before downgrade. Browser recovery does not preserve native Undo history across document reloads. Simultaneous loss of unsaved editor state and browser storage cannot be recovered from a transport receipt alone.

Question forms are optional agent output. Panels retain legitimate direction questions across recovery and distinguish answered forms from superseded instructions. No mandatory discovery or approval stage is imposed.

Premium WordPress execution modules are maintained in the Pro repository. Core owns the shared Direct browser/Bridge contracts and transport. Free builds must not import private implementation.
