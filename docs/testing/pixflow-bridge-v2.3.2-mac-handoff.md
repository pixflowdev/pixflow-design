# Pixflow Design Bridge v2.3.2 Mac release candidate

Publication is on hold. Build and validate Apple Silicon and Intel DMGs; do not change public downloads, tags or updater feeds. The owner explicitly authorised ad hoc signing without notarisation for v2.3.2 on 14 November 2026. Report Gatekeeper limitations accurately; do not describe these builds as notarised.

## Exact source pair

- Core: `pixflowdev/pixflow-design`, branch `codex/v232-core-candidate`, commit `21804a5928451edeef6f1908affeb85191035f9c`.
- Pro: `pixflowdev/pixflow-design-pro`, branch `codex/v232-pro-candidate`, commit `8c903c8f340bc853a7e75f5ad9f39026bcaa1022`.
- Pro's `pixflow-pro.json` pins that exact Core revision. No dirty-source override is permitted for runtime changes. Do not build from this documentation branch.
- Both plugins and Bridge are stamped 2.3.2. The source includes the merged v2.3.2 builder reliability and Bricksforge work, and preserves the server-to-server pairing correction from Core #133. Do not add Origin or Sec-Fetch-Site to the pairing exchange: WordPress deliberately rejects them.

Read both repositories' AGENTS.md, Core tools/AGENTS.md and tools/pack/AGENTS.md. Use isolated, short-path worktrees with Node 24 and pnpm 10.33.2. Install frozen dependencies separately in both checkouts. Set PIXFLOW_DESIGN_CORE_ROOT for Pro and PIXFLOW_DESIGN_PRO_ROOT for Core explicitly. Install Pro's locked Composer dependencies with no development dependencies. Do not update dependencies during release packaging.

## Build both architectures

Use a separate architecture-matched environment for each build. On Apple Silicon, use native arm64 Node for arm64, and x64 Node under Rosetta for x64. Confirm process.arch before installing native dependencies. Do not reuse native node_modules between architectures.

From the pinned Core checkout:

```sh
pnpm exec tsx tools/pixflow-design-bridge/native-messaging/store-build.ts hbnbiboohlelmngadeolikeejamjlbkh
export PIXFLOW_DESIGN_NATIVE_PAYLOAD_DIR="$PWD/.tmp/chrome-store/native"
pnpm bridge:mac
```

Use the maintained installer script for Pixflow identity and icons. Its tools-pack mac build invocation currently lacks `--portable`: add that packaging-only flag in the isolated build copy, retain the exact runtime revisions, and record the diff in the receipt. Use ad hoc signing, not Developer ID/notarisation flags. If clean-source validation rejects this packaging-only adjustment, report it to the coordinator rather than disabling verification or changing runtime source silently.

Verify that the resulting app is portable and contains no build-machine runtime paths. Confirm product Pixflow Design Bridge, bundle ID dev.pixflow.bridge, version 2.3.2 and the production native host dev.pixflow.bridge. Keep the permanent extension identity above.

## Package verification

For each final DMG:

1. Run hdiutil verify and mount read-only.
2. Check bundle version/identity and architecture of the executable, Electron framework, standalone Node and better-sqlite3 binding.
3. Confirm open-design-config.json selects open-design/bin/node. Verify the bundled Node reports 24.22.3, matches the target architecture, and opens an in-memory SQLite database with the packaged binding. Electron's embedded Node is separate.
4. Run codesign --verify --deep --strict --verbose=2 and spctl --assess --type execute --verbose=4. Record the actual Gatekeeper outcome; ad hoc signing may be rejected. No notarisation/stapling claim.
5. Verify Contents/Resources/open-design/native-transport exists and the installed app registers the production extension's native host.
6. Compute SHA-256 only after final signing and packaging. Preserve logs and source revisions.

## Live Apple Silicon acceptance

Use a disposable local WordPress site and the matching v2.3.2 Core/Pro plugins. Build them from the pinned pair if coordinator ZIPs are not yet available; verify versions and record hashes. Never use customer content as a test fixture.

- Upgrade an isolated v2.3.1 installation; confirm existing pairing, conversations and provider preferences survive. Test fresh pairing separately. Test direct Chrome connection and production native messaging, restoring the previous routing afterwards.
- Run natural customer prompts with Codex and Claude, without coaching tool names. Confirm model/auth/usage/runtime selection agree, first reply and follow-ups work, Stop and reload recovery work.
- Exercise Workspace-to-Bricks draft creation, native save, reload and a subsequent targeted edit. Verify the saved frontend. Inspect failed commands, repeated discovery, retries and wrong-page edits.
- Verify saved draft previews, query pagination, dynamic data and an interactive element. Cover the new discovery guidance and readable tool output.
- With Bricksforge 4.1+ installed locally, keep its public MCP switch off and test official Pixflow session tools. Confirm native role controls and disabled submissions remain enforced. Test a form and an animation/interactive workflow, inspect the rendered result and restore fixtures. Do not send external test email or webhooks without an explicitly controlled destination.
- Run PHP bridge-pairing tests and daemon pairing/central-entitlement tests. Origin must remain absent on the exchange; PKCE, expiry, replay, site identity and entitlement checks must pass.
- Record Intel native hardware coverage separately from Rosetta. If no Intel Mac is available, state that limitation explicitly; do not mark native Intel acceptance passed.

## Return and release hold

Return `pixflow-design-bridge-2.3.2-mac-arm64.dmg`, `pixflow-design-bridge-2.3.2-mac-x64.dmg`, `SHA256SUMS-mac.txt` and `validation-receipt-mac.md`. Include exact pins, architecture, macOS version, signing status, checks, live results, known limitations and any packaging-only patch.

Stage locally or upload only to a coordinator-confirmed unpublished v2.3.2 GitHub draft. Do not reuse v2.3.1 releases or replace their assets. No draft ID is assigned in this handoff. Report artifact location and hashes to the coordinator; publication remains on hold.

Before public release the coordinator must finish Windows install/upgrade acceptance, paired plugin upgrade/packaging checks, publish and verify the 18 exact language-pack hashes, and align website changelogs. Final order remains language packs, Bridge, then paired Core/Pro and website notes after explicit approval.
