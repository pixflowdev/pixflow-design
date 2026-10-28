# v2.1.1 and optional Chrome extension: platform handoff

Updated 28 October 2026. Do not publish packages, change updater pointers, or include Team work. Extension approval is NOT a prerequisite for the ordinary v2.1.1 release.

## Get the source from Git

Repository: https://github.com/pixflowdev/pixflow-design
Branch: `codex/release211-mac-acceptance`

Use a separate clone/worktree; do not overwrite another task's checkout:

```sh
git clone --branch codex/release211-mac-acceptance https://github.com/pixflowdev/pixflow-design.git pixflow-extension-checks
cd pixflow-extension-checks
git checkout --detach dbe241f6bfbdd544978cb9eef6c41a73dd34ec36
git rev-parse HEAD
corepack pnpm install --frozen-lockfile
```

Record that exact commit in every test/build receipt. Source, build scripts, tests and this handoff are in Git; the earlier Windows ZIP/source patch is not required. Node 24 and the package-manager version in package.json are required. Read root AGENTS.md, apps/AGENTS.md, tools/AGENTS.md and tools/pack/AGENTS.md before changing packaging.

The approved **isolated testing pair**, not a release approval, is:

- Core: `dbe241f6bfbdd544978cb9eef6c41a73dd34ec36`
- Pro: `398cf34e30ecbbdbf1b98293461657f09b0d9c51`
- Both branches: `codex/release211-mac-acceptance`.

This supersedes af03030dd for full paired tests: it includes the committed direct-connection, navigation, history and Unicode session-header fixes. Pro pins that exact clean Core revision, module API 14. No Team source was added by this pairing. Pro remains private at https://github.com/pixflowdev/pixflow-design-pro. Do not copy its source into Core.

```sh
# From a parent directory alongside the Core clone:
git clone --branch codex/release211-mac-acceptance https://github.com/pixflowdev/pixflow-design-pro.git pixflow-pro-checks
cd pixflow-pro-checks
git checkout --detach 398cf34e30ecbbdbf1b98293461657f09b0d9c51
export PIXFLOW_DESIGN_CORE_ROOT="$(cd ../pixflow-extension-checks && pwd)"
pnpm install --frozen-lockfile
pnpm setup:core
pnpm guard
pnpm typecheck
pnpm test:build
pnpm test:web
pnpm test:php
pnpm wordpress:zip
cd ../pixflow-extension-checks
export PIXFLOW_DESIGN_PRO_ROOT="$(cd ../pixflow-pro-checks && pwd)"
```

Do not set PIXFLOW_DESIGN_ALLOW_CORE_WORKTREE or change the pin to get a build through. Read this handoff on the branch tip, but build the immutable revisions above. The fixes and current validation are recorded in [the retest receipt](../../../docs/testing/2026-10-28-mac-retest.md). Windows broad suites now pass; rerun on macOS, including its previously reported platform-specific failures. This remains a test candidate, not release approval.

## Live-site acceptance setup

Use a dedicated reachable WordPress test site with backups and real authorized Pro access. The Mac agent's existing LocalWP site can be cloned to an isolated fixture; do not overwrite its original installation/content. The public reviewer site is Free-only and cannot establish Pro acceptance. Obtain reviewer credentials and a legitimate test licence privately; do not store either in Git or receipts. If access is unavailable, record the affected test as BLOCKED instead of bypassing authorization.

Before upgrading, export/hash posts, postmeta, Pixflow chats/resources/settings and licence records (keep sensitive exports local). Record installed plugin basenames and versions. Upgrade the fixture from published Free/Pro to the newly built ZIPs without uninstalling. Use new synthetic pages/chats only. Verify original rows/files are unchanged, allowing only documented migration metadata and synthetic additions. Test Free alone, Pro active, expired/revoked access and renewed access without deleting saved data.

In both floating panel and Pro Workspace, use the full installed Bridge and real Codex: send, observe streaming, steer, queue, navigate between Bricks and WP/ACF, reload immediately after Send and mid-reply, then reload again after completion. Require complete durable history, no duplicated edits, no stuck Preparing/Working, and accurate connection/recovery status. Repeat without the extension, then with it enabled. Test manual Bricks Design Your System with Bridge stopped. Use the builder/Feedback and authorization matrix below. Never use a real customer page for mutation tests.

## Two independent candidates

1. **Ordinary v2.1.1:** clean build output, unset PIXFLOW_DESIGN_NATIVE_PAYLOAD_DIR. Direct Bridge must work without the extension installed. Do not wait for Google. The exact source pair above is frozen for testing; final PR review, CI and platform acceptance still gate release.
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
- **Final Core/Pro pairing and upgrades:** test the frozen pair above, then review/merge the intended fixes and confirm final CI; exclude Team work and build fresh Free/Pro ZIPs. Verify Free-only operation, existing Pro entitlement and all original content/chats/preferences after upgrade. Capture before/after hashes and explicit allowlisted synthetic changes.
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

Website-owned detailed checklist (committed separately in the private website repository): [v2.1.1 website gates](https://github.com/pixflowdev/pixflow-website/blob/7bb25dc3c48ac5e6acfba35cb4fca5f4b9ac71ef/docs/releases/2.1.1-website-gates.md). It covers immutable release/account snapshots, final download/auth/updater/Linux/alias/rollback checks, separate Design/Pro changelogs and Bridge notes, and staged-to-live promotion. Access requires the existing website repository permission; no credentials are included here.

## Local test commands before platform builds

```sh
pnpm guard
pnpm typecheck
pnpm exec tsx --test tools/pixflow-design-bridge/tests/native-*.test.ts
pnpm exec tsc -p tools/pixflow-design-bridge/native-messaging/tsconfig.json --noEmit
pnpm --dir apps/packaged exec vitest run -c vitest.config.ts tests/native-registration.test.ts
pnpm --filter @open-design/packaged build
pnpm --dir tools/pack exec vitest run tests/native-transport.test.ts
```

The native UI suites are e2e/ui/native-messaging-prototype.test.ts and e2e/ui/native-popup.test.ts, configured by e2e/lib/playwright/native.config.ts. Read their explicit environment opt-ins first; their local fixture/session inputs are not bundled credentials and must be created on the isolated test machine. Never point them at a customer site. Use the manual acceptance matrix for the public reviewer installation until its own isolated inputs are prepared.


## Immediate Mac retest — supersedes the earlier pair

Read [the retest receipt](../../../docs/testing/2026-10-28-mac-retest.md). Exact Store identity material and setup are committed in the private Pro repository at `docs/testing/chrome-exact-id-retest.md` and `docs/testing/chrome-store-public-identity.json` (Pro commit `398cf34e30ecbbdbf1b98293461657f09b0d9c51`). Use only the public key in a separate unpacked test copy; keep Store output keyless.

## Mac acceptance fixes in progress — 28 October 2026

The extension no longer uses the active Bridge site as its dropdown directory. Clicking its action permits active-tab metadata inspection; persistent host access is still explicitly granted through Chrome. Supported candidates and remembered site metadata are separate from consent. The trusted extension background enrolls an approved origin through the native host, which checks its canonical URL/hash and uses the existing Bridge site switch; page channels cannot send enrollment control messages. Existing server-side WordPress session/entitlement checks remain in place.

Remembered sites remain visible offline, reconnect on browser startup/navigation and a 30-second alarm, and honor explicit direct mode or removed host access. Retry only reconnects transport and never submits an agent prompt. Browser and native payloads must be updated together (extension 1.0.2); old native hosts cannot perform first-site enrollment. New `activeTab` permission supports pre-consent metadata discovery and `alarms` supports recovery after Bridge starts later. No local-network permission is needed for native enrollment.

Workspace now surfaces explicit native disconnect as an error instead of reconnecting its stream through loopback fallback. The existing run may still be active; reconnection must inspect that run, not replay its prompt. Mac font fallback serialization consistently quotes multiword families. Paired Pro fixes canonicalize the temporary PHP fixture and distinguish unavailable legacy design routes from network failures.

Automated and live evidence, exact source pins, and remaining acceptance limitations will be added after validation. This is not release approval.
