# Native Bricks MCP and Pixflow live editing assessment

Date: 2026-11-15. Scope: inspect local Bricks 2.4.2, official documentation and the current Core/Pro candidate. No production changes or native MCP activation. This is an architecture assessment, not an acceptance-tested integration.

## Recommendation

Reuse native Bricks capabilities behind Pixflow's structured tool server, with a small directly exposed tool set and a routed live-edit adapter. Do not enable every native writer and rely on prompt guidance to keep the agent on the canvas. Keep the existing Windows launcher, diagnostics, permissions, recovery and preview fixes.

The transport already uses MCP. The opportunity is stronger operation contracts, reliable capability discovery and fewer model-authored scripts, rather than replacing the acronym or connecting a second unrestricted editing server.

## Inspection evidence

Local theme source: `C:/Users/chris/Web Development/Pixflow.dev/Plugin/pixflow-design/.tmp/publication-audit/upgrade206-204/site/wp-content/themes/bricks/includes/abilities/`.

The local PHP inspection returned Bricks 2.4.2, masterEnabled=false, 170 ability catalogue entries across 27 categories, and zero registered native Bricks abilities. The master setting was unchanged. The reference image schema returned name, label, nestable, controls and controlGroups. These probes inspected the internal catalogue/schema without enabling MCP, invoking a write or granting an agent access. They do not establish end-to-end MCP performance or permissions correctness.

Reviewed registration and enablement in `manager.php`, authoring workflow in `start-here.md`, element reads/writes and permission gates in `elements.php`, `save-pipeline.php`, element schema/normalizer/validator, design context, workspace preview/apply, conditions, queries and permission management. Inventoried the other ability categories; not every callback has been executed or security-audited.

Official source: https://academy.bricksbuilder.io/builder/features/ai-abilities-and-skills/ . Bricks describes these abilities as experimental and advises local/staging use. Local installed registration is authoritative for exact names and schemas; the documented direct-tool examples differ from the installed named-tool shortlist.

## Capability mapping

| Area | Native support inspected | Recommended integration |
| --- | --- | --- |
| Design system | Combined context, palettes, classes, variables, theme styles, components, breakpoints; resource versions/ownership | Reuse read APIs; retain Pixflow revision-aware context snapshots, bounded responses and explicit freshness. Overlay unsaved canvas state where applicable. |
| Element controls | Runtime schema from registered controls plus canonical/virtual definitions | Expose typed element-schema tool; include third-party controls and version-aware caching. Avoid model inspection of raw stores. |
| Page structure | Scoped reads, summaries, digests, insert/update/remove/batch writers | Reuse schemas and validation; route edits to the bound Pixflow live canvas, then save through its acknowledged path. |
| Validation | Normalization, IDs, parent/child relationships, components, setting schemas, code restrictions, filter ID uniqueness | Validate proposed candidates before applying; return exact field errors. Validation must not silently discard settings. |
| Dynamic content | Tag catalogue/previews, queries, conditions, forms, interactions | Expose task-specific native-backed reads and validated live patches. Verify actual matching/nonmatching content and pagination. |
| Complex edits | Canonical workspaces, expected digests, preview/apply and resumable changesets | Reuse concepts and suitable pure planning/validation functions; do not report a native commit receipt for a merely staged canvas edit. |
| New visual pages | HTML/CSS conversion/import and foundation orchestration | Investigate as an optional authoring path; conversion fidelity and class/token integration require separate tests. Do not replace Pixflow design/media workflow blindly. |
| Global/site changes | Templates, queries, fonts, icons, navigation, settings, imports, maintenance | Explicitly classify by resource and permissions. Synchronize affected live state after server writes; never indiscriminately refresh a dirty canvas. |
| Permissions / PHP | Sensitive features have distinct opt-ins and capability checks | Preserve those gates and admin deny-lists. No blanket enable-all or global settings changes as a side effect of pairing. |
| Verification | Saved-tree readback and rendering | Retain browser viewport, interaction, draft and frontend checks; valid structure is not visual or factual correctness. |

## Critical save-path difference

Native `Elements::set_page_elements` and partial writers call `Save_Pipeline::execute`/`execute_partial`. That pipeline normalizes, checks permissions/code, validates, snapshots a WP revision, writes post metadata with concurrency checks, and triggers CSS regeneration via `wp_update_post`. It has no Pixflow live-canvas/follower dispatch. A WordPress revision is not the open builder's Undo entry.

Pixflow Pro `apps/web/src/pro/bricks/direct-bricks-tools.ts::executeLiveTool` binds commands to a post and expiry, checks read-only mode, plans edits against the live snapshot, then calls the existing native canvas `set`; the existing browser integration supplies follower feedback and Undo. `bricks.save` is separate. Preserve that route.

Do not call a native saved-document writer and then replay its changes into the canvas: that introduces duplicate saves and stale/unsaved-state races. An adapter must plan/validate, check the current canvas revision, apply once, save once and return a receipt identifying each completed stage. Native dry-run helpers often read persisted baselines; they need explicit treatment of unsaved canvas state and cannot automatically be treated as pure validators for live documents.

Core `wordpress/src/Admin/DirectSiteWorkspace.php` currently forwards authorized `ability.call` operations to the registered ability's execute method. Enabling native writers would therefore create an alternative saved-document write path. Enforce routing centrally for all dispatch aliases, not just direct tool names. A hidden direct tool can still be callable through the generic dispatcher.

## Why this can help recent failures

| Observed failure | What would address it |
| --- | --- |
| Treating keyed theme styles as an array | Stable native-backed context response, normalized at the Pixflow boundary. |
| Guessed control names/image alt field | Authoritative runtime control schemas and preflight validation. |
| Placeholder boolean in an element array | Typed input and candidate validation before canvas dispatch. |
| Repeated discovery and PHP/database detours | Small first-class tool shortlist, cached capabilities and bounded exact-target reads. |
| Windows script policy / missing argument files | Existing structured MCP transport and retained launcher/file safeguards; native Bricks alone does not fix fallback commands. |
| Hardcoded REST paths | Host-owned dispatch using discovered site routes; no model-authored REST fetch needed. |
| Similar taxonomy names matching accidentally | Exact IDs and structured intent plus positive/negative rendered tests; syntactically valid conditions alone are insufficient. |
| Unsourced business/performance claims | Content evidence/review, not MCP selection. |
| Preview assertion or browser interaction failures | Existing verification fixes and dedicated interaction tests, not replacing writers. |

## Proposed implementation order

1. Capability adapter: detect actual enabled abilities/version, respect the master switch, constants, user rights and per-ability denies; keep the current supported fallback on older Bricks.
2. Direct typed tools for context, scoped live reads, element schema, validated patches, query/condition configuration, save and verification. Keep long-tail tools discoverable on demand. Preserve existing paired-site authorization and all provider transports.
3. Native-backed validation with a live revision-bound mutation plan; centrally route every equivalent writer through the canvas path for active pages. Define separate synchronized authority for global resources.
4. Operation IDs and durable receipts spanning validation, apply, save and verification. After interruption inspect status; never repeat an uncertain write automatically.
5. Trim redundant guidance only after the stronger tools pass acceptance. Retain design intent, factual-copy constraints and task-specific skills.

## Acceptance before switching the default

- Compare the current and adapted paths on the same natural briefs, model/reasoning, site fixture and Restricted environment. Measure tool calls, schema discovery, scripts, failures, retries, duration, token use and quality.
- Run full and complex builds with Codex, Claude, Grok and AntiGravity. No corrective follow-up prompts counted as first-pass success.
- Assert follower feedback, native Undo/Redo, save readback, desktop/mobile layout, images and interactive elements.
- Test unsaved human edits, another-tab edits, navigation to another page, stale revisions, Stop, reload, Bridge restart and disconnect after apply/before receipt.
- Test unavailable/disabled abilities, non-admin users, code restrictions, third-party element schemas and older Bricks fallback. Generic dispatch must not bypass routing or permissions.
- Verify queries and conditions against positive and negative examples, exact taxonomy IDs, draft exclusion and second-page results.
- Compare global classes/variables/theme styles before/after and confirm no duplicate or lost resources.

No speedup or universal first-pass reliability is claimed by this inspection. A native-backed adapter is justified, but all 170 abilities enabled unchanged is not the recommended design.

## Adapter implementation checkpoint

The first adapter implementation adds `bricks.native.catalogue` and `bricks.native`, reusing registered native input schemas and permission checks. Generic `ability.call` requests for Bricks also pass through the adapter; unknown native writers cannot bypass the canvas. Registered read-only abilities execute through their own native callbacks. The catalogue explicitly distinguishes native reads, adapted live writes and unsupported writers.

Currently adapted writers: `bricks/update-element` and `bricks/batch-update-elements`. These require an explicit canvas, post ID and fresh live revision, merge settings against unsaved canvas state, and call the existing native canvas set once. Save remains explicit. Unsupported options and writers fail closed rather than silently changing semantics. This is an in-principle implementation checkpoint, not completion of the comprehensive capability mapping: structural authoring, global resource synchronization, conversion and compound changeset adaptation remain outstanding.

Small-test evidence (no full provider runs):

- Local Bricks 2.4.2 catalogue/schema smoke: 170 registered abilities and actual image control schema. Discovery was enabled within the CLI process only; persisted settings unchanged.
- PHP adapter permission/routing checks pass under Windows PowerShell reporting Restricted.
- 29 live-tool unit tests pass, including native batch merging and stale revision rejection.
- Headless Chrome on local draft 3081: candidate adapter changes one existing heading using the installed canvas bridge; native Undo restores its original text. No save or publication. Follower uses the unchanged set path; animation appearance was not separately visually signed off.
- Core and Pro guard/typecheck pass; Pro build-contract tests pass. A first Pro typecheck used the wrong default paired checkout and was rerun successfully with explicit PIXFLOW_DESIGN_CORE_ROOT. An initial test discovery also included stale scratch copies; the focused current-source run excludes .tmp.
- The Chrome harness initially used an incorrect invocation envelope; corrected to `{tool, arguments}` and the edit/Undo smoke passed. This was harness code, not a provider run.

No plugin packages, Bridge builds or live site files were installed or published for this checkpoint. Native reads and canvas application were tested separately; complete authenticated relay/provider acceptance is still outstanding.

## Structural, shared-style and compound checkpoint

The subsequent implementation adds live add/remove/set-tree operations, including child promotion and subtree reordering. Single-canvas changesets prepare all steps before one application and one native Undo entry. A server-side validation endpoint checks native full-tree permissions, code restrictions and tree validity against saved and live baselines; the browser rechecks its revision after validation.

Shared-style sync uses server-owned saved snapshots and a three-way merge with the original and locally edited resources. It covers classes, variables, categories, palettes and theme styles, rejects conflicting edits, and participates in the same Undo/Redo entry. This is synchronization, not blanket native global-writer passthrough.

Small-test evidence: 38 focused unit tests, PHP routing/scope checks under Restricted PowerShell, actual installed schema/normalization checks, and headless Chrome compound insert/update with class/variable/theme sync. Receipt replay did not duplicate edits; native Undo/Redo restored structure and all shared state; the receipt remained available after reload. No save or publication occurred. Temporary local fixture files were restored. Core/Pro guard and typecheck, and Pro build-contract checks passed.

Browser-session receipts distinguish applied from uncertain outcomes and prevent blind replay. They describe historical application, not the current document after Undo. Multi-page changesets and unsupported writers remain blocked. Full provider acceptance and follower animation visual sign-off remain deferred at the user's request.
