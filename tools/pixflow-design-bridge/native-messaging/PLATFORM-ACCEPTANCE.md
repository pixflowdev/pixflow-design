# macOS/Linux native-messaging acceptance handoff

Prepared 28 October 2026. Review-only; do not publish installers, change updater feeds, or overwrite existing user profiles.

## Candidate and identity

Fetch `codex/chrome-store-preparation` from https://github.com/pixflowdev/pixflow-design and record the exact checked-out commit. See [RELEASE-HANDOFF.md](RELEASE-HANDOFF.md) for clone/build instructions, candidate boundaries and all remaining v2.1.1 checks. No local Windows ZIP is required.

Extension 1.0.1: hbnbiboohlelmngadeolikeejamjlbkh
Native host: dev.pixflow.bridge
Only allowed extension origin: chrome-extension://hbnbiboohlelmngadeolikeejamjlbkh/
Bridge endpoint: http://127.0.0.1:7456
Reviewer WordPress: https://docs.pixflow.dev/extension-review/wp-admin/
Guide: https://docs.pixflow.dev/extension-review/reviewer-guide
Request dedicated reviewer credentials privately; never put them in Git, screenshots, archives or receipts.

Build the native payload with:

    pnpm exec tsx tools/pixflow-design-bridge/native-messaging/store-build.ts hbnbiboohlelmngadeolikeejamjlbkh

Set PIXFLOW_DESIGN_NATIVE_PAYLOAD_DIR to the absolute .tmp/chrome-store/native directory when building an isolated candidate using the existing tools-pack platform workflow. Use the compatible explicitly pinned Pro checkout only where required. Do not include browser profiles, private receipts, or the parent .tmp folder.

## Implemented lifecycle (awaiting actual platform acceptance)

The packaged Bridge tray registers the optional native host asynchronously on each macOS/Linux launch. Headless Linux registers when the explicit optional payload exists. Missing payload or registration failure leaves direct startup available; helper execution is bounded to ten seconds. Windows keeps its existing installer hooks.

POSIX registration copies host.mjs/config.json into the current user's persistent Pixflow Design Bridge/native-messaging directory (Library/Application Support on macOS, .local/share on Linux), leaving signed bundles and AppImage mounts unchanged. The launcher uses the installed macOS executable or persistent APPIMAGE path. Launches from mounted DMGs, App Translocation or an AppImage mount without a persistent executable are refused. Reopening from the installed location retries registration.

Repair is serialized, abandoned locks are recovered, and another live installation's registration is not overwritten. The install.mjs uninstall command removes only its owned Chrome manifest; it retains runtime files and all user data/permissions. Dragging an application to Trash or deleting an AppImage does not execute an uninstall hook; residual per-user registration is inert when the executable is gone and the next installation can repair it. Do not claim automatic OS-trash cleanup.

Validated here: 45 native tests, four packaged startup tests, three packaging tests, native typecheck, full repository typecheck/guard and packaged build. POSIX filesystem/CLI tests on Windows simulate the platform selector; these are not actual macOS/Linux installer runs.

## Clean-machine matrix

Run on actual macOS arm64 and x64, and supported Linux x64 desktop with Google Chrome. Use disposable OS accounts/VMs and synthetic data. Record OS, architecture, Chrome and Bridge versions, candidate commit and installer SHA256.

1. Install without a system Node dependency. Launch the installed Bridge. Verify native files and permanent ID; missing extension must not prevent direct Bridge operation.
2. Check user manifest: macOS ~/Library/Application Support/Google/Chrome/NativeMessagingHosts/dev.pixflow.bridge.json; Linux ~/.config/google-chrome/NativeMessagingHosts/dev.pixflow.bridge.json. Confirm stdio, exact allowed_origins, executable launcher mode and persistent absolute paths with spaces supported.
3. Quit/reopen Bridge and Chrome; reboot once. Verify registration survives and still references the installed runtime, not build/DMG/AppImage mount directories.
4. Sign into the synthetic reviewer site and pair using normal authenticated WordPress flow. Approve site permission using Chrome UI. Confirm automatic native connection after reload and cross-page navigation without reopening the popup.
5. Make a text-only synthetic CLI run, observe multiple streamed chunks, steer, navigate and reattach. Verify one run only and final persisted response. Do not edit public content or reuse customer conversations.
6. Revoke site permission during a pending read: connection closes, no request replay and future requests denied. Re-approve using Chrome UI; reconnect successfully. Check wrong origin, missing/expired session and revoked pairing are denied by real authorization.
7. Disable extension; direct Bridge health/pairing/run still work with ordinary browser local-network approval. Retain direct connection preference across restart.
8. Upgrade/repair candidate. Hash synthetic chats/settings before and after; confirm unchanged. Verify another installation's registration is not overwritten.
9. Uninstall only the test installation. Remove only its matching native registration; preserve chats/settings and Chrome site permission. Reinstall and recover normally.

## Evidence and reporting

Return redacted JSON/Markdown receipt with each check pass/fail/not run, platform versions, hashes, timings and screenshots. Include actual installer logs and native error messages without tokens, prompts containing personal data, or session credentials. Contract tests run on Windows are not macOS/Linux installation evidence.

Do not upload these candidates over existing release assets. Keep review artifacts separate and retain the current direct-only maintenance release path. No platform should be advertised as extension-ready until its actual installed checks pass.
