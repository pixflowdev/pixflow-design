# Live builder mailbox cache recovery

Reported during a Claude/Bricks inspection on an owner-authorized staging site running Core/Pro 2.1.3. The canvas mutation completed, but its following geometry inspection never reached the browser. This is shared server relay behavior, independent of the selected agent.

## Evidence and cause

- Read-only SQL inspection found an expired `bricks.run` mailbox row. `get_option()` returned `false` for the same key, and the persistent `notoptions` cache contained that key. The browser's canvas heartbeat was fresh; the command had no SQL execution claim.
- The run journal recorded 352 rejected `bricks.read` submissions while result polls remained pending. Reconnection alone could not clear the SQL reservation hidden from the poller.
- `reserve()` already invalidated the option caches. A concurrent absent read can repopulate the negative cache after invalidation, so invalidation alone is insufficient for coordination. Stale positive command entries can also survive completion.

## Invariant

Mailbox and claim reads use the primary-key SQL row, matching the existing `INSERT IGNORE` reservation and conditional completion delete. Non-coordination option reads retain WordPress caching. Missing SQL rows are empty; SQL errors fail closed. Ownership, capability checks, originating-tab binding, expiration and result authorization are unchanged.

## Verification

- `wordpress/tests/direct-canvas-mailbox-cache.test.php` fails on the released baseline at the hidden-command assertion and passes with the fix. It exercises stale negative and positive command/claim caches, expiry without execution, late completion, subsequent command delivery, reload reconciliation and database failure.
- Core navigation, reconnect and builder handoff PHP suites pass (190 handoff assertions).
- The retained Pro relay suite passes against the changed Core in an isolated fixture, including Bricks, Etch, Elementor and Gutenberg targeting, expiry/renewal, shared entities, feedback and uncertain result preservation. The test double was adapted locally to provide SQL `get_var` and `maybe_unserialize`; no Pro runtime source changed.
- `pnpm guard` and `pnpm typecheck` pass.
- Applied only the tested Core PHP file to the staging site, atomically after verifying its previous SHA-256 and preserving its owner/mode. No server backups, database restores, cache flushes, service restarts, content saves or published package changes.
- The existing heartbeat settled the expired, unclaimed inspection automatically. A new owner-authenticated, read-only REST session submitted a real `bricks.read` and received its browser result in 1,667 ms, with post 37554 and 186 elements. The session was revoked in `finally`.
- The original editor tab was never reloaded. Native readback retained 186 elements. A later read reported no unsaved changes; this check did not invoke Save and does not attribute any independent save to the fix.

This is a Core PHP fix. It requires neither a Bridge rebuild nor a Pro implementation change. Team work and published 2.1.3 artifacts remain untouched. The isolated evidence/log workspace is retained locally; customer conversation bodies and credentials are not committed.
