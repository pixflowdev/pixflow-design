# Synthetic agent replay fixtures

The mock CLIs render locally authored synthetic events in the native protocols
accepted by Pixflow Design. They need no provider credentials, network fetch or
LLM calls. Existing renderer code retains its upstream Apache-2.0 attribution through
`LICENSE` and `THIRD-PARTY-NOTICES.md`; no separate renderer licence overrides
were found. Fixture payloads use that same repository licence and contain
no customer sessions, prompts, session IDs or exported telemetry.

```bash
export PATH="$PWD/mocks/bin:$PATH"
export OD_MOCKS_TRACE=synthetic-success
export OD_MOCKS_NO_DELAY=1
echo "example" | claude -p --output-format=stream-json
bash mocks/scripts/smoke-test.sh
```

On Windows, invoke `node mocks/mock-agent.mjs --as claude --no-delay` directly
and pass the prompt on stdin; the `bin/` wrappers require a POSIX shell.

`recordings/synthetic-success.jsonl` covers Read, Write, Edit, Bash and final
assistant text. `synthetic-failure.jsonl` covers a failed tool result;
`synthetic-empty.jsonl` covers a textless completion. These are synthetic parser
regression examples, not recordings of current CLI behavior. `manifest.json`
records their hashes, sizes and provenance. Add only authored, reviewed synthetic
payloads to this public corpus; keep private local replay data untracked.

Selection keeps the existing environment interface:

| Variable | Behavior |
| --- | --- |
| `OD_MOCKS_TRACE` | Fixed fixture ID or unambiguous prefix |
| `OD_MOCKS_BY_PROMPT_HASH=1` | Deterministic fixture selected by prompt hash |
| `OD_MOCKS_POOL` | Select `agent:claude`, `skill:parser-regression`, `outcome:failed`, or matching tags |
| `OD_MOCKS_SEED` | Reproducible random selection |
| `OD_MOCKS_NO_DELAY=1` | Skip replay waits |
| `OD_MOCKS_RECORDINGS_DIR` | Explicit private/local fixture directory override |

The wrapper names cover opencode, claude, codex, gemini, cursor-agent,
deepseek, qwen, grok, devin, hermes, kilo, kimi, kiro, vibe and vela, including
CLI aliases. Plain and JSON streaming renderers share the same neutral fixture
format. ACP wrappers implement JSON-RPC initialize, session/new and
session/prompt. Vela additionally supplies test-only login/models commands and
the session/set_model gate. Its login smoke check uses a temporary home directory.

Golden daemon event snapshots run without downloads:

```bash
pnpm --filter @open-design/daemon test mocks-golden
# After an intentional parser change, regenerate and review:
MOCKS_GOLDEN_UPDATE=1 pnpm --filter @open-design/daemon test mocks-golden
```

`mocks/scripts/contract-check.sh` is a separate, manual comparison with a real
installed CLI. It makes a real provider call and is never part of offline smoke
validation. Synthetic examples prove parser regressions only; they do not prove
compatibility with a newly released real CLI.
