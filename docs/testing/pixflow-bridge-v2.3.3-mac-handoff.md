# Pixflow Design Bridge v2.3.3 Mac handoff

Build the Apple Silicon and Intel release candidates and report back before publication. Use ad hoc signing for the Mac update experiment. Keep the published downloads, feed and live sites untouched. Return any runtime fixes in focused PRs before rebuilding the affected artifacts.

## Source

| Repository | Branch | Commit |
| --- | --- | --- |
| pixflowdev/pixflow-design | `codex/v233-core-candidate` | `7b6e70f9de07288ee7382f5281d9b6b2bf96ff23` |
| pixflowdev/pixflow-design-pro | `codex/v233-pro-candidate` | `17fbd37f28cc51eda86505ea2c30a358d818ee31` |

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

## Ad hoc update feasibility

The v2.3.3 WordPress seamless updater is implemented for Windows. Treat Mac updating as a separate feasibility experiment using a disposable install and local fixture feed or existing test harness. A manual DMG replacement is a migration check and does not establish seamless updating.

1. Install v2.3.2 in an isolated Mac user/profile, keeping normal quarantine. Approve only the ordinary initial macOS user flow and record it. Start the Bridge from the GUI and pair to the local WordPress fixture. If the existing app has no way to start the required update mechanism, report that limitation and document any isolated experimental updater used.
2. Attempt a verified v2.3.3 update through that mechanism, including replacing the running app safely, restarting it and reconnecting the original WordPress tab. Check if macOS requests approval again, blocks first launch of the replacement, or changes Chrome native-host access or credential access. Confirm preserved pairing and settings, correct architecture, installed signature and version.
3. Run on arm64 and x64 environments and state whether x64 was native or Rosetta. Keep manual DMG installation coverage and seamless update coverage separate. Return logs and a verdict. If unattended updating fails, needs another approval prompt, cannot be tested on the intended path, or relies on weakening macOS security, keep seamless updating Windows-only until notarisation is available. Mac DMGs can still use the normal manual install path, subject to build and smoke checks.

Return both DMGs with SHA-256 and sizes, exact commit pair, signing/Gatekeeper evidence, Bricks MCP traces and results, and the updater verdict. The designated [Bridge v2.3.3 GitHub draft](https://github.com/pixflowdev/pixflow-design/releases/edit/untagged-08d0de5e62fba4ef1469) has release ID `446489613` and targets the Core commit above. Use it for verified DMG assets if the source pair passes. Recheck the draft flag, target commit and GitHub asset digests. Publication and production feeds remain on hold.
