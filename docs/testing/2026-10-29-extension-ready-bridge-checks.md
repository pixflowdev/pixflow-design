# Extension-ready Bridge v2.1.1 checks

29 October 2026. Release preparation only: no published packages, updater pointers or customer settings changed. Team changes remain excluded. The extension-ready installer is the sole intended release build for each platform; direct connections do not require the extension.

## Windows

Core `037a867b5f207ffcd754c3582c0d501f2c6c8691`; Pro `697a8117000a9c06ea102304cd22df665f8e9610`.

Artifact: `pixflow-design-bridge-2.1.1-win-x64-setup.exe`, 248,213,769 bytes, SHA256 `0577b160e3e861a9564f8f7d7d3a164291d4abd78f5e33bc19604d214ac84fd4`.

- Production installer built with the permanent-ID native payload.
- Exact production payload archives and native hooks exercised through an isolated QA installer identity/path/shortcuts. Upgrade and repair passed; all 10 pre-existing fixture data files remained byte-identical after both operations.
- All 11,418 installed payload files matched archive CRCs. Compiled host/config/install files matched the build inputs and registered extension `hbnbiboohlelmngadeolikeejamjlbkh`.
- Installed tray runtime reported 2.1.1. Direct HTTP/CORS health, native enrollment and framed health streaming with acknowledgements passed. Unapproved origin rejected; direct health remained available after closing native transport.
- Maintainer verified in the browser that page refresh, a new tab and actual tray Restart Bridge reconnect through the extension without pressing Connect again.
- Initial direct-route observation preceded an explicit Connect action. Chrome permission was retained (no new Allow prompt). A saved direct preference is possible but was not inspected, so no root cause or product fix is claimed.
- Browser observations above are maintainer-confirmed; automation API returned `browser.user is unavailable`. Earlier permanent-ID UI evidence remains separate from this exact-payload transport check.

## Linux runtime

Core `5f9f2105870dc304c8ef31bcef6cb508988af3e3`, focused PR #36, adds compiled native payload staging and automatic registration to the runtime installer. It does not change the Mac/Windows tray implementation.

Artifact: `pixflow-design-bridge-2.1.1-9e28485f2b69.zip`, 4,655,123 bytes, SHA256 `9e28485f2b69c85bf58f14233e4f15334a813931ab014cb29a951d3470c668f1`.

- 57 native tests, 3 existing source-install tests, repository guard and full typecheck passed.
- Website chat's isolated Linux receipt: website commit `b192cdf`, `docs/releases/2.1.1-linux-native-check-2026-10-29.md`.
- Install, dependency build, direct health/version, stop/restart and synthetic-data preservation passed.
- Automatic native registration/payload equality; framed discovery/enrollment after explicit local CLI provisioning; health relay with acknowledgements; wrong-extension/unapproved-site rejection; unregister/repair and conflict no-overwrite passed.
- Direct connectivity remained available without registration and after registration failure. Synthetic Chrome Preferences and Secure Preferences stayed byte-identical.
- A fresh daemon correctly rejected first claim from a browser Origin. This test does not establish first-time browser provisioning of the standalone daemon.
- Headless container checks do not establish Linux desktop browser UI, desktop login or provider authentication acceptance.

## Remaining release gates

1. Finish CI/review for the Linux runtime PR and reconcile stacked Core/Pro source pins before promotion. Do not describe a missing CI run as passing; manual Free/native workflows were dispatched for the exact Linux commit.
2. Receive extension-ready arm64 and x64 Mac DMGs, hashes and build receipts from the existing build-only handoff. Full Mac acceptance is already complete per the maintainer; do not repeat it.
3. Verify the final combined downloads, aliases, authorization, updater metadata, language-pack hashes and changelogs against those exact assets. Website chat has prepared the checks privately.
4. Preserve older draft assets as historical evidence; publish only the intended single extension-ready installer for each platform. Extension approval is independent of the direct Bridge release path.

No live promotion is authorized by this evidence document.
