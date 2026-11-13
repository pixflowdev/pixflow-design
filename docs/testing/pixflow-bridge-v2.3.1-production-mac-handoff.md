# Pixflow Design Bridge v2.3.1 production Mac build

## Mac build return

The verified Mac DMGs are attached to the [unpublished Bridge v2.3.1 draft](https://github.com/pixflowdev/pixflow-design/releases/tag/untagged-c31e767d9f4f6f34f647). Use a GitHub account with draft access to download them.

- [Apple Silicon DMG](https://github.com/pixflowdev/pixflow-design/releases/download/untagged-c31e767d9f4f6f34f647/pixflow-design-bridge-2.3.1-mac-arm64.dmg) ([authenticated API download](https://api.github.com/repos/pixflowdev/pixflow-design/releases/assets/744754897), asset `744754897`)
- [Intel DMG](https://github.com/pixflowdev/pixflow-design/releases/download/untagged-c31e767d9f4f6f34f647/pixflow-design-bridge-2.3.1-mac-x64.dmg) ([authenticated API download](https://api.github.com/repos/pixflowdev/pixflow-design/releases/assets/744757523), asset `744757523`)
- [SHA-256 manifest](https://github.com/pixflowdev/pixflow-design/releases/download/untagged-c31e767d9f4f6f34f647/SHA256SUMS-mac.txt) (asset `744760125`)
- [Validation receipt](https://github.com/pixflowdev/pixflow-design/releases/download/untagged-c31e767d9f4f6f34f647/validation-receipt-mac.md) (asset `744760686`)

Both DMGs were downloaded from GitHub and verified against their local SHA-256 hashes. The API links require GitHub authentication and an `Accept: application/octet-stream` header.

Both architectures built from the exact commits below, with frozen dependencies and the normal clean-source check. The local DMGs passed image, bundle, architecture, strict signature, Node 24.22.3 and SQLite checks. Both launched as Bridge 2.3.1, including the Intel build under Rosetta. Apple Silicon also passed direct and packaged native host connectivity. The previous Bridge was restored. The matched WordPress draft ZIP hashes and versions were verified.

The Mac has no valid Developer ID Application signing identity. Both DMGs are ad hoc signed. Gatekeeper rejected both apps during assessment, so macOS may show a warning or block a quarantined download. The owner authorised these ad hoc signed DMGs for v2.3.1 and approved uploading them to draft 444589251 without notarisation. Final browser upgrade and live provider acceptance are still open. See the [validation receipt](pixflow-bridge-v2.3.1-production-mac-validation.md) for test scope and local validation checksums.

Build both DMGs from this exact pair. The release is on hold. Upload validated production assets to the private GitHub draft for review.

- Core: `pixflowdev/pixflow-design`, branch `codex/v231-core-candidate`, revision `7de674745c7207b5320a96e7f8c311c4f6f620fb`. Includes Node 24.22.3 for Mac sidecars, Core #133 pairing and Workspace admission, and the Bridge 2.3.1 stamp.
- Pro: `pixflowdev/pixflow-design-pro`, branch `codex/v231-pro-candidate`, revision `a96bca545e8655c2a55ae107dadcfcf7616879df`. Includes Pro #73, the standalone CSS fix from the published baseline, and the exact Core pin.

Read the repository instructions and the adjacent [original Mac handoff](pixflow-bridge-v2.3.1-mac-handoff.md) for the build command, app identity and detailed test procedure. The pins above already incorporate the version and CSS adjustments. Set `PIXFLOW_DESIGN_PRO_ROOT` to the pinned Pro checkout and use the normal clean-source check. Use separate worktrees and frozen dependencies for arm64 and x64. On Apple Silicon, use native Node for arm64 and x64 Node in an x64 shell under Rosetta for Intel. Check `process.arch` before packaging. Build the desktop dependency before the packaged launcher. The original handoff describes passing signing flags to the installer script in the isolated build checkout. Record any signing-only script adjustment.

For each architecture, stage the production Chrome native-messaging payload from the pinned Core checkout before packaging:

```sh
pnpm exec tsx tools/pixflow-design-bridge/native-messaging/store-build.ts hbnbiboohlelmngadeolikeejamjlbkh
export PIXFLOW_DESIGN_NATIVE_PAYLOAD_DIR="$PWD/.tmp/chrome-store/native"
```

Verify the mounted app includes `Contents/Resources/open-design/native-transport` and the installed app registers the `dev.pixflow.bridge` native host for the production extension. Check Chrome with the native connection enabled and direct connection with the extension disabled.

Use ad hoc signing for this release. Record the strict signature verification and Gatekeeper assessment in the receipt. The exact-pin Mac builds above already contain the production native-messaging payload.

Mount each final DMG read-only. Verify its integrity, version 2.3.1, bundle ID `dev.pixflow.bridge`, target architecture, strict signature and the observed Gatekeeper result. Confirm the packaged config selects `open-design/bin/node`, its binary reports Node 24.22.3, and its architecture matches the app and SQLite binding. Run the in-memory SQLite check. Record Intel execution under Rosetta separately from native Intel hardware coverage.

The matching WordPress ZIPs are on the [Core v2.3.1 draft](https://github.com/pixflowdev/pixflow-design/releases/tag/untagged-69eddf8e6f1542a308f1) and [Pro v2.3.1 draft](https://github.com/pixflowdev/pixflow-design-pro/releases/tag/untagged-a0e0354d4ec6366e0fa2). Check their supplied SHA-256 sums before installing them.

On Apple Silicon, test an upgrade from 2.3.0 with an existing pairing, then verify the installed Bridge, Chrome connection and provider preferences. Use the final paired WordPress 2.3.1 plugins for live Codex and Claude checks. Verify Claude authentication, models and usage, and exercise Workspace-to-Bricks draft creation and native save plus translation stop, reload and resume. Use the earlier receipt as baseline and record the final results.

Upload the two production DMGs to the [private Bridge v2.3.1 draft](https://github.com/pixflowdev/pixflow-design/releases/tag/untagged-c31e767d9f4f6f34f647), release ID `444589251`, tag `bridge-v2.3.1`. Confirm it is still a draft targeting the Core revision above. Upload:

- `pixflow-design-bridge-2.3.1-mac-arm64.dmg`
- `pixflow-design-bridge-2.3.1-mac-x64.dmg`
- `SHA256SUMS-mac.txt`
- `validation-receipt-mac.md`

Compute the hashes after signing. If a filename already exists, compare its hash before making changes. Report asset IDs and verified downloaded hashes. Leave the draft unpublished and updater pointers on hold.
