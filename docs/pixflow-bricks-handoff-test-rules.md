# Pixflow Bricks Handoff Test Rules

These rules define the first acceptance suite for the improved handoff skill pack. They are intentionally stricter than a visual smoke test because bad Bricks JSON can create orphaned elements or weak editable output.

## Test Sources

Use at least these source types:

- Static landing page with hero, content, CTA, FAQ, contact form.
- Page with source `<header>` and `<footer>`.
- Page with image cards, icons/SVG affordances, and buttons.
- Page with tabs or FAQ accordions.
- Page with slider/carousel-like content.
- Blog/archive-like section with repeated post cards.
- WooCommerce product/archive source when available.

## Required Artifacts

Every handoff must write:

- `bricks-result.json`
- `bricks-payload.json`
- `global-classes.json`
- `bricks-header-payload.json`
- `bricks-footer-payload.json`
- `conversion-report.md`
- `bricks-handoff-qa.json` or the current local QA equivalent

## Skill-Pack Proof

For every prepared Stage B workspace:

- `.pixflow-skills/bricks-web-prototype/references/handoff/bricks-handoff.md` exists.
- The six always-loaded child skills exist.
- Conditional child skills exist and are available.
- `TODO.md` tells the model to read the router and child skills.
- The runner prompt references the router skill.

## Structural Hard Gates

Block apply if any fail:

- every element ID is unique
- parent/child references are symmetrical
- no orphaned elements
- all `_cssGlobalClasses` IDs resolve to `global_classes`
- page content roots are valid Bricks roots
- ordinary page sections contain a `container`
- header/footer landmarks are not duplicated in page payload when header/footer payloads exist
- accordion/tab/offcanvas internals include the correct hidden Bricks wrapper classes

## Quality Gates

Warn or repair before apply:

- source link/button counts do not match the Bricks payload link affordances
- source images, video, iframe/canvas/runtime media, background media, or SVG/icon affordances are dropped
- source reveal/sticky/marquee/runtime attributes or scripts are dropped
- BEM naming does not follow Pixflow Library patterns
- repeated cards do not use a component block class
- routine layout/style is trapped in `_cssCustom`
- source forms are not Bricks `form` elements
- source FAQ/tabs are not Bricks native components where appropriate
- source sliders lose arrows/progress/interaction affordances
- icons/SVGs are missing from the Pixflow icon sidecar
- framework route tokens are not used for spacing/type/radius/layout

## Live Builder Proof

For at least one representative source:

- Handoff action appears as **Handoff to Bricks**.
- Handoff stream shows meaningful progress, not only `Preparing...`.
- Apply button appears only after QA success.
- Apply inserts non-empty editable Bricks elements.
- Bricks reload shows no orphaned element warning.
- Header/footer templates are created and assigned when included.
- Page content visually resembles the source HTML after insertion.

## Visual Parity Proof

For each fixture in a parity run:

- Capture source HTML and Bricks frontend screenshots at desktop, tablet, and mobile.
- Compare scroll height, hero heading top position, second section height, link counts, image/media counts, and form control styling.
- Treat large deltas as handoff repair issues, not visual polish.
- Apply broad model-skill or generic converter fixes only. Do not add project-specific selectors, titles, or one-off fixture hacks.
