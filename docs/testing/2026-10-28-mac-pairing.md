# Paired v2.1.1 Mac acceptance candidate — 28 October 2026

Core source: `4935eb5e2044da92b19277cd126e63969afd03f4`.
Private Pro source: `99efa4ecb8a9d9b347e621fc9046abc772302ec8`.
Both repositories expose `codex/release211-mac-acceptance`. Pro pins this exact Core; no dirty-checkout override was used. This is an isolated testing candidate, NOT release approval.

Core combines af03030dd's extension/platform changes with the existing bc643122 direct-release candidate. The Pro source is b175b7f plus its explicit Core pin. No Team implementation was added; previous working checkouts remain preserved. Published assets and updater pointers are untouched.

## Verified locally on Windows

- Core guard: PASS, including 27 guard tests.
- Core full typecheck: PASS after frozen dependency install and shared contracts rebuild. The first attempt used stale generated declarations and failed; rebuilding resolved it without source changes.
- Pro guard, typecheck and three repository contract tests: PASS.
- Native transport/registration: 45 PASS; packaged startup: four PASS; packaging integration: three PASS.
- Focused Core navigation/history/preparation/provider suites: 202 PASS across ten files.
- Free ZIP build: PASS, 2,380,999 bytes, SHA256 `d578fb6701efc5f28b105a4f3539887acc786f2eb2c31d8f9b0386fd7291d894`.
- Pro ZIP build against pinned clean Core: PASS, 6,065,853 bytes, SHA256 `b9b27e0d0934e79f867e9a0a48e97232c7209a7080707caadeef4f411f2377e9`.
- No full installer or installed-browser acceptance was performed for this new combined pair in this receipt. Existing earlier receipts do not automatically cover it.

## Broad test failures — release blockers pending triage

Pro web lane completed: **2,209 passed, six failed, 28 skipped**; 198 passing, five failing, two skipped files. Failures:

1. `HomeView.prefill.test.tsx`: inherited plugin-authoring fallback expectation differs from current behavior.
2. `assistant-message-unfinished-todos.test.tsx`: generated-plugin contribution action absent.
3. `bricks-execution-reconnect.test.ts`: extracted-function VM has no `rememberFloatingExecution` binding.
4. `bricksMcpModePolicy.test.ts`: source-string assertion expects the earlier inline writable expression.
5–6. `bricks-provider-switching.test.ts`: extracted-function VM has no `PixflowOptionalBridgeUnavailableError` binding, both online/offline scenarios.

Pro PHP lane FAILED. Observed failures: `design-templates` directory missing when RegistryService is exercised by the catalogue test; missing WordPress `apply_filters` stub in `direct-code-authority.test.php` and `direct-site-session.test.php`. Other tests continued. These failures look at least partly harness-related, but that is not a completed baseline comparison or permission to waive them. Reproduce on the prior clean pairing, repair fixtures/assertions appropriately, and rerun before release approval. Do not weaken production authorization to satisfy a mock.

## Mac report incorporated

[Mac native-registration report](2026-10-28-mac-native-registration.md) is retained unchanged with its original af03030dd source identity. It passed native registration, typechecks and all 166 packaged tests on arm64. It did not test a full installer, real Chrome permissions, Pro or installed CLI flows. Those remain required on the new pair, as do x64/Linux where advertised.

Use the updated [platform handoff](../../tools/pixflow-design-bridge/native-messaging/RELEASE-HANDOFF.md) from the acceptance branch tip. Build the fixed source hashes above rather than the later documentation-only tip. Mac acceptance may proceed on a disposable authorized site while the broad-test failures are triaged; publication remains blocked. Return redacted results through Git, not private runtime exports.