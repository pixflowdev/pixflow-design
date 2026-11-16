# Direct provider launch and structured Pixflow tools

Date: 2026-11-15. Local candidate only; published packages and provider configuration remain unchanged.

## Launch audit and change

Most providers already launched without a shell. The gap was inconsistent preparation: probes recognised JavaScript entry points, while chat/model/usage paths generally used the platform wrapper directly. Codex warm, turn and voice processes bypassed even that wrapper. A configured script could therefore pass discovery but fail execution; a Windows batch fallback could work in a usage probe but fail a Codex turn.

`apps/daemon/src/runtimes/invocation.ts` now owns `createAgentInvocation`:

- Native executable: executable plus an argument array, no shell.
- JavaScript entry point: Bridge Node runtime plus script path and arguments, no shell.
- Windows batch shim: existing platform `cmd.exe` escaping and verbatim-argument handling. Do not replace arbitrary vendor wrappers with guessed internals: wrappers may prepare environment or select a bundled runtime.
- Probe execution explicitly sets `shell: false`; project-neutral probe working directories remain unchanged.

Consumers include ordinary chat, direct-site chat, Codex warm/turn/voice, OpenCode serve, connection tests, Claude sign-in/model/usage, Codex/Grok usage, text generation, memory generation and Vela sign-in. Existing executable selection, provenance, authentication environment, process cleanup and stream parsers remain the owners of those concerns.

Intentional exceptions: the user-requested interactive sign-in terminal opens a shell so the terminal remains visible; ordinary OS utilities, Git and package-manager commands are not provider invocations. These do not need to be routed through a provider-specific abstraction.

## Structured tool access investigation

We should reuse the existing WordPress tools and authorization, not create a competing Bricks implementation. Current building blocks:

- Workspace helper: `workspace-builder-session.ts`, with three allowlisted handoff/discovery tools and a scoped connection.
- Direct-site helper: `direct-site-run.ts`, existing site tools, context synchronization and capability handling.
- Per-turn MCP injection: `pixflow/direct-site-mcp.ts` supports Codex, Claude and OpenCode. This was the initial set for Pixflow MCP. The expanded configuration matrix is below.
- ACP session setup supports MCP server descriptors; actual provider acceptance still needs verification.
- Existing daemon stdio MCP plumbing: `mcp-live-artifacts-server.ts`, `runtimes/mcp.ts` and the `od mcp` CLI. Extend/reuse the protocol plumbing, but do not give site sessions artifact or connector permissions accidentally.
- API tool loops are a separate execution surface. API mode must retain WordPress-side dispatch when the Bridge is disconnected; do not make it depend on launching an MCP subprocess.

### Local proof

An isolated stdio MCP adapter invoked the **actual generated Workspace helper** using Node and an argument array. The provider saw typed tools; the helper retained the existing allowlist and authenticated HTTP dispatch. A local fixture represented WordPress and recorded the request.

Both real Codex and Claude CLI runs selected `pixflow_builder_destinations`, returned the Services draft and made exactly one `builder.destinations` request. Neither generated a shell command or changed PowerShell policy. Both ran with a Restricted parent policy and used the new provider invocation function. This proves interoperability and reuse for discovery, not complete production acceptance or a real-site mutation.

| Provider path | Evidence / disposition |
| --- | --- |
| Codex | Per-thread MCP config already supported; real local discovery proof passed. |
| Claude | Per-run MCP config already supported; real local discovery proof passed. |
| OpenCode | Per-run MCP config and serve path exist; configuration/turn tests passed. Live Pixflow MCP acceptance remains to do. |
| ACP providers | Session descriptors support MCP; verify each installed provider before advertising support. |
| Grok Build, Antigravity and additional adapters | See the expanded matrix below. |
| API providers | Reuse the same server-side schemas and dispatch via function calls; Bridge-independent acceptance required. |

### Implemented local candidate

The callable dispatcher is now shared by native helpers and a run-local stdio adapter. MCP operations do not spawn a helper for each call. Most supported local adapters receive isolated configuration. Native helpers cover unsupported clients and approved fallback paths. API mode remains unchanged and Bridge-independent.

Workspace exposes the existing three handoff tools. Site sessions expose progressive tool discovery and structured calls into the existing catalogue. WordPress remains authoritative for capabilities, authorization and validation. The model cannot choose a different connection or endpoint through the adapter. A connection fingerprint prevents an old adapter from borrowing renewed credentials.

Cancellation aborts pending requests. Interrupted writes retain uncertain-operation evidence; neither the adapter nor fallback automatically repeats them. Codex MCP error results and nested handoff receipts are preserved in delivery reporting. External MCP configuration and entitlements are separate. No saved CLI configuration is changed.

This is an internal transport for existing UI/CLI operations, not a new user-facing capability requiring a separate od command. Helpers remain directly executable.

### Acceptance evidence and limits

- Real local Codex and Claude CLI runs under a Restricted PowerShell parent environment completed discovery and permitted handoff through the adapter. Neither used PowerShell policy bypass. The endpoint was a local WordPress permission fixture, not a live builder.
- Both providers handled a denied handoff with one write request followed by status inspection. Their final replies reported the refusal instead of claiming success.
- 157 focused daemon tests passed across structured tools, helpers, MCP configuration, Codex turns/workers and stream results. Coverage includes read-only permissions, stale-session rejection, renewed authorization, cancellation, uncertain writes, reload reattachment and no duplicate dispatch.
- Real Codex and Claude processes were stopped during a pending handoff using the production process-tree stop function. Each dispatched exactly one handoff; neither retried it. Fresh real runs then completed successfully for both providers. Adapter EOF/cancellation and recovery are additionally covered by deterministic tests.
- Repository guard, complete typecheck and 14 web delivery tests pass.
- Live OpenCode acceptance is still outstanding. See the expanded matrix for additional provider work.
- Chrome acceptance used the local WordPress Bricks floating panel, a rebuilt dev Bridge, and matching Core and Pro browser bundles served only in the test browser context. Codex and Claude completed live Media Library reads through Pixflow MCP, with no shell calls. The first Claude run used shell commands before the conflicting helper guidance was corrected.
- Reload reattached to the running conversation. Before the fix, Stop reused the credential already consumed at reattachment and WordPress rejected it. With the fix, both providers reattached and Stop sent a fresh WordPress credential. Bridge returned HTTP 200 with cancellation accepted and persisted both outcomes as canceled.
- After cancellation, both providers started a new turn in the recovered panel using a real WordPress read-only session. The Chrome test requested the existing guidance-draft scope and verified that WordPress returned a read-only credential before submitting each run. Each provider made exactly one structured draft-creation request. WordPress returned HTTP 403, both providers reported the refusal, and neither retried or switched to a shell helper.
- The post-reload Stop regression passed in the 75-test web panel suite. The 111 focused daemon tests, repository guard and full typecheck passed.
- A follow-up Chrome test reproduced the restart failure by pressing Send while the port was down. The first health check failed before the provider request. The initial health check now retries transient connection errors for up to 12 seconds, within the caller timeout. A refused or stalled first probe is covered by regression tests, along with an offline Bridge and an explicit 403. Only the health GET is retried. Both Codex and Claude completed their Media Library lookups in the same Chrome document after separate dev Bridge restarts.

Published packages remain unchanged. This candidate is not release sign-off.


### Expanded provider configuration

- Grok Build runs with the isolated ACP stdio adapter for structured Pixflow turns. Pass the server in session creation. The installed headless route loaded no servers during real probes even though its configuration inspection listed a project entry. Endpoint calls in the initial smoke tests were native helper calls. A subsequent ACP run confirmed a real `pixflow_builtin__pixflow_tools` result. ACP turns send the saved conversation context because each owns a fresh local ACP session.
- Antigravity uses the workspace MCP config and registers the Pixflow tools eagerly. Its CLI rejects a contradictory effort flag when a model ID already fixes a reasoning level. Matching effort and other model IDs retain their existing launch behavior.
- Cursor and Qwen use project configuration with provider-managed approvals. Copilot and Qoder use per-invocation configuration flags on the Workspace path, MiMo uses its existing config content variable, and other ACP adapters receive the standard stdio descriptor where the Workspace session supports it. These are configuration integrations, with live acceptance still needed.
- Keep helpers for CLI paths without a verified unattended MCP integration. Preserve existing workspace and global provider configuration and provider approval policies.
- Test environment uses process-level Restricted PowerShell for the localhost dev Bridge and its child processes. A child Windows PowerShell process reported Restricted and refused a test script with PSSecurityException. No persistent execution policy was changed.

### Bricks builds under Restricted PowerShell

Two natural requests were submitted through the local Bricks floating panel. Grok Build saved the 64-element Harbour Heat landing page as draft 2986. The saved frontend rendered at 1440px and 390px without page overflow. In-page links resolved to their sections and the native FAQ toggled in Chrome. The run still used the Windows command fallback for the large build payload and encountered timeouts in its own preview verification.

Antigravity saved the 32-element Advice Hub as draft 2987. Chrome verified three published posts from the requested category, their native dynamic titles, dates and links, the second page, the Planning tag condition and the missing-image and excerpt conditions. The trace still includes repeated Bricks PHP probing, a malformed native insert, and an unresolved live command after save. Saving the right result did not make that run a clean first pass.

The follow-up adds run-local JSON and script files to the existing MCP call so large inputs do not require a shell helper. An actual Grok ACP turn dispatched a file-backed call exactly once against a local endpoint fixture. Pro now rejects a malformed native element before modifying the canvas. The agent instructions name the native insertion shape, the existing query references and the expected response to a pending preview. The full builds above predate these follow-up changes.

A foreground Grok follow-up on the rebuilt candidate completed against the saved draft. The signed-in preview verified a closed FAQ item opened and revealed its answer at 1280px and 390px. The tool also correctly reported an initial-state mismatch and a selector with no match on two earlier verification recipes. The successful recipe required no shell commands or draft edits. This verifies the preview transport and interaction, with room to reduce discovery before selecting a recipe.

Antigravity also completed a foreground follow-up on the rebuilt candidate. Its fifth signed-in preview call verified the rendered cards and page-two link at both widths. The earlier recipes exposed an invalid check shape and selectors with zero or multiple matches. Chrome independently followed the actual link and verified the second page. Both builds remain drafts. Clean first-pass complex builds and live acceptance of the other newly configured clients remain open.

Windows PowerShell 5.1 on the test machine had `LocalMachine: Restricted` and `CurrentUser: Unrestricted`. The separate PowerShell 7 process had `LocalMachine: RemoteSigned`. The process-scoped test policy was confirmed from Windows PowerShell 5.1 itself and no stored scope was edited.

### Four-provider retest after restoring the Windows client policy

After the user removed the `CurrentUser` override, Windows PowerShell 5.1 reported `Restricted` in a fresh process with no process override. Running a harmless `.ps1` failed with `PSSecurityException`. The local dev Bridge was restarted with Restricted inherited by its children. Each provider received the same two natural briefs in separate browser sessions. The seeded local category was renamed from Builder QA Heating to Harbour Heat Advice to match the request; its ID, slug and posts were retained.

| Provider | Full page draft and run time | Advice Hub draft and run time |
| --- | --- | --- |
| Codex | 2992 · 6m 28s | 2993 · 5m 10s |
| Claude Code | 2994 · 6m 11s | 2995 · 4m 20s |
| Grok Build | 2996 · 17m 54s | 2997 · 10m 05s |
| Antigravity | 2998 · 12m 33s | 2999 · 6m 17s |

All eight turns completed and kept their pages as drafts. Signed-in Chrome verified the four FAQs, the four query loops and page-two links, dynamic titles, dates, optional images and summaries, and tag-dependent labels at desktop and phone widths. No test page had horizontal overflow. Claude’s complex draft included a second main landmark; the shared Bricks guidance now calls out the outer landmark supplied by the theme.

These were functional completions with workflow defects. Antigravity made 19 PHP calls on the complex task and reused an earlier local draft’s element tree. Grok’s full page repeated saves and layout checks. Antigravity supplied `codeFile` inside the tool arguments and Grok tried to dispatch a file before writing it. A multi-match pagination assertion and a link-presence check without a value produced false preview failures, and a click on an accordion title child missed the actual disclosure control. Some medium-sized reference receipts were truncated at about 10 KiB.

Follow-up fixes let providers retrieve named schemas together, return small misses for unknown tools, use smaller file-backed skill receipts and get an actionable response for missing inputs. The transport accepts a nested script filename without widening the approved run directory or relaxing existing dispatch checks. WordPress’s native post list can filter by exact category and tag and sort by publication date. Saved previews can check match counts, missing elements and attribute presence, and click the enclosing permitted disclosure from its nested label. The existing form and navigation guard remains in force.

The fixes were tested with the real Antigravity CLI against a local MCP fixture, the local WordPress query service and signed-in Chrome against the saved drafts. The browser reproduced and then passed the originally failing link check at both widths. Core and Pro validation suites passed. The eight original build traces predate these follow-up fixes, so they do not establish clean first-pass performance on the final candidate.

After another Restricted dev Bridge restart, Antigravity completed a real floating-panel follow-up against the updated local candidate in 73 seconds. It used one batched schema request, filtered native category and tag queries, and two successful saved-preview calls. The trace contained no PHP execution, failed tool calls, identical requests or edits. This was a verification task on an existing draft; the original complex build time includes construction and is not directly comparable.

### Fresh full-build retest on the updated candidate

The same two briefs ran against new drafts 3018–3025 through the Bricks panel. Windows PowerShell 5.1 rejected the script probe with `PSSecurityException`. Matching PHP and locally built browser assets were served from the local fixture only. All four complex traces used the native category and tag filters, including Antigravity, which had used 19 PHP calls in the preceding round.

The first runs exposed additional recoverable input mistakes. A generic MCP discovery call now routes to schema discovery, and batches containing WordPress ability names identify them without executing any ability. The file-backed transport accepts a full path when it resolves to a direct child of the current run. Credential files and out-of-run paths remain rejected. Grok’s missing-directory search also prompted clearer guidance about site catalogue identifiers and downloaded reference paths.

The preview parser accepts `expectation` as an alias for `expect`, allows a count to require a visibility state for every match, and identifies incomplete click checks by index. Chrome confirmed those shapes on the actual saved Grok draft at desktop and phone widths. A click still requires an explicit postcondition. Real Antigravity and Grok CLI fixture runs under Restricted confirmed the corrected discovery and file-backed dispatch receipts.

Gemini 4 Argon could not be used for a separate build. Antigravity CLI 1.5.9 and the Bridge both returned the same account-scoped list with Gemini 3.8 Flash and no Gemini 4 entries. Explicit probes for Argon, Hydrogen and Carbon were rejected by the CLI during model selection. The Antigravity matrix builds ran with Gemini 3.8 Flash (High).

| Provider | Full page | Advice Hub | First-pass observations |
| --- | --- | --- | --- |
| Codex | 3018 · 4m 35s | 3019 · 3m 00s | Full page had no failed calls; the complex build recovered from a batch containing ability IDs. |
| Claude Code | 3020 · 6m 37s | 3021 · 2m 22s | Both builds completed without failed calls. |
| Grok Build | 3022 · 18m 42s | 3023 · 8m 45s | Full build had two failed calls and repeated preview recipes. The complex build had no failed calls and verified both pages. |
| Antigravity | 3024 · 11m 28s | 3025 · 7m 14s | Full build recovered from a misrouted discovery call and repaired a missing survey anchor. The complex build had no failed calls or PHP probes. |

All eight completed without a second user prompt. Chrome independently checked the saved pages at 1440px and 390px. The query pages rendered three published records followed by the fourth through the pagination link, and the example without a featured image, excerpt or Planning tag omitted those elements. The final browser check waited for the paginated content to arrive before reading it. Antigravity used static FAQ content on its landing page. The other three pages had working interactive FAQs. The later fixes passed targeted tests; a complete first-pass matrix after those patches remains unverified.

### Restricted rerun with an exact-tag check

The next matrix repeated both original briefs on fresh local drafts 3041–3048. The Windows PowerShell 5.1 policy was still Restricted. Chrome tested the saved frontend on 1440px and 390px viewports. To verify the Planning condition more rigorously, a temporary local fixture gave one matching post both Planning and Planning permission, and gave one nonmatching post Planning permission alone.

The combined text, visibility and count assertion uncovered by Codex now runs as a single supported saved-preview check. The original heading assertion passed on the saved draft at both widths. A deliberately incorrect heading was still rejected with the actual match count. Grok's trace also used this combined assertion on the Advice Hub. Text or attribute checks for a specific card still require a selector for that single card.

Focused schema lookup now resolves slash-delimited names against this site's available WordPress abilities. It reports an unavailable name separately without invoking it or relaxing WordPress permissions. The Bricks references now distinguish native ability discovery from a standalone MCP's tool names. Exact tag guidance uses a native post-term expression with delimited term IDs. In the local Bricks runtime the test posts returned |75|80| for the two tags, |80| for the similar tag alone, and |75| for the exact tag alone.

Short inspections can pass code directly through MCP. File-backed calls still require a completed write inside the run before dispatch. The Bricks design instructions also require specific claims and credentials to have supporting evidence from the brief or site.

| Provider | Full-page draft | Advice Hub draft | First-pass outcome |
| --- | --- | --- | --- |
| Codex | 3041 · 5m 38s | 3042 · 2m 59s | Full preview rejected the combined assertion. Advice Hub called an unavailable ability before recovery. |
| Claude Code | 3043 · 7m 06s | 3044 · 2m 09s | Both runs had zero failed commands. The Advice Hub label incorrectly matched Planning permission in the expanded fixture. |
| Grok Build | 3045 · 14m 19s | 3046 · 7m 01s | Full page had no failed commands. The Advice Hub output was correct but needed corrected preview recipes. |
| Antigravity | 3047 · 14m 10s | 3048 · 9m 46s | Full page recovered from a filename called before it was written and included an unsupported performance claim. Advice Hub tried 17 unnecessary PHP probes, including three failed calls, before completing. |

All eight runs completed and saved native, unpublished Bricks content. All four full drafts passed desktop and phone FAQ interaction and overflow checks. The Advice Hubs rendered the intended article order and second page. Claude's near-match badge was the conditional-data failure. Six complete cases were selected for a fresh live rerun with the corrections.

The fresh build reruns used drafts 3068–3073. All four Advice Hubs completed with no failed tool calls and no PHP probes. Chrome verified exact Planning matches, conditional images and summaries, and pagination for all four. Antigravity's complex build went from 17 PHP probes (three failures) to zero. In this round it still spent time on ordinary reference lookup.

The full-page reruns exposed two further details. Codex's image initially inherited generic attachment alt text until it set the native image element's altText. A read-only preview check that duplicated its selector at the top level incorrectly required one match. An independent browser test reproduced the rejection on four cards and passed with the fix at both widths; the same test verified the rendered alt and confirmed a click matching multiple disclosures was still refused. Antigravity's full page had two rejected calls (an assumed /wp-json route and an insert with a boolean placeholder) and repeated an unverified temperature claim. The next full-page checks include guidance for WordPress data tools, complete file-backed mutations, concise shared-class receipts and native alt text.
