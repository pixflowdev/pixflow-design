# Mac production DMG build authorization — v2.1.2

29 October 2026. The owner confirmed in the coordinator chat that the outstanding manual checks passed and authorized production DMG builds. Store submission and public deployment remain on hold.

## Acceptance update

Record automatic Claude post-sign-in card refresh and live permission removal/recovery as owner-reported manual passes, superseding the inconclusive Mac harness results. Do not relabel these as automated evidence. This does not claim physical Intel testing, every provider/panel permutation, or independently installed standalone CLI coverage. Claude steering remains unsupported; steering acceptance applies to Codex.

Coordinator reviewed the multi-site popup fix and reran native-status/native-reconnect tests: 9 passed, 0 failed. Native extension TypeScript check passed. The fix enrolls the selected approved site on the same native connection used for health.

## Approved source baseline and preparation

- Core: `7c90aca799b4bea03db320e3e65247cc065715ff` (includes popup fix `e4397c40a00088024fb42d9d7fa95bf8debebb7b`).
- Pro implementation baseline: `17b358fb11dcfdbab6e4f8e095c1a981b3dc497a`, module API 14.
- Extension permanent ID: `hbnbiboohlelmngadeolikeejamjlbkh`.

Prepare a focused production build branch from this baseline. Before packaging, commit the coordinated v2.1.2 release identity/version changes and update Pro's required Core pin to the exact resulting Core commit. Record both full SHAs and run the paired contract/version checks. Do not bypass the pin check, package uncommitted changes, use moving branch tips, or bring in Team changes. Stop and report any implementation failure rather than silently extending scope.

Rebuild the corrected extension browser ZIP and matching native helper from the final source. The earlier 1.0.3 ZIP with SHA256 `4750cbe937d5365c771c8ade9f5ebed7456d5841dee0101d977e8e3be2144839` predates the popup fix and must not be reused as the corrected artifact. Retain old evidence; do not overwrite archived test assets. Verify the native `/api/test/connection` endpoint allowance is included.

## Build and upload

Build exactly one extension-ready production v2.1.2 Bridge DMG for Apple Silicon and one for Intel, both retaining direct Bridge connections. Use stable product identity, portable paths and genuine architecture-correct Electron/native bindings. The wrapper's --x64 option imports a DMG; it does not cross-compile one. Use the established x64 build environment and report Rosetta versus physical Intel evidence accurately.

Reuse the completed functional acceptance evidence. Run artifact-specific checks on the actual outputs: version/identity, architecture, hdiutil verification, native host registration for the permanent extension ID, direct/extension smoke checks, and preservation through install/restart. Report signing/notarization accurately. Preserve normal runtime data, chats, settings and permissions.

Upload both production DMGs, SHA256 checksums, sizes, final source-pair manifest and build report to a GitHub draft release. Confirm draft=true before and after upload. Keep extension/browser ZIP clearly separate from installers. Do not publish any release, submit the Store update, change updater pointers, replace live packages or overwrite v2.1.1 artifacts.

Return draft URL, asset IDs, checksums and remaining artifact limitations to the coordinator. No further handoff is required to carry out the preparation, build, checks and draft uploads above.

Prior detailed report: [Mac handoff](2026-10-29-mac-to-windows-v212-handoff.md).
