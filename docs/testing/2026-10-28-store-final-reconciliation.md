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
