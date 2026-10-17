# Pixflow Design for WordPress

This directory owns the Free WordPress host: authenticated site APIs, the floating
agent panel, native WordPress/Gutenberg operations, onboarding, appearance,
provider settings, durable chat history and export. Shared React code lives in
`apps/web`; this is not a separate copy of that application.

Premium builder integrations, Workspace contributions, advanced raw tools and
Composio are supplied by the separately installed Pro add-on. Core retains their
module contracts, permission boundaries and saved-data compatibility, not their
private implementations. See [repository boundaries](../docs/architecture.md).

## Build and installed identity

Use `pnpm wordpress:build` for the local build or `pnpm wordpress:zip` to build
browser assets and the website ZIP. Read [packaging](../docs/pixflow-design-local-packaging.md)
for isolated output options. [Directory builds](directory/BUILD.md) are separate:
they use WordPress.org updates rather than the website updater.

The installed basename is `pixflow-ai/pixflow-ai.php`. Keep it unchanged so existing
users can upgrade without reinstalling. Do not install a second copy under a
`pixflow-design/` directory. Source cleanup does not authorize replacing published
ZIPs or changing update feeds.

PHP classes use the `PixflowDesign\WordPress\` namespace with the local autoloader
and vendored dependencies. Runtime browser assets are generated under
`wordpress/assets/app/`; edit their TypeScript/CSS sources rather than compiled files.

## Execution and preservation

API chat runs through WordPress without requiring the Bridge. Local CLI execution
uses the authenticated Bridge connection. Pro integrations are discovered and
authorized server-side. Existing licences, preferences, conversations and installed
resources must remain readable when a capability becomes unavailable.

The `pixflow-design/v1/od/*` REST paths and other `od` identifiers are compatibility
contracts, not product branding. Keep those paths stable. Resource migration must
preserve personal assets and site content; essential Free guidance is bundled and
does not require a resource download.

## Validation

`wordpress/tests/` contains isolated PHP checks and explicitly named integration
or live tests. Run live tests only against a configured disposable site; never
use customer content as a fixture. Shared browser tests live in `apps/web/tests`,
and cross-runtime checks live in `e2e/tests`.
