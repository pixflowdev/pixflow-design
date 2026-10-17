# Reproducing validation

Use Node 24 and the pnpm version pinned in `package.json`. Install workspace dependencies before running validation:

```sh
pnpm install
pnpm guard
pnpm typecheck
pnpm --filter @open-design/web test
pnpm --filter @open-design/daemon test
```

Tests live with their owning app, package or tool. Cross-boundary and browser tests live in `e2e/`; read [its instructions](../../e2e/AGENTS.md) for scoped commands and isolation rules. WordPress regression harnesses live in `wordpress/tests/` and build-contract checks in `scripts/`. Read each integration harness before executing it: opt-in external-service checks require separate operator-supplied fixtures.

The [mock CLI guide](../../mocks/README.md) describes replay-based parser validation without provider usage. Keep live provider acceptance separate from deterministic test results. Record evidence under ignored `.tmp/` directories with the tested source/artifact identity; do not commit credentials, private site content or run transcripts.

Free builds must validate without a Pro checkout. Tests for private Pro implementation run in the Pro repository. Shared Bridge packaging has its own explicit pairing requirements; see the [packaging guide](../pixflow-design-local-packaging.md).
