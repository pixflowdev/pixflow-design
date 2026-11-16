# v2.3.3 Mac acceptance PR review

Publication remains on hold. This addendum accounts for the Mac follow-up PRs without replacing the earlier release source inventory.

## Reviewed changes

| Core PR | Change |
| --- | --- |
| #159 | Explicit approval policy for the reserved, run-bound Pixflow MCP tools |
| #160 | Canonical temporary-directory aliases for bounded run-file reads |
| #161 | User-controlled reasoning/tool disclosure; corrected stream and fallback-renderer tests |
| #162 | System certificate trust for MCP child processes |
| #163 | Workspace helper invocation through canonical path aliases |
| #164 | Compact Workspace session authorization header |
| #165 | Saved conversation binding before continuation and Plan admission |
| #166 | Builder-owned handoff recovery and semantic empty tool-input comparison |

| Pro PR | Change |
| --- | --- |
| #89 | Saved Plan rows excluded from active run detection |
| #90 | Validate new native Bricks element IDs before dispatch |
| #91 | Preserve native canvas object identity in compound Undo/Redo |

## Windows local verification

- Core #165 and #166 combined: 112 browser tests passed across direct-site admission, history recovery, run reattachment and ProjectView restoration.
- All eight Core branches combined: 168 browser tests passed; 34 daemon tests passed, with two Unix path-alias cases skipped on Windows.
- Additional #161 fallback-renderer corrections: 74 focused disclosure and renderer tests passed.
- Builder handoffs PHP: 202 checks passed.
- Pro paired Bricks/native transaction: 40 tests passed; saved Plan run controls: 13 passed; native canvas history: 2 passed.
- Core guard and root typecheck passed for the corrected branches. Pro guard, paired typecheck and three repository-contract tests passed. The Pro dependency links were refreshed to the explicitly selected Core checkout before the successful typecheck.
- Locale tests passed separately: 14. No locale source or language-pack pins changed in these PRs.
- A broad local browser-suite attempt was interrupted after it stopped producing progress. It is not counted as a pass. The first broad attempt exposed two additional obsolete auto-expanded tool expectations, now corrected in #161. Release merges require successful GitHub checks independently.
- Both release-note formats were compared: 30 Core and 18 Pro entries match exactly.

## Scope limits

See the chronological Mac acceptance report for the exact editor-supplied excerpt limitation, older-Bricks coverage, native Intel/Rosetta distinction and unsuccessful unattended ad hoc updater experiment. These are not silently marked passed. Production DMGs and refreshed Windows/plugin packages still require final artifact verification after the source pair is frozen. Team, comments/Feedback and Tauri remain excluded.

The merged Core source `a4e7741732881a0e7c7c435731b208f0a38ae6d8` differs from the tested combined branch only in CHANGELOG.md and readme.txt. Core changelog PR #167 also passed CI and merged.

Pro source `2c19c1b6719dc90981721f61d2b79274e82dad54` pins that clean Core checkout. Frozen dependency installation, setup:core, Pro guard, paired typecheck and repository-contract tests passed again for the final pin. Pro #92 and this handoff PR require successful CI before production packaging.
