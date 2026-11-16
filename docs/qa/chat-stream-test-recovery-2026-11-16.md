# Test recovery after stream alignment

2026-11-16. Isolated local verification; no live packages or services changed.

## Causes and changes

- The attachment-content PHP harness lacked WordPress's admin_url/add_query_arg
  helpers after libraryUrl was added. Added the stubs and asserted the returned
  attachment ID and Media Library URL, alongside Unicode filename and content.
- Core's old EnhancedDesignGuidance tests exercised a premium implementation
  through the now-optional contribution wrapper. Replaced them with Core boundary
  coverage (feature disabled, contribution absent, props forwarded), and retained
  all four actual preference behaviour tests in Pro's paired test inventory.
- No production entitlement checks or design-guidance behaviour were changed.

## Verification

- The original two failing files reproduced five failures before changes.
- Core repaired tests: 4 passed; extra media URL assertion passed afterwards.
- Pro paired preference tests: 4 passed, including failed-save preservation and
  stale hydration protection.
- Core guard: 27 passed; full workspace typecheck passed.
- Pro guard/typecheck passed; 3 repository/build contract checks passed.
- Real Codex read-only reply in local WordPress: completed in 13 seconds, recalled
  Pedal Ready draft page 5 and all six completed plan steps. Reload retained the
  reply and one Plan card; expand/collapse worked; no visible error or legacy card.
- Full Core web suite: 519 files passed, 4 existing skipped; 4,550 tests passed,
  54 existing skipped, zero failures (401.56 seconds, two workers).

Evidence stays in .tmp/shadcn-stream-alignment/ and
.tmp/saved-plan-walkthrough/ (Core), .tmp/design-guidance-*.log (Pro).
