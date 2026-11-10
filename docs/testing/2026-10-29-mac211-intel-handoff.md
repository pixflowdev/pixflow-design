# Extension-ready Mac v2.1.1 build-only handoff

29 October 2026. Authorized scope: build extension-ready Apple Silicon and Intel DMGs, verify build artifacts, then upload them and their checksums to the existing draft. Full Mac acceptance is already complete per the maintainer; do not repeat it. Do not publish releases, update websites/updater pointers, replace existing assets, or change customer data. Team changes remain excluded. This supersedes the ordinary/optional split and Intel continuation of earlier handoffs; retain earlier Apple Silicon evidence.

## Immutable source pair

- Core: `037a867b5f207ffcd754c3582c0d501f2c6c8691`, branch `codex/bridge211-runtime-version`, PR35. Includes the standalone launcher version correction to2.1.1.
- Private Pro: `697a8117000a9c06ea102304cd22df665f8e9610`, branch `codex/mac211-intel-pin`. Its manifest pins exactly the Core revision above; only the pin changed from ed901f3.
- Read this handoff from branch tip, but build those exact revisions in clean worktrees. Do not bypass pin checks or include Team branches. Preserve existing installed apps, fixture data and backups.

Fetch both repositories, create separate detached worktrees at the exact revisions, set PIXFLOW_DESIGN_PRO_ROOT and PIXFLOW_DESIGN_CORE_ROOT explicitly, and install frozen dependencies with Node24 and pnpm10.33.2. Run Pro setup:core. Follow root/tools/tools-pack AGENTS.md. Record clean status and both SHAs in the receipt.

## Build architecture — verify before packaging

The existing Mac wrapper selects architecture from process.arch. Its `--x64` argument imports an existing DMG; it is NOT a cross-compilation switch. Do not rename an arm64 DMG or simply pass --x64 expecting a new build.

Prefer an Intel Mac. On Apple Silicon, use an explicitly installed x64 Node24/toolchain under Rosetta, with x64 Node first on PATH for every child process. Confirm `node -p process.arch` reports `x64`; record host architecture separately. Do not silently install Rosetta or alter the user's normal toolchain without their approval. If no suitable toolchain is available, report the blocker rather than fabricate acceptance.

Use scripts/build-pixflow-design-bridge-mac-installers.mjs and its pixflowPackEnv identity/icon recipe. Build the native payload first and require it in BOTH release installers:

```sh
pnpm exec tsx tools/pixflow-design-bridge/native-messaging/store-build.ts hbnbiboohlelmngadeolikeejamjlbkh
export PIXFLOW_DESIGN_NATIVE_PAYLOAD_DIR="$PWD/.tmp/chrome-store/native"
```

This payload contains only host.mjs, install.mjs and config.json. Extension support is included in the main installer; users may continue using direct connections without installing the extension. Do not build a separate direct-only release or use prototype identity. Do not upload or change the already-submitted extension1.0.2 ZIP. Prepare icons using that recipe, then build a fresh portable artifact through the existing tools-pack entrypoint, under the verified x64 execution environment:

```sh
pnpm tools-pack mac build --to dmg --portable --namespace release-stable-pixflow-bridge-mac-x64 --app-version 2.1.1 --json
```

Carry the recipe's PIXFLOW_DESIGN_PACK_APP_ID, PRODUCT_NAME, PACKAGE_NAME, REGISTRY_ID, UPDATE_URL, BRIDGE_TRAY_MODE and icon variables into this command; do not use generic app identity. Retain the JSON report and use its actual dmgPath. Import that result with:

```sh
node scripts/build-pixflow-design-bridge-mac-installers.mjs --x64 /absolute/path/from/build/report.dmg
```

Required outputs: `pixflow-design-bridge-2.1.1-mac-arm64.dmg` and `pixflow-design-bridge-2.1.1-mac-x64.dmg`, both extension-ready. Build arm64 under arm64 Node and x64 under the verified x64 toolchain; use separate output roots/namespaces to avoid architecture contamination. The command above shows the x64 lane; use the matching arm64 namespace and environment for that lane. Verify Info.plist product/bundle identity and version2.1.1, inspect executable architectures using file/lipo (Electron, helper/Node executables, and native .node dependencies). Verify x86_64 payloads, no baked build-machine paths, and the expected permanent-ID native payload (not browser files or reviewer credentials). Use hdiutil verify and codesign --verify --deep --strict. Ad-hoc signing is expected; do not claim Developer ID or notarization.

## Build-only scope — no repeated Mac acceptance

The maintainer confirms Mac acceptance is complete and explicitly requests builds only. Reuse the existing acceptance receipts, keeping their actual architecture/runtime boundaries visible. Do not repeat the full installed-browser, reboot, steering or preservation suite. Do not claim newly observed acceptance for this build.

Perform artifact verification only: fresh build success; app identity/version2.1.1; actual arm64/x86_64 executables and native modules; compiled native host/config/install payload for the permanent extension ID; portable runtime paths; hdiutil verification; signature classification; file size and SHA256. Record existing acceptance references separately from these new build checks. If the build needs a product-code change, stop and report the impact rather than assuming old acceptance covers changed behavior.

## Draft upload only

Repository: pixflowdev/pixflow-design. Existing draft release ID **427088978**, tag **bridge-v2.1.1**. Verify it remains draft before any upload. Do not create a new release, move the tag, change its target, publish it, or replace the arm64/optional-native artifacts.

Upload one extension-ready DMG per architecture plus checksums and a redacted build receipt. Existing draft names may already contain older direct-only builds: preserve them, do not overwrite. If a canonical filename is occupied by different bytes, upload the new build under a source-qualified name such as pixflow-design-bridge-2.1.1-mac-arm64-037a867b-extension-ready.dmg (and x64 equivalent) and identify it as the intended release candidate. The coordinator will reconcile canonical names at promotion; do not publish both variants as customer choices. Use SHA256SUMS-mac-extension-ready-2.1.1.txt and mac-extension-ready-2.1.1-build.json for new receipts.

Compute SHA256 with shasum -a256 and byte count from the final file. Upload via GitHub release asset API or gh release upload after checking existing names. Do not use --clobber. If a same-name asset exists, compare hash/size and stop on differences; preserve existing archives. Verify uploaded size and GitHub digest, then independently download and hash the DMG. Record asset ID/name/bytes/SHA256 and draft:true in Git.

Commit the redacted report/checksum/upload receipt under docs/testing/evidence/mac211-intel/ on a dedicated codex/mac211-intel-acceptance branch based on this handoff branch; push and open a focused documentation PR. Do not commit DMG bytes or private Pro source to Core. Return report commit, PR URL, asset IDs, exact checksum and any testing limitation to the release coordinator.

## Already verified / remaining boundaries

Apple Silicon DMG ad45372f28b618d5bc2d411714676711f44b35aa8cbb711894d1f7ff1f85f6a6 retains its prior acceptance. Windows installer and plugin checks remain separate receipts. The corrected universal ZIP5b8766ded3a6feba14f329d8a4235793fe26b77623c4820ec43bf57c028f7ac5 passed isolated Debian install/build/CLI health/stop/restart and synthetic-data preservation. Linux desktop/login/native-browser/provider-auth were not tested. The final combined download/updater manifest still needs validation before any live promotion.
