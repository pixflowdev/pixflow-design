# Composer hover and host page overflow

The installed Bricks floating panel reproduced the report: hovering Add context increased document/body height from 1,000px to 1,707px, and width from 1,430px to 1,438px. Both active shared tooltip instances had computed `position: static`. The tooltip was portalled outside WordPress's CSS scope. Its viewport transform then moved a normal-flow box into the host page's scrollable area. A contained/transformed Workspace root is also an unsuitable parent for viewport coordinates.

The shared TooltipLayer now portals to a viewport-sized, fixed, paint-contained Pixflow scope directly under body. Tooltips retain the trigger's theme tokens and are placed above its stacking ancestors; existing clamping, title suppression, activation dismissal and keyboard behavior remain in use. No overflow rule is applied to the host document or editor canvas.

## Verification

- New component regression failed before the fix; existing dismissal tests remained green. Three TooltipLayer tests pass after the fix, covering scope, paint isolation, contained-root escape, theme and stacking.
- Installed Bricks test failed before the fix on computed positioning, with the actual expanded dimensions above recorded in browser metrics.
- Five installed-browser checks pass after the final theme correction: Bricks, Gutenberg, Etch, Elementor and a 640px Bricks viewport. Both Add context and Send were hovered, dismissed and checked for unchanged document/body dimensions and scroll position. Every custom tooltip remains inside the viewport and uses the trigger's background token.
- The three non-Bricks fixture panels used their existing native title tooltip in this state; they did not emit a custom TooltipLayer. Their no-overflow checks passed. This does not claim a new custom-tooltip implementation on those surfaces.
- On the combined candidate, 36 focused tooltip/composer/usage checks, guard and full typecheck passed. Free and explicitly paired Pro browser builds passed. Focused PR CI verifies the independent main-based patch.
- No prompt was sent and no editor Save action was used. Published packages, normal Bridge registration and Chrome permissions were untouched. The installed local candidate retains the preceding usage and Claude sign-in fixes.

The combined runtime candidate is `601ab8f1d7d307b6211dc3e6ca4e9d64ab1b0ff0` on `codex/tooltip-integrated-check`, paired for local browser checks with Pro `faf6dfc9fd44f04dc4c0c36beb74c9a7321f8af7`. Release preparation must use the Mac handoff's released Pro baseline and record a final clean exact pin; no acceptance of that new production pair is implied here.
