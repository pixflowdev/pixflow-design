# Mac usage refresh, Claude recovery and next Bridge DMGs

Owner request, 30 October 2026: verify the usage auto-refresh fix, then prepare new Mac DMGs. **Follow-up: include the composer tooltip overflow fix before final packaging.** Keep customer data, sign-ins, settings and Chrome permissions. Keep Team separate and published files unchanged. No public deployment, Store submission or updater changes are authorized.

## Starting source and scope

Fetch these immutable inputs, rather than a moving branch tip:

| Input | Repository / branch | Commit |
| --- | --- | --- |
| Combined Core test candidate | `pixflowdev/pixflow-design`, `codex/tooltip-integrated-check` | `601ab8f1d7d307b6211dc3e6ca4e9d64ab1b0ff0` |
| Released Pro baseline | `pixflowdev/pixflow-design-pro`, `codex/pro-repository-extraction` | `68995f19d42a005ca327e41186bba7c2a086c12b` |

Core includes the separate Claude sign-in recovery [PR #63](https://github.com/pixflowdev/pixflow-design/pull/63), the usage fix, and the tooltip layout fix [PR #67](https://github.com/pixflowdev/pixflow-design/pull/67). The focused usage [PR #65](https://github.com/pixflowdev/pixflow-design/pull/65) targets main independently at `ca87cb5e33877bffc987725921b4e32644289c57`. Its two usage source files and both usage regression files are byte-identical to this combined candidate. It also adds explicit timer-test CI coverage and evidence. Do not drop any of these fixes when preparing final release sources.

The new Core pin supersedes the earlier `1800792b` input. If usage/auth acceptance has already passed, do not restart that matrix: add the tooltip regression and one Bricks hover smoke, then use the new combined input for version/pin preparation. If DMGs were already built from the old input, retain their evidence but do not designate them as the final corrected artifacts.

This handoff is on `codex/mac214-usage-handoff`; its document commit is not the test/runtime pin above. Pro's default branch is `codex/pro-repository-extraction`, not `main`. Module API stays 14. No personal credentials or site access details belong in Git; use the existing authorized QA site and private local configuration.

The Pro starting manifest still pins the previous release Core input. Set `PIXFLOW_DESIGN_PRO_ROOT` and `PIXFLOW_DESIGN_CORE_ROOT` explicitly. For coordinated tests only, the documented `PIXFLOW_DESIGN_ALLOW_CORE_WORKTREE=1` override is permitted; record the actual two SHAs. Before production packaging, create a clean Pro commit with the exact final Core pin and remove that override. Source availability is not a licence grant.

## Windows evidence and limits

- Usage: all 16 component regressions passed; two installed WordPress composer checks waited a real minute and observed the ring/hover change without clicking. Guard, full typecheck, Free and explicitly paired Pro browser builds passed. Original readings remain visible during background reads; unavailable clears stale values and retries. Model changes cancel old work. Hidden tabs pause and refresh overdue usage on return.
- Claude recovery: 164 focused tests plus installed direct authorization and a real manual-code exchange through Chrome native messaging passed with Claude Desktop closed. Browser restart/reload, settings reopen and automatic refresh without Rescan passed. The native test blocked direct browser HTTP and verified the extension route. No extension update was needed.
- The Windows paired UI build used Pro `faf6dfc9fd44f04dc4c0c36beb74c9a7321f8af7`, which contains other pending work. It is deliberately **not** the new Mac production baseline. Use the released Pro commit above and record the new exact pair after testing. This is a remaining paired Mac check, not a claim that that pair was already accepted.
- Chats, content and saved settings were unchanged. Automatic entitlement/admin audit records refreshed during inspection. Tim's original computer-specific disconnect cause remains unconfirmed; do not claim this handoff reproduces every customer environment.

## Targeted Mac acceptance

Read both AGENTS.md files and `tools/pack/AGENTS.md`. Use Node 24 and pnpm 10.33.2, a single named task folder and shared caches. Preserve installed runtime data. Do not repeat the broad builder, steering, licence, reboot or installer matrix already completed for v2.1.3.

1. Build/install the paired candidate on the existing authorized QA fixture without resetting its database or chats. Keep a reversible checkpoint of only changed fixture assets. Use the actual candidate Bridge and record its source/version. Desktop runtimes remain preferred; do not uninstall an app or log out normal accounts to force fallback.
2. **Codex and Claude, both composers:** leave the ring untouched for at least 60 seconds. Confirm a second usage read occurs without clicking the ring or opening details. A quiet account may return unchanged percentages: prove the request and checked time advanced rather than requiring quota consumption. Hover must display the current result; click/manual Refresh must still work. No generated model turn is necessary.
3. **Claude model isolation:** switch between two available models, then let the minute refresh occur. Verify the request carries the newly selected model and a late response cannot restore the former model's allowance. Shared-only windows may legitimately match; do not invent separate model buckets. Restore the original provider/model preferences afterwards.
4. **Visibility and recovery:** hide the tab for over a minute, then return. Hidden tabs should not poll; overdue usage refreshes on return. Verify one unavailable/recovery case with test responses or the isolated candidate only, without revoking Chrome permissions or deleting authentication. Polls must not overlap and no unavailable response may become a fabricated 100% reading. Check the existing hover/click styling once at a narrow width.
5. **Claude sign-in recovery:** with Desktop closed and its runtime still discoverable, verify Sign in again remains available. Complete one owner-authorized official sign-in through the real WordPress button, including waiting and automatic connection without Rescan. Check Open sign-in page; if a manual code is returned, enter it only in WordPress and complete sign-in. Otherwise record that manual exchange is Windows live-tested and Mac control-tested. Do not force logout to manufacture a fresh account state. Never paste codes, tokens or full authorization URLs into logs/chat/Git. Keep only one current authorization attempt; close cancelled test-created authorization tabs so an obsolete localhost callback cannot be mistaken for the active attempt.
6. Check direct and existing published-extension routes once for health and one usage read each. For the sign-in scenario use the extension route if available; do not repeat a broad permission matrix or rebuild/submit the extension. Record the actual route, not only a green connected badge. Existing permissions must be restored unchanged.
7. **Composer tooltip follow-up:** in the Bricks floating panel hover + and Send, then move away. Host document/body width, height and scroll position must not change. The custom tooltip must stay inside the viewport with the panel theme. Windows reproduced the original 1000px-to-1707px page growth and verified the fix in Bricks, Gutenberg, Etch, Elementor and a 640px Bricks viewport. The Mac addition is one Bricks smoke plus the focused TooltipLayer test; no new builder matrix is requested.

Run the focused tests, then guard/typecheck and Pro's normal paired checks:

```sh
pnpm --filter @open-design/web exec vitest run tests/components/usage-refresh.test.tsx tests/components/CodexUsage.test.tsx tests/components/CodexUsageIndicator.test.tsx
pnpm --filter @open-design/web exec vitest run tests/components/TooltipLayer.test.tsx
pnpm --filter @open-design/daemon exec vitest run tests/runtimes/codex-usage.test.ts tests/runtimes/claude-usage.test.ts tests/runtimes/claude-usage-protocol.test.ts tests/routes/codex-usage.test.ts tests/routes/claude-usage.test.ts tests/runtimes/claude-sign-in.test.ts tests/routes/claude-sign-in.test.ts tests/claude-sign-in-cli.test.ts
pnpm --filter @open-design/web exec vitest run tests/components/ClaudeSignIn.test.tsx tests/pixflow/bridge-request-connectivity.test.ts
```

If a targeted test fails, fix it in a focused `codex/` branch, add a regression where practical and repeat the affected check. Push the fix before packaging, record the new full SHAs and notify the coordinator so Windows/plugin candidates do not omit it. Do not silently broaden scope or include Team changes.

## Production packaging gate and version

The next candidate version is **2.1.4**, because v2.1.3 is already published. Starting sources above still identify as 2.1.3 and are **test inputs, not permission to relabel or overwrite published DMGs**.

After targeted acceptance passes:

1. Prepare separate release-only Core/Pro commits for 2.1.4, retaining both reviewed fixes and excluding Team. Use the existing release-version pattern, not a repository-wide text replacement. Align the Core plugin header/constants, Bridge requirement and compatibility wrapper version, plugin readme version and new changelog heading; align Pro's plugin header/constants/readme version. Preserve historical changelogs and avoid duplicating the shared Core usage entry in Pro. Do not change generic workspace package versions or the extension's version.
2. Push the clean final Core revision. Pin that full SHA in Pro's `pixflow-pro.json`, commit/push Pro and record the resulting exact pair. Run Pro's exact-pin checks **without** the worktree override. If either source changes afterwards, update the receipt and pin before rebuilding. Check #63/#65/#67 CI and ensure no later accepted fix has been omitted. This authorizes build preparation, not merging PRs or publishing.
3. Build one **extension-ready** production DMG for Apple Silicon and one for Intel, retaining direct access. No direct-only variant. Keep permanent extension ID `hbnbiboohlelmngadeolikeejamjlbkh`; do not rebuild the browser extension.

```sh
pnpm exec tsx tools/pixflow-design-bridge/native-messaging/store-build.ts hbnbiboohlelmngadeolikeejamjlbkh
export PIXFLOW_DESIGN_NATIVE_PAYLOAD_DIR="$PWD/.tmp/chrome-store/native"
```

Use the existing `scripts/build-pixflow-design-bridge-mac-installers.mjs` product identity/icon recipe and `pixflowPackEnv` values, with `pnpm tools-pack mac build --to dmg --portable --app-version 2.1.4`, the architecture-specific production namespace, task output directory and shared cache. The wrapper reads the Core Bridge constant and its `--x64` argument **imports**, not cross-builds, a DMG. Use the known x64/Rosetta toolchain for Intel; verify Node/Electron/native-binding architectures. Do not rename an arm64 file to Intel. Report Rosetta honestly; no new physical Intel test campaign is requested.

Minimal artifact checks: correct product/version/architecture, portable config, native helper included, no development site binding/path/credential, runtime health/version matching 2.1.4, `hdiutil verify`, and actual signing/notarization status. Reuse prior broad installer evidence, but fix any new packaging defect before upload.

## Draft assets and Git return

Target a **new draft** in Core repository `pixflowdev/pixflow-design`, tag `bridge-v2.1.4`. Verify it is still draft and targets the final Core build commit before uploading. If a published release already occupies that version, stop and report; never overwrite it. Use names `pixflow-design-bridge-2.1.4-mac-arm64.dmg` and `pixflow-design-bridge-2.1.4-mac-x64.dmg`, plus `SHA256SUMS-mac-2.1.4.txt` and a redacted source/build receipt. Never clobber different existing asset bytes.

Upload exact tested bytes only after both architectures pass. Verify downloaded asset size/SHA256 against local files. Commit a small redacted report under `docs/testing/evidence/mac214-usage-recovery/` on a dedicated branch and open a PR. Return:

- Full accepted Core and Pro SHAs, Pro pin and module API; test versus production input distinction.
- Mac OS/architecture and Desktop/CLI versions; actual connection routes and model/window evidence.
- Pass/fail and any skipped/unavailable live check; preservation of chats, content, settings, credentials and permissions.
- DMG names, architectures, sizes, SHA256, signing/notarization classification, draft URL/asset IDs and download verification.

Keep DMG bytes, private sessions, site credentials and raw authorization logs out of Git. Keep one canonical artifact per architecture and clear only verified generated intermediates after stopping this task's own processes. Keep runtime data and evidence. Do not publish the draft, deploy plugin ZIPs, update customer downloads/updater pointers, or submit the extension.

## Mac return — completed 2026-10-30

Targeted acceptance, the added Bricks tooltip smoke, and both production 2.1.4 DMGs are complete. The new shared-polling fix is Core PR #68; final release preparation is Core PR #69 and Pro PR #33. Final Core is `e1443e228ef68bc921298f5678d38e1af51dff5b`; final Pro is `32a7946801d30e37f30bf35dda622f15335f3ec5`, pinning that Core at module API 14 without an override. All four draft assets passed independent download verification.

See [the complete Mac return, PRs, artifact hashes, signing classification and limits](evidence/mac214-usage-recovery/README.md). The release remains draft; public publication/deployment was not performed.

Review the Mac return in [Core PR #70](https://github.com/pixflowdev/pixflow-design/pull/70).
