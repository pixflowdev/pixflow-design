# Pixflow Design Bridge v2.3.3 Mac handoff

Build the Apple Silicon and Intel release candidates and report back before publication. Use ad hoc signing for the Mac update experiment. Keep the published downloads, feed and live sites untouched. Return any runtime fixes in focused PRs before rebuilding the affected artifacts.

## Source

| Repository | Branch | Commit |
| --- | --- | --- |
| pixflowdev/pixflow-design | `codex/v233-core-candidate` | `7ef664f9c231163e60bb0274cc633c8b95824209` |
| pixflowdev/pixflow-design-pro | `codex/v233-pro-candidate` | `4f1f06c275492e859b83405f0e157fdd705e396d` |

This replaces the earlier handoff. Do not build from the old source pair or reuse its plugin ZIPs or Bridge binaries. Begin only after Core #153/#155/#156/#158 and Pro #85/#87/#88 have merged with passing checks. The release inventory is in `docs/qa/v233-source-inventory.json`; unfinished Team and comments/Feedback work and the Tauri experiment are excluded.

Pro pins that Core commit. This documentation branch is separate from the build source. Read both repositories' AGENTS.md and Core's tools/pack/AGENTS.md. Use clean, isolated, architecture-specific worktrees, Node 24 and pnpm 10.33.2 with frozen installs. Point each checkout at its exact partner with `PIXFLOW_DESIGN_CORE_ROOT` and `PIXFLOW_DESIGN_PRO_ROOT`.

## Build and verify each DMG

Build `arm64` with arm64 Node and `x64` with x64 Node, using Rosetta on Apple Silicon if needed. Use separate native dependencies. Generate the production Chrome native host payload with `pnpm exec tsx tools/pixflow-design-bridge/native-messaging/store-build.ts hbnbiboohlelmngadeolikeejamjlbkh`, export `PIXFLOW_DESIGN_NATIVE_PAYLOAD_DIR` to the generated `.tmp/chrome-store/native`, and run `pnpm bridge:mac` using the pinned source. Reuse the v2.3.2 package verification checklist in [the previous handoff](https://github.com/pixflowdev/pixflow-design/blob/codex/v232-mac-handoff/docs/testing/pixflow-bridge-v2.3.2-mac-handoff.md) where available.

- Verify the DMG read-only with `hdiutil verify`. Check app version 2.3.3, bundle ID `dev.pixflow.bridge`, architecture of the executable, Electron framework, bundled Node and SQLite binding, and that the app has no build-machine runtime paths.
- Verify the bundled standalone Node reports 24.22.3 and can open an in-memory SQLite database. Check native messaging and Chrome extension identity.
- Record `codesign --verify --deep --strict` and `spctl --assess` results as observed, including any initial Gatekeeper prompt. Preserve quarantine and normal Mac security settings. Compute SHA-256 after final signing and packaging. Name the artifacts `pixflow-design-bridge-2.3.3-mac-arm64.dmg` and `pixflow-design-bridge-2.3.3-mac-x64.dmg`.
- Report native Intel hardware coverage separately from Rosetta coverage.

## Verify the native Bricks MCP adapter

Use local WordPress with the paired v2.3.3 plugins, supported Bricks and the real floating panel. On Apple Silicon run fresh natural briefs with Codex and Claude. Give them a full page brief and a complex brief with queries, dynamic data and conditions. Record provider, model and reasoning separately from each prompt.

- Confirm traces show the native Bricks ability being discovered and selected through Pixflow. Verify a structural write and a compound changeset, including moving or reordering elements, a shared style change and an in-canvas follower update. Verify native Undo restores the previous state and the saved frontend matches the canvas after a reload.
- Test recovery with unsaved canvas edits and a reload or interrupted connection. Confirm stale mutations are rejected and retries do not duplicate edits. Verify draft previews, pagination, conditional visibility and interactive behavior in the saved result.
- Confirm the adapter respects WordPress and Bricks role permissions. Where feasible, exercise the fallback with an unsupported Bricks version and record the tools selected. Keep Bricksforge integration testing separate so it cannot be mistaken for native Bricks MCP coverage.
- Inspect traces for failed commands, repeated discovery, unnecessary retries and file or database searches. Record meaningful timings and why any repeated calls were required. Fix reproducible issues in focused PRs and rerun the original natural brief.
- Smoke test GUI launch, provider detection, native messaging, pairing and normal update/migration with each final architecture. Verify that prior pairing, settings and chats survive. Restore the original local routing after testing.

## Additional checks for this refreshed candidate

- Use natural customer prompts, without prescribing bento, editorial or another layout. The selected styling mode, builder styles and saved DESIGN.md must supply the design direction. Verify component consistency and meaningful page coverage, not only successful saving or absence of overflow.
- Confirm the shared Plan card records the outline and progress. Test a fresh chat, reload during a run, recovery and Workspace-to-builder handoff. The same plan must remain attached to the same conversation; completed steps must reflect verified work.
- Verify follow-at-live-edge scrolling, scrollback while streaming, Jump to latest, queued-message clearance and opening saved chats at the end. Check narrow and wide panel sizes with the real Mac browser.
- Exercise `browser.preview` on the connected saved draft at desktop/mobile widths, including a supported disclosure interaction. Confirm the provider receives real screenshot images and that expiry, revocation and a different page are rejected. Do not publish a draft or obtain browser login cookies for verification.
- Exercise a large tool result through `pixflow_result_read`. Confirm exact-path reads work without shell-parsing provider transcripts, and that results cannot be reused after the originating tool session ends. Check that screenshot base64 data is not copied into durable chat history.
- Include one Gutenberg title/excerpt edit with native Undo and one batch of block-schema reads. Keep document and style revisions distinct.
- Test blank-site guidance in a disposable fixture: enough business context should produce a sensible scoped design; missing essential context should produce a focused question before building. Preserve the user's global styles and documents. Ordinary website images should not acquire unnecessary captions.
- Specifically inspect macOS launch paths, quoting, permissions, missing tools, repeated discovery and retries. Retest failures with the original natural prompt after fixing their cause. Do not count corrective user prompts as first-pass success.

## Ad hoc update feasibility

The v2.3.3 WordPress seamless updater is implemented for Windows. Treat Mac updating as a separate feasibility experiment using a disposable install and local fixture feed or existing test harness. A manual DMG replacement is a migration check and does not establish seamless updating.

1. Install v2.3.2 in an isolated Mac user/profile, keeping normal quarantine. Approve only the ordinary initial macOS user flow and record it. Start the Bridge from the GUI and pair to the local WordPress fixture. If the existing app has no way to start the required update mechanism, report that limitation and document any isolated experimental updater used.
2. Attempt a verified v2.3.3 update through that mechanism, including replacing the running app safely, restarting it and reconnecting the original WordPress tab. Check if macOS requests approval again, blocks first launch of the replacement, or changes Chrome native-host access or credential access. Confirm preserved pairing and settings, correct architecture, installed signature and version.
3. Run on arm64 and x64 environments and state whether x64 was native or Rosetta. Keep manual DMG installation coverage and seamless update coverage separate. Return logs and a verdict. If unattended updating fails, needs another approval prompt, cannot be tested on the intended path, or relies on weakening macOS security, keep seamless updating Windows-only until notarisation is available. Mac DMGs can still use the normal manual install path, subject to build and smoke checks.

Return both DMGs with SHA-256 and sizes, exact commit pair, signing/Gatekeeper evidence, Bricks MCP traces and results, and the updater verdict. The designated [Bridge v2.3.3 GitHub draft](https://github.com/pixflowdev/pixflow-design/releases/edit/untagged-08d0de5e62fba4ef1469) has release ID `446489613` and may still target the earlier candidate. Do not upload to it until its target is explicitly updated to the verified Core commit above. Old draft assets must be rebuilt from this source pair. Recheck the draft flag, target commit and GitHub asset digests. Publication and production feeds remain on hold.

## Mac acceptance in progress — 16 November 2026

Release remains on hold. The seven prerequisite PRs are merged and all reported checks passed. The exact source pair above built both ad hoc signed DMGs. Both passed read-only DMG verification, architecture checks, portable configuration, Node 24.22.3 plus SQLite, strict code signing and isolated production-ID Chrome registration. Gatekeeper rejected both, as expected for these unnotarised artifacts. Intel coverage is Rosetta only.

Do not publish or treat these initial artifacts as accepted: live testing found two Core issues, now in focused draft PRs:

- [Core #159](https://github.com/pixflowdev/pixflow-design/pull/159): Codex 0.169.0 / GPT-6.1 Sol Medium could not call even discovery or plan-read tools because its non-interactive approval policy rejected the unconfigured MCP tools. The original natural Bricks brief stopped without content changes after 21.55 seconds. The fix configures the known run-bound built-in tools only; external MCP and WordPress authorization remain unchanged. Live repeat pending.
- [Core #160](https://github.com/pixflowdev/pixflow-design/pull/160): Mac absolute run-file paths using `/var` aliases failed containment validation against `/private/var`. The unchanged candidate failed the existing absolute input test. The fix canonicalizes the parent and retains file containment; 18 structured-tool tests pass, including alias acceptance and symlink-escape rejection.

The combined focused suites pass 32 tests. Initial native adapter PHP checks pass. Full live Bricks, recovery, Plan, scrolling, preview and Gutenberg acceptance is still in progress; no claim of release readiness is made.

The running arm64 candidate returns HTTP 404 for `/api/pixflow/bridge-update`. The tray wires that endpoint only to its Windows updater. An intended-path unattended Mac update is therefore unavailable; keep seamless updating Windows-only. Manual migration and GUI smoke coverage must be reported separately.

The designated draft was still unpublished but targeted `7b6e70f9de07288ee7382f5281d9b6b2bf96ff23` at the first check. No assets were uploaded. After reviewed fixes, provide a refreshed exact Core/Pro pin and update the draft target before final rebuild/upload.

Initial artifact inventory (not final accepted release assets):

| Architecture | Bytes | SHA-256 |
| --- | ---: | --- |
| arm64 | 253769453 | `b23b6be86345dbd8474d0a623c26eb140b4241830a8366afb843a01d4bda589d` |
| x64 | 266961553 | `c1378aefcadc8e36421d53f77ced37e4a7cd07c87cfbe0e6e3a86cc406045120` |

Local evidence is under `outputs/mac233`; the validation build combining the two PRs uses separate output paths and is not a release-source approval. QA plugins were backed up and replaced with freshly built v2.3.3 ZIPs from the designated pair. Published feeds and live sites were not modified.
