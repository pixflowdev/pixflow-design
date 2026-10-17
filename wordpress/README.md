# Pixflow Design WordPress Wrapper

This wrapper keeps the OD v0.10.0 workspace intact and adds only the Bricks Builder entry point for Pixflow Design.

The builder shell enqueues only in the Bricks main window. It adds a Pixflow Design toolbar icon and opens a full-screen overlay that mounts the OD React app directly into the builder page.

PHP classes under `wordpress/src/` are mapped with Composer PSR-4:

```json
"PixflowDesign\\WordPress\\": "wordpress/src/"
```

The plugin bootstrap loads `vendor/autoload.php` when present and falls back to the minimal direct include required for local development before Composer has been installed.

Build the local WordPress plugin zip with the embedded OD React bundle:

```bash
pnpm wordpress:build
```

Build only the WordPress plugin zip with whatever embedded app bundle already exists:

```bash
pnpm wordpress:zip
```

The zip builder includes the WordPress wrapper, Composer metadata, the OD app icon, `vendor/` when present, and the generated bundle under `wordpress/assets/app/`.

The zip is packaged as `pixflow-ai/pixflow-ai.php`. That preserves the installed plugin basename used by existing Pixflow users, so WordPress can install Pixflow Design as an update over the current Pixflow plugin instead of requiring users to remove it first.

Do not also install a `pixflow-design/pixflow-design.php` package on the same site. WordPress identifies plugins by basename, not display name, so multiple basenames with the same `Plugin Name` appear as duplicate Pixflow Design plugins and can leave stale activation records.

The embedded OD app rewrites daemon-style `/api/*` requests to the plugin REST namespace at `pixflow-design/v1/od/*`. API/BYOK mode uses WordPress-backed projects, conversations, file trees, and request-scoped media generation, so it does not require the optional Bridge. Local CLI execution, filesystem projects, long-running media task polling, artifacts, and frame capture remain Bridge capabilities.
# Bricks design-system library

Inside the WordPress embed, Design Systems uses the existing Pixflow visual editor for both manual drafts and AI proposals. Creating and saving a library record does not apply it to the site. Apply is a separate action.

On an available Pixflow Framework route, Apply uses the existing framework service, including its Theme Styles integration. Other routes receive namespaced Bricks variables, palettes and reusable classes; global Theme Styles are optional. Unrelated Theme Styles and their conditions are retained. Library records retain up to 20 previous revisions and reject stale revision updates.

The WordPress REST surface is `pixflow-design/v1/od/design-systems/bricks`, with `/<id>` for records and `/<id>/apply` for application. Existing administrator authentication applies. The CLI equivalent is `od design-systems bricks <list|show|save|apply> --help`; it uses these same endpoints and accepts a private authentication headers file. Never commit that file. CLI profiles should reference available Bricks fonts; the editor additionally installs needed Google fonts when local font installation is required.

Validation: focused library/editor/parser/hydration web tests, `wordpress/tests/bricks-design-system-library.test.php`, and daemon CLI tests. Local QA also exercised manual creation/editing, a Codex AI proposal, standalone application with and without Theme Styles, Framework application, and the previous editor's publication link. Final visual review after the last styling adjustment requires an authenticated local WordPress session. No public deployment is part of this change.

