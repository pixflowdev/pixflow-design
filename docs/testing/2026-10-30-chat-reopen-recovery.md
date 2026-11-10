# Retained chat reply recovery on reopening

An owner reported that closing a Bricks floating panel, changing pages and reopening it showed only the beginning of the previous Claude reply, together with an invented successful completion and an elapsed time extending to the reopen time.

## Reproduced persistence defect

The durable-history hook treated every initial in-memory snapshot without a browser outbox as insert-only migration input. After importing and reading the older server row, it removed the retained local snapshot from the pending writes even when that snapshot contained an appended final reply based on exactly the same acknowledged revision. Hydration then replaced the fuller local reply with the server prefix.

The fix recognizes only a narrow retained live continuation: same assistant identity and positive revision, still-active saved row, exact content and activity prefixes, actual added content/activity, unchanged other metadata, and no legacy-display provenance. It retains that snapshot in the outbox and saves it through the existing compare-and-swap API. A newer server revision, divergent activity, legacy snapshot, or terminal saved row still wins. No arbitrary stale-revision rebase was added.

## Recovery and validation

- A regression failed on the main baseline because the fuller reopened reply was never saved. It passes with the fix. Negative cases cover a newer server revision, a legacy display snapshot and divergent earlier activity.
- The durable-history and history-client suites pass together (115 tests). Core guard and full typecheck pass.
- The original Bridge SQLite database was opened read-only. Its 1,974 durable events retained the entire reply and its interrupted terminal event. No agent work was rerun.
- The affected staging message was restored through the normal owner-authorized HistoryService using an exact revision check (96 to 97), with its shortened previous version retained in historyRecoverySnapshots. Readback verified the entire reply and all 458 translated activity events, original interrupted status and original terminal timestamp.
- No content, settings, other messages, server backups, database restores or published packages changed. Temporary server recovery payloads were removed.
- A separate Pro correction preserves revision-backed lifecycle fields in both native and React restore paths. Its regressions fail before that correction and pass afterwards; the paired semantic-preflight/round-trip suites pass (42 tests).

The remaining installed-browser close/navigation/reopen check was blocked when browser control timed out and the Windows helper stopped because it could not confidently verify Chrome's current URL. No reload, Retry or further UI input was attempted. The new browser source fixes are not represented as installed-browser accepted or deployed release artifacts.
