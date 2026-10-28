# Chrome Store candidate reconciliation

28 October 2026. Preparation only; no Store submission, publication, live package change or updater change.

## Candidate

- Source: `fa7cabb207c6fea1059c704076d3ad3e7c0dea87`, Core PR #34, stacked on PR #33.
- Extension: 1.0.2, permanent Store ID `hbnbiboohlelmngadeolikeejamjlbkh`, native host `dev.pixflow.bridge`.
- ZIP: `pixflow-design-bridge-extension-1.0.2.zip`, 42,338 bytes.
- SHA256: `f35508dad5ef70d1b586c04495ad6ed14be6e6cbc548531b9fcf2e80a45b0d69`.
- Local artifact and per-file receipt: `D:/pixflow-211-final/store-reconciliation/`.
- Old local Store output preserved in `previous-chrome-store`; this ZIP contains exactly the ten allowlisted browser files, not the parent directory or native payload.
- Configuration uses production loopback port 7456, no embedded customer sites, and paired-site discovery. No manifest public key, private credentials or development site configuration is shipped.
- Internal legacy port identifier `pixflow-native-prototype` and development-host fallback strings still exist in bundled code. These are not visible branding; production config explicitly selects `dev.pixflow.bridge`. Do not describe the ZIP as having no occurrence of the word prototype.
- Native payload hashes: `host.mjs` = `f08c7f4fc1be485f7c8fbaef1787f0475fd6cb9fe7cca32d894f63ec6f310c08`; `install.mjs` = `dff8e0609e40cb79466390554f7c029a83124182ffd3b853d3b1f591af1e5625`; `config.json` = `9e43de61915fc597e1b1cc2d73e747b785d02a4252292512555993f77184d478`.

## Validation and evidence boundaries

All 55 native test cases passed, with zero skips or failures. Native TypeScript validation passed. Core PR #34 CI passed on this source. Source comparison with Mac-tested Core `72d4dee346fab1a564703c84a47c3d9ecd7825a6` shows only the browser page-response route marker and handoff documentation changed within native-messaging; native-host and registration implementation are unchanged.

The latest Mac report on `codex/mac211-acceptance-receipt`, `docs/testing/2026-10-28-mac211-production-handoff.md`, supersedes older Mac summaries. Its paired Pro revision is `4a61d59a289483b0e364673b529f392d04712642`. It records Apple Silicon installation, repair, relocation, uninstall/reinstall, permissions, direct fallback and post-reboot reconnection. Some manual checks are explicitly user-reported rather than independently observed. Bridge starts manually after OS login in that fixture. Both DMGs are ad-hoc signed, not notarized. Intel Mac and Linux were not built or accepted.

Windows production Bridge direct route and both connection-label surfaces passed. The user confirmed both extension-route labels in the in-app browser. Those checks used the prototype identity and cannot replace the final permanent-ID customer-installer check. Historical permanent-ID reviewer tests used an isolated development daemon and are not equivalent either.

## Chrome for Testing investigation

The isolated profile reports Bridge not reachable. Its extension identity, manifest and both Windows registry views match the prototype registration. Production Bridge health succeeds on port 7456. Both the native Node entrypoint and actual registered CMD launcher return a successful framed health response with the expected origin argument. This narrows the problem but does not establish a browser root cause.

Computer Use still rejects the returned Chrome for Testing window with `window id ... no longer belongs to Chrome; current owner is Chrome`, preventing inspection of Chrome's extension error. The popup currently maps several native failures to the same unavailable state and its help text does not expose the underlying error. Do not claim Chromium incompatibility or resolution without Chrome's actual failure evidence.

Chrome's documented separate Chrome for Testing native-host paths concern macOS/Linux. They do not establish a Windows registry defect. Reference: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging

## Remaining submission gates

1. Inspect the actual Chrome native-host failure and finish the installed Windows check using the permanent ID and current paired browser/native payload.
2. Verify the reviewer download is the matching native-enabled installer; an older reviewer installer must not be assumed to support 1.0.2 enrollment.
3. Upload this browser ZIP to the existing Store draft and reconcile `activeTab` and `alarms` permission explanations, reviewer instructions and screenshots with 1.0.2. Confirm the reviewer login and public privacy URL still work.
4. Complete Intel/Linux acceptance before advertising those platforms, or explicitly limit initial availability and reviewer instructions to verified platforms.
5. Obtain the owner's confirmation for final Store certifications and submission. Extension approval remains independent of the plugin maintenance release.

No chats, content, settings, permissions, Team source or published packages were modified by this reconciliation.

## Store update and replacement Windows reviewer candidate

The Store draft now displays **1.0.2** and all six expected permissions. Native computer controls completed the upload despite the browser API becoming unavailable again. The `activeTab` and `alarms` explanations were added; `tabs` and `scripting` explanations were aligned with pre-consent discovery. Save draft became disabled after saving. Certifications were not accepted and submission was not clicked. Screenshot: local `store-draft-1.0.2.png` beside the package receipt.

Archive inspection confirmed the older reviewer EXE contains the earlier host without the new enrollment handler. A separate replacement was compiled from the final Windows payload archives and generated NSIS template, adding only the three verified native payload files. Published downloads were not replaced.

- Reviewer EXE: `pixflow-design-bridge-2.1.1-extension-review-1.0.2-win-x64.exe`, 248,208,653 bytes.
- SHA256: `40490d3d9e41424697c51f84a09173b995bf2ef7c10ddd9309d43a7b399a1606`.
- Extraction confirms all three embedded native files match the candidate hashes above.
- Equivalent isolated QA installer retains the existing `D:/p211qa` identity and data paths. Full install and repair both exited 0. All ten saved-data files match their pre-install hashes after repair. Native registration targets the installed helper and exact permanent Store ID. Production Bridge restarted successfully.
- Real NSIS native-hook install/repair/uninstall test passed with a separate disposable registration and preserved saved-data sentinel. This does not claim full customer EXE uninstall acceptance.
- The reviewer-only website replacement is being prepared, not published. Final browser acceptance with the permanent ID is pending explicit approval to load that identity and grant isolated-site access; earlier prototype consent is not reused.

The final exact-ID unpacked browser copy is local `exact-id-browser/`. Only this testing copy includes the Store public manifest key. The uploaded ZIP remains keyless and unchanged. The Windows host registration created by the isolated installer is the intended test change; chats, settings, normal Chrome permissions and live packages remain unchanged.

## Permanent-ID browser acceptance

With the user's explicit isolated-site approval, the final 1.0.2 browser copy was loaded into the Codex in-app browser. Its displayed ID matched `hbnbiboohlelmngadeolikeejamjlbkh`. The older 0.0.3 prototype was disabled (not removed) to avoid testing the wrong adapter. Only loopback site access was approved; no customer-site permissions were granted.

The installed Windows native helper connected successfully. The extension popup reported **Bridge connected**, and the WordPress Bridge popover reported **Connected via Chrome extension**, with the isolated site listed as connected. Reloading WordPress restored the same saved chat and automatically reconnected without another consent prompt. Disconnecting through the extension then changed the WordPress popover to **Connected directly**. The popup explicitly stated active requests were not replayed. No chat prompt, content mutation or settings edit was performed.

Local evidence: `permanent-id-connected.png` and `permanent-id-direct-fallback.png` in the reconciliation directory. This closes the current Windows permanent-ID connection/reload/direct-fallback gate; it does not establish the cause of the older Chrome for Testing prototype failure or claim new CLI streaming acceptance.

Website preparation is committed at `pixflowdev/pixflow-website` revision `d31f13fc92142c7aa0158ec15cbff617862b7457`. The new reviewer-only download, reviewer guide and precise extension privacy section are not yet published. The currently public guide/download still describe the old 1.0.1 setup and must be replaced before submission. Final reviewer login, Store test instructions/screenshots and owner certifications remain outstanding. Intel/Linux must not be advertised as accepted.

## Store reviewer instructions — final preparation

The confidential Test instructions form was updated and saved for 1.0.2 without changing its existing username/password. Its 496-character setup text points to the separate Windows reviewer guide/installer, explains pairing and site approval, requests reload/direct-fallback/reconnect checks, states that no Pro licence is needed and that real AI runs need the reviewer's signed-in CLI, and excludes unverified Intel Mac/Linux claims.

The Store listing retains its icon, two screenshots, English (United Kingdom) language, Developer Tools category, homepage and support URL. Google's "Why can't I submit?" validation reports only the data-usage Developer Program Policy certification as its remaining form blocker. Certifications remain unaccepted and nothing was submitted. This form validation is not a substitute for final public reviewer download/login checks.

Local evidence: `store-reviewer-instructions-1.0.2.png` and `store-final-certification-gate.png` in `D:/pixflow-211-final/store-reconciliation/`.

The website chat freshly authenticated the existing reviewer account on 28 October 2026 at 22:58:27 UTC, reached authenticated WordPress admin/profile, then logged out the synthetic test session. Credentials were not rotated or copied into this report. Public installer/guide/privacy deployment verification is tracked separately below.

## Public reviewer deployment — 28 October 2026

User-authorized reviewer-only publication completed. Independent HTTP checks returned 200 for the guide, new exact-name installer and public privacy policy. Guide identifies 1.0.2 and the correct versioned installer; installer HEAD reports 248,208,653 bytes. The extension privacy section now covers pre-consent site discovery, remembered metadata, reconnection, native forwarding and retention.

Website chat's full public GET at 23:07:49 UTC confirmed 248,208,653 bytes and SHA256 `40490d3d9e41424697c51f84a09173b995bf2ef7c10ddd9309d43a7b399a1606`. Public guide and privacy desktop/mobile checks passed; reviewer guide no-store/noindex and staging 401 protection passed. Existing reviewer login/logout passed without rotation.

- Guide: https://docs.pixflow.dev/extension-review/reviewer-guide
- Installer: https://docs.pixflow.dev/extension-review/downloads/pixflow-design-bridge-2.1.1-extension-review-1.0.2-win-x64.exe
- Privacy: https://pixflow.dev/privacy#browser-extension

The Store draft remains unsubmitted; final owner certifications and submission approval are still required. The Windows reviewer path is verified; unverified Intel Mac/Linux claims remain excluded.

Final preservation check passed: website chat compared all 202 normal download files (7.02 GB) against pre-publication filenames, sizes and SHA-256 values; all match. Protected service identities, configuration hashes and release endpoints also match. Only the authorized reviewer-specific download/guide and extension privacy content were published.
