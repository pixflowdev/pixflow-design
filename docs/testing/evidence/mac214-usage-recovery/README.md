# Mac 2.1.4 return — 2026-10-30

Mac targeted acceptance and production DMG preparation are complete. The release remains a draft; no plugin deployment, updater change, extension submission or public publication was performed.

## Review and immutable sources

- Polling fix: [Core #68](https://github.com/pixflowdev/pixflow-design/pull/68), `5e088f7669258b1c8c45912402c5988aaa7c106f`.
- Production Core: [#69](https://github.com/pixflowdev/pixflow-design/pull/69), `e1443e228ef68bc921298f5678d38e1af51dff5b`.
- Production Pro: [#33](https://github.com/pixflowdev/pixflow-design-pro/pull/33), `32a7946801d30e37f30bf35dda622f15335f3ec5`.
- Pro pins that full production Core SHA, module API 14. Production checks/builds use no worktree override. No Team changes were added.
- The installed behavioral acceptance used test Core `5e088f7669258b1c8c45912402c5988aaa7c106f` and released Pro `68995f19d42a005ca327e41186bba7c2a086c12b`, identifying as 2.1.3, with the handoff-authorized test override. Release-only commits then set production metadata to 2.1.4. Do not confuse this test pair with the final production pair.
- Retains Claude recovery [#63](https://github.com/pixflowdev/pixflow-design/pull/63), usage [#65](https://github.com/pixflowdev/pixflow-design/pull/65), tooltip [#67](https://github.com/pixflowdev/pixflow-design/pull/67). Their checked heads were `3047e0cdfeb1860434ff077a846610de705536e1`, `ca87cb5e33877bffc987725921b4e32644289c57`, and `c058d90e3582b74c4444b6e772aa252450c4aea8`. Required checks were successful at inspection. Later #67 changes add CI/evidence and an E2E readiness wait; tooltip runtime/component-regression files match the integrated input. #68 Free and Unified chat checks also passed.
- PRs are stacked: #68 targets the combined tooltip integration branch, #69 targets #68's branch, and Pro #33 targets the released Pro baseline. Review the dependency fixes before preparing a merge or deployment. Artifacts are tied to the recorded full SHAs; do not retarget their source receipt to a different merge SHA without reconciling the pin/build evidence.

## Mac results

Host: macOS 26.5.1, arm64. Claude Desktop 4.29.0 was closed for recovery; Desktop-managed Claude CLI 2.1.309 remained discoverable. Codex CLI was 0.165.0-alpha.1.2.

- **Tests:** 102 focused usage/tooltip/daemon/auth/connectivity tests passed, plus all 3 Pro repository-contract tests. Core guard/full typecheck and Pro exact-pin guard/typecheck passed. Paired browser ZIP builds passed during acceptance. Pro's package version was aligned to its 2.1.4 PHP version after its identity contract correctly rejected mixed metadata; generic Core workspace and extension versions were unchanged.
- **Polling fix:** Workspace exposed two same-model Codex GETs starting 153 ms apart and overlapping for about 665 ms. Two new regressions failed on the original handoff input and inspected main (`6534b611710143dbbb8dab681d2f76ac3ced193f`) and pass with the fix. Mounted consumers now share one provider/model poller. Installed Codex/Sonnet automatic reads succeeded without overlap; the Sonnet reads were 60 seconds apart. Both composers were exercised, with affected Workspace checks repeated on the fix. Model requests changed Opus → Sonnet; old-model cancellation and late-result isolation pass deterministic tests. Shared 5-hour/weekly Claude windows legitimately matched; no separate live model bucket was invented.
- **Visibility/recovery:** debugger focus emulation forced `document.visibilityState` to `visible`, invalidating the first attempts. Disabling `Emulation.setFocusEmulationEnabled` immediately returned `hidden`; the confirmed 68.692-second interval had no usage reads, and returning caused a successful overdue read. This required no product fix. Unavailable/recovery and slow nonoverlapping reads pass test-response regressions without deleting authentication or revoking permissions.
- **UI:** usage hover was readable at 640px and click/manual refresh worked. Bricks +/Send hover and pointer exit kept body/document dimensions at 1220×646 and scroll at 0,0. Tooltips stayed inside the viewport and used the panel's dark background/light text. The temporary Bricks page-type setting was restored from its exact checkpoint. See [tooltip metrics](bricks-tooltip-smoke.json) and [screenshot](bricks-send-tooltip.png). No additional builder matrix was repeated.
- **Claude recovery:** the real WordPress Sign in again control remained available with Desktop closed. Waiting state and Open sign-in page worked. The owner completed official authentication; the UI automatically returned to authenticated controls with refreshed usage, without Rescan. Manual-code input/button controls were present; a live Mac code exchange was not observed, so retain the Windows live-exchange evidence rather than claiming a Mac exchange.
- **Routes:** direct HTTP health/usage passed. The owner re-enabled the existing exact-ID 1.0.3 extension; a fresh Claude usage reading and health Reconnect then passed with browser HTTP loopback fallback temporarily blocked. The UI reported Connected via Chrome extension. The block was cleared, site grants were unchanged, and no browser extension update or broad permission matrix was performed. Recovery used direct transport because the extension was unavailable at that point.
- **Connected + update warning:** the old Bridge reported 2.1.2 while the published latest manifest required 2.1.3. Connected reports transport availability; the CLI update gate also considers the published minimum/latest requirement. With the compatible candidate the warning disappeared and usage worked. No gate defect was reproduced.

## Preservation and limits

Posts, chats/messages, comments, terms and relationships retain their checkpoint hashes. Postmeta retained 9 rows but its aggregate hash changed after builder opening; the checkpoint had no per-row hashes, so exact postmeta preservation is not claimed. No page save or content mutation was performed. Original Codex GPT-6.1-Sol/Medium and Claude Sonnet 5.5/Low preferences were restored. The owner-authorized Claude refresh did not log out or delete normal credentials. Private checkpoints, runtime sessions and raw authorization data are not committed.

Broad v2.1.3 builder, steering, permissions, reboot and installer evidence is reused as requested. Intel was built with x64 Node/Electron and exercised under Rosetta on this arm64 host; no physical Intel hardware campaign was run. The first cold Intel launch exceeded the initial bounded health wait, then reported healthy production 2.1.4. The runtime harness initially selected the pre-existing system app for arm64; it was stopped and the task-local exact production app was selected before recording the passing health result. No system application was replaced. The isolated 2.1.3 acceptance Bridge was restored after artifact runtime checks.

## Production draft

[Draft release](https://github.com/pixflowdev/pixflow-design/releases/tag/untagged-d66a98dc168ab91ec769), ID `429347161`, tag `bridge-v2.1.4`, target `e1443e228ef68bc921298f5678d38e1af51dff5b`, `draft=true`, `prerelease=false`.

Canonical names: `pixflow-design-bridge-2.1.4-mac-arm64.dmg` and `pixflow-design-bridge-2.1.4-mac-x64.dmg`.

| Architecture | Bytes | SHA256 |
| --- | ---: | --- |
| arm64 | 209983271 | `44c4316f07fcbc38f24a4510c0e769e0778471daf2fb1a48acf0144ede5ccc22` |
| x64 | 221115840 | `b17bfd6775ccb83d06187d60964a092d4f86645c26e42e10ed2fb88997f052c4` |

Both DMGs are production 2.1.4 (no RC suffix), extension-ready with direct access retained. Each app contains 18 matching-architecture Mach-O binaries, portable config without build-machine runtime roots/site bindings/credentials, and the exact helper payload for `hbnbiboohlelmngadeolikeejamjlbkh`. Version/identity, strict deep signature verification, `hdiutil verify` and runtime health 2.1.4 passed. **Signing is ad-hoc and not notarized**, matching the existing recipe; this is not an Apple Developer ID/notarized build.

Both DMGs, checksums and redacted build receipt were uploaded without clobbering different bytes. All four assets were independently downloaded and matched local size/SHA256. Asset IDs/digests/download verification are in [GitHub verification](github-draft-verification.json); configuration, architecture and runtime evidence are in [build receipt](build-receipt.json). Keep the release draft until the Windows coordinator finishes review and authorized production deployment steps.
