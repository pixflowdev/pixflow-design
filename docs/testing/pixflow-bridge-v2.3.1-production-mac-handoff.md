# Pixflow Design Bridge v2.3.1 production Mac build

Build both DMGs from this exact pair. The release is on hold. Upload validated production assets to the private GitHub draft for review.

- Core: `pixflowdev/pixflow-design`, branch `codex/v231-core-candidate`, revision `7de674745c7207b5320a96e7f8c311c4f6f620fb`. Includes Node 24.22.3 for Mac sidecars, Core #133 pairing and Workspace admission, and the Bridge 2.3.1 stamp.
- Pro: `pixflowdev/pixflow-design-pro`, branch `codex/v231-pro-candidate`, revision `a96bca545e8655c2a55ae107dadcfcf7616879df`. Includes Pro #73, the standalone CSS fix from the published baseline, and the exact Core pin.

Read the repository instructions and the adjacent [original Mac handoff](pixflow-bridge-v2.3.1-mac-handoff.md) for the build command, app identity and detailed test procedure. The pins above already incorporate the version and CSS adjustments. Set `PIXFLOW_DESIGN_PRO_ROOT` to the pinned Pro checkout and use the normal clean-source check. Use separate worktrees and frozen dependencies for arm64 and x64. On Apple Silicon, use native Node for arm64 and x64 Node in an x64 shell under Rosetta for Intel. Check `process.arch` before packaging. Build the desktop dependency before the packaged launcher. The original handoff describes passing signing flags to the installer script in the isolated build checkout. Record any signing-only script adjustment.

Use Developer ID Application signing and the configured notary profile. If those credentials are unavailable, report the blocker before uploading production assets. The ad hoc signed QA DMGs returned earlier failed Gatekeeper assessment.

Mount each final DMG read-only. Verify its integrity, version 2.3.1, bundle ID `dev.pixflow.bridge`, target architecture, strict signature, Gatekeeper acceptance and notarisation. Confirm the packaged config selects `open-design/bin/node`, its binary reports Node 24.22.3, and its architecture matches the app and SQLite binding. Run the in-memory SQLite check. Record Intel execution under Rosetta separately from native Intel hardware coverage.

On Apple Silicon, test an upgrade from 2.3.0 with an existing pairing, then verify the installed Bridge, Chrome connection and provider preferences. Use the final paired WordPress 2.3.1 plugins for live Codex and Claude checks. Verify Claude authentication, models and usage, and exercise Workspace-to-Bricks draft creation and native save plus translation stop, reload and resume. Use the earlier receipt as baseline and record the final results.

Upload the two production DMGs to the [private Bridge v2.3.1 draft](https://github.com/pixflowdev/pixflow-design/releases/tag/untagged-c31e767d9f4f6f34f647), release ID `444589251`, tag `bridge-v2.3.1`. Confirm it is still a draft targeting the Core revision above. Upload:

- `pixflow-design-bridge-2.3.1-mac-arm64.dmg`
- `pixflow-design-bridge-2.3.1-mac-x64.dmg`
- `SHA256SUMS-mac.txt`
- `validation-receipt-mac.md`

Compute the hashes after signing and stapling. If a filename already exists, compare its hash before making changes. Report asset IDs and verified downloaded hashes. Leave the draft unpublished and updater pointers on hold.
