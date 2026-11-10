# macOS native registration receipt — 28 October 2026

Source: `af03030dd5c714f61a2b6d03dc9a43224a813603` (`codex/chrome-store-preparation`).

Result: registration checks PASS. Full Bridge builds and installer acceptance are ON HOLD at the user's request until Pro changes are isolated. This is not release or Chrome Store approval.

## Environment

- macOS 26.5.1 (25F80), arm64; Node 24.19.0 arm64; pnpm 10.33.2.
- Installed Chrome: 156.0.8078.48 (not exercised for extension acceptance).
- LocalWP admin accessible; WordPress 7.1.3 and active Free/Pro 2.1.0 observed. No site content, plugin installation or settings changed.
- Existing /Applications Bridge reports 2.0.2; it was not replaced or used as candidate evidence.
- Source checked out separately; no Pro source used in builds. No installer produced or uploaded; no release pointers or Store submission changed.

## Checks

| Check | Result |
| --- | --- |
| Frozen dependency install | PASS, 23.2 seconds |
| Repository guard and full typecheck | PASS |
| Native tests | 44 PASS, 1 Windows-only registry test SKIPPED |
| Native module typecheck | PASS |
| Packaged native registration tests | 4 PASS |
| Full packaged test suite | 166 PASS across 17 files |
| Packaged runtime module build | PASS; this is not a full Bridge installer build |
| Native transport packaging tests | 3 PASS |
| Store browser/native payload compilation | PASS |
| Isolated macOS registration with generated payload | PASS, 15 assertions/groups; 14 ms |

Initial packaged tests/build failed because desktop dist declarations had not yet been built. Full typecheck builds that dependency; the subsequent tests and build passed. The handoff command `pnpm --filter @open-design/packaged test -- native-registration` ran all packaged tests rather than filtering. Use the explicit focused command below.

## Registration evidence

The isolated check called the production portable-registration API with an explicit temporary home directory and the generated permanent-identity native payload. It used real macOS filesystem operations and the actual Node executable; it did not override the platform or write the user's Chrome registration.

Verified exact `dev.pixflow.bridge` identity, sole allowed origin `chrome-extension://hbnbiboohlelmngadeolikeejamjlbkh/`, stdio, launcher mode 0700, manifest mode 0600, persistent copies outside source, repeat registration, damaged-copy repair, abandoned-lock recovery, foreign live-owner refusal, transient-path rejection, owned/idempotent unregister, reinstall, retained runtime payload and unchanged synthetic chat/settings/grants hashes. Final synthetic manifest was removed. Source host/config hashes remained unchanged. See the companion JSON for hashes.

Synthetic grants preservation is a file sentinel check, not proof of actual Chrome permission preservation. Source immutability is not signed-bundle validation.

## Reproduction commands

Run sequentially after frozen install so desktop build outputs exist before packaged checks:

```sh
pnpm guard
pnpm typecheck
pnpm exec tsx --test tools/pixflow-design-bridge/tests/native-*.test.ts
pnpm exec tsc -p tools/pixflow-design-bridge/native-messaging/tsconfig.json --noEmit
pnpm --dir apps/packaged exec vitest run -c vitest.config.ts tests/native-registration.test.ts
pnpm --filter @open-design/packaged test
pnpm --filter @open-design/packaged build
pnpm --dir tools/pack exec vitest run tests/native-transport.test.ts
pnpm exec tsx tools/pixflow-design-bridge/native-messaging/store-build.ts hbnbiboohlelmngadeolikeejamjlbkh
```

## Platform acceptance matrix

All full installed-candidate checks remain NOT RUN / ON HOLD: first installed launch without system Node, installed manifest/path inspection, Chrome/Bridge restart and reboot, real first-time site approval and automatic popup, CLI streaming/steering/queue/navigation/reload persistence, active permission revocation/reapproval, real WordPress authorization rejection, extension-free direct fallback, installer upgrade/repair and real data preservation, owned installed uninstall/reinstall, signing/notarization and relocation. No x64 or Linux actual-machine acceptance was performed. No Pro Workspace or final Free/Pro upgrade test was performed.

## Local generated artifacts

These are payload archives only, not Bridge installers or approved Store submissions. They remain local and unpublished.

- `pixflow-extension-1.0.1-browser-af03030dd.zip`: 40846 bytes; SHA256 `ab15fab356c37e177cc4b2038c65ed6290e5d8618508defb89c95f3eed183b9d`.
- `pixflow-extension-1.0.1-native-af03030dd.zip`: 6686 bytes; SHA256 `3be2bf520b5c7e5b539d801f0a1c6c92ffff29641495c521af366ace4f3ae979`.
