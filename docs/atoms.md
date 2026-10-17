# Pipeline atom reference

> Stable atom identifiers exposed to personal and installed plugin manifests.
> The inherited bundled atom-plugin catalogue is retired; this reference describes the runtime contract.
> Spec: [`docs/plugins-spec.md`](plugins-spec.md) §10.
> Source of truth: [`apps/daemon/src/plugins/atoms.ts`](../apps/daemon/src/plugins/atoms.ts).
> Live discovery: `GET /api/atoms` (also reachable via `od atoms list --json` in a future PR).

A **plugin** assembles atoms into ordered stages (`od.pipeline.stages[].atoms[]`).
The Pixflow Design daemon is responsible for resolving each atom into a system-prompt
fragment, tool gating, and (when applicable) GenUI surface declarations. Plugins
never own the atom implementations; they only reference them by id.

## Reading this document

- **id** — what you write inside `od.pipeline.stages[*].atoms[]` and
  `od.context.atoms[]`. Stable across daemon versions.
- **status** — `implemented` (live in v1) or `planned` (id reserved; the daemon
  will accept it but emit a doctor warning until the matching atom is wired in).
- **task kinds** — which of the four product scenarios (`new-generation`,
  `code-migration`, `figma-migration`, `tune-collab`) the atom is intended for.
  Plugins may reference an atom outside its declared task kinds, but doctor
  flags this as suspicious.

## Implemented atoms (v1)

| id | label | task kinds |
| --- | --- | --- |
| `discovery-question-form` | Discovery question form — turn-1 question form for ambiguous briefs. | `new-generation`, `tune-collab` |
| `direction-picker` | Direction picker — 3–5 direction picker before the final commit. | `new-generation`, `tune-collab` |
| `todo-write` | Todo write — TodoWrite-driven plan. | all |
| `file-read` / `file-write` / `file-edit` | File ops on the project cwd. | all |
| `research-search` | Research search — Tavily-backed shallow research. | `new-generation` |
| `media-image` / `media-video` / `media-audio` | Media generation through configured providers. | `new-generation`, `tune-collab` |
| `live-artifact` | Create / refresh live artifacts. | `new-generation`, `tune-collab` |
| `connector` | Composio connector tool calls. | `new-generation`, `tune-collab` |
| `critique-theater` | 5-dimension panel critique; emits the `critique.score` signal that drives devloop convergence. | all |

## Planned atoms (reserved ids)

These ids are reserved so plugins authored against the v1 spec do not have to
churn names when the daemon adds the matching capability. Until promotion, the
daemon treats references as "doctor warning" rather than "unknown atom error".

| id | label | task kinds |
| --- | --- | --- |
| `code-import` | Clone / read existing repo. | `code-migration` |
| `design-extract` | Extract design tokens from source code / Figma / screenshots. | `code-migration`, `figma-migration` |
| `figma-extract` | Extract Figma node tree + tokens + assets. | `figma-migration` |
| `token-map` | Map extracted tokens onto the active design system. | `code-migration`, `figma-migration` |
| `rewrite-plan` | Long-running multi-file rewrite plan. | `code-migration`, `tune-collab` |
| `patch-edit` | Small-step file patches. | `code-migration`, `tune-collab` |
| `diff-review` | Render rewrite as a reviewable diff. | `code-migration`, `tune-collab` |
| `handoff` | Push artifact to downstream surfaces (cli / cloud / desktop). | `tune-collab` |

## Runtime ownership

Plugin manifests reference atom identifiers through `od.pipeline.stages[*].atoms[]`. Parsing, validation, stage execution and prompt assembly remain runtime responsibilities in `apps/daemon/src/plugins/` and `apps/daemon/src/prompts/`. The removed `plugins/_official/atoms/` tree is not a current source or extension destination. Essential Home and Website Clone routers live in `guidance/`; package paths and saved plugin identifiers remain compatible.

## Atom signals + the `until` vocabulary

Spec §10.1 locks the v1 `until` vocabulary to:

- `critique.score` — emitted by `critique-theater`.
- `iterations` — built-in per-stage counter.
- `user.confirmed` — emitted when a `confirmation` GenUI surface resolves.
- `preview.ok` — emitted by the live-artifact preview pipeline.

Atoms outside that list contribute signals through `critique.score` (which is
how today's `build-test`-shaped community plugins encode pass/fail). Phase 7
(spec §21.4) extends the vocabulary so atoms can declare named signals
through `od.atom.untilSignals[]`; until then, the closed vocabulary is the
contract.

## Adding a new atom

1. Author the atom out-of-tree as a plugin (per spec §22.5 promotion path).
2. Once the SKILL.md / MCP tool / pipeline shape stabilises, append the
   matching row to `FIRST_PARTY_ATOMS` in `apps/daemon/src/plugins/atoms.ts`.
3. Update this runtime reference, the manifest contract and focused validation in the same PR. A new bundled catalogue requires an explicit product decision.
4. The atom is now reachable via:
   - `od.pipeline.stages[*].atoms[]` references in any plugin,
   - `GET /api/atoms` discovery,
   - `od plugin doctor` validation.
