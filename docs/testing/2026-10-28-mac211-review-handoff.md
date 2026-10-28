> Latest return: [Mac 2.1.1 production draft handoff](2026-10-28-mac211-production-handoff.md). This older document is historical evidence for its own source pair.

# Mac 2.1.1 fixes: Windows review handoff

Updated 28 October 2026. This is the current summary; older dated receipts retain the chronological evidence. Code is ready for review. Full Mac reboot acceptance is still pending; this is not production deployment approval.

## Pull requests to review

| Repository | PR | Scope | Head |
| --- | --- | --- | --- |
| Core | [#27](https://github.com/pixflowdev/pixflow-design/pull/27) | Browser discovery before Bridge pairing; remembered enrollment/reconnect; explicit native Workspace disconnect errors; Mac font serialization and regressions | `35e5512104a01888491d0fb4456b23a98d628041` |
| Private Pro | [#16](https://github.com/pixflowdev/pixflow-design-pro/pull/16) | Unavailable legacy design-route fallback; canonical Mac PHP test fixture; regression checksums; Core pin | `a4ff3bf4af4f7990ef260a333c5659ca44d8ebb4` |
| Core evidence | [#26](https://github.com/pixflowdev/pixflow-design/pull/26) | Mac reports, screenshots, artifact hashes and this handoff | Use current PR head |

Both implementation PRs target `codex/release211-mac-acceptance`. Review Core first, then Pro with the paired Core checkout. Pro's manifest pins Core `35e5512104a01888491d0fb4456b23a98d628041`, module API 14. The built Pro implementation was `590c1b88b531444ba0eb947970003ccdf2c44fca`; the additional `a4ff3bf` commit changes only recorded regression-file checksums. If integration or squash changes the selected Core revision, update Pro's pin deliberately and rerun paired validation before final artifacts. Do not substitute a different branch tip without recording the new immutable pair.

The implementation PRs contain all product changes made in this Mac fix task. Evidence and handoff updates are deliberately in #26. No fixes were merged, and no binaries, Store package, release feed or website were published.

## Verified on the current candidate

- All automated checks passed: Core/Pro guard and typecheck; native module typecheck; 53 native tests with one Windows skip; 37 SSE/queue tests; 64 Bricks MCP/font tests; Pro build contract; full Pro web (2,217 passed, 28 skipped) and full PHP.
- Both ordinary and extension arm64 DMGs and Free/Pro ZIPs built. Exact checksums are in [the fixes receipt](2026-10-28-mac211-fixes.md#artifact-checksums).
- Chrome lists the QA site before Bridge pairing. Explicit extension connection enrolls it without WordPress Reconnect or local-network permission.
- Automatic recovery after Bridge restart and cold Chrome startup passed. The cold Chrome test began with Chrome closed and Bridge site=null; Chrome launched the exact-ID native helper and enrolled the site before the user opened the popup. This is not merely a popup-triggered connection check.
- During a native Workspace run, Disconnect produced the explicit connection-closed error instead of indefinite Preparing. Only the original run existed, and it subsequently completed without a duplicate submission.
- Chrome's “When you click” site-access setting prevented native helper startup/reconnection during 36 seconds of observation. Restoring site access recovered native transport without opening the popup. A fresh read-only request succeeded afterward.
- Settings no longer shows the false design-system error. The original Bricks Design Your System entry also fell back to the manual library form when its previously available route became unavailable. No profile was saved/applied, and both temporary WordPress settings were restored and verified.
- Finder copied the mounted 2.1.1 DMG app over an isolated copy of the installed 2.0.2 app using Replace. All 24 runtime files retained identical hashes before launch; the replacement launched and strict deep code-signature verification passed. The original /Applications app was untouched. This is actual Finder bundle replacement, not a public downloaded/quarantined updater test or a new 2.0.2 database migration exercise.

## Reload-hang investigation

Changing Chrome site access and reloading reproduced a navigation stall while the ChatGPT browser debugger was attached. WordPress AJAX and Bridge health continued responding quickly while the main document reload remained pending. The user clicked Cancel on the debugger banner, without another reload, and the stalled navigation immediately completed. With debugging detached, restoring site access recovered the native connection; another reload through native Chrome controls returned the dashboard in about 0.8 seconds. Evidence points to a browser automation/debugger interaction. No Pixflow extension, WordPress plugin or Bridge code fix is justified by this observation. Keep debugger instrumentation detached for the reboot check.

The earlier seven-minute provider response delay is separate: dispatch/session creation were prompt, and the long delay occurred before provider text. Subsequent fresh requests completed in 4.9 and 8.0 seconds. The original latency cause is unresolved; do not claim a queue-performance fix.

## Remaining before final release approval

1. Complete the full Mac OS reboot check with saved consent and the popup left closed; verify native reconnect, preserved history/settings and a fresh request. This is the only remaining targeted check from the final Mac follow-up list.
2. Review/integrate Core #27 and Pro #16, resolve the final immutable pair, run final CI and Windows packaged/native registration/upgrade acceptance on that pair.
3. Retain original unrun matrix limitations: Intel Mac/other platforms, fresh disposable Chrome profile and expired-login UX, unavailable Bricks→WP/ACF and full review/canvas/history fixtures. Earlier candidate results are not automatically passes for new artifacts. Assign owners or explicitly record release scope for these cases.
4. Rebuild/check final artifacts from the approved pair; verify release identity, checksums, language/version pins, staged website/download/updater behavior and rollback. Current Mac candidates are ad-hoc signed, not Developer ID signed/notarized. Website disclosures must accurately cover 2.1.1. No live deployment or updater/Store promotion has been authorized.

## Local continuation

QA: https://pixflow-204-mac-qa.test/wp-admin/ . Chrome's QA-site access is restored. Extension identity is `hbnbiboohlelmngadeolikeejamjlbkh`; browser version 1.0.2 and native payload must ship together. Store output remains keyless; exact-ID public-key material remains in private Pro documentation.

Running candidate root: `/Users/Shared/Pixflow-211-fixes-35e551`, namespace `release-stable-qa211-extension-arm64`. Launch/stop through the existing local `work/fixes-lifecycle.sh` wrapper. Private pre-reboot data hashes are saved locally under `work/fixes211-backup/pre-reboot-data.json`; do not commit runtime data or credentials. Preserve the earlier app backups until acceptance is closed.

Evidence: [detailed fixes receipt](2026-10-28-mac211-fixes.md), [evidence directory](2026-10-28-mac211-fixes-evidence), and prior [retest receipt](2026-10-28-mac211-retest.md). The current summary above supersedes earlier pending/pass statements in the chronological receipt.
