# Pixflow HTML-to-Bricks compatibility profiles

Pixflow owns the production HTML-to-Bricks converter. Bricks' native HTML
converter is never imported, called, probed, or used as a fallback.

## Runtime contract

WordPress may supply safe facts: installed Bricks version, active breakpoints
and mode, pseudo states, Theme Style loading method, available element schemas,
and supported Pixflow persistence surfaces. The standalone adapter combines
those facts with a version-labelled Pixflow profile. Missing facts produce an
observable partial/fallback context; they never trigger native conversion.

Unknown controls and CSS properties stay out of native settings and remain
eligible for scoped CSS with a diagnostic. Incompatible major versions block
unsafe payloads. Global references do not pass the WordPress mutation boundary
until their definitions are present in the persisted catalogue.

## Adding a Bricks version

1. Capture the exact supplied/versioned Bricks files and safe runtime schema
   facts without changing the production call path.
2. Add or amend a version-labelled profile in
   `html-to-bricks-compatibility.mjs` and the matching transport contract.
3. Start with failing profile tests for version selection, changed controls,
   element capabilities, breakpoints/states, payload builders, and global-data
   references.
4. Add fixtures for supported, partial, unknown, and incompatible versions.
5. Prove all emitted controls validate against the selected profile and every
   unrepresentable declaration is diagnosed and retained by safe scoped CSS.
6. Run the frozen converter-only fixtures at desktop, 992px, and mobile. Every
   viewport must remain at or above QA95, with no unexplained regression from
   its incumbent score.
7. Run bridge tests, WordPress persistence tests, package typechecks, repository
   guard/typecheck, and the Phase 8 compatibility/performance matrix before
   changing the default supported range.

Native-converter comparison may inform a research ledger, but copied private
implementation, runtime imports, and production availability checks are not
acceptable profile inputs.
