# Develop Pixflow Design Free

Use Node 24 and pnpm 10.33.2. Free does not require a licence or a Pro source checkout.

## Install and check

```powershell
pnpm install --frozen-lockfile
pnpm guard
pnpm typecheck
pnpm wordpress:web
```

Read [AGENTS.md](AGENTS.md) and the directory-specific instructions before making changes. The package names beginning with `@open-design/` are retained internal compatibility identifiers.

## Build a WordPress package

Keep development artifacts separate from published release files:

```powershell
$env:PIXFLOW_DESIGN_PACKAGE_OUTPUT_DIR = Join-Path (Get-Location) '.tmp/free-development'
pnpm wordpress:zip
```

This builds the website distribution. For the WordPress.org candidate, follow [directory build instructions](wordpress/directory/BUILD.md); that target omits the website updater and includes readable build sources. Never substitute the website ZIP for the directory ZIP.

Install test packages only into an isolated WordPress site or a backed-up development site. Preserve the `pixflow-ai` plugin directory and existing option, content and chat identifiers.

## Local agent development

`pnpm tools-dev` owns local daemon/web/desktop lifecycle. Run `pnpm tools-dev --help` for available commands and select an isolated namespace and ports for tests. API mode in WordPress does not require the Bridge. Local CLI mode requires a running compatible Bridge and a configured agent on the user's computer.

The separately maintained Pro repository documents its pinned core dependency. Set `PIXFLOW_DESIGN_PRO_ROOT` explicitly when developing full premium standalone/Bridge contributions; do not make a Free build discover a private checkout automatically.

## Tests

Use package-scoped test commands for the area changed. WordPress PHP checks are in `wordpress/tests`; browser tests are in `apps/web/tests`; daemon tests are in `apps/daemon/tests`; cross-boundary checks are in `e2e`.

Use temporary fixtures rather than customer content or real credentials. Keep logs, screenshots, database dumps, local secrets and personal data in ignored local directories. Publishing source never authorizes publishing these files.
