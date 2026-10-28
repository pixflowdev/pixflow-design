# Mac retest candidate — 28 October 2026

Ready for isolated Mac retesting, not publication. Core `dbe241f6bfbdd544978cb9eef6c41a73dd34ec36`; private Pro `398cf34e30ecbbdbf1b98293461657f09b0d9c51`. Pro pins this clean Core with no development override. Both branches are `codex/release211-mac-acceptance`; use fixed source hashes rather than later documentation-only tips.

## Changes since the Mac report

- Incorporated PR #25's durable steering queue recovery (commit 009e64429; cherry-picked as ea71c126). The PR itself remains unmerged; do not mistake the candidate branch for main.
- Direct and Workspace steering gateway budgets now match the 240-second continuation budget instead of expiring at 25 seconds. Codex waits at most 120 seconds for an active text item; if still active, guidance is returned unsent to the normal queue. The wait is removed, so it cannot dispatch later as a hidden duplicate. Normal reply-boundary steering still works without interruption. RPC confirmation remains separately bounded.
- Manual Bricks styling no longer depends on CLI readiness. It stays disabled during an active run; permissions and design-system persistence are unchanged.
- Missing optional/retired resource catalogues return an empty list without creating directories or crashing. Saved-template tests now create their own preserved personal fixture instead of depending on retired bundled templates.
- Updated extracted-function test bindings, removed-feature expectations and the read-only guidance-draft assertion. PHP WordPress stubs include apply_filters. Skill fixtures canonicalize their system temporary parent before creating private storage, avoiding macOS /var symlink ancestors without weakening production symlink checks.
- Pro's readme now includes its existing v2.1.1 changelog bullets plus the offline manual-styling correction. Built-history replay tests discover the transport symbol from the shipped bundle instead of hardcoding esbuild's numeric suffix.
- Private Pro includes `docs/testing/chrome-exact-id-retest.md` and `chrome-store-public-identity.json`. SHA256-derived extension ID was checked against `hbnbiboohlelmngadeolikeejamjlbkh`. No private signing key or credential is included; Store output remains keyless.

## Local verification

Core guard (27 checks) and full typecheck passed. Codex turn tests: 19 passed. Gateway tests: 18 passed. Queue tests: 33 passed. Native tests: 45 passed; native module typecheck passed. Missing-catalogue PHP regression passed.

Pro guard, typecheck and three repository-contract tests passed. Full web suite: 2,215 passed, 28 existing skips; the additional manual-styling regression passed in the 10-test reconnect suite. Full paired PHP lane passed after the fixture fixes. Both final ZIPs build. Pro archive integrity and shipped history replay: two tests passed. These are Windows results, not evidence that the previously Mac-only failures have cleared. Re-run the complete suites on macOS and attach exact failure output if any remain.

Local artifact receipts (ZIP compression output may vary by platform; record Mac hashes separately):

- Free v2.1.1: 2,381,247 bytes, SHA256 `9a332eec0459a2356369810c3a4abe53895c4fe3d35558fc6ae064ed0c4e3c2f`.
- Pro v2.1.1: 6,066,391 bytes, SHA256 `bafd478d1572caa76d07e3558ab6d17ecdfb97331f5ba110875ec731739ccff6`.

No new complete Windows installer acceptance is claimed. Published packages, customer sites, updater pointers and Team sources are unchanged.

## Required live retest

1. Back up the authorized QA site and Bridge data. Build/install both plugins and full Bridge from this exact pair, ordinary and optional-extension outputs separately. Preserve existing data and use synthetic test pages/chats.
2. Floating and Workspace: steer during long text output, queue a successor, reload during delivery and after completion. Require no 25-second gateway 504, automatic successor dispatch after confirmed delivery, durable history, no duplicates or persistent Working/save warning. For text lasting over two minutes, verify guidance remains queued and starts only through the ordinary next-turn path. Stop must preserve an explicit pause.
3. With Bridge stopped, test Use site styles, Custom styling and Change site design system. Complete manual Design Your System save-to-Bricks and reusable-profile actions, verify after reload, and restore synthetic changes. No AI or Bridge should be needed for manual editing.
4. Follow the private exact-ID guide in a fresh Chrome profile. Test actual permission approval, automatic connection and popup, revoke during an active request, reapproval, auth rejection and extension-disabled direct fallback. Test both panels; the public reviewer fixture is Free-only.
5. Complete the outstanding original matrix: real tray Restart, reboot, relocation, upgrade from published installer, uninstall/reinstall preservation, Bricks-to-WP/ACF immediate-navigation handoff, review targeting and stalled-canvas recovery. Mark unavailable fixtures/architectures NOT RUN. x64 and Linux are not established by arm64 results.
6. Run Core guard/typecheck and native/queue/gateway/Codex suites; Pro guard/typecheck/test:build/test:web/test:php/test:archive against the clean pin. Preserve the complete diagnostics for the Mac-only Google Fonts and skill scenarios if they recur; do not just report suite names.

Return a redacted receipt through Git with exact commits, artifact hashes, before/after preservation and observed UI outcomes. Do not publish/upload stable assets or submit Store certifications. Final CI/PR review, website language/download/updater/changelog checks, and accurate unsigned/ad-hoc macOS 2.1.1 disclosure remain release gates.
