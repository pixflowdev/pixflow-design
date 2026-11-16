# Shared chat stream: shadcn alignment

Date: 2026-11-16. Local candidate only; published plugins and Bridge unchanged.

## Reference and ownership

The reference is the current Base UI shadcn AI Elements patterns at
https://ui.shadcn.com/docs/ai-elements, using the base-rhea Trace, Message,
Bubble, Marker and Code Block source. Pixflow maps colours to its existing
light/dark tokens. Provider parsing, permissions, history and saved-plan
persistence remain outside the presentation components.

The AI SDK helper is demo/test message infrastructure, not a replacement for
CLI execution or Pixflow's Bridge. No AI SDK transport was added.

## Pattern mapping

| Pattern | Shared implementation |
| --- | --- |
| Chat | Shared ChatPane/message scroller; bottom-follow and manual scroll preserved |
| Message | Message/MessageContent/Header/Footer and Bubble; aligned actions |
| Chain of Thought | ActivityDisclosure with nested Trace lines |
| Checkpoint | Marker separators in handoff/history presentation |
| Inline Citation | InlineCitation, small trigger and Hover Card |
| Plan | PlanCard, nested Trace steps from the saved plan |
| Queue | ComposerQueue, Trace disclosure preserving reorder/edit/steer controls |
| Reasoning | ThinkingBlock on Trace, no preview gradient or legacy card |
| Sources | Sources, collapsible Trace with linked source rows |
| Stack Trace | StreamToolResult, error disclosure and Code Block |
| Subagent | ToolTrace with subagent classification and plain-text result |
| Task | ToolTrace with state icon and disclosure |
| Terminal | Shared command classification and Code Block, including exec_command/cmd |
| Test Results | Explicit structured suites/tests only; unknown output is not presented as passed |
| Tool | ToolTrace with supplied input/output and real execution status |

Old task/thinking/operation card markup and unused CSS were removed. Historical
TodoWrite event decoding remains intentionally supported so saved chats still
render through PlanCard; it is not a second task-card UI.

## Validation

- 96 focused stream/disclosure/status/queue/scroll tests passed.
- 105 message/citation/bubble/copy/queue/streaming/scroller tests passed.
- 5 floating-panel geometry/docking tests passed, including 390px viewport.
- Repository guard: 27 passed. Root typecheck and final web typecheck passed.
- Core and paired Pro browser bundles built and installed only in the isolated
  WordPress walkthrough site at 127.0.0.1:18374.
- Chrome checked the actual saved Codex/Claude conversation and Plan, dark/light
  desktop and light mobile. Final 390px panel width 374px, no horizontal content
  overflow; Plan width/scrollWidth both 336px; footer visible at 12px.
- No new paid provider run was needed for this presentation pass. Existing saved
  provider output was replayed; component tests cover live state transitions.

Follow-up: both remaining harness failures are now fixed. The full Core web suite
passes: 519 files / 4,550 tests, with the existing 4 skipped files / 54 skipped tests.
Pro's four preference tests also pass in its paired lane. See
[the recovery report](chat-stream-test-recovery-2026-11-16.md) for causes and live
floating-panel verification.

Local evidence: .tmp/shadcn-stream-alignment/ and
.tmp/saved-plan-walkthrough/ (not committed; screenshots and Chrome measurements).
