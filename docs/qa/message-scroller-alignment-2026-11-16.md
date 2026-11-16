# Shared shadcn Message Scroller acceptance

Scope: Core and paired Pro browser source, local WordPress only. Live packages and provider/Bridge builds are unchanged. Design-engine acceptance remains paused.

## Implementation

- The installed `@shadcn/react/message-scroller` primitive owns scroll positions, user-turn anchoring, prepend preservation, viewport/content resizing and jumping.
- All interactive transcripts use `autoScroll` and `defaultScrollPosition="end"`. The former React-version/legacy-controller branch, floating-scroll hook, Workspace tail spacer/observers and Sitemap scroll controller have been removed.
- Workspace, WordPress/builder panels, Sitemap's fallback panel and the read-only history browser share the same composition. Transcript children have stable message IDs; history-loading controls live outside the measured message list so prepending can preserve the first visible message.
- Saved history waits for initial hydration. Preparing a reply never remounts the scroller. New user turns animate with transform/opacity; saved/prepended messages do not. Reduced motion disables entrance animation and smooth jumping.
- Long conversations retain real message DOM, using the upstream styled pattern's content visibility/intrinsic sizing instead of the removed absolute-positioned chat virtualizer. Selection, browser search and accessible content remain available.
- The 0.3.1 public primitive handles wheel/touch/scroll keys but does not expose an imperative pause method for selection/link/focus/search interactions. A narrow composition forwards those gestures to its wheel intent handler with zero delta and disables `autoScroll` until an explicit return to the edge, jump or new user turn. It contains no scroll-position calculation or polling loop. The growing final row is excluded from native scroll anchoring while the reader hold is active; earlier rows retain native anchoring so image/content resizing preserves the reading position.
- Jump-to-latest styling is component-owned and uses upstream `data-active`; the old active class/global CSS has been removed.

## Regression coverage

`e2e/ui/message-scroller.test.ts` compiles the actual shared components into a Chrome fixture. It covers:

1. Following growing output, holding scrollback, explicit jump and resumed following.
2. Saved thread/hydration opening at the end; queue resizing and unobscured output.
3. Prepending older history and preserving an existing row's screen position.
4. Text selection, keyboard focus, browser find and disclosure interaction during streaming.
5. New-turn animation, no restored-history animation and replies growing beyond the viewport.
6. A 1,000-message searchable transcript.
7. Prepending while a reader has keyboard focus.
8. Preparation/completion without position theft.
9. Mobile width and reduced motion.
10. A new user prompt resuming following after a reading interaction.
11. Earlier content resizing without moving a focused reading position.
12. A consistent 28px gap between an assistant reply and the next user turn.

The former geometry-only jsdom assertions have been moved to browser coverage. Component tests continue to cover shared rendering, message registration, saved plans, history controls and composer behaviour.

## Local WordPress evidence

Installed paired candidate on `http://127.0.0.1:18374`.

- Existing 21-row saved chat opens at distance 0 from the bottom; spacer height 0.
- Scroll back 350px, then Jump to latest: distance returns to 0. Jump button centre differs from viewport centre by 0.008px.
- Reload restores the same 21 rows at distance 0.
- Workspace and floating panel show the same saved chat, each at the end.
- Evidence: `.tmp/saved-plan-walkthrough/message-scroller-saved.png`, `message-scroller-jump.png`, `message-scroller-workspace.png`.

## Validation

- Chrome regression suite: 12 passed. The initial nine-case suite also passed twice consecutively (18/18).
- Focused Core component tests: passed; obsolete global jump-button CSS assertion updated for the CSS Module and retested (20/20 streaming tests).
- Paired Pro Sitemap panel tests: 2 passed.
- Core guard: 27 passed. Core workspace typecheck passed. E2E typecheck passed.
- Pro guard, typecheck and all 3 build-contract tests passed.
- Free and paired Pro WordPress builds passed and were installed locally.
- Full web suite: initial run passed 517 files, with one obsolete jump-button CSS assertion subsequently fixed and its 20-test suite passing. A repeat encountered an unrelated ConnectorsBrowser authorization-refresh timing failure; that untouched file passed all 31 tests on isolated rerun. Repeat full run remains in progress.

Latest local Chrome verification: all eight assistant-to-user boundaries measured 28px; saved chat remained at distance 0 from the end. Paired assets installed locally. Mobile floating panel measured 374px wide within a 390px viewport, with no document overflow.

