# Local packaging and compatibility

WordPress serves the embedded React bundle locally. Normal site UI does not require a hosted Pixflow web application. Core-owned build logic lives in `scripts/wordpress-build-contract.ts` and the WordPress build scripts; optional Pro recipes and premium source live in the Pro repository.

```sh
pnpm wordpress:build
```

The build bundles `apps/web/src/pixflow/wordpress-entry.tsx` and packages the PHP plugin with its required assets and bundled Free guidance. Use isolated output roots when validating migration candidates. Existing published package versions are immutable.

The compatibility ZIP basename remains `pixflow-ai/pixflow-ai.php`. The source development entry is `pixflow-design.php`; packaging maps it to that installed basename. Renaming it would create a second WordPress plugin rather than update the existing installation. Saved identifiers, chats, settings and private files must survive updates.

Free must build and typecheck without private source. Full Bridge and Pro builds require an explicitly configured compatible `PIXFLOW_DESIGN_PRO_ROOT`; never discover a neighboring private checkout implicitly. The Pro manifest records the required core revision and module API. Source availability is not an entitlement grant.

Packaging selects the four bundled Free skills and the essential routers in `guidance/scenarios/od-default` and `guidance/examples/web-clone`. Router package paths remain `plugins/_official/scenarios/od-default` and `plugins/_official/examples/web-clone`; saved identifiers do not change. Desktop packages no longer copy or hash the retired plugin registry, preview manifest, craft, design-template or design-system catalogues. An explicitly paired Pro checkout contributes only the Bridge `skills/web-clone` workflow. Personal resource directories and existing installed packs are not source-cleanup targets.

The WordPress runtime adapter maps shared daemon-style API calls to the owning WordPress service or explicit local Bridge capability. The site REST prefix is `/wp-json/pixflow-design/v1/od/`. See [runtime ownership](pixflow-bridge-optional-runtime-checklist.md) and [reproducing validation](testing/README.md).
