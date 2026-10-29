# Intel Mac v2.1.1 build, acceptance and draft upload

29 October 2026. Authorized scope: build and test the missing ordinary Intel DMG, then upload it and its checksum to the existing draft. Do not publish releases, update websites/updater pointers, replace existing assets, or change customer data. Team changes remain excluded. This supersedes only the Intel continuation of earlier handoffs; retain earlier Apple Silicon evidence.

## Immutable source pair

- Core: `037a867b5f207ffcd754c3582c0d501f2c6c8691`, branch `codex/bridge211-runtime-version`, PR35. Includes the standalone launcher version correction to2.1.1.
- Private Pro: `697a8117000a9c06ea102304cd22df665f8e9610`, branch `codex/mac211-intel-pin`. Its manifest pins exactly the Core revision above; only the pin changed from ed901f3.
- Read this handoff from branch tip, but build those exact revisions in clean worktrees. Do not bypass pin checks or include Team branches. Preserve existing installed apps, fixture data and backups.

Fetch both repositories, create separate detached worktrees at the exact revisions, set PIXFLOW_DESIGN_PRO_ROOT and PIXFLOW_DESIGN_CORE_ROOT explicitly, and install frozen dependencies with Node24 and pnpm10.33.2. Run Pro setup:core. Follow root/tools/tools-pack AGENTS.md. Record clean status and both SHAs in the receipt.

## Build architecture — verify before packaging

The existing Mac wrapper selects architecture from process.arch. Its `--x64` argument imports an existing DMG; it is NOT a cross-compilation switch. Do not rename an arm64 DMG or simply pass --x64 expecting a new build.

Prefer an Intel Mac. On Apple Silicon, use an explicitly installed x64 Node24/toolchain under Rosetta, with x64 Node first on PATH for every child process. Confirm `node -p process.arch` reports `x64`; record host architecture separately. Do not silently install Rosetta or alter the user's normal toolchain without their approval. If no suitable toolchain is available, report the blocker rather than fabricate acceptance.

Use scripts/build-pixflow-design-bridge-mac-installers.mjs and its pixflowPackEnv identity/icon recipe. Keep ordinary release native-extension payload unset. Prepare icons using that recipe, then build a fresh portable artifact through the existing tools-pack entrypoint, under the verified x64 execution environment:

```sh
pnpm tools-pack mac build --to dmg --portable --namespace release-stable-pixflow-bridge-mac-x64 --app-version 2.1.1 --json
```

Carry the recipe's PIXFLOW_DESIGN_PACK_APP_ID, PRODUCT_NAME, PACKAGE_NAME, REGISTRY_ID, UPDATE_URL, BRIDGE_TRAY_MODE and icon variables into this command; do not use generic app identity. Retain the JSON report and use its actual dmgPath. Import that result with:

```sh
node scripts/build-pixflow-design-bridge-mac-installers.mjs --x64 /absolute/path/from/build/report.dmg
```

Expected output: `dist/bridge-release/packages/pixflow-design-bridge-2.1.1-mac-x64.dmg`. Verify Info.plist product/bundle identity and version2.1.1, inspect executable architectures using file/lipo (Electron, helper/Node executables, and native .node dependencies). Verify x86_64 payloads, no baked build-machine paths, and no optional extension-review payload. Use hdiutil verify and codesign --verify --deep --strict. Ad-hoc signing is expected; do not claim Developer ID or notarization.

## Acceptance before upload

Run Core guard/typecheck and release-version-consistency/packaging regression tests; Pro guard/typecheck/test:build with the exact pin. Stop and report failures. Windows already validated the launcher regression red/green and universal ZIP; this does not replace Mac install checks.

Use an isolated install path, runtime data and WordPress fixture with legitimate Pro access. Record private before/after hashes/counts for original chats, settings, notes, content and Bridge data. Never erase or migrate the user's normal Bridge data to make a test pass. Keep credentials and customer content out of Git and draft assets.

1. Mount and install the exact DMG; launch installed app, verify2.1.1 health and correct site binding. Verify direct Bridge connection with extension disabled in the isolated profile.
2. Floating panel and Workspace: synthetic read-only CLI request, streaming, steering, reload recovery, chat switching and cross-panel continuity. Confirm no duplicate sends or stale Working state. Preserve original drafts/settings.
3. Upgrade from the preserved previous installed version, repair/reinstall, tray Restart, quit/relaunch, and relocation if supported. Verify data preservation and automatic site reconnection once Bridge is running. Record actual login/reboot behavior; do not infer OS auto-launch.
4. Inspect native module loading and process architecture. On Apple Silicon, report **x64 under Rosetta**, not native Intel hardware acceptance. If native Intel hardware is unavailable, explicitly mark that limitation; never describe native Intel tests as passed.
5. Restore fixture permissions/settings and original app state. Save redacted results with observed pass/fail/blocked, architecture, macOS/Node versions, build commands, source SHAs, artifact bytes/hash, signing status and preservation summary.

## Draft upload only

Repository: pixflowdev/pixflow-design. Existing draft release ID **427088978**, tag **bridge-v2.1.1**. Verify it remains draft before any upload. Do not create a new release, move the tag, change its target, publish it, or replace the arm64/optional-native artifacts.

Upload only:
- pixflow-design-bridge-2.1.1-mac-x64.dmg
- SHA256SUMS-mac-x64-2.1.1.txt
- mac-x64-2.1.1-build-acceptance.json (redacted)

Compute SHA256 with shasum -a256 and byte count from the final file. Upload via GitHub release asset API or gh release upload after checking existing names. Do not use --clobber. If a same-name asset exists, compare hash/size and stop on differences; preserve existing archives. Verify uploaded size and GitHub digest, then independently download and hash the DMG. Record asset ID/name/bytes/SHA256 and draft:true in Git.

Commit the redacted report/checksum/upload receipt under docs/testing/evidence/mac211-intel/ on a dedicated codex/mac211-intel-acceptance branch based on this handoff branch; push and open a focused documentation PR. Do not commit DMG bytes or private Pro source to Core. Return report commit, PR URL, asset IDs, exact checksum and any testing limitation to the release coordinator.

## Already verified / remaining boundaries

Apple Silicon DMG ad45372f28b618d5bc2d411714676711f44b35aa8cbb711894d1f7ff1f85f6a6 retains its prior acceptance. Windows installer and plugin checks remain separate receipts. The corrected universal ZIP5b8766ded3a6feba14f329d8a4235793fe26b77623c4820ec43bf57c028f7ac5 passed isolated Debian install/build/CLI health/stop/restart and synthetic-data preservation. Linux desktop/login/native-browser/provider-auth were not tested. The final combined download/updater manifest still needs validation before any live promotion.
