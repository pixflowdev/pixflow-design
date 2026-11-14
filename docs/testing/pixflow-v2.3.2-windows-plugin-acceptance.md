# v2.3.2 Windows and WordPress package acceptance

Publication remains on hold. These checks did not change customer installations, live packages or updater pointers.

## Candidate inputs

- Core: `21804a5928451edeef6f1908affeb85191035f9c`.
- Pro: `8c903c8f340bc853a7e75f5ad9f39026bcaa1022`, pins the Core revision above.
- Windows installer SHA-256: `471ab019031d843802531cb2128914d97068c1ea90abea811851877365f68a3a`.
- Core ZIP SHA-256: `9be4f9685896587c8b9b1414864a7de292e0267ad4a58a05d963c1ae0e5081f4`.
- Pro ZIP SHA-256: `82276688a821e5871f30a46d0aebd08844869e9376ae8d126b16b20c58d866ae`.

## Windows installer — passed

[Windows acceptance run](https://github.com/pixflowdev/pixflow-design/actions/runs/43651634340), Windows Server 2025 runner. Test source: branch `codex/windows-2.3.2-acceptance`, commit `d3a8b9a982ba97d46161b52ee6f8848f0d78eaa5`.

- Fresh v2.3.2 install, executable/version and uninstall registry verification.
- Chrome native-host manifest registration and executable existence.
- Installed Bridge owns its listener and reports healthy at v2.3.2.
- Uninstall, install published v2.3.1, verify health, upgrade to v2.3.2 and verify health again.
- Existing namespace data marker remains byte-identical.
- Packaged Node reports v24.22.3; unpacked candidate passes native SQLite in-memory query.
- Companion launcher payload build completed successfully.

Receipt artifact: `windows-2.3.2-acceptance` (14136750199). The first runner attempt could not read the unpublished release with a read-only token. Restoring the draft-read permission required by GitHub fixed the test setup; no installer change was required.

## WordPress packages — passed

Disposable local WordPress 7.1 / PHP 8.3 installations used the exact release ZIPs:

- Fresh paired installation and activation.
- v2.3.1 to v2.3.2 using WordPress Plugin_Upgrader, Core then Pro.
- A separate v2.3.1 fixture upgraded Pro then Core.
- Explicit activation after the individual upgrader operations, matching the manual upgrade completion flow.
- Saved draft content, French user locale and previously installed language file preserved.
- Site setting preserved; previously issued pairing token still authenticates after upgrade (test token then revoked).
- Encrypted resource key unchanged and previously encrypted content still decrypts.
- French and Arabic packs install/read through authenticated REST and match candidate hashes; both plugin textdomains load.
- Shared media runtime registered and ordered before the media picker.

The unpublished package download transport was supplied locally with exact SHA-256 assertions. Production update-feed discovery, entitlement authorization and public downloads were not exercised by this offline upgrade test. The initial harness attempts correctly encountered the protected download guard; production checks were not weakened. Individual upgrader calls deactivate plugins, so the harness explicitly completes activation before verifying the next request.

Local evidence/harnesses: `D:/px232/acceptance` and `D:/px232/acceptance-reverse`. Language-pack sources remain unpublished. No product defect was identified by these package tests.

## Remaining release gates

Mac architecture/signing/runtime and live agent acceptance remain separate. These installer checks do not replace Codex/Claude builder acceptance. Final candidate PR disposition, website parity, exact language-pack publication/verification and explicit release approval remain required. Do not publish from this receipt alone.
