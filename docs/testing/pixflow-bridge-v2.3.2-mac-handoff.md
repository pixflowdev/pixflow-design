# Pixflow Design Bridge v2.3.2 Mac release candidate

Publication is on hold. Build and validate Apple Silicon and Intel DMGs; do not change public downloads, tags or updater feeds. The owner explicitly authorised ad hoc signing without notarisation for v2.3.2 on 14 November 2026. Report Gatekeeper limitations accurately; do not describe these builds as notarised.

## Exact source pair

- Core: `pixflowdev/pixflow-design`, branch `codex/v232-core-candidate`, commit `c2a655ca7e45861de14ea074d138fe3fdd58f857`.
- Pro: `pixflowdev/pixflow-design-pro`, branch `codex/v232-pro-candidate`, commit `85be1218309185c9739f9973fcb9c8459a750d85`.
- Pro's `pixflow-pro.json` pins that exact Core revision. No dirty-source override is permitted for runtime changes. Do not build from this documentation branch.
- Both plugins and Bridge are stamped 2.3.2. The source includes the merged v2.3.2 builder reliability and Bricksforge work, and preserves the server-to-server pairing correction from Core #133. Do not add Origin or Sec-Fetch-Site to the pairing exchange: WordPress deliberately rejects them.

Read both repositories' AGENTS.md, Core tools/AGENTS.md and tools/pack/AGENTS.md. Use isolated, short-path worktrees with Node 24 and pnpm 10.33.2. Install frozen dependencies separately in both checkouts. Set PIXFLOW_DESIGN_CORE_ROOT for Pro and PIXFLOW_DESIGN_PRO_ROOT for Core explicitly. Install Pro's locked Composer dependencies with no development dependencies. Do not update dependencies during release packaging.

If building WordPress ZIPs, prepare the Pro detector using `pnpm exec tsx scripts/adapt-impeccable-detector.ts <upstream-checkout>` at Impeccable revision `374a0e179bb36725283a612462131705ba4780ae`, as documented in Pro's docs/design-engine-boundary.md. Retain its licence and hash receipt. This is a required generated packaging input, not a reason to alter source or skip packaging checks.

## Build both architectures

Use a separate architecture-matched environment for each build. On Apple Silicon, use native arm64 Node for arm64, and x64 Node under Rosetta for x64. Confirm process.arch before installing native dependencies. Do not reuse native node_modules between architectures.

From the pinned Core checkout:

```sh
pnpm exec tsx tools/pixflow-design-bridge/native-messaging/store-build.ts hbnbiboohlelmngadeolikeejamjlbkh
export PIXFLOW_DESIGN_NATIVE_PAYLOAD_DIR="$PWD/.tmp/chrome-store/native"
pnpm bridge:mac
```

Use the maintained installer script for Pixflow identity and icons. Its tools-pack mac build invocation currently lacks `--portable`: add that packaging-only flag in the isolated build copy, retain the exact runtime revisions, and record the diff in the receipt. Use ad hoc signing, not Developer ID/notarisation flags. If clean-source validation rejects this packaging-only adjustment, report it to the coordinator rather than disabling verification or changing runtime source silently.

Verify that the resulting app is portable and contains no build-machine runtime paths. Confirm product Pixflow Design Bridge, bundle ID dev.pixflow.bridge, version 2.3.2 and the production native host dev.pixflow.bridge. Keep the permanent extension identity above.

## Package verification

For each final DMG:

1. Run hdiutil verify and mount read-only.
2. Check bundle version/identity and architecture of the executable, Electron framework, standalone Node and better-sqlite3 binding.
3. Confirm open-design-config.json selects open-design/bin/node. Verify the bundled Node reports 24.22.3, matches the target architecture, and opens an in-memory SQLite database with the packaged binding. Electron's embedded Node is separate.
4. Run codesign --verify --deep --strict --verbose=2 and spctl --assess --type execute --verbose=4. Record the actual Gatekeeper outcome; ad hoc signing may be rejected. No notarisation/stapling claim.
5. Verify Contents/Resources/open-design/native-transport exists and the installed app registers the production extension's native host.
6. Compute SHA-256 only after final signing and packaging. Preserve logs and source revisions.

## Live Apple Silicon acceptance

Use a disposable local WordPress site and the matching v2.3.2 Core/Pro plugins. Build them from the pinned pair if coordinator ZIPs are not yet available; verify versions and record hashes. Never use customer content as a test fixture.

- Upgrade an isolated v2.3.1 installation; confirm existing pairing, conversations and provider preferences survive. Test fresh pairing separately. Test direct Chrome connection and production native messaging, restoring the previous routing afterwards.
- Run natural customer prompts with Codex and Claude, without coaching tool names. Confirm model/auth/usage/runtime selection agree, first reply and follow-ups work, Stop and reload recovery work.
- Exercise Workspace-to-Bricks draft creation, native save, reload and a subsequent targeted edit. Verify the saved frontend. Inspect failed commands, repeated discovery, retries and wrong-page edits.
- Verify saved draft previews, query pagination, dynamic data and an interactive element. Cover the new discovery guidance and readable tool output.
- With Bricksforge 4.1+ installed locally, keep its public MCP switch off and test official Pixflow session tools. Confirm native role controls and disabled submissions remain enforced. Test a form and an animation/interactive workflow, inspect the rendered result and restore fixtures. Do not send external test email or webhooks without an explicitly controlled destination.
- Run PHP bridge-pairing tests and daemon pairing/central-entitlement tests. Origin must remain absent on the exchange; PKCE, expiry, replay, site identity and entitlement checks must pass.
- Record Intel native hardware coverage separately from Rosetta. If no Intel Mac is available, state that limitation explicitly; do not mark native Intel acceptance passed.

## macOS agent efficiency: investigate, fix and retest

This is a required acceptance gate, not just a log collection exercise. Inspect the complete Codex and Claude runs for failed commands, repeated discovery, unnecessary file/database searches, retries, stalls and time spent finding the correct tool, even when the final page looks correct. Fix reproducible product defects and retest locally. Keep live packages, customer sites and public updater feeds unchanged.

Exercise at least two distinct full-page briefs per provider, plus targeted section changes, tagged and untagged follow-ups, queries, dynamic data, conditions, draft preview verification and the Bricksforge workflows above. Use natural customer prompts and the real floating panel. Do not coach command syntax or tool selection to manufacture a passing run. Record settings separately. Preserve the test site's existing content and clean up only owned fixtures.

Investigate Mac-specific failure modes, including:

- Finder/Dock launch versus Terminal launch: inherited PATH, login-shell configuration and executable selection. Homebrew arm64 `/opt/homebrew/bin`, Intel `/usr/local/bin`, standalone CLI and Desktop-bundled CLI discovery must not drift between authentication, models, usage and execution.
- zsh/bash command quoting, spaces and Unicode in paths, argument files, UTF-8 output and helper exit codes. Agents must use the supplied helpers rather than searching for Python/Node or repeatedly parsing truncated tool output.
- Native arm64 versus x64/Rosetta executables and dependencies; executable permissions, quarantine, app relocation and native-host paths. Do not globally disable Gatekeeper or other security controls to obtain a passing result.
- GUI-launched Bridge credential/keychain access, browser/native transport reconnects, provider switching, CLI update/rescan, Stop, reload and follow-up context after changing builder pages. Do not expose credentials in logs or prompts.
- Slow tool replies and temporarily busy builders: bounded recovery, useful progress and no duplicate mutations. Distinguish a deliberate permission denial or missing credential from a retryable transport failure; do not retry denied writes or weaken authorization.

For each run retain a redacted trace, prompt, provider/model/reasoning, architecture, cold/warm state, time to first visible text, total duration, failed-command count, repeated discovery calls, retries and outcome. Explain legitimate repeated calls separately from avoidable ones. Compare equivalent prompts/settings; a successful page is not sufficient evidence of an efficient run.

For every reproducible defect:

1. Capture the smallest failing case and add a regression test at the cheapest appropriate layer.
2. Fix the responsible shared helper, transport, runtime or guidance. Use a Mac-only branch only when the cause is genuinely platform-specific; provider-neutral defects must be fixed for all affected providers. Never hide errors from the trace to improve the count.
3. Repeat the original uncoached prompt from a clean fixture and run at least one fresh equivalent prompt. Recheck both Codex and Claude when the path is shared; verify saved content and frontend, not just tool success.
4. Run applicable guard, typecheck and targeted tests. Create focused Core/Pro PRs with user-facing v2.3.2 changelog entries, before/after evidence and CI results. Do not merge or publish these new fixes automatically; send PR links to the release coordinator for review.
5. Any runtime fix invalidates the affected candidate artifacts. Return the new commit pair and required Pro pin update; wait for coordinator confirmation of replacement release pins before building final DMGs. Windows/shared regression checks and affected ZIP/Bridge rebuilds must use the same reviewed source. Never put uncommitted fixes into production DMGs or silently reuse the old hashes.

Do not mark acceptance passed with unresolved recurring errors or unexplained stalls. If blocked by credentials, hardware or the authorised ad hoc signing limitation, report the exact blocker and incomplete coverage instead of claiming a pass. Restore the original Bridge routing and stop only test-owned dev services at the end.

## Return and release hold

### Mac acceptance return — 15 November

The remaining feasible Mac acceptance checks are complete. Review [Core #148](https://github.com/pixflowdev/pixflow-design/pull/148) at `2a64d307d3b545242de72e2dbc281c6fec21acc1` and [Pro #82](https://github.com/pixflowdev/pixflow-design-pro/pull/82) at `a1c36cd46d59af5dd3c34356c4d3db43fb758fec`. Pro pins that Core head. All three Core and five Pro PR workflows passed. Neither PR was merged. The coordinator must review/merge both, update the Pro pin if merge commits change the exact Core revision, and confirm the replacement release pair before final DMG builds. Production remains unpublished; notarisation is explicitly waived by the owner.

Fixed and verified:

- Typed read-only media search/inspection and numeric post lookup arguments, with pre-dispatch validation. All 105 helper tests passed. Mutation shortcuts and the builder write guard remain unchanged.
- Pending questions now remain above the floating composer. Small/medium sizes, reload, collapse/reopen and custom-answer submission passed; 15 question/scroll tests passed.
- Shared Workspace-style shadcn/BaseUI tooltips across floating composer and native header controls. Fixed duplicate Core/Pro handlers and Bricks' forced350px minimum width. Both Bricks and WordPress admin showed one matching compact tooltip per control; 21 tooltip/composer tests passed.
- Bricks guidance now explains root section placement, element-specific grid controls and native CSS-value semantics. A final Claude run exposed `_gridItemColumnSpan: 3` meaning starting line3 rather than span3. Pro a1c36cd explicitly requires CSS strings such as `span 3`, `1 / -1` and mobile `auto`. The fresh uncoached Claude retest used correct spans immediately; desktop tiles measured685/334px and phone tiles358px each, stacked with18px gap and no overflow. No repeated span repairs in that retest.

Final live evidence (signed-in CLI, Medium reasoning; GPT-6.1 Sol, never Terra; Claude Opus5.5 expressly authorized):

| Check | Result |
| --- | --- |
| Sol full-page Harbour, final guidance | 162.32s, first text2.90s, 42 tools, zero failed calls; saved frontend and expanding FAQ independently verified. |
| Sol full-page Pottery, final guidance | 178.41s, first text3.40s, 40 tools, zero failed calls; saved content and FAQ independently verified. |
| Claude layout + journal + conditions | 325.48s, first text31.40s, 29 tools, zero failed calls; one grid repair prompted the final guidance correction above. Real preview pagination showed Aster/Birch on page1 and Clover with its dynamic excerpt on page2. |
| Claude fresh span regression retest | 175.50s, first text45.26s, 20 tools, zero failed calls. Correct values on first construction; saved desktop/tablet/phone checks passed. |
| GUI launch and page-context follow-up | LaunchServices launch with PATH=/usr/bin:/bin:/usr/sbin:/sbin and isolated config returned healthy2.3.2; automatic reconnect and discovery of Codex0.167.0/Claude2.1.309 passed. Authenticated Sol follow-up after navigating from Pottery417 to Harbour416 returned Harbour's correct business/hours:24.51s, six tools, no failures or writes. This tests the macOS GUI launch mechanism, not a literal Finder/Dock click. |
| Stop/reload | Text-only Sol run canceled after5.27s, zero tool calls. Reload retained Canceled, restored connection and idle Send; no replay. |
| Conditional visibility | Signed-in preview displayed the member note. Bricks' actual PHP renderer returned it for signed-in user and omitted it for user0. No publishing or draft-access bypass was used. |
| Bricksforge | Earlier form/scroll-animation acceptance passed with public MCP off: required fields, only local confetti action, actual opacity/translation transition. No form submitted, email, webhook or storage action. Native role/read-only/disabled-submission checks passed. |
| Intel smoke | Baseline x64 package launched successfully under Rosetta with healthy2.3.2 gateway and three packaged Node processes. Native Intel hardware unavailable; this is not native Intel acceptance or acceptance of the future rebuilt x64 artifact. |

Both providers had two distinct full-page briefs and tagged/untagged follow-ups across this acceptance cycle. Read complete traces rather than interpreting zero failed tool calls as zero layout revisions. Discovery calls were bounded; repeated post reads in final Sol briefs were before/after-save checks. Image-caption cleanup and preview verification were legitimate follow-ups. Stream-event timings are not browser-paint timings and warm library reuse prevents claiming a controlled speedup.

Validation: Core full repository typecheck passed; Pro guard, typecheck, build contract and clean ZIP build passed. Previous pairing/entitlement, native discovery/path and paired Bricks/Bricksforge suites remain passed (55 launch/path tests plus one skip; six discovery tests). Real Homebrew installations and native Intel hardware are unavailable on this sole Mac; owner previously authorized production with those limits. Final rebuilt installers still need package/signature/architecture/hash and launch smoke verification before upload.

Cleanup and evidence:14 unrelated page/post hashes stayed unchanged in the valid tail-test comparison (not proof for the earlier malformed baseline). Thirteen owned fixture posts/pages were moved to Trash. Restored only the test-changed builder post-types setting and Bricksforge feature activation. Removed the owned enquiry timeline through the official backed-up tool; Bricks had normalized its ID to `4be5cba6-be77-4103-8a3a-6cc21c6b4a3d`, and its name/page397 ownership was checked before removal. Generated media/shared styles were retained rather than risking unrelated consumers. Test browser tabs were closed. Test Bridge namespaces stopped and original2.3.0 Bridge routing restored and health verified. Local QA retains the latest2.3.2 Core/Pro plugins and test update pin for review; no staging/customer deployment occurred.

Evidence remains local under `outputs/mac232/`: sanitized `efficiency/fixed2/*.jsonl` and summary.json; condition-render-check.log; content-preservation-result.json; gui-launch-health.json; x64-health.json; cleanup-receipt.json; timeline-cleanup-result.json; final-root-typecheck.log and pro-final-* logs. Screenshots include efficiency/final-preview-acceptance.png and shared-tooltip/question evidence.

**Do not release the existing baseline DMGs.** They predate the runtime helper fix and remain local. The tested app runtime was Core6d6a951c/Pro9f17730d, which contains the final helper runtime; subsequent Core changes are shared plugin UI and Pro changes are WordPress-served guidance/pin updates. Latest local plugins were built cleanly from Core2a64d307/Proa1c36cd. No claim is made that the earlier app bundle contains the later plugin UI/guidance. Build both final DMGs only from the coordinator-confirmed reviewed pair, verify them again, and stage only in the assigned unpublished v2.3.2 draft. No draft ID is assigned yet. Ad hoc signing only; macOS Gatekeeper may warn or block these unnotarised downloads, as it rejected baseline packages during assessment.

Return `pixflow-design-bridge-2.3.2-mac-arm64.dmg`, `pixflow-design-bridge-2.3.2-mac-x64.dmg`, `SHA256SUMS-mac.txt` and `validation-receipt-mac.md`. Include exact pins, architecture, macOS version, signing status, checks, live results, known limitations and any packaging-only patch.

Stage locally or upload only to a coordinator-confirmed unpublished v2.3.2 GitHub draft. Do not reuse v2.3.1 releases or replace their assets. The coordinator-confirmed Bridge draft is release ID 445657482 (bridge-v2.3.2). Confirm draft=true before uploading. Report artifact location and hashes to the coordinator; publication remains on hold.

Before public release the coordinator must finish Windows install/upgrade acceptance, paired plugin upgrade/packaging checks, publish and verify the 18 exact language-pack hashes, and align website changelogs. Final order remains language packs, Bridge, then paired Core/Pro and website notes after explicit approval.

## Coordinator review and replacement pins — 15 November

Core #148 and Pro #82 were reviewed and merged into their v2.3.2 candidate branches. The Exact source pair at the top now supersedes the original acceptance pins. Both readme changelogs include the three new fixes from each repository, and Pro pins the replacement Core revision.

Windows reran all 105 direct-site helper tests and all 11 TooltipLayer tests successfully. Pro's three repository/build contracts passed. Original Mac PR heads had all three Core and five Pro workflows green. Candidate PRs #147 and #81 include the final documentation and pin updates.

Build final arm64 and x64 DMGs from the replacement pair, verify signatures, packaged Node, architecture, hashes and launch, and upload to the confirmed unpublished draft. Keep ad hoc signing and the explicit notarisation waiver. The coordinator must rebuild Windows and both plugin ZIPs, regenerate website notes, and refresh acceptance receipts against this pair before publication.