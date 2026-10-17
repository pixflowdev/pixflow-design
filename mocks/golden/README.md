# Daemon event snapshots

Each `<agent>-synthetic-success.events.json` stores the actual daemon event
sequence from the locally authored `recordings/synthetic-success.jsonl` fixture.
Claude, Codex and OpenCode preserve coverage of tool starts/results, text and
usage. Volatile session identifiers are normalized by the daemon test.

Run `pnpm --filter @open-design/daemon test mocks-golden`. To update intentionally,
set `MOCKS_GOLDEN_UPDATE=1`, rerun that command, and review every event change.
Fixtures and snapshots are committed together; missing data fails the test.
