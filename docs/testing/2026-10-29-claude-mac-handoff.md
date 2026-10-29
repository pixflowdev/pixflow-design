# Claude Desktop and extension 1.0.3 — Mac acceptance handoff

29 October 2026. The owner has paused Chrome Web Store submission and will install Claude Desktop on the Mac. Test the new Claude integration and the **new extension**, then report before production Apple Silicon/Intel DMGs are frozen. Do not submit/publish the extension, publish releases, replace deployed v2.1.1 assets, change updater pointers or deploy to customer sites. Preserve chats, settings, permissions, installed runtimes and authentication. Team changes remain excluded.

This handoff supersedes earlier build-only instructions for this new feature candidate. Earlier Mac v2.1.1 acceptance remains valid for those older bytes; it does not cover Claude Desktop discovery or the new extension reconnect flow.

## Exact paired source

- Core candidate: `fc185c2ccd5eba8a94c27e1169d056dc9afbb75f`, branch `codex/claude-mac-candidate` in `pixflowdev/pixflow-design`.
- Private Pro candidate: `a4942a73da108758709bbb0260b2ec149ba87b78`, same branch name in `pixflowdev/pixflow-design-pro`.
- Pro changes only its Core pin from released/default source `b77341e0c6afa3869e0c852125257e6e3b885e32`; module API remains 14. Do not bypass pin validation or pull a Team branch.
- Core is a test integration snapshot of Claude #39, footer #40, native endpoint #41, and the reconnect/wording changes. It is not a merge to main or a production release approval. #39/#40/#41 CI passed on their recorded heads; the combined Mac pair still requires the checks below.

Read this document from the handoff branch tip, but build the exact source revisions above in clean, separate worktrees. Set `PIXFLOW_DESIGN_CORE_ROOT` and `PIXFLOW_DESIGN_PRO_ROOT` explicitly. Use Node 24 and pnpm 10.33.2, frozen dependency installation, then Pro `pnpm setup:core`. Record both SHAs and clean status. Do not modify the coordinator's branches to fix discovered bugs: use a focused `codex/` branch and PR and report which acceptance must be rerun.

## The extension to test — NOT the approved 1.0.2

Use **Pixflow Design Bridge extension 1.0.3** from the draft GitHub release:

- Draft release ID: `427826409`; tag intent `extension-v1.0.3-mac-candidate`.
- [Open draft release](https://github.com/pixflowdev/pixflow-design/releases/tag/untagged-0e86ecf7c2a5921b236a).
- Asset ID `688467093`: `pixflow-design-bridge-extension-1.0.3.zip`, **43,041 bytes**.
- SHA256: `4750cbe937d5365c771c8ade9f5ebed7456d5841dee0101d977e8e3be2144839`.
- Permanent Store ID: `hbnbiboohlelmngadeolikeejamjlbkh`.
- Per-file production hashes: `docs/testing/evidence/claude-mac-2026-10-29/extension-1.0.3-files.json` at the Core candidate.

Download through authenticated GitHub/gh, verify the hash before extracting. The ZIP is browser-only; never load the separate native payload as an extension. Use a dedicated Chrome test profile. For an unpacked permanent-ID test, add the existing Store **public** key to a disposable extracted manifest using the previously verified Mac setup; confirm Chrome reports the exact permanent ID. Never alter the frozen ZIP or invent an ID. If the public key/setup is unavailable, obtain it from the maintainer/Store rather than treating a randomly assigned ID as a pass. Do not alter normal Chrome permissions.

The new external reconnect message only requests UI; it must not grant site consent or relay arbitrary commands. Permissions/native enrollment remain required. Production config uses port 7456 and no embedded customer origins. If an isolated port is needed, record the exact test-only config override separately from artifact hashes.

Build the matching native helper from the candidate:

```sh
pnpm exec tsx tools/pixflow-design-bridge/native-messaging/store-build.ts hbnbiboohlelmngadeolikeejamjlbkh
export PIXFLOW_DESIGN_NATIVE_PAYLOAD_DIR="$PWD/.tmp/chrome-store/native"
```

The deployed v2.1.1 native helper denies `/api/test/connection`. #41 corrects this exact endpoint; unrelated `/api/test/*` remain denied. Testing only the new browser ZIP with the old native helper cannot validate Claude's Test button. No new extension permissions are needed specifically for Claude sign-in.

## Automated gates

Run Core `pnpm guard`, `pnpm typecheck`, daemon build and relevant Claude runtime tests; run all native tests with `pnpm exec tsx --test tools/pixflow-design-bridge/tests/native-*.test.ts`. Run `pnpm --filter @open-design/e2e exec vitest run tests/pixflow/bridge-reconnect.test.ts` and focused web ClaudeSignIn, BridgeConnectionSettings, SettingsDialog provider-sync, agentReasoning and AssistantMessage tests. Run Pro guard, typecheck, test:build and the affected paired web/Bridge checks. Record actual results and pre-existing failures separately.

Windows evidence: 63 native tests, 7 reconnect tests and 6 Bridge settings tests passed. Actual Execution Reconnect opened the popup after explicit direct preference; Close worked; Connect restored the Chrome-extension route in settings and the floating Bridge menu. Claude Desktop model/effort selection persisted on reload, Haiku 4.5 hid unsupported effort, and the actual Test returned `ok` in 3464 ms with the corrected helper. Installed standalone fallback discovery passed, but this is not a claim that Mac fallback or all Mac browser entry points have passed.

## Mac Claude acceptance

1. Record macOS/CPU, Claude Desktop version/runtime path, standalone CLI version/path and browser version. With both installed, verify Desktop runtime wins and UI says **Live from Desktop app**. Do not update/remove the existing standalone CLI merely to make this pass.
2. Test fresh sign-in from the actual WordPress Execution **Sign in with Claude** button. Use an isolated auth directory where supported; do not log out the owner's normal app/CLI account. Let the owner perform official browser authentication. Verify waiting spinner, Cancel, timeout/retry and automatic connected state without Rescan. Sign-in replaces Test until authenticated.
3. Compare discovered models with the selected Desktop runtime's own catalogue. Record discrepancies; do not hard-code model IDs or infer capability from display names. Check model-specific effort including Low through Max where advertised, hidden unsupported effort and persisted selection after reload.
4. In both floating panel and Workspace send a synthetic no-change request, observe streaming/completion and verify selected model/effort in redacted runtime evidence. Confirm no misleading dollar amount in the footer. Record startup/first-token/total times without claiming API-equivalent cost.
5. Exercise standalone CLI fallback using a test-scoped discovery seam/environment or isolated harness; do not rename/delete the installed Desktop app or alter normal PATH globally. Record which runtime actually ran. Verify fallback model discovery comes from that CLI, is labelled correctly, and Desktop wins again after restoring discovery. Test both installed-but-unauthenticated and unavailable Desktop states without silently changing user account/plan.

## Extension 1.0.3 browser acceptance

Use a synthetic WordPress site with the candidate plugin pair and candidate Bridge. Back up and record existing test chats/settings first. No customer-content mutation is needed.

1. Start with no site approval in the isolated browser profile. Test **Execution Reconnect**, **floating-panel Bridge reconnect**, and **Workspace toolbar reconnect** separately. Each should open the extension popup when approval/direct preference requires UI; no toolbar click should be required. Approve only the synthetic site with the owner as needed.
2. Verify readable popup width, inner rounded card, working Close button, loading/error states and no duplicate prompts. Closing without connecting must leave direct access and stored permissions/preferences unchanged.
3. Connect via extension and verify route wording in Execution, Bridge popover and avatar menu. Then choose direct mode, verify all labels follow the actual route, and explicitly reconnect through the popup. Check no stale “Connected directly” or spurious Bridge-update badge remains.
4. Approved site: new tab, refresh, browser restart and Bridge restart recover automatically. Explicit direct preference must not be overridden silently. Permission removal closes active native connections; reapproval recovers without losing history or resetting settings. Unapproved/foreign sites and subframes cannot enroll or relay.
5. Test real Claude and Codex short streaming, steering/cancel and navigation reattachment in both panels over the extension. Provider Test must work with the corrected native helper. Repeat representative runs with the extension disabled and direct Bridge connections. No duplicate run or replayed edits after reconnect.
6. Reconcile chats/settings/content/permission backups, documenting only intentional synthetic test additions. Restore test-only preferences/permissions where appropriate. Capture screenshots of all three reconnect entry points and final route labels; redact account details, tokens, private paths and chat content.

## DMG preparation and reporting

After Mac checks pass, prepare **one extension-ready build per architecture**, Apple Silicon arm64 and Intel x86_64; direct access remains included in both. Do not build separate direct-only/optional-extension variants. Use the packaging guidance and identity recipe in `scripts/build-pixflow-design-bridge-mac-installers.mjs`, portable paths and the matching native payload. The wrapper's `--x64` imports an existing DMG; it is not cross-compilation. Use a genuine x64 toolchain (Intel Mac or approved Rosetta setup) and verify Electron/native module architectures with file/lipo.

This source still carries the released v2.1.1 version. Do not overwrite or upload changed bytes under published v2.1.1 filenames/tags. Return acceptance and build readiness first; the coordinator must freeze the next release version/source pair before final production DMGs. This avoids another build from an unapproved version. Existing v2.1.1 Mac reports remain historical evidence only.

For the final new-version build, require hdiutil verify, correct bundle identity/version, actual per-architecture payloads, native host registration for the permanent ID, install/repair/restart preservation, direct and extension smoke tests, signature classification (do not claim notarization for ad-hoc signing), SHA256/size and a draft-only upload receipt. If Intel runs under Rosetta, say so; do not call it physical Intel acceptance.

Push a redacted report under `docs/testing/evidence/claude-mac-2026-10-29/` on a dedicated branch and open a documentation PR. Include exact source/runtime versions, per-check PASS/FAIL/NOT RUN, screenshots, logs without credentials, remaining blockers and any fix PRs. Do not submit the Store update or publish artifacts. The coordinator will reconcile Mac evidence before resuming submission.
