# v2.1.4 deployment preparation

30 October 2026. The owner requested coordination with the website chat to update changelogs and prepare deployment. This is a preparation record, not publication approval. Preserve customer content, chats, settings, credentials and permissions; keep Team separate. Do not replace existing published packages, change updater pointers or alter checkout logic during preparation.

## Change ownership and draft copy

Core owns the following user-facing changes. Their focused PRs already update `CHANGELOG.md` and plugin `readme.txt` under Unreleased. Consolidate those entries once during release integration; do not duplicate them in Pro or repeat v2.1.3 changes.

| Change | PR | Exact review head | Validation |
| --- | --- | --- | --- |
| Reliable Claude sign-in and recovery | [#63](https://github.com/pixflowdev/pixflow-design/pull/63) | `3047e0cdfeb1860434ff077a846610de705536e1` | Three executed workflows passed; Windows direct and real manual-code native authorization passed |
| Minute usage refresh | [#65](https://github.com/pixflowdev/pixflow-design/pull/65) | `ca87cb5e33877bffc987725921b4e32644289c57` | Free and Unified chat workflows passed, including all 16 usage tests; both installed composers passed |
| Composer tooltip overflow | [#67](https://github.com/pixflowdev/pixflow-design/pull/67) | `c058d90e3582b74c4444b6e772aa252450c4aea8` | Final Free and Unified CI both passed; marked ready for review without merging. Installed builder/viewport evidence remains applicable |
| Shared minute polling follow-up | [#68](https://github.com/pixflowdev/pixflow-design/pull/68) | `5e088f7669258b1c8c45912402c5988aaa7c106f` | Mac found duplicate reads with both composers mounted. Unified CI passed; independent 21 usage/tooltip tests, guard and full typecheck passed. Manually dispatched Free CI and Mac installed retest remain pending |

Proposed website Core copy, to reconcile against final plugin files:

- Keep Claude sign-in available after authentication and resume an existing sign-in attempt when settings reopen.
- Reopen Claude's official authorization page and complete a returned authorization code directly in WordPress, with cancellation and automatic connection refresh.
- Recover temporary sign-in request failures without starting duplicate logins or falsely marking a healthy Bridge disconnected.
- Discover the authorization address from the selected official Claude runtime while retaining domain and authorization-request checks.
- Refresh Codex and Claude usage rings and hover summaries every 60 seconds in visible tabs, and refresh overdue readings when returning to a tab.
- Prevent hovering composer controls from adding page scrollbars in the Bricks floating panel while preserving tooltip position and theme.

Do not claim that every customer-specific network/authentication failure is resolved. Non-Bricks fixtures used existing native title tooltips in the tested state: their page dimensions stayed unchanged, but this is not a new custom-tooltip feature there. No extension update, publication or approval is part of this release scope.

No additional Pro-owned user-facing implementation has been approved in these four PRs. The planned Pro source pin/version is release metadata, not a new premium feature. The website owner must derive any Pro note from actual accepted Pro changes since the live baseline. If a Pro package is released solely as a paired build, describe that fact plainly rather than copying Core bullets or inventing fixes. Include #68 within the existing usage-refresh changelog group; it is a correction to the unreleased behavior, not another premium feature.

The [final CI and release PR review](2026-10-30-v214-pr-review.md) records exact runs, the stacked PR #68 integration caveat and the separate, unfinished history fixes. It supersedes earlier queued-CI observations in this preparation record.

## Website coordination

The existing website chat, **Inspect Pixflow migration scope**, received the above scope, exact review heads, test limitations and preparation-only authorization. It acknowledged that it would prepare v2.1.4 draft notes/plans and verify the live baseline before reconciliation. The prior website record confirms v2.1.3 deployment, but the website owner must reverify current production rather than promote an old private preparation snapshot.

Website ownership: separate draft changelog entries, current public baseline, private/staging readiness and rollback plan, immutable language delivery, download/updater candidate reconciliation, account/download UI and applicable Mac signing disclosures. Plugin/Bridge ownership: PR review, release source integration, exact Pro Core pin, plugin/Windows/runtime artifacts and installed/package evidence. The Mac agent owns its targeted acceptance, final versioned build pair and both DMGs/checksums. No component may substitute a moving branch tip or a merely similar local build for its recorded artifact identity.

## Frozen test input versus release input

The [Mac handoff](2026-10-30-mac214-usage-handoff.md), documentation commit `125fe55859343d2c707a617b958faddf2ac0cce9` on `codex/mac214-usage-handoff`, identifies the combined runtime test input:

- Core `601ab8f1d7d307b6211dc3e6ca4e9d64ab1b0ff0`, branch `codex/tooltip-integrated-check`; later `c2d8ad64` changes test readiness only.
- Released Pro baseline `68995f19d42a005ca327e41186bba7c2a086c12b`, module API 14.

Mac's focused polling correction is `5e088f7669258b1c8c45912402c5988aaa7c106f`, based on that combined Core runtime. The original test input is no longer sufficient evidence for the corrected polling behavior. Final builds must include this correction after its installed retest; retain the earlier targeted evidence rather than restarting the broad acceptance matrix.

These inputs still identify as v2.1.3. They are not final v2.1.4 production pins or artifacts. Mac preparation must retain all three fixes, produce clean release-only v2.1.4 source commits, record the exact Core SHA in Pro's manifest and validate without the development pin override before packaging. Keep one extension-ready DMG per architecture, retaining the direct route. Reuse prior broad installer acceptance; add only the targeted tests and the tooltip hover smoke described in the handoff. Report Rosetta and signing/notarization status accurately.

## Deployment clearance gates

1. Review the focused PRs and verify CI against the exact final heads. Resolve competing Unreleased changelog insertions into one deduplicated section during authorized integration. No merge is authorized by this record.
2. Freeze the clean, versioned Core/Pro build commits and exact Pro Core pin. Reconcile Mac build sources with the final Windows/plugin sources; document any component-specific differences instead of relabelling old inputs.
3. Build the final Free ZIP, Pro ZIP, Bridge runtime ZIP, Windows installer and supported install scripts/manifests from those inputs. Verify versions, package boundaries, upgrade/data preservation and direct/extension connectivity. Do not reuse current v2.1.3 test outputs as v2.1.4.
4. Receive both exact Mac DMGs, checksums, targeted acceptance and upload/download receipts in draft `bridge-v2.1.4`. Verify architecture, identity, native helper, runtime version and disclosed signing status. Do not clobber published release assets.
5. Generate language packs from the final merged translations. Claude recovery adds strings; usage/tooltip fixes add no new strings. Verify plugin manifests against exact immutable pack bytes, retain prior hashes and stage those bytes before publishing packages that pin them. Do not infer final hashes from earlier generated outputs.
6. The website owner reconciles exact size/SHA256 for every final artifact, updater/download manifests, language objects and Core/Pro changelog copy in staging/private preparation. Preserve existing checkout/licensing logic and customer data; keep rollback and old public artifacts available.
7. Obtain final deployment clearance. Then publish only the reconciled bytes through the normal process and verify public downloads, updater, language packs and changelogs. Public deployment, package replacement, GitHub release publication and extension submission remain on hold under the current request.

PR #67's exact-head CI gate is closed successfully. PR #68's remaining Free CI, installed retest, release-version/pin, build and artifact gates remain open. No final release manifest or checksum is fabricated while the Mac build is in progress.
