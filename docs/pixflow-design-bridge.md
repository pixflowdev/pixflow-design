# Pixflow Design Bridge

Pixflow Design Bridge is the local-machine wrapper for the Pixflow Design daemon.

It supplies installed local agent discovery and CLI execution while WordPress owns the embedded UI and site APIs. Shared browser/Bridge contracts live here; premium site modules are maintained separately.

## Boundary

Included:

- Pixflow Design daemon/runtime.
- Local loopback start/stop/status supervision.
- Local bridge config under the user's app data folder.
- Installer/package scripts for the Pixflow Design-based bridge.

Excluded:

- Legacy Pixflow AI Stage A or Stage B bridge runtime.
- Legacy Pixflow AI `/v1/runs` route contract.
- Legacy Svelte sidebar assumptions.
- Pixflow-specific generation mechanics.

## Runtime Shape

```text
WordPress builder page
  -> Pixflow Design React overlay
    -> local Pixflow Design Bridge URL
      -> Pixflow Design daemon routes
```

The React app still calls Pixflow Design paths such as:

- `/api/*`
- `/artifacts/*`
- `/frames/*`

The WordPress runtime adapter routes explicit local capabilities to the configured Bridge and site-owned calls to WordPress.
The bridge starts Pixflow Design on `http://127.0.0.1:7456` by default.

## Commands

Build the full Bridge package with an explicitly configured compatible Pro checkout (see [packaging](pixflow-design-local-packaging.md)):

```bash
pnpm bridge:zip
```

Install from the extracted package:

```bash
node runtime/tools/pixflow-design-bridge/install.mjs --start --allowed-origin https://example.com
```

Run the bridge directly from this checkout:

```bash
node tools/pixflow-design-bridge/pixflow-design-bridge.mjs start --allowed-origin https://example.com
node tools/pixflow-design-bridge/pixflow-design-bridge.mjs status --json
node tools/pixflow-design-bridge/pixflow-design-bridge.mjs stop
```

## WordPress Config

By default the plugin points Pixflow Design requests at:

```text
http://127.0.0.1:7456
```

Override it with:

```php
define('PIXFLOW_DESIGN_BRIDGE_URL', 'http://127.0.0.1:7456');
```

or the `pixflow_design_bridge_url` filter.
