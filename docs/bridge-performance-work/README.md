# Pixflow Bridge chat performance

This work covers all Pixflow Bridge chat providers. The goal is to reduce the time from Send to the first visible response while preserving chat history, follow-ups and recovery. The Bridge can share its approach to those features across providers, while each provider uses the session and worker capabilities it actually supports.

## Reference case: the Codex app

Reviewed 10 November 2026 using the installed Windows Codex app (26.1103.4239.0, bundled CLI 0.167.0-alpha.3.2), the public App Server protocol and the Pixflow Core source. These observations describe Codex. They inform the shared plan without assuming that other providers offer the same native features.

- The desktop app starts a host-scoped Codex App Server and keeps a JSONL connection open. Eligible new chats can prewarm an empty native thread without asking a model to respond. The app checks the workspace, permissions, instructions and feature configuration before consuming a prewarmed thread.
- A follow-up starts a new turn on the same native thread. Steering targets the current turn by ID. Interrupting a turn, reconnecting to a live run and reloading an inactive thread are separate operations. The app can unload an inactive thread without stopping its process.
- The desktop client reads thread metadata and loads transcript pages independently. A stored thread can resume with `excludeTurns: true` so the client does not need the full transcript in the response. A local probe using synthetic history verified that the bundled binary reopened the same thread after it was unsubscribed and unloaded. The process stayed alive and the probe made no model request. An empty prewarmed thread has no persisted history until it is materialized.
- Native working context can be compacted independently of the visible transcript. Optional Codex memories carry selected information across chats and are maintained in the background. Required instructions belong in project guidance. The installed app also checks a context key before injecting certain passive context updates into the native thread.
- Skills expose names and descriptions for discovery, then load full instructions when used. Explicitly selected skills are passed as structured turn input.

[App Server protocol](https://learn.chatgpt.com/docs/app-server) · [Codex memories](https://learn.chatgpt.com/docs/customization/memories?surface=app) · [Skill loading](https://learn.chatgpt.com/docs/build-skills)

## Where Pixflow does extra work

The [Codex turn runner](../../apps/daemon/src/pixflow/codex-turn.ts) already uses App Server for chat, steering, progress and compaction. Each turn spawns the server, initializes it, starts or resumes a native thread and tears the process down at settlement. The Bridge keeps a separate [run log and recovery path](../../apps/daemon/src/pixflow/direct-site-routes.ts), including request admission, journalled tool outcomes and reconnecting to an active run.

The [floating panel history path](../../apps/web/src/pixflow/working-context.ts) imports visible messages into WordPress, reads the saved transcript in pages and reconstructs it before the Bridge decides whether it can reuse a native thread. The initial inspection found that the [native reuse check](../../apps/daemon/src/pixflow/direct-site-lineage.ts) hashed only the last two messages. The first candidate patch now hashes every supplied role/content pair, so an earlier edit, deletion or insertion invalidates native reuse. This does not replace the authoritative revision checkpoint proposed below. Some conversation identity is also scoped to browser session storage, which limits dependable reuse after reopening.

The [floating panel](../../apps/web/src/pixflow/WpAdminAgentFrameApp.tsx) can send earlier attachments with the new request. The [site tool preparation code](../../apps/daemon/src/pixflow/direct-site-run.ts) downloads and stages each attachment in sequence. It resolves explicitly selected skills, and ordinary chat can discover other skills on demand. The reviewed runs showed no compulsory skill reads before the first reply. API chat has its own [WordPress working context path](../../apps/web/src/pixflow/direct-site-byok.ts).

## Shared implementation direction

1. Start the last selected supported provider when the Bridge starts and reconcile it with the floating panel. Keep the selected worker alive without an idle timeout. Manage loaded threads independently so inactive chats can release resources. Validate Codex first because Pixflow already speaks its native protocol. Evaluate other providers on their own lifecycle capabilities.
2. Bind native continuation to the authorised WordPress site, user and saved conversation. Verify an authoritative history checkpoint that catches edits, deletions and writes from another tab. Keep the durable transcript and execution checkpoint consistent. A matching checkpoint permits sending only the new turn input. Resume an unloaded thread by ID and rebuild from saved history when the native state is missing or the checkpoint disagrees.
3. Preserve durable admission, queued messages, steering, Stop and reconnect. Interrupt only the active turn. Resolve ambiguous delivery against the existing run before any retry. Keep the current editor target and permissions live on every turn, including when a reused thread changes tabs.
4. Keep stable instructions with the thread, send changed editor context and reuse authorised attachment references. Use native compaction for native threads and the existing WordPress path for API chats. Treat cross-chat memory as a separate product choice with explicit site and user boundaries.

For each provider, measure Send, Bridge admission, provider submission, first provider text and first visible text. Keep the model, reasoning level and service tier consistent between that provider’s baseline and candidate. Compare a new chat, a long follow-up and a reopened chat. Test Stop, reload and another tab during a write, plus attachment and skill reuse. Process startup and protocol measurements do not establish how much faster a real reply will appear.

## Candidate status: measurement and continuity foundation

The first patch is isolated on `codex/direct-chat-latency`, based on Core `5eb247a00e79543568e274672eca4f5ae5171cdd`. It has not been installed on a customer site, published or added to release packages.

- Browser timings start before editor and history preparation. The bounded local `pixflow.direct-run` User Timing entry records those milestones, licence/session preparation, Bridge request/headers, first text received and first text published to the panel. The existing Bridge terminal timings are attached under `detail.bridge` using a strict scalar allowlist. Prompts, responses, tokens and URLs are not collected.
- Codex protocol initialization, native thread readiness and model submission have separate timings. Spawned CLI transports record submission at process/input delivery. Empty text deltas do not count as a first response. An existing run replay retains its original Bridge timings, while the viewer's timings describe that attachment; these are not a new model latency sample.
- Sending a prompt no longer waits for an extra Bridge config fetch. The Bridge already resolves its current guidance preference at admission, and explicit request overrides remain supported.
- Native continuity now compares all supplied role/content history. Old incompatible checkpoints rebuild naturally from the existing saved conversation; no history is deleted.

Validation: the new protocol-stage and earlier-history regression tests failed before their fixes and passed afterwards. Focused browser tests cover Codex, Claude, Grok and Cursor, with controlled preparation delays and private payloads. Direct-site admission, steering, Stop/reconnect, native compaction, API chat, durable history, session authorization, CLI and synthetic parser replay suites passed. `pnpm guard`, workspace `pnpm typecheck` (after rebuilding contract declarations) and `git diff --check` passed. These are offline regression checks, not evidence of a measured production speedup.

Next is the persistent-provider lifecycle. Keep process ownership separate from turn ownership: Stop must interrupt the intended turn, a lost acknowledgement must not repeat a write, and changing sites or users must not reuse another conversation's context. Validate those guarantees before enabling startup warming. The selected supported provider should then remain warm without an idle timeout; providers lacking a supported persistent protocol need their own measured path.

## Candidate status: persistent Codex worker

The local candidate starts and initializes Codex App Server when daemon preferences select Codex. Initialization sends no model request. An exclusive lease supplies the initialized process to direct text chat. Each turn still opens or resumes the authorized thread with its current workspace, permissions and tools. A successful unsubscribe makes the worker eligible for reuse; Stop, failed teardown or a provider switch retires it. Overlapping turns keep isolated processes. There is no idle timer.

An isolated Windows daemon with saved Codex preferences started a worker before a prompt. Switching to Claude through the settings endpoint removed the Codex process; switching back created one replacement. A real CLI follow-up recalled a test word on the same PID. Stop and a subsequent native resume on a fresh PID passed. A local HTTP test detached an active reader and reconnected through resume-stream with fresh session authorization: the original response and one successful terminal event were returned. These were runtime tests, not a visual browser reload or a measured first-token benchmark. Shutting down the isolated daemon left no matched processes.

Claude, Grok, Cursor and other CLI adapters still use their existing execution paths. Their process protocols and workspace/session ownership must be validated individually before enabling persistent reuse.

## Windows floating-panel benchmark, 10 November 2026

Local WordPress admin floating panel in Chrome on port 18364, candidate development Bridge on 17481. Both paths used gpt-5.6-luna, Medium, standard speed. Synthetic one-word prompts required no tools; the panel still performed its normal site preparation. Native baseline was codex exec --json in an empty directory, followed by exec resume. Its times are launch to first agent-message event, not process exit or an already-open interactive TUI. Panel timings are the external click to visible answer, including browser automation observation. Small exploratory samples, not percentiles.

| Path | New chat | Recall follow-up | Recall after Chrome reload |
| --- | --- | --- | --- |
| Native | 5.60 s; 4.83 s | 3.61 s; next resume 7.15 s | N/A |
| Panel, worker disabled | 9.21 s (another trial showed 10 s to completion only) | 11.36 s | 10.21 s |
| Panel, worker enabled | 9.15 s; 8.38 s | 9.54 s | 12.34 s |

The installed panel changed its own provider preference without changing the candidate daemon's saved provider. For the comparison, explicitly selected Codex through the loopback Bridge configuration and verified the standby process persisted across turns and reload. Reverted the panel provider/model, daemon preference and local daemon namespace afterward. Do not assume a standby child proves a particular turn leased it: add a scalar lease-hit indicator to the browser timings before wider sampling.

In the installed panel's bounded timing entry, the licence milestone was 2.07–2.39 s and site session ready 2.86–3.15 s from its internal start (cumulative, not additive). Its timer starts later than the external click. The next comparison should include the matching candidate frontend, separate the pre-submit stages, and overlap independent preparation while preserving authorization and expiry checks. This small sample does not isolate a reliable end-to-end cold/warm improvement.

Chrome restored both completed turns and recall worked. Reloading a longer admitted turn restored a partial list then completed all 25 entries once in the chat. Reloading immediately after Send, before admission, preserved the prompt and marked it interrupted with explicit resend guidance.

Claude Code 2.1.312 answered two successive stream-json user messages correctly in one PID with the same session ID; no tools, MCP servers, slash commands or persisted chat were needed for the probe. EOF after the second result exited cleanly. Do not globally pool that process: it remembered the previous turn and its launch configuration fixes the workspace and tool context. Consider an exclusively leased worker for a single authorized site/user/conversation only, with fresh per-turn tool authorization, config invalidation, bounded worker count, verified interrupt handling and isolation tests before enabling it.

## Paired chat follow-ups

On 10 November a dedicated local Chrome tab loaded the candidate JS and CSS together. The normal admin page used its original bundle. The first send in the test tab confirmed the pairing and showed text at 6.88 s. Two recall follow-ups used the warm Codex worker and resumed the native thread. They issued zero browser licence requests and showed the correct replies at 5.56 s and 4.71 s. History and the WordPress session were ready concurrently within 0.98 s. The Bridge then spent 0.83–0.89 s authenticating ownership and submitted to Codex 1.12–1.17 s after receiving each request. Both resumed prompts were about 12 KB. The desktop app was not timed. Two short follow-ups fall within the earlier CLI range but do not establish latency parity across workloads.

## Session preparation and ownership follow-up

Measured on 10 November 2026 against the local WordPress test install with the matching candidate JavaScript and stylesheet (SHA-256 prefixes 727A807A and 106BE377). Each surface received the same two no-tool recall questions in its existing chat. The panel and CLI used Luna Medium. Desktop used the app's selected GPT-6.1 Sol Extra High, so it is a workflow reference, not a controlled model comparison.

| Warm follow-up | Recall | Uppercase recall | Timing boundary |
| --- | ---: | ---: | --- |
| Floating panel | 5.716 s | 5.423 s | Send to first visible answer |
| Native CLI | 4.473 s | 4.094 s | Process launch with exec resume to answer event |
| Codex Desktop | 2.302 s | 2.127 s | App task start to recorded assistant message |

The panel reused both the warm worker and the native conversation. WordPress session ready: 1.139/1.017 s from send; history ready concurrently: 1.647/0.981 s. Subsequent Bridge ownership: 0.861/0.877 s. The authorized feature registry is now read once per ownership response, and session creation skips retiring an already-disabled preference. No cross-request entitlement cache. These samples do not show an end-to-end speedup over the previous two panel runs. The remaining opportunity is eliminating a separate WordPress bootstrap (e.g. prepare history and issue the session in one authenticated request); benchmark that separately before changing the trust boundary.

## Matched Codex benchmark with combined WordPress setup

For saved floating-panel conversations with up to 50 acknowledged messages, the session POST now carries the conversation binding. WordPress reads the first page through HistoryService before issuing the session. The panel checks the returned rows against its local messages. If more pages or revision reconciliation are needed, the existing history flow handles them. The Bridge performs its own ownership request on every turn.

Three local warm recall prompts on 10 November 2026 used gpt-6.1-sol with xhigh reasoning and the same Codex binary version (0.167.0-alpha.3.2). Chrome loaded the combined candidate JS (59dc3f9d) and CSS (106be377). Each surface produced cedar, CEDAR and cedar cedar.

| Surface | Recall | Uppercase | Repeat twice |
| --- | ---: | ---: | ---: |
| Floating panel, send to first visible text | 6.931 s | 6.260 s | 7.766 s |
| Direct CLI, exec resume process launch to answer event | 5.640 s | 4.794 s | 5.284 s |
| Desktop, task start to recorded assistant message | 1.969 s | 1.855 s | 2.686 s |

Panel history and session were ready together at 0.953, 1.163 and 2.114 seconds. The Bridge then authenticated ownership in 0.823, 1.261 and 1.020 seconds. All three panel turns reused the native thread. These measurements compare workflows and include their normal context and startup differences. Earlier panel samples used Luna Medium, so they cannot establish the speed change from combining the requests.

### Prepare on floating panel open and after durable reply save

Local Chrome, same Sol/XHigh settings and recall sequence as above. Opening the panel does not submit an agent turn. The in-memory session can be claimed once within 60 seconds; an unknown binding, expired preparation or changed editor uses the ordinary Send path. Long conversations retain paginated history. The Bridge still authenticates the owner after Send.

| From Send | WordPress ready | Bridge ownership (inside Bridge) | First visible text |
| --- | ---: | ---: | ---: |
| Immediately after opening (about 1.2 s to enter and submit) | 1.471 s | 0.786 s | 6.940 s |
| Warm recall | 0.085 s | 0.809 s | 5.722 s |
| Uppercase | 0.046 s | 0.861 s | 5.506 s |
| Repeat twice | 0.051 s | 0.900 s | 4.413 s |
| First send after browser reload (final candidate) | 1.618 s | 0.832 s | 7.870 s |

All five used the preparation. Every follow-up recalled the word. The first send after reload waited for entitlement readiness, even though its prepared WordPress session was available. Warm median time to first visible text was 5.506 s versus 6.931 s in the previous three-sample panel run. Provider timing varies; these are observed runs, not a guaranteed saving or proof of desktop parity.
One further warm send after reload and durable persistence reused the preparation and native thread: WordPress ready 0.125 s, ownership 0.868 s, first visible text 4.923 s; correct uppercase recall.

### Attached Codex thread and incremental follow-ups

Windows, 10 November 2026. Three warm no-tool recall prompts per mode, same installed desktop Codex binary and GPT-6.1 Sol XHigh. The daemon adapter benchmark starts immediately before worker acquisition and ends at the first text event. The desktop figures are the earlier local app measurements from task start to recorded assistant message.

| Path | Recall | Uppercase | Repeat | Median |
| --- | ---: | ---: | ---: | ---: |
| Warm worker, resume thread, full follow-up | 4.730 s | 4.213 s | 5.904 s | 4.730 s |
| Attached thread, full follow-up | 1.808 s | 2.513 s | 2.874 s | 2.513 s |
| Attached thread, changed context | 1.941 s | 1.898 s | 2.724 s | 1.941 s |
| Codex Desktop, previous matched reference | 1.969 s | 1.855 s | 2.686 s | 1.969 s |

Resume used 221–241 ms before submission. Both attached modes used 0–1 ms. The synthetic browser context produced 1,766–1,788 bytes per full follow-up and 32–54 bytes per incremental follow-up. The three modes ran consecutively. Provider variation contributes to the differences. The repeated word was recalled throughout. The final repetition in the incremental run retained uppercase from the preceding instruction.

In Chrome, a real long floating-panel conversation initially missed its standby process. The selected provider's launch configuration is now reconciled with the executable and environment resolved for Send. With that correction, two follow-ups used 44 bytes each. They reached first visible text at 5.980 and 6.036 s, respectively. History became ready at 2.991 and 2.918 s after Send. The Bridge verified ownership in 0.792 and 0.945 s. Provider submission to first text took 1.975 and 1.980 s. The longer saved-history path remains a material difference from desktop.
A second saved Desktop run on the same model and reasoning gave 4.102, 3.402 and 4.266 s on the same recall sequence, for a median of 4.102 s. Both historical desktop samples use task start to recorded assistant text. In Gutenberg the same chat switched from draft 2443 to 2444, appended a native paragraph and saved, then switched back and saved a different paragraph on 2443. Direct database inspection verified both original paragraphs, both additions on their intended posts, and both draft statuses.

### WordPress history revision and local recall, 10 November 2026

On an acknowledged floating-panel turn, WordPress binds the session to an ordered revision of saved messages through the preceding message. The panel prepares all pages of that prefix. The Bridge validates it as part of the existing ownership GET before admitting a new run. A changed prefix gets one pre-admission refresh. The existing lineage comparison then decides whether the native thread can continue. Messages queued beyond the cutoff belong to later turns. Unacknowledged browser writes retain the existing reconciliation path.

The local Chrome test used the existing timing-fixture conversation on port 18364 and the development Bridge on 17481. The saved transcript had 74 messages at the first count. In the same conversation, Codex recalled the first message (“marigold”) after reload. An authenticated revision-checked edit in a second Chrome tab changed the original fixture instruction from Amber-417 to Violet-832. The first tab remained open and returned Violet-832 on the next Send.

| Send | First visible text | History ready after Send | Native thread reused |
| --- | ---: | ---: | --- |
| Initial context build | 9.479 s | 2.260 s | No |
| Prepared follow-up | 3.597 s | 0.066 s | Yes |
| First send after reload | 8.983 s | 4.292 s | Yes |
| Recall of earliest message | 2.950 s | 0.063 s | Yes |
| After cross-tab correction | 10.322 s | 4.276 s after refresh | No |

These are single observations per scenario. Preparation can overlap licence/pairing readiness and editor initialization. The history-ready timestamp includes that overlap. The browser still sends normalized history to the Bridge for lineage validation and recovery. On the two prepared follow-ups the native provider input was 68 and 118 bytes respectively.

### First Send after reload, 10 November 2026

A module reload lost the paired-site hint. The reproducible extra requests were WordPress licence status and the local Bridge central-entitlement read. A second Chrome run isolated a separate delay: licence readiness took 68 ms, but the prepared credential was unavailable after activity in another tab, and history was ready only at 4.181 s. A recent central pairing now leaves a non-secret hint scoped to the tab, site, WordPress user and Bridge URL. The Bridge remains authoritative on each protected request. WordPress revision checks allow a prepared snapshot to survive outbox notifications. A revision-bound session can fetch up to 100 history rows in its first response.

The final candidate's two consecutive first sends after reload reached visible Codex text in 4.227 and 3.816 s (previous candidate 8.983 s). In both, the prepared session and native thread were reused. Licence readiness took 1.049 and 1.046 s, and Bridge ownership took 1.419 and 1.209 s. The initial run establishing the new hint took 5.106 s. The original first word was recalled. With 96 messages, a second tab edited the locker instruction. The first tab detected the revision, rebuilt context and answered Ochre-296 in 8.809 s. Timings start at Send; restoring the dashboard and enabling the composer are separate costs.

### Reload to composer readiness, 10 November 2026

Chrome reloaded the local WordPress dashboard with the same open floating panel and long Codex conversation. An opt-in test populated the composer with a recall question and clicked the real Send button at the first enabled observation (25 ms polling). Times below start at navigation, including the WordPress document and panel bootstrap.

| Build | Reload to Send enabled | Reload to first visible reply |
| --- | --- | --- |
| Before, run 1 | 15.83 s | 24.28 s |
| Before, run 2 | 15.56 s | 19.81 s |
| After, run 1 | 5.82 s | 11.61 s |
| After, run 2 | 4.38 s | 11.54 s |

The baseline resolved ownership, imported already-saved browser copies twice and then read the transcript. The optimized resolve optionally includes the authorized latest page. Stored identities require no imports; missing rows and genuine pending writes still follow the migration and recovery paths. Passive synchronization and Bridge ownership on Send remain enabled. Both optimized runs recalled marigold. These are two observations per build on one machine, not a latency guarantee; the first baseline did not reuse the prepared session.

### Send versus native CLI, 10 November 2026

Same installed Codex executable, gpt-5.6-luna, Medium. The no-tool prompt asked for the first remembered word; both paths returned marigold throughout. The panel used the existing long WordPress conversation; native exec resume used its own seeded thread. Native timing starts at process launch and ends at the first agent-message JSON event. This is not an interactive TUI benchmark.

- Native follow-ups: 3.468, 3.564 and 4.805 s (seed excluded).
- Baseline immediate Send after reload, first presentation callback: 7.388 and 5.989 s on the attached thread. WordPress preparation accounted for 5.041 and 3.889 s.
- Final immediate Send after reload, first presentation callback: 5.201, 5.335, 4.833, 5.627, 5.607 and 5.769 s. In the last two, a Chrome MutationObserver saw the new reply paragraph at 6.417 and 6.499 s from the button click. The callback does not measure the DOM commit.
- Final open-panel follow-ups, click to reply paragraph: 2.089, 2.011, 2.168 s. WordPress preparation was ready within 41–65 ms; the Bridge still checked ownership on each send (648–684 ms). Provider submission to text took 1.053–1.186 s in those runs.

Removed duplicate catalogue loading on context refresh and reused the just-hydrated page for initial recovery. Versioned session preparation can start against a known address before hydration; Send still checks the authoritative binding, and mismatches fall back without waiting on the unused request. Smaller history records can include one more bounded page with the session. The first text update publishes immediately, with subsequent deltas still coalesced. Immediate post-reload sends still sometimes reach WordPress before preparation finishes; they are not at CLI parity.

### Immediate dashboard Send with shared history restoration

On the 10 November 2026 local Chrome test, baseline session requests spent 2.4–3.9 s before request transmission. The instrumented WordPress server reported 0.6–0.9 s of processing. A fresh paired baseline gave 6.823 s from click to reply insertion. Browser priority alone still produced duplicate requests for the same chat cutoff.

The dashboard now shares the authenticated session response with chat restoration. The UI takes the latest 50 rows. A revision-bound session can read up to two additional 100-row pages within a 512 KiB budget for combining pages. Larger conversations continue from the server cursor. The existing ownership and prefix-revision check on Send remains active. Editor-specific sessions continue to resolve the current editor target.

Five immediate sends in the long test conversation used GPT-5.6-Luna Medium and recalled marigold. From a real enabled Send click to insertion of the reply paragraph, Chrome recorded 5.528, 4.260, 4.253, 4.016 and 2.670 s (median 4.253 s). Session readiness after Send took 69, 47, 111, 52 and 42 ms. The Bridge ownership check took 3.068, 2.492, 2.484, 1.792 and 1.221 s. The first sample overlapped local validation. Navigation to reply took 9.02–11.25 s (median 10.52 s). The previous matched native exec resume reference was 3.564 s median from process start to the first agent-message event.

### First Send after reload: ownership and WordPress startup

The local four-worker site had Elementor, Etch, WooCommerce, Yoast and Pixflow active. The REST permission and session callbacks, including the prefix revision, took roughly 7–19 ms combined. WordPress initialization and REST route registration commonly took 0.8–0.9 s before dispatch, and longer during simultaneous reload requests. The PHP workers reported their 128 MiB opcode cache full. The local fixture now uses a separate 384 MiB cache, with approximately 164 MiB occupied after testing. This is a local fixture setting.

The floating panel now loads its four read-only catalogues in one WordPress bootstrap. Each subrequest retains its original permission callback. An admin received identical payloads for all four catalogues in the real local installation. Anonymous access returned HTTP 401. Bridge ownership and history verification still run on every Send. The final five runs each returned HTTP 200 and an explicit current prefix revision. Regression coverage also exercises a changed prefix and revoked ownership on successive requests using the same token.

Chrome, immediate Send after reload, same long chat and recall question, GPT-5.6-Luna Medium. Medians in seconds:

| Configuration | Samples | Send to ownership | Send click to visible reply |
| --- | ---: | ---: | ---: |
| Previous recorded baseline | 5 | 2.484 | 4.253 |
| Original panel, same-day warm control, 128 MiB | 5 | 1.691 | 3.372 |
| Grouped catalogues only, 128 MiB | 5 | 1.763 | 3.513 |
| Grouped catalogues and resized local cache, first series | 5 | 1.468 | 3.201 |
| Final candidate with explicit revision observation | 5 | 1.326 | 3.431 |

Final (ownership / click to DOM, ms): 2204/4269, 1326/3431, 921/2194, 1272/2937, 1647/3549. All five recalled marigold. Combined across both resized-cache series the medians were 1.406 s and 3.214 s. The grouped request removes three WordPress bootstraps per panel load. Its own latency advantage was not established on this site. The size of any hosting-side gain depends on the installed plugins and PHP configuration.

### After ownership: warm Codex submission, streaming and scroll

Chrome admin floating panel after reload, attached Codex thread and the same recall question and model as native exec resume (gpt-5.6-luna, Medium). Five final first-visible-character timings were 4117, 4177, 5232, 5313 and 3956 ms. Medians: ownership confirmation to submission 110 ms, submission to first provider text 1177 ms, first provider text to browser reception approximately 10 ms, reception to visible paragraph text 8 ms. The transport estimate subtracts elapsed times from two processes. Browser time before the Bridge POST varied from 1102 to 2208 ms. One trial intentionally scrolled up while the model was working; its DOM time measures text insertion even though the reader stayed above it.

Native CLI process launch to the first completed agent-message JSON event: 5655, 4534, 4599, 4905 and 4403 ms. Both clients recalled marigold on every measured run. The native fixture has its own seeded conversation, and process launch differs from sending to an already running TUI.

The daemon now immediately persists and flushes the first text. The floating panel avoids repeating comparisons of unchanged immutable history snapshots. The Markdown renderer skips selection and motion queries for immediate text. Chrome JS self-profiling identified the renderer in a 450 ms first-text task; the final five receipt-to-DOM observations were 5–9 ms. Chrome recorded zero spacer height and zero bottom distance throughout both pinned scroll trials. In the manual scroll trial the top offset remained 5063.33 px through completion and Jump to latest restored zero bottom distance. The normal and reduced-motion scroll regression cases, Workspace streaming and chat recovery tests passed.

### Claude Code: prompt size, first text and footer (local WordPress, 2026-11-10)

Matched Claude Code 2.1.309 (the copy used by the Bridge), Sonnet 5.5, Medium, with the same one-word recall prompt. Both paths resumed their own saved CLI session. Native measures process launch to first text delta; Chrome measures Send click to visible reply. Every measured reply recalled the word.

- Native resumes: 2.045, 1.993, 2.281, 2.209 and 2.257 s (median 2.209 s).
- Final local panel asset: first Send after browser reload 5.148 s. First follow-up with history still being prepared 5.905 s; another unprepared follow-up 4.587 s; prepared follow-up 2.911 s. Do not use the prepared figure as an all-turn median. The three warm runs spent 3.073, 1.687 and 0.043 s respectively before the Bridge request. Browser reload does not restart the Bridge.
- Earlier in this pass the resumed panel repeatedly sent 11,710 bytes. With a matching session and lineage the unchanged request was 76 bytes; page context changes still traveled. On a Bridge restart the first resumed turn sent the full context again. Ownership and WordPress revision checks remain on Send. A partial acknowledged history window can be continued at its own cursor; long history fetches can request 100 rows while the restoration UI still opens with 50.
- A native diagnostic reply emitted text at 2.779 s, a successful result at 3.224 s and process close at 4.100 s. Chrome now renders a plain Claude reply finished on its successful end-turn result; tools, errors, questions and handoffs wait for their real outcome. In three final Chrome runs the new turn displayed Preparing, Working and Done once each. Working-to-Done was 246, 253 and 248 ms for these one-word replies. No timeout or quiet-period heuristic was used. Persisted run status still comes from the Bridge.

### WordPress history on reload and immediate follow-ups (Claude, local, 2026-11-10)

The dashboard can restore a canonical chat by asking WordPress for the most recent saved message ID when the browser has no cutoff. The credential is reusable only for that confirmed ID and owner. A quick Send waits for pending writes in the preceding transcript. Final replies start saving immediately. WordPress can include up to four additional pages within the existing 512 KiB budget for older rows. The cursor path remains available for longer histories.

Chrome click to first visible text on the final local candidate, Claude Code 2.1.309, Sonnet 5.5, Medium, same one-word recall prompt:

| Scenario | Individual measurements (seconds) | Median |
| --- | --- | --- |
| First Send after browser reload | 4.083, 4.458, 3.987 | 4.083 |
| Immediate follow-up | 3.856, 3.788, 4.699 | 3.856 |
| Native CLI resume to first text delta | 2.411, 2.209, 2.181, 2.222, 2.149 | 2.209 |

All runs recalled marigold. For a separate test, a second signed-in WordPress tab edited a controlled user message via the normal revision-checked history REST endpoint. The open panel answered Juniper after revision 2 and Hazel after revision 3. Both runs recorded a history refresh before admission. The Hazel check used the final panel build. Browser timings include waiting for any prior save before the direct-run timer starts. Prepared-session timing alone understates that cost. Only local candidate assets and the local test site's controller were installed.

### Claude first-frame comparison on a long chat

Windows local WordPress floating panel and native Claude 2.1.309 used Sonnet 5.5, Medium, the same recall question, and their respective existing conversations. Every answer was correct. The panel probe started at the actual Send click and recorded the first reply paragraph and the next frame callback followed by a timer. The latter estimates the first painted answer. CLI timing starts at process launch and ends at the first streamed text delta. The two histories differ in length and the CLI measurement excludes terminal rendering.

| Scenario | Previous build, next frame (s) | Candidate, next frame (s) | Candidate, first DOM text (s) |
| --- | --- | --- | --- |
| First Send after reload | 5.206, 5.295, 5.053 | 4.543, 4.866, 4.455 | 4.193, 4.342, 4.264 |
| Immediate follow-up | 4.570, 4.539, 4.565 | 4.196, 4.257, 3.918 | 3.841, 4.143, 3.769 |

Native first text took 2.679, 2.022, 2.229, 2.289 and 2.270 seconds. The median residual to a painted answer was 2.273 seconds on reload and 1.926 seconds on a quick follow-up. WordPress ownership and history admission took 1.390–1.693 seconds after reload and 0.385–0.433 seconds on follow-ups. Quick sends also spent 0.756–0.813 seconds before the direct run timer started. This interval includes pending history saves and browser work. Provider submission to first text took 2.051–2.704 seconds across those six runs.

The browser profile attributed a 710 ms long task to synchronous scroll measurement. Older assistant rows now use layout containment and message commits coalesce scroll measurement into a frame. Ordinary tool-free Claude replies retain their editor context, site settings refresh on invalidation, and initial Bridge discovery reuses the in-flight catalogue read. Each send still checks ownership and history revision. Editing the fixture in a second tab from Hazel to Birch was visible on the very next answer, with a history refresh recorded.

A subsequent user-scroll test exposed a pending programmatic scroll event arriving between wheel input and the browser actually moving. The regression test reproduced this for both reduced and normal motion. After the scroll fix the browser stayed at the same scroll position (4293 px) while new text arrived. The table measures the candidate before that manual-scroll fix.

### Final Codex floating-panel regression check

The locally installed panel bundle matched the final candidate by SHA-256. Chrome used Codex with gpt-5.6-luna at Medium on 10 November 2026. The first Send after reload acknowledged the fixture in 6.621 s. The next Send recalled Rowan in 2.403 s. Stop interrupted a longer answer after text had appeared, displayed Canceled and retained the partial reply. A second authenticated tab then updated the original test message from Rowan to Silvermist at message revision 2. The first tab stayed open and correctly answered Silvermist on the next Send in 6.586 s. The trace recorded historyRefreshed=1, ownerReadyMs=388 and a completed turn. Timings are click to first reply text in the DOM, one trial per scenario. These four checks passed for the shared local candidate.
