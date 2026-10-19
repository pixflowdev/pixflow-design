# WordPress.org review package

The default website build remains unchanged. It keeps the Pixflow website updater,
the existing plugin identity and the normal `dist/` ZIP names. This directory
candidate is separate and has not been approved by WordPress.org.

For a directory candidate, set `PIXFLOW_DESIGN_WORDPRESS_DISTRIBUTION=directory`
for both `pnpm exec tsx scripts/build-wordpress-web.mjs` and
`node scripts/build-wordpress-plugin.mjs`. The first command writes isolated assets
to `.tmp/wordpress-directory/assets/app`; the second writes
`dist/wordpress-directory/pixflow-design-2.0.6.zip` and `pixflow-ai.zip`.
Packaging rejects assets with the wrong distribution marker. The current candidate
slug is `pixflow-ai`; an approved different slug needs an explicit migration review.

The candidate uses WordPress's React dependencies (minimum WordPress 6.2), removes
the website Free updater, and changes only translation-domain arguments to
`pixflow-ai`. Existing option names, REST routes, licence data and chat identifiers
are preserved. It includes ordinary bundled guidance files instead of a nested ZIP.
The directory HTTP client requires WordPress HTTPS support; it does not launch a
PowerShell fallback. The website HTTP client remains unchanged.

## Readable source

The ZIP includes a standalone `source/` project containing the original Pixflow
source inputs and virtual modules produced by the adapters. Unmodified npm source
inputs are referenced by exact package version, file path and SHA-256, with public
registry URLs and integrity hashes in the lockfile; `npm ci` restores those sources.
Changed dependency inputs remain local. This avoids shipping an unnecessary second
node dependency tree and keeps the submission ZIP below WordPress's 10 MB limit. The
capture rejects private `apps/web/src/pro/` modules. Recipes retain resolved import
edges and content hashes; stale, unreferenced captures are not packaged. The source
project has pinned npm build dependencies and a lockfile. Run `npm ci --ignore-scripts`
and `npm run build` with Node 24 after extracting it. No access to the private
repository is needed. Namespaces can change bundler output identifiers and
tree-shaking; rebuilt output is not claimed byte-identical to release files.

This source project explains the larger size of the review ZIP. It does not add
browser execution or PHP work; source files are not enqueued by the plugin.

## Licensing and disclosures

`THIRD-PARTY-NOTICES.txt` is generated from dependencies evidenced in the emitted
Free JavaScript/CSS and includes their licence texts. The directory font/CSS pair
uses pinned Apache-2.0 Remix Icon 4.7.0; website builds keep their existing assets.
The glyph-coverage test checks that current UI references do not require any icon
added after that version. Directory provider artwork uses 35 exact files from MIT
Lobe Icons v6.0.0 at commit `8a1b2821bb768c484fe8da20c5e1838b6bf551a9`, plus seven
original MIT neutral glyphs where compatible artwork was not verified (Aider,
AMR, Azure, Composio, Copilot, Reasonix and SenseAudio). Provider labels and paths remain
unchanged; website artwork is untouched. The directory set uses theme-aware masks
so monochrome PNGs and SVGs remain visible in light and dark modes.
Directory provider and model image URLs carry a separate artwork revision, so
switching from a website build at the same version cannot reuse its cached marks.

`assets/app/provider-asset-sources.json` records each source URL, revision, licence,
byte hash and fallback reason. `assets/app/brand-licences/` includes licence texts
and the original neutral SVG source (its PNG form was rasterized at 64px with
Sharp 0.34.5). Build validation rejects missing coverage, changed image/licence
bytes, unpinned sources and unsafe SVG content. It performs no network fetches.
Copyright licensing does not confer trademark rights or imply endorsement:
these marks identify configured services and are not Pixflow's product branding.
Microsoft's express-permission requirement is the reason for the neutral Azure
substitution, rather than assuming an icon-set licence overrides brand terms.
GitHub's [logo guidance](https://brand.github.com/foundations/logo) lists
integration uses of permitted logos but also requires prior written permission.
Its [Copilot guidance](https://brand.github.com/brand-identity/copilot) deprecates
the standalone Copilot logo. Directory Free uses a neutral Copilot glyph because
permission for that standalone mark was not verified.

The directory readme documents the Free AI provider presets, local Bridge and
Pixflow language/licence requests. External service terms are links to the service
operators' own pages, not a representation that Pixflow controls their policies.

## Verification

Focused tests: `pnpm exec tsx --test scripts/wordpress-directory-*.test.ts`.
The built-artifact tests require a candidate ZIP and verify updater omission,
guidance preservation, dependency attribution and every packaged source hash.
Runtime tests must also cover Free alone and Free plus Pro on WordPress; the
packaging checks are not a substitute for editor, licence and chat-preservation
tests or the final Plugin Check run.
