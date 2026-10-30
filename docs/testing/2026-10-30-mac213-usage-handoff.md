# Mac usage acceptance and production Bridge 2.1.3 builds

Owner authorization, 30 October 2026: test the new Codex and Claude usage indicators on macOS; if a test fails, fix it and repeat the affected checks, then build production Apple Silicon and Intel DMGs. Do not repeat the broad 2.1.2 installer, builder, steering, authentication or permission matrices. No public deployment or publishing is authorized.

## Exact starting pair

- Core repository: `pixflowdev/pixflow-design`, branch `codex/release-v213`, commit `e6ec0e0a7ee15c70fbe06ad7974d2fb0b6d11cd7`.
- Pro repository: `pixflowdev/pixflow-design-pro`, branch `codex/release-v213`, commit `a4747a209ebe74ba42f7ce2d8beed82abc580c80`.
- Pro `pixflow-pro.json` pins that exact Core commit; module API remains 14.
- This document is on Core branch `codex/mac213-usage-handoff`; its documentation commit does not change the runtime pair.
- Source review: Core [#52](https://github.com/pixflowdev/pixflow-design/pull/52) (usage), [#53](https://github.com/pixflowdev/pixflow-design/pull/53) (inline slash commands), Pro [#29](https://github.com/pixflowdev/pixflow-design-pro/pull/29) (pin/changelogs). Merge order is 52, 53, 29; do not merge or publish on this handoff's authority.

Fetch both repositories and verify full SHAs before starting. Explicitly set `PIXFLOW_DESIGN_PRO_ROOT` for Core/Bridge and `PIXFLOW_DESIGN_CORE_ROOT` for Pro. Use Node 24 and pnpm 10.33.2 and follow each repository's AGENTS.md. Keep all work/builds/evidence in one Mac task folder and reuse caches. Preserve existing chats, settings, sign-ins and permissions. Do not log out normal accounts or uninstall Desktop apps to force fallback.

## Scope and existing evidence

Core owns the shared UI, HTTP usage endpoints and `od agents usage codex|claude [--model MODEL] --json`. Queries use the selected Desktop-managed runtime first, with the existing installed CLI fallback. There are no hardcoded plan quotas. Claude uses read-only initialize/get_usage control requests, not a generated conversation; never copy tokens into another client.

Windows evidence: 22 backend usage tests, 10 usage UI tests, 21 composer tests and six native relay tests pass; guard, full typecheck, locale parity and paired Pro guard/typecheck/contract checks pass. Free and Pro local builds succeeded. Both composers displayed real Claude shared five-hour and weekly allowance and refreshed on Opus/Sonnet switching. This account supplied no separate model buckets; those cases are deterministic fixtures, not live evidence. Final positioning/scope fixes have regression coverage but need visual confirmation on the installed candidate because Windows browser control became unavailable.

## Short Mac checklist (the only new feature acceptance required)

1. On the existing authorized QA site, install/build the paired candidate without resetting site data. Confirm Bridge uses the intended candidate and reports the Desktop-managed runtime for each provider. Record versions/source labels, not credentials.
2. **Codex:** open the usage ring next to the avatar in the floating panel and Workspace. Check hover, click, Refresh, Escape and close. Compare actual reported windows/remaining percentages/reset times with the provider's own usage display or runtime result. A weekly-only account must not gain a fabricated five-hour limit. Verify the ring represents the most constrained applicable remaining allowance. If a standalone CLI is already installed, perform one isolated read with that launch source and restore Desktop preference.
3. **Claude:** repeat the same usage check. Switch between two available models, reload once, and confirm the usage query follows the saved model and never keeps another model's bucket. Shared-only limits legitimately remain identical across models. If separate model windows are not returned, record that limitation and run the existing fixture tests instead of inventing account evidence. If an installed CLI is available, perform one isolated fallback read and restore Desktop preference.
4. **UI/recovery:** in both composers check that hover and click menus retain their themed background, text, squircle corners and compact spacing, with an 8px anchor gap and no large Workspace offset. Use a narrow window once to check clipping. Verify one temporary unavailable/recovery case without revoking permissions or deleting credentials; `Unavailable` must not become 100% remaining. No paid model turn is required.
5. Record pass/fail, runtime source, model IDs, window types and redacted screenshots. Restore original provider/model choices; confirm no chats/content were changed. Run the focused usage tests below. If anything fails, fix in a focused `codex/` branch, add a regression where appropriate, rerun affected usage checks and update Pro's exact Core pin. Push fixes and record the new immutable pair before building.

```sh
pnpm --filter @open-design/daemon exec vitest run tests/runtimes/codex-usage.test.ts tests/runtimes/claude-usage.test.ts tests/runtimes/claude-usage-protocol.test.ts tests/routes/codex-usage.test.ts tests/routes/claude-usage.test.ts
pnpm --filter @open-design/web exec vitest run tests/components/CodexUsage.test.tsx tests/components/CodexUsageIndicator.test.tsx
```

## Production build authorization after usage passes

The starting pair is now versioned **2.1.3** and includes Core #50/#51 and Pro #28 as well as usage/slash changes. No further version bump or integration is needed. The coordinator is building Windows/runtime/plugin artifacts from this same pair. Keep the WordPress directory submission unchanged. If Mac testing requires code fixes, push them and record the new source pair before packaging; notify the coordinator so the other platform artifacts can be reconciled. This paragraph supersedes the original 2.1.2 starting pair and exclusions.

Build **one extension-ready production DMG per architecture**, arm64 and x64, retaining direct Bridge support. Do not produce separate direct-only and extension variants. Use the existing native host recipe with permanent extension ID `hbnbiboohlelmngadeolikeejamjlbkh` and the already-published extension; no extension rebuild/submission is requested.

```sh
pnpm exec tsx tools/pixflow-design-bridge/native-messaging/store-build.ts hbnbiboohlelmngadeolikeejamjlbkh
export PIXFLOW_DESIGN_NATIVE_PAYLOAD_DIR="$PWD/.tmp/chrome-store/native"
```

Use `scripts/build-pixflow-design-bridge-mac-installers.mjs` and its `pixflowPackEnv` product identity/icon recipe, and `pnpm tools-pack mac build --to dmg --portable --app-version 2.1.3` with the existing architecture-specific namespace, task output directory and shared cache. Preserve the Pixflow Bridge identity, update URL and tray-mode variables supplied by that recipe. Read `tools/pack/AGENTS.md` first.

Important: the wrapper's `--x64` option **imports** a DMG; it does not cross-build one. Use the previously working Intel/x64 toolchain (or approved Rosetta x64 Node) and verify `process.arch`, Electron and native binding architecture. Do not rename an arm64 build as Intel. Report the actual execution environment honestly; no new physical Intel test campaign is required.

Only minimal artifact checks are required after the targeted usage tests: version/product identity, expected architecture, native helper included, no development paths/test site binding, `hdiutil verify`, and actual signing/notarization classification. Do not repeat the full reboot/install/repair matrix already completed for 2.1.2. A discovered packaging defect must still be fixed before upload.

## Draft upload and return

Use Core repository `pixflowdev/pixflow-design`, draft tag `bridge-v2.1.3`. If absent, create a **draft** targeted at the final recorded build commit; if present, verify draft status and target before uploads. Do not alter a published release. Upload both DMGs, `SHA256SUMS-mac-2.1.3.txt` and a redacted build receipt. Verify byte counts and SHA256 against uploaded assets. Do not clobber different existing bytes; use source-qualified names and identify the intended pair.

Commit the redacted acceptance/build/upload report under `docs/testing/evidence/mac213-usage/` on a dedicated branch and open a PR. Return exact Core/Pro SHAs, test results, artifact architectures, signing status, draft URL, asset IDs/names, sizes and SHA256 hashes. Keep private logs, user data and DMG bytes out of Git. Preserve published packages, customer data and Team separation. Production build/upload is authorized; public publication and deployment are not.

