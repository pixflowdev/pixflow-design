> Intel v2.1.1 continuation: use [the 29 October Intel handoff](2026-10-29-mac211-intel-handoff.md) and its exact source pins. The earlier pair below is historical evidence, not the new Intel build target.

# v2.1.1 combined Mac and unified-chat candidate

Updated 28 October 2026. This is the authoritative continuation of the Mac reboot handoff. Read this document from the branch tip, but build the immutable source revisions below. Earlier receipts remain evidence for their own revisions only.

## Frozen pair

| Repository | Exact revision | Integration PR |
| --- | --- | --- |
| Core | `4fa74d328b6ccf0619ca8cb701b180a6c4baca6a` | [Core #30](https://github.com/pixflowdev/pixflow-design/pull/30) |
| Private Pro | `3f34d403eebce54c1ee14a0630fd199dd44c6491` | [Pro #18](https://github.com/pixflowdev/pixflow-design-pro/pull/18) |

Both are reachable through `codex/mac-unified211-candidate`. Pro pins that exact Core revision, module API 14. Core combines #27 with #28/#29; Pro combines #16 with #17 and adapts one regression assertion to require the stronger chat-owner draft-reset guard. The latter is test-only; it changes no shipped code. Team changes are excluded. Neither PR is merged by this handoff.

Use separate clean worktrees. Preserve the earlier Mac fixture, app backups and runtime data. Never set `PIXFLOW_DESIGN_ALLOW_CORE_WORKTREE` to bypass a pin check.

```sh
git -C pixflow-core fetch origin
git -C pixflow-core worktree add --detach ../pixflow-211-core 4fa74d328b6ccf0619ca8cb701b180a6c4baca6a
git -C pixflow-pro fetch origin
git -C pixflow-pro worktree add --detach ../pixflow-211-pro 3f34d403eebce54c1ee14a0630fd199dd44c6491
cd pixflow-211-core
export PIXFLOW_DESIGN_PRO_ROOT="$(cd ../pixflow-211-pro && pwd)"
export PIXFLOW_DESIGN_CORE_ROOT="$PWD"
corepack pnpm install --frozen-lockfile
cd "$PIXFLOW_DESIGN_PRO_ROOT"
corepack pnpm install --frozen-lockfile
pnpm setup:core
```

Run from the parent of the existing `pixflow-core` and `pixflow-pro` clones; adapt those clone paths as needed. Use Node 24 and the pinned pnpm. Read repository/module AGENTS.md and the packaging guidance before building. Do not copy Pro implementations into Core.

## Windows verification of this integration

- Core guard and full typecheck passed; native module typecheck passed.
- Exact-pair CI passed: [Core run 40752566323](https://github.com/pixflowdev/pixflow-design/actions/runs/40752566323) and [Pro run 40753002696](https://github.com/pixflowdev/pixflow-design-pro/actions/runs/40753002696). Later Core handoff commits are documentation-only; keep the build pin unchanged.
- 54 native transport/enrollment/permission/registration tests passed, including the real isolated Windows registry test.
- 184 focused shared-chat, draft, last-active restoration, stream and recovery tests passed.
- 22 packaged registration/gateway tests and 3 packaging/native transport tests passed.
- Pro guard, typecheck and all 3 repository-contract tests passed against the clean pinned Core.
- Full paired Pro PHP lane passed, including data/permission preservation and review-link grants.
- Full paired Pro browser run: 2,219 passed, 28 skipped, one stale source assertion failed. The assertion expected the older draft-reset guard; it now also requires matching chat ownership. The affected 13-test suite and repository contracts passed after that test-only correction. This is a full run plus targeted correction, not a claimed second full run.
- Free and Pro WordPress bundles/ZIPs built successfully. Free basename remains `pixflow-ai/pixflow-ai.php`; Pro remains `pixflow-design-pro/pixflow-design-pro.php`.
- Free ZIP: 2,387,643 bytes; SHA256 `1cfaf8cb893998543bda47204b71340edd1374b31dff5110f16da4c202ca2471`.
- Pro ZIP: 6,077,022 bytes; SHA256 `bdfd6b896b38bb8b875f604cb5de0d07c314786f4ecf31f40656263a0b7b2e70`. Built before the test-only assertion correction; shipped source is identical.

These are local build/automated checks, not new installed Mac acceptance. Previous unified-chat live CLI checks covered active-run switching, cross-panel completion recovery and draft/context preservation on the unified source. Repeat impacted installed flows on this combined pair. No live site or runtime database was modified during integration.

## Mac acceptance before production builds

1. Check CI on the exact Core and Pro revisions above; require successful completion, not merely a queued run. Do not infer broad suite coverage from the narrower PR workflow. Run Core guard/typecheck, native tests/typecheck and packaged tests from the existing platform handoff; run Pro guard/typecheck/test:build/test:web/test:php against the pin.
2. Build and install this pair into the existing isolated Mac fixture. Verify legitimate Pro access and the installed source/version. Do not count rebooting the older `35e551` build as acceptance of this pair.
3. Before reboot, record private hashes/counts of original chats, settings, notes, content, licences and Bridge data; record selected chat, site and user. Keep backups and credentials outside Git. Use synthetic acceptance chats, not customer edits.
4. Perform a full macOS reboot. Leave the extension popup closed and browser debugger detached. With saved Chrome site consent, open the QA site and verify native registration/automatic connection and a fresh read-only CLI request without a reconnect click. Verify history/settings and last-active chat survive. Record actual OS, CPU, Chrome, Bridge and extension versions.
5. In both floating panel and Workspace: send/stream/steer/queue; switch chats during preparation and streaming; ensure runs are not duplicated or cancelled by viewing another chat. Navigate/reload before completion and verify exactly one final saved reply, no stuck Working/Preparing badge and no persistent save warning. Draft text, attachments and context must remain with the correct chat. Verify new tab and logout/login last-active restoration remains site/user scoped and explicit chat links win.
6. Verify the floating chat drawer, selection auto-close and list markers in supported builders, including Etch. Test Bricks manual Design Your System with the legacy route available and unavailable; do not apply/save a real profile just to test opening. Check the Mac multiword font-family result.
7. Revoke site access during a native request; require immediate disconnect and no prompt replay. Reapprove through Chrome and recover the existing run/history. Test cold Chrome startup, Bridge starting later and two approved sites without cross-site sessions/data. Repeat with the extension disabled/absent: direct Bridge must work in both panels.
8. Test installed upgrade/repair, tray restart, relocation and uninstall/reinstall preservation in isolation. Reconcile original data hashes, allowing only documented synthetic test records. Record unavailable platforms/scenarios as NOT RUN. Intel macOS and Linux acceptance cannot be inferred from Apple Silicon or Windows.

Previous Mac evidence is in branch `codex/mac211-acceptance-receipt`, especially `docs/testing/2026-10-28-mac211-review-handoff.md`. Its local continuation used `/Users/Shared/Pixflow-211-fixes-35e551`, namespace `release-stable-qa211-extension-arm64` and `work/fixes211-backup/pre-reboot-data.json`. Retain those backups; configure a separate candidate build with the existing data-preserving lifecycle approach. The earlier seven-minute provider delay remains unexplained; do not claim it fixed. Debugger-induced reload stalls are not evidence of a product hang.

## Authorized next action after gates pass

The user authorizes the Mac agent to proceed directly to production-format v2.1.1 builds and **draft uploads** after the above checks pass, without requesting another handoff. A failed gate stops that promotion. If product source must change, commit the fix in a focused PR, update the immutable pair/Core pin and rerun affected checks before building. Never silently substitute a branch tip.

Build the ordinary release first, from clean output with `PIXFLOW_DESIGN_NATIVE_PAYLOAD_DIR` unset. Use the Pixflow Bridge recipe `scripts/build-pixflow-design-bridge-mac-installers.mjs` and packaging guidance, version 2.1.1, Pixflow Design Bridge identity and existing customer data paths. Build each intended architecture; report any unavailable architecture explicitly. Verify built app version, native dependencies, install/launch/direct CLI and data preservation. Do not relabel an earlier DMG.

Build the optional extension-enabled candidate separately using the same source pair and the native payload built with permanent ID `hbnbiboohlelmngadeolikeejamjlbkh` (extension 1.0.2). Follow `tools/pixflow-design-bridge/native-messaging/PLATFORM-ACCEPTANCE.md`. Keep optional artifacts distinctly named; they must never replace ordinary installers. Exact-ID unpacked testing uses only the public key in private Pro documentation; Store ZIP stays keyless. Ordinary release readiness must not wait for Google approval.

Upload destination: **existing draft release ID `427088978`, tag `bridge-v2.1.1`**, in `pixflowdev/pixflow-design`: [draft release](https://github.com/pixflowdev/pixflow-design/releases/tag/untagged-2da3790fffeb3da16b64). GitHub may change a draft's temporary URL; locate it by release ID, not by guessing another release.

Before upload, read the release and require `draft: true` and the expected tag/repository. Upload new asset names only. Never use clobber, delete old assets, publish the draft or update a public asset. Include architecture and candidate hash in new filenames if a name already exists. Upload SHA256SUMS and a redacted build/acceptance receipt with exact Core/Pro hashes, artifact sizes, signing/notarization status and pass/fail/not-run matrix. Only public Bridge artifacts belong in this Core draft; private Pro ZIPs/source remain private.

Commit the Mac return report and sanitized screenshots through Git. Production-format builds are not deployment approval: keep live packages, downloads, updater pointers, checkout, WordPress submission and Chrome Store submission unchanged. Do not claim Apple signing/notarization for ad-hoc builds. Final website disclosures, language-pack/download hashes, Windows/final platform gates and release promotion remain separate checks.
