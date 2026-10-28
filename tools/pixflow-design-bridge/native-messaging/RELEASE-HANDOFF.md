# v2.1.1 and optional Chrome extension: platform handoff

Updated 28 October 2026. Do not publish packages, change updater pointers, or include Team work. Extension approval is NOT a prerequisite for the ordinary v2.1.1 release.

## Get the source from Git

Repository: https://github.com/pixflowdev/pixflow-design
Branch: `codex/chrome-store-preparation`

Use a separate clone/worktree; do not overwrite another task's checkout:

```sh
git clone --branch codex/chrome-store-preparation https://github.com/pixflowdev/pixflow-design.git pixflow-extension-checks
cd pixflow-extension-checks
git rev-parse HEAD
corepack pnpm install --frozen-lockfile
```

Record that exact commit in every test/build receipt. Source, build scripts, tests and this handoff are in Git; the earlier Windows ZIP/source patch is not required. Node 24 and the package-manager version in package.json are required. Read root AGENTS.md, apps/AGENTS.md, tools/AGENTS.md and tools/pack/AGENTS.md before changing packaging.

The paired Pro repository is private: https://github.com/pixflowdev/pixflow-design-pro. Obtain access normally. Do not copy credentials or private Pro source into this public repository. Full Bridge builds require an explicitly configured compatible Pro checkout through PIXFLOW_DESIGN_PRO_ROOT. The last local v2.1.1 test Pro checkout was commit `120ed24` with uncommitted Bricks work, pinned to Core `9235328a9af3138d32c7d998cc94e9a6f148df3c`; that is evidence, NOT a clean final pairing. Before producing releasable full installers, the coordinator must identify the reviewed Pro commit, reconcile the Core pin and exclude Team changes. Never silently disable the pin check or treat a dirty local checkout as the release source.

## Two independent candidates

1. **Ordinary v2.1.1:** clean build output, unset PIXFLOW_DESIGN_NATIVE_PAYLOAD_DIR. Direct Bridge must work without the extension installed. Do not wait for Google. Existing maintenance PRs and candidate pairing still need their final review/freeze.
2. **Extension review candidate:** same approved base plus the optional native payload. This branch contains the new permanent Store identity, automatic connection and native registration work. Build and test separately; do not replace ordinary/public release assets with this candidate.

Build the optional payload from Git:

```sh
pnpm exec tsx tools/pixflow-design-bridge/native-messaging/store-build.ts hbnbiboohlelmngadeolikeejamjlbkh
export PIXFLOW_DESIGN_NATIVE_PAYLOAD_DIR="$PWD/.tmp/chrome-store/native"
```

Use the product-specific Bridge packaging recipe, with portable paths and the configured Pro checkout. A generic desktop package is not a Bridge acceptance build. Product identity must remain Pixflow Design Bridge / dev.pixflow.bridge, tray mode enabled, version 2.1.1. Existing recipe references: scripts/build-pixflow-design-bridge-mac-installers.mjs, scripts/build-pixflow-design-bridge-installer.mjs and tools/pack/README.md. Run packaging inside this isolated checkout; its dist files must not be uploaded to live paths. Rebuild the packaged app so apps/packaged startup changes are included; updating only host.mjs is insufficient.

## Extension tests required on real macOS/Linux

Follow [the platform acceptance matrix](PLATFORM-ACCEPTANCE.md). Test actual macOS arm64/x64 and advertised Linux platforms; report unavailable architectures as NOT RUN, never inferred passes.

- Installed first launch automatically registers the permanent host without system Node. Repeat launch, repair, relocation, reboot and upgrade. Check launcher/manifest permissions and paths; no DMG, App Translocation or temporary AppImage mount references.
- Signed bundles remain unmodified; unsigned/unnotarized builds are described accurately. Do not disable security controls globally or claim Apple approval.
- Real Chrome first-time site approval and automatic popup, subsequent automatic connection without a second click, and explicit direct preference after browser restart.
- Revoke Chrome site permission during an active request; verify immediate disconnection, no replay, and recovery only after real reapproval. Contract tests and pregranted profiles do not substitute for this test.
- Public reviewer site: https://docs.pixflow.dev/extension-review/wp-admin/ . Obtain the dedicated login privately; never commit it. It is deliberately Free: Pro Workspace tests belong on a separate legitimately authorized test fixture.
- Full installed daemon/native-host path with real CLI streaming, steering, queueing, navigation, early reload and terminal recovery. Check the actual floating-panel composer, including durable history after a second reload. Use a legitimately licensed Pro fixture for Workspace coverage.
- Reject wrong origin, expired/revoked WordPress sessions and mismatched installation; retain normal site/WordPress authorization.
- Extension disabled or absent: direct connection still pairs and runs normally. Direct image/iframe/WebSocket/EventSource limitations remain; the extension adapts fetch only.
- Owned unregister/reinstall preserves chats, settings and Chrome grants. OS Trash/file deletion does not execute an uninstall hook; document residual inert registration accurately.

## v2.1.1 remaining release checks

The last verified ordinary Windows receipt passed full installation/repair, 11,450 payload file checks, tray Restart Bridge, removal/preservation, extension-free direct connectivity and an authenticated floating-panel CLI reply/reload. These apply to that older frozen candidate, not automatically to a rebuilt candidate.

Known outstanding or requiring evidence against the final freeze:

- **Pro Workspace direct CLI:** restore legitimate Pro access on the isolated fixture, then send/stream/steer/queue, navigate/reload during preparation and streaming, verify one complete saved reply and no persistent Working/save warning. The last ordinary-release receipt explicitly left this unverified. Do not bypass licensing.
- **macOS/Linux actual installers:** install, upgrade from the published release, restart/tray action where applicable, repair/reinstall, uninstall/reinstall, permissions and data preservation; run the direct CLI flow with the extension absent. Repeat Windows impacted checks if the final installer/source/payload changes.
- **Final Core/Pro pairing and upgrades:** review/merge the intended fixes, pin Pro to the exact reviewed Core, exclude Team work, build fresh Free/Pro ZIPs. Verify Free-only operation, existing Pro entitlement and all original content/chats/preferences after upgrade. Capture before/after hashes and explicit allowlisted synthetic changes.
- **User-facing regression spot checks on those exact installed ZIPs:** Bricks manual Design Your System and variable/profile actions without AI/Bridge; repeated native saves; Bricks-to-WP/ACF handoff including immediate navigation after Send; stable review target/pill position; bounded canvas requests and recovery; history conflict/early-reload recovery without replayed mutations. Feedback/client-review flows need their existing focused permission/navigation tests and confirmation they are included only if their reviewed PRs are in the release.
- **Final build/release gates:** CI for every final commit; correct versions/required Bridge version; Free/Pro readme changelogs agree with the website; exact language-pack hashes hosted before updated pins ship; download checksums, platform labels and macOS unsigned disclosure; staged upgrade/download/updater responses and old-version compatibility. Do not change live feeds or checkout logic while testing.
- **Website readiness:** coordinate final staged download/updater/changelog/language checks with the website chat and record its receipt. Earlier v2.1.0/live or review-only checks are not v2.1.1 promotion evidence.

## Already verified (do not overstate)

On Windows: 45 native tests, four packaged startup tests, three packaging tests, guard, full typecheck, native module typecheck and packaged build passed. Public reviewer native transport passed real Codex streaming, steering and navigation recovery: 683 recovered events, one steering message, successful answered outcome. That used the installed Windows native host with an isolated development daemon and prior browser permission. It was not a complete customer installation/composer-persistence test. Temporary pairing credentials were revoked; original content/settings remained unchanged. The browser extension 1.0.1 and reviewer Windows installer remain unchanged and unsubmitted/unpublished as applicable.

## Return results through Git

Commit a redacted report under docs/testing/ with source hashes, OS/CPU/Chrome/Bridge versions, artifact SHA256 and size, pass/fail/not-run for each matrix item, timing and preservation comparisons. Include screenshots without personal data. Keep credentials, cookies, browser profiles, raw customer logs and runtime databases out of Git.

Use a separate PR for fixes discovered by testing. Upload installers only as NEW assets of a specifically agreed draft GitHub release (or CI artifacts); do not create/replace public release assets, stable filenames or update pointers. Report that draft/artifact URL and its checksum. No Google submission, final certifications, Apple signing claim or live release is authorized by this handoff.

## Website audit snapshot — 28 October 2026

The website chat verified current public Free, Pro and Bridge are still 2.1.0, using snapshot release-2.1.0-final-ed4ab60b-5a7c4ff5. The review-only Free 2.1.1 package has JSON-equivalent language pins to public Free 2.1.0; all 18 pins passed public hash/size and immutable-cache checks. Recheck the final build; unchanged pins need no republishing.

Known website release blocker: the Mac install-notice component currently lists unsigned/ad-hoc disclosures for 2.0.4, 2.0.6 and 2.1.0, not 2.1.1. If final 2.1.1 DMGs remain ad-hoc/not notarized, the website team must add correct version-aware disclosure and account-page coverage before deployment. The Mac agent must report actual signing/notarization status, not assume it.
