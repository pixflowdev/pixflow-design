# Extension-ready Mac 2.1.1 build receipt

29 October 2026. Build-only continuation of [the handoff](../../2026-10-29-mac211-intel-handoff.md). No installed-browser, reboot, steering or data-preservation acceptance was repeated. No product source was changed.

## Exact inputs

- Core: `037a867b5f207ffcd754c3582c0d501f2c6c8691` (Core PR35, standalone launcher version correction).
- Private Pro: `697a8117000a9c06ea102304cd22df665f8e9610`, pinned to that Core, module API 14.
- Instructions: `codex/bridge211-runtime-version` at `8dcc6944c`; dedicated receipt branch `codex/mac211-intel-acceptance`.
- Host: macOS 26.5.1, arm64. Node 24.19.0 and pnpm 10.33.2. arm64 lane ran natively; Intel lane used an already-installed x64 Node under existing Rosetta. No Rosetta install or normal-toolchain change.
- Four separate detached worktrees, frozen dependency installs, explicit Core/Pro paths and Pro `setup:core`. Both source pairs were clean before and after packaging. Installation changed only executable bits on four tracked launchers; those bits were restored before pin validation. No clean-pin bypass was used.

## Artifacts intended for promotion

Both are **production-format stable 2.1.1**, not RC. Both main installers include extension support, and users can still use direct connections without installing the extension. The older ordinary/optional split is superseded for intended promotion; old draft assets are preserved, not offered here as additional customer choices.

| Architecture | New draft filename | Bytes | SHA256 |
| --- | --- | ---: | --- |
| arm64 | `pixflow-design-bridge-2.1.1-mac-arm64-037a867b-extension-ready.dmg` | 209966857 | `6c38bca034043269051628c7503dc27881b06dd6ad19b477141c15e22348417f` |
| x64 | `pixflow-design-bridge-2.1.1-mac-x64-037a867b-extension-ready.dmg` | 221084602 | `d0dd0d04dc59e318063c70dacf900231ace71e3a365eaf99bacf31d8257a7dcf` |

## Artifact checks

- Fresh tools-pack builds with `--portable`, architecture-specific stable namespaces, Pixflow Design Bridge identity and `--app-version 2.1.1`. Icons generated with the installer recipe's functions; actual JSON-report `dmgPath` imported with its `--arm64` / `--x64` input. `--x64` was not treated as a cross-compile switch.
- Both app Info.plist versions and the bundled standalone launcher report 2.1.1; identifier `dev.pixflow.bridge`, name `Pixflow Design Bridge`.
- 18 Mach-O binaries per architecture inspected with `file` / `lipo`, including Electron framework/helpers (also used as the Node host), bundled CLI/dictation executables, framework libraries and both packaged SQLite `.node` locations. Each arm64 binary contains arm64; each Intel binary contains x86_64.
- Only compiled `host.mjs`, `install.mjs`, `config.json` in `native-transport`, matching generated payload bytes. Permanent extension identity `hbnbiboohlelmngadeolikeejamjlbkh`; no configured site list, browser ZIP, public-key reviewer build or reviewer credentials bundled in that payload. Store extension 1.0.2 ZIP was not uploaded or changed.
- Portable configs contain no build-machine runtime paths. `hdiutil verify` and `codesign --verify --deep --strict` pass.
- Each final DMG was mounted read-only; identity, launcher version, configuration, compiled native-payload hashes, all 18 binary architectures and strict signature verification also passed on the mounted contents.
- **Ad-hoc signatures only. No Apple Developer ID signing or notarization.**

## Draft upload and verification

Existing release ID **427088978**, tag **bridge-v2.1.1**, repository `pixflowdev/pixflow-design`. Source-qualified filenames avoid the existing arm64 name and keep both intended installers unambiguous. No asset deletion/replacement, tag/target change, new release or publication.

[Upload receipt](uploaded-assets.json) records asset IDs, uploaded size, server SHA256 and independent full-download hashes. [Verified draft metadata](verified-draft.json) records `draft: true` and preserves the initial asset IDs/names/digests. Uploaded files: the two DMGs, `SHA256SUMS-mac-extension-ready-2.1.1.txt`, and `mac-extension-ready-2.1.1-build.json`.

## Acceptance boundaries and coordinator actions

The maintainer confirmed full Mac acceptance complete and requested builds only. [Previous Apple Silicon acceptance](https://github.com/pixflowdev/pixflow-design/blob/codex/mac211-acceptance-receipt/docs/testing/2026-10-28-mac211-production-handoff.md) remains evidence for its recorded source/runtime, not newly observed acceptance of this pair. Intel here means x64 artifacts built under Rosetta; no physical Intel installation/browser/provider acceptance is claimed.

Use these extension-ready artifacts as the intended Mac pair. Reconcile canonical filenames during promotion; do not publish the older ordinary/optional variants as separate customer choices. Final combined download/updater manifest, Windows/Linux boundaries, Apple signing policy and live promotion remain coordinator work. Installed apps, site fixtures and customer data were not touched by this build-only run.

Evidence: [build receipt](mac-extension-ready-2.1.1-build.json), [checksums](SHA256SUMS-mac-extension-ready-2.1.1.txt), [arm64 audit](arm64-artifact.json), [x64 audit](x64-artifact.json), [mounted contents](mounted-dmg-verification.json).
