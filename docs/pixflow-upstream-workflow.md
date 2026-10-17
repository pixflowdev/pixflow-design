# Upstream maintenance

Pixflow Design derives shared runtime code from Open Design. Keep upstream fetch-only and review selected updates on isolated branches. Repository history migration is a separate maintainer decision; do not merge unrelated history or rewrite published history as routine cleanup.

Preserve Pixflow's WordPress shell, explicit Free/Pro boundary, shared Bridge toolchain, authenticated site pairing and existing `pixflow-ai` installed basename. Do not restore retired upstream marketing/telemetry deployments or removed runtime registrations.

```sh
git remote add upstream https://github.com/nexu-io/open-design.git
git remote set-url --push upstream DISABLED
git fetch upstream --tags --prune
pnpm pixflow:upstream:status
```

Use a dedicated `codex/` update branch. Inspect the upstream diff and adapt it to current module ownership rather than importing upstream product workflows wholesale. Validate with `pnpm guard`, `pnpm typecheck` and the relevant scoped tests/builds. Free validation must work without a private Pro checkout; full paired Bridge validation uses the explicit compatible source interface.

Run development instances through `pnpm tools-dev` and isolated namespaces. Installer validation must use an explicit test origin and must preserve existing installations and user data. Do not overwrite immutable published releases or activate public update pointers as part of an upstream comparison.
