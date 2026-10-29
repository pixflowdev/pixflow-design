# Mac Claude and extension candidate — blocked acceptance report

29 October 2026. This is an initial acceptance and fix report, **not release approval**. The frozen candidate fails installed Mac Claude discovery. No final DMG was built or uploaded, and no release, Store submission, installed application, WordPress fixture, browser permission or authentication state was changed.

## Inputs

- Handoff: `f627af49eebe32e5ad8511fcfe9cb72db8c3db72` on `codex/claude-mac-candidate`.
- Frozen Core: `fc185c2ccd5eba8a94c27e1169d056dc9afbb75f`; frozen Pro: `a4942a73da108758709bbb0260b2ec149ba87b78`; module API 14.
- Separate worktrees, Node 24.19.0, pnpm 10.33.2, frozen installation and explicit Core/Pro paths. Both frozen worktrees were clean before gates. Dependency installation's four launcher mode-only changes were restored before pin validation; no pin bypass.
- macOS 26.5.1, arm64. Claude Desktop 4.29.0, app-managed Claude Code 2.1.309. Runtime layout: `~/Library/Application Support/Claude/claude-code/2.1.309/<download-id>/claude.app/Contents/MacOS/claude`. No standalone CLI was selected by the frozen resolver. Browser version and authenticated fallback runtime were not established.
- Extension draft asset 688467093: 43,041 bytes; SHA256 `4750cbe937d5365c771c8ade9f5ebed7456d5841dee0101d977e8e3be2144839`. Authenticated download and all ten per-file hashes match the frozen manifest. ZIP extracted locally only, not installed; permanent-ID enrollment was not exercised. Matching native helper compiled successfully from the frozen candidate, not registered over the installed helper.

## Results

| Check | Result | Evidence / boundary |
|---|---|---|
| Core guard, full typecheck, daemon build | PASS | `core-gates.json` |
| Claude runtime suites | PASS | 22 passed, 1 Windows-only skip; existing tests missed the real Mac bundle layout |
| Native suites | PASS | 62 passed, 1 skipped, 63 total |
| Reconnect suite | PASS | 7 passed |
| Focused web suites | PASS | 89 passed across 13 files |
| Pro guard, typecheck, repository build contract | PASS | Frozen pair; `pro-gates.json` |
| Pro browser bundle build | PASS | Local ignored output only |
| Pro full paired web | FAIL | After supplying PHP and building bundles: 2221 passed, 3 failed, 28 skipped |
| Pro paired Bridge | FAIL | 17 passed, 1 failed, 1 skipped; Windows-only mock launcher on macOS |
| Actual installed Desktop discovery, frozen candidate | FAIL | No candidate or selected runtime despite executable app-managed CLI |
| Corrected resolver against installed Desktop | PASS | Selected source `desktop`; CLI version 2.1.309; live model-control catalogue returned |
| Fresh WordPress sign-in, Cancel, timeout/retry | NOT RUN | Requires corrected paired candidate; owner's authentication preserved |
| Live floating-panel / Workspace Claude and Codex runs | NOT RUN | No streaming, steering, cancellation, timing or reattachment claim |
| Live extension 1.0.3 three-entry-point and recovery matrix | NOT RUN | No permission or browser installation changes made |
| Actual standalone fallback / unauthenticated Desktop | NOT RUN | Unit fallback coverage is not installed-runtime acceptance |
| Final new-version production DMGs | NOT RUN | Coordinator must freeze new version/source after acceptance |

The first broad Pro run lacked PHP and generated browser bundles, producing 29 failures. Those prerequisites were supplied using existing Local PHP and `pnpm wordpress:web`; 26 failures cleared. The supplied installed OpenCode was also tried for the Bridge suite, but the retained test creates only `opencode-cli.cmd`, so POSIX execution misses its synthetic runner and reaches the real binary. No test success is inferred from that invocation.

## Fixes and baseline comparison

1. [Core PR42](https://github.com/pixflowdev/pixflow-design/pull/42), `6e13644ac`: discover app-bundled Mac CLI downloads while retaining flat layouts. Two new tests reproduce red on frozen Core and green after the fix, including shared resolver Desktop precedence and fallback after removal of a synthetic download. Guard, full typecheck, daemon build and all listed focused Core suites pass on the fix. Real installed runtime selection and catalogue initialization pass without a user prompt. This does **not** establish UI authentication, inference or provider Test acceptance.
2. [Private Pro PR23](https://github.com/pixflowdev/pixflow-design-pro/pull/23), `e8cb309`: align the retained footer test with the deliberate removal of estimated dollar amounts, retaining output-token information. All 43 tests in that file, Pro guard, typecheck and test:build pass. Original provenance retained; adaptation hash updated. No Pro product source or source pin changed.
3. The two `bridgeSiteSwitch` source-string assertions also fail on released Core `5f9f2105870dc304c8ef31bcef6cb508988af3e3` / Pro `b77341e0c6afa3869e0c852125257e6e3b885e32` in clean isolated worktrees (55 pass, 2 fail across the two selected files). The footer assertion passes on that baseline, confirming its change is specific to the new footer contract. The Bridge mock-launcher failure also reproduces on this baseline. These pre-existing failures remain open; no blanket paired-suite pass is claimed.

## Catalogue evidence

`desktop-catalogue.json` contains only model and effort metadata returned by the selected actual Desktop runtime. It advertises default, opus, fable, sonnet and haiku with low/medium/high/xhigh/max. This differs from the handoff's Windows Haiku example; do not hard-code capability from a display name. No account details or auth output were retained. UI persistence and actual model/effort execution still require acceptance.

## Coordinator / next Mac run

Review Core PR42 and Pro PR23, integrate the discovery fix and freeze a compatible updated Pro pin. The original pair cannot satisfy the first Mac acceptance requirement; silently substituting a dirty Core or bypassing the pin would invalidate the exact-pair evidence. Resolve or explicitly disposition the baseline paired-suite failures. Then resume **all live Mac acceptance** from the handoff, including the fresh sign-in flow, both panels, actual fallback states, all three extension reconnect entry points, route labels, permissions, restarts and preservation. Capture redacted screenshots during those actual flows.

Do not promote this report to completed acceptance. No screenshots are supplied because no candidate UI was deployed. After acceptance, coordinator must assign the next release version and exact source pair before production arm64/x64 builds. Published v2.1.1 assets remain immutable.
