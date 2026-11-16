# Blank-site design fallback acceptance — 2026-11-16

Scope: local WordPress/Gutenberg, Codex and Claude. Live packages unchanged.

The shared page workflow now distinguishes missing documents from missing identity,
and failed context loading from genuinely absent context. Sufficient business facts
allow a scoped, provisional design recorded in the saved plan. Insufficient business
purpose prompts one focused customer question before authoring.

Fixtures use independent database table sets with empty posts, systems and guidance,
including whitespace-only documents. The original local dataset is retained.

Initial Codex run exposed a first-Send saved-plan binding defect on a genuinely new
chat. Existing empty saved chats had passed earlier checks. Added a failing regression
and fixed first-Send binding; no extra request is added to bound follow-ups.

Validation results and provider evidence are recorded after completing each run.
## Automated checks

- Core guard and full workspace typecheck passed.
- Direct-site regression suite: 79 tests passed. New first-Send binding test was
  observed failing before the fix; binding failure also prevents run admission.
- Pro guard, typecheck, build-contract checks and design-foundation tests passed.
- PHP design-guidance and design-engine asset checks passed.

## Codex informed brief

Fresh fixture `pfdblank5_1116_`; run `9770eb5a84954e43bac45906674e4eee`.
Natural Harbour Cycle repair-workshop brief, no layout instructions. Completed in
331 seconds, 73 tool calls, zero tool errors. Chose a scoped teal/cream/yellow
palette with native typography, recorded business facts and visual choices in the
saved plan, and produced an unpublished native-block draft. Plan restored at 4/4
and editor clean after reload. Desktop 1440 and mobile 390 had no horizontal
overflow; both placeholder images loaded and appointment anchor/mailto matched.
Documents and saved-system library remained empty after the run. Default theme
header/footer remained, as changes were scoped to the page rather than globals.

Initial failed evidence is retained separately (`codex-initial-events.json`): two
plan errors on an unbound brand-new chat; not counted as successful acceptance.

## Captions

Shared guidance now avoids routine visible captions beneath ordinary website
images, while allowing requested labels, attribution and useful explanatory
context. The informed test explicitly requests labelled placeholder spaces;
those are not evidence that real images require captions.
## Claude informed brief (incomplete)

Fixture `pfdblank2_1116_`; run `fc465584957a4db1a38c2f9309e7644d`.
Chose a provisional navy/cream/rust palette, read native style context, saved a
fact-based plan and authored a native-block draft. One plan update returned
`fetch failed`; Claude reread the plan and retried successfully. The cause was
not established, and no automatic write retry was added. This is not clean
first-pass evidence.

The provider then exhausted its five-hour allowance during final review
(`rate_limit`, reset reported as 19:30 Europe/London). Claude final completion
and the independent no-context clarification scenario remain outstanding. Do
not claim the Claude matrix passed. Its isolated fixture and event evidence are
retained for resumption after the allowance resets.
## Codex unclear brief

Initial `bec25bf8076a425588d5bb0072af40c0` correctly asked one question and left
content empty, but unnecessarily searched local folders for empty documents;
`rg` returned no matches. Tightened the shared workflow to treat supplied empty
document values as authoritative and avoid searching for substitute files.

Fresh retest fixture `pfdblank6_1116_`, run
`8c2e22c061fb4b008536b99277d27e44`: awaiting input in 42 seconds, 11 tool calls,
zero errors. Rendered a question-form: "What does your business offer, and who
is it for?" No page content or speculative design was authored. No local search
for PRODUCT.md/DESIGN.md. Read-only checks used native context, selected guidance
and bounded page/post listings. Documents/systems remained empty.

## Earlier Claude acceptance (not claimed as passed)

- Fresh Claude informed build with no transport errors and completed review.
- Claude independent unclear-brief question/no-edit check.
- Investigate the one-off Claude plan transport failure if it reproduces; do not
  mask uncertain writes with blind retries.

Local evidence: `D:/px233/core/.tmp/blank-design-acceptance/`. Original WordPress
config backup is private and untracked. Isolated fixtures preserve all original
site tables and assets. No live plugin packages or release feeds were changed.
The original `pfdsguide_1116_` configuration was restored byte-for-byte and the
WordPress dashboard reopened. Verification found its original 10 authored pages,
three saved systems and nonempty documents. The local candidate assets remain
installed. Full Core typecheck passed after adding an explicit missing-session-key
guard to first-Send binding; the web assets were rebuilt locally.


## Completion with Codex, as requested

The user explicitly requested finishing the testing with Codex instead of waiting
for Claude. Restored the unanswered clarification in fixture `pfdblank6_1116_`,
reloaded the editor, and submitted the business facts through the actual question
form. No layout direction, technical coaching or corrective follow-up was used.

Run `b78aa7dff8d244308b5c068952da99a5` continued the same conversation
`1b89ddbdf05e445eac0e7bcd3442dacd` and completed in 278 seconds with 43 tool calls
and zero tool errors. It selected a coherent page-local navy/cream direction,
saved the facts and style decisions in a four-step plan, built native blocks,
and saved/reviewed the draft. It did not repeat the clarification or search for
substitute empty documents. Its own review adjustments completed in the same turn.

Independent Chrome checks at 1440px desktop and 390px mobile confirmed no
horizontal overflow, consistent visual hierarchy, the correct mailto destination
and working appointment anchor. All three native FAQ disclosures opened; answers
did not invent prices, repair times or an address. Reload restored the same chat
and the completed 4/4 Plan card; editor status was draft with dirty=false.
PRODUCT.md and DESIGN.md remained empty, and no saved design system was created.
No automatic captions were added (this run intentionally chose a photo-free
layout; it is not a real-photo caption acceptance test).

The requested Codex blank-site matrix is complete: sufficient context, empty and
whitespace-only documents, no existing designs, missing-context clarification,
answer continuation, saved plan progress and reload. Claude remains historically
incomplete and is not represented as passed. No new product changes were needed
in this final Codex pass. Evidence: `codex-clarified-events.json`,
`codex-clarified-{desktop,mobile,panel}.png` and Chrome actions 205–211 in the
local acceptance directories.
