# Pixflow Design Bridge v2.3.1 Mac handoff

Build signed and notarised stable DMGs for Apple Silicon and Intel. Run the live browser acceptance checks on Apple Silicon. Publication is on hold.

This document and the adjacent Pro patch are on the private Core branch codex/mac-231-handoff. Use the pinned runtime revisions below for the builds.

## Source and release inputs

- Core, pixflowdev/pixflow-design at 500a49bef33238e7cc56e9b4036d8d2ffc8af708. Includes #127, #129, #130, #131 and #132, which bundles Node 24.22.3 for both Mac architectures.
- Pro, pixflowdev/pixflow-design-pro at feafb4754eeb685c8720ced67656288804773902. Includes the parallel translation work from Pro #70 and release notes from #71–72.
- Use separate worktrees for each architecture. If release commits become available, confirm that they contain this code and record the exact new revisions. Match Core's module API 14. The Pro manifest on main still pins an older Core revision.
- For a local candidate built from the revisions above, set PIXFLOW_DESIGN_BRIDGE_VERSION to 2.3.1 in the Core checkout's pixflow-design.php and apply pro-standalone-css.patch to Pro. The Pro patch scopes four CSS selectors required for the standalone Next build and is the same build adjustment used for Windows. Record the version stamp and Pro patch. For final release provenance, coordinate with the release chat to use reviewed version and pin updates and account for the Pro CSS adjustment. Confirm the final Core revision includes #132.
- Use the existing Developer ID Application identity and Apple notary keychain profile. Keep credentials in the configured keychain. The bundle ID is dev.pixflow.bridge and the app name is Pixflow Design Bridge.

## Build each architecture

Use native arm64 Node 24 for Apple Silicon. For Intel, use x64 Node 24 and an x64 shell under Rosetta on the Apple Silicon Mac, or an Intel builder if available. Check `node -p 'process.arch'` before dependency installation and again before packaging. The packager selects architecture from Node, including the SQLite prebuild. Use fresh architecture-specific node_modules and packaging output. Use pnpm 10.33.2 and the frozen lockfiles in both checkouts.

Set PIXFLOW_DESIGN_PRO_ROOT to the matching Pro checkout. For the isolated candidate above, use PIXFLOW_DESIGN_ALLOW_CORE_WORKTREE=1 to acknowledge the version stamp and older Pro pin. Use the exact pinned pair for release once available.

Use scripts/build-pixflow-design-bridge-mac-installers.mjs for product identity, icons and namespace. Its build path does not currently pass signing flags. In the isolated build worktree, add `--portable`, `--signed` and `--notarize` to its tools-pack mac build argument list. Set APPLE_NOTARY_KEYCHAIN_PROFILE to the configured profile and run `pnpm bridge:mac` from Core in each architecture's environment. Record the local packaging adjustment. This writes local release files and metadata under dist/bridge-release only. Keep the architecture output and logs for each run.

Verify each DMG with hdiutil verify. Mount it read-only, inspect CFBundleIdentifier and CFBundleShortVersionString, and verify architecture of the main executable, Electron framework, bundled Node, and better-sqlite3 native binding with file or lipo. Verify the app using `codesign --verify --deep --strict --verbose=2`, `spctl --assess --type execute --verbose=4` and `xcrun stapler validate`. Submit and staple the final DMG using the configured notary profile if the build only notarised the app. Validate the DMG staple and check the image again. Compute SHA-256 after the last change to each DMG. Record the macOS version, build architecture, signing identity, notary acceptance and verification results.

## Verify the packaged Node runtime

Both v2.3.0 DMGs contain Electron 44.7.0, which embeds Node 24.21.0. Neither contains a standalone Node executable. For v2.3.1 Core #132 selects the official Node 24.22.3 binary for the daemon and web processes. Electron remains the tray runtime and retains its own embedded Node.

Before signing, confirm the build stages the correct Mach-O Node binary and its licence. In each final mounted DMG, confirm Contents/Resources/open-design-config.json selects open-design/bin/node. Check that binary's architecture with lipo, verify its signature with codesign --verify --strict, and record its --version output where executable. Check the signature and notarisation of the whole app and DMG after bundling Node. Do not substitute the build machine's Node version.

On Apple Silicon, verify the installed app's daemon and web processes both run the bundled Node 24.22.3 executable. Test that the packaged better-sqlite3 binding opens an in-memory database under that Node, and confirm the actual Bridge starts and serves Chrome requests. For Intel, verify the signed x86_64 package contents. A Rosetta launch can verify the Node version and SQLite load under translation. Record any Rosetta result separately from native Intel acceptance.

## Apple Silicon acceptance

Use the signed arm64 DMG on the Mac and a disposable WordPress test site with Bricks and the matched Core and Pro candidates. Record the actual plugin versions. Upgrade from v2.3.0 using a test profile and confirm pairing and provider preferences persist. Launch the packaged app and check that Chrome connects and reports 2.3.1.

1. With standalone Claude and its Desktop runtime both present, rescan and check the selected path and version. The configured CLI wins, then standalone, then Desktop. Verify authentication, live model options, usage and a real reply agree with that runtime. Use the existing login. Check that the normal sign-in action targets the same CLI if authentication is needed.
2. For Codex and Claude separately, ask Workspace to create a named Bricks draft, add one unique heading and save it as a draft. Verify discovery, handoff, correct editor, native save and persistence after reload. If Chrome blocks the popup, record whether Open editor works. Review for HTML 403s or duplicate drafts. WordPress authorization must still apply.
3. With each provider, translate two disposable pages into two languages. Check that independent jobs overlap, shared text stays consistent and output respects the selected publication preference. Stop during a run, reload, resume and check for missing or duplicate results. Note the actual concurrency observed. Use a host that reproduces the Origin requirement only if an authorised test host is available. Ordinary local WordPress confirms the flow but may not reproduce the original hosting rule.
4. Restore the previous test routing and record any outstanding failures. Windows PowerShell and Windows Node bundling are covered by the Windows checks. Intel receives the build, architecture, signature and notarisation checks above. Mark native Intel runtime acceptance unavailable. If you run under Rosetta, report it separately as translated execution.

## Return to the release chat

Stage the files privately for review. The Windows release coordinator's intake folder is D:/Pixflow/work/release-231-preparation/mac/incoming (transfer there via the established private handoff, or provide an accessible private location if the Mac cannot see that path).

- pixflow-design-bridge-2.3.1-mac-arm64.dmg
- pixflow-design-bridge-2.3.1-mac-x64.dmg
- SHA256SUMS.txt and a validation receipt with the revisions, any patches, verification outputs, test results and remaining blockers.

Keep GitHub releases, public downloads and updater pointers on hold until explicit publication approval.
