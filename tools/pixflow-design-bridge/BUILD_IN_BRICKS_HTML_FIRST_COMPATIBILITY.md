# Build in Bricks HTML-first compatibility matrix

This matrix records the Phase 06 disposition of representative Build-source web
features. It is intentionally evidence-backed by the existing converter
ownership tests and the companion `build-in-bricks-html-first-compatibility`
fixture. The converter remains the deterministic boundary; a fallback is a
successful preservation result, not a reason to restrict HTML-first design.

| Source feature | Disposition | Evidence/owner |
| --- | --- | --- |
| CSS Grid and responsive grid columns | Native controls where the class cascade is unambiguous; scoped CSS fallback for complex relationships. Canonical Build also neutralizes the automatic minimum of unsized direct native grid items so Bricks block defaults and destination typography cannot enlarge authored `fr` tracks; explicit authored width/min/max constraints remain authoritative. | `html-to-bricks-structure.test.ts`, `html-to-bricks-style-ownership.test.ts`, `build-in-bricks-grid-item-projection.test.ts` |
| Flexbox, wrapping, ordering | Native controls for simple declarations; scoped CSS fallback for compound rules | `html-to-bricks-structure.test.ts` |
| Absolute/sticky positioning and overlaps | Scoped/custom CSS fallback | `html-to-bricks-style-ownership.test.ts` and the Phase 06 fixture |
| Pseudo-elements and pseudo-classes | Scoped/custom CSS fallback with `%root%` ownership | `html-to-bricks-style-ownership.test.ts` |
| Descendant, sibling, attribute and `:nth-child()` selectors | Scoped/custom CSS fallback; no forced class flattening | `html-to-bricks-style-ownership.test.ts` |
| `clamp()`, CSS variables and gradients | Native values when safe; token graph/page CSS or scoped CSS fallback | `html-to-bricks-style-ownership.test.ts`, `html-to-bricks-token-graph.test.ts` |
| Masks and `clip-path` | Scoped/custom CSS fallback | `html-to-bricks-style-ownership.test.ts` |
| Media queries at actual widths | Native responsive keys when mapped; preserved CSS for unsupported/compound rules | `html-to-bricks-style-ownership.test.ts`, structure fixtures |
| Container queries | Preserved as scoped/page CSS when parser accepts them; no native-control claim | Phase 06 fixture and Phase 13 `build-in-bricks-html-first-compatibility.test.ts`; the installed bridge profile now retains the conditional wrapper in class-scoped custom CSS |
| Keyframes and transitions | Page/scoped CSS fallback; never silently removed | `html-to-bricks-style-ownership.test.ts` |
| Separate JS listeners | Existing script classifier/source snapshot path; no execution during validation | `html-to-bricks-class-lifecycle.test.ts`, code safety tests |

Unsupported or partial constructs must be surfaced in the style-ownership
diagnostic. Do not add native Bricks controls solely to avoid a custom CSS
fallback. A future converter change requires a red fixture demonstrating loss
or invalid output, followed by green incumbent fixtures.

## Phase 13 evidence (2026-08-16)

The standalone HTML-first compatibility fixture reproduced a real loss: the
bridge omitted `globalClasses[].settings._cssCustom` from the aggregated CSS
and flattened `@container` declarations into unconditional native settings.
The localized bridge fix now includes global-class custom CSS and preserves
supported container-query rules as `%root%`-scoped custom CSS. The focused
fixture passes (`1` file, `1` test). The full bridge suite still reports two
unrelated legacy failures (`html-to-bricks-style-ownership` page-foundation
reset expectation and `condition-mutation` repair-attempt expectation) plus
seven syntax-error suites in the Windows workspace; those remain outside this
fixture's supported-path change and are recorded in the Phase 13 hand-off.
