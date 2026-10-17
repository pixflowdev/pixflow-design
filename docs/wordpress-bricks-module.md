# WordPress core and Bricks integration

## Ownership

WordPress core owns the admin floating panel, workspace, onboarding, full settings, licensing, updates, media, providers, Bridge connections, voice, dictation, annotations, queueing and steering.

The optional Pro Bricks module owns Bricks hooks. `BricksModuleLifecycle::active()` is the shared availability authority. It resolves the parent theme, so Bricks child themes activate the integration; an installed but inactive or missing Bricks theme does not. Existing mixed REST handlers remain a compatibility facade, with module routes omitted at registration when unavailable.

Bricks owns builder toolbar/docking/follower, native editing/context, its skills and abilities, extensions, template insertion, framework mapping and Bricks Theme Styles. Shared resource previews remain readable; unavailable Bricks handoff actions are not offered. Other builder integrations have their own availability adapters.

## Availability boundaries

- Backend: module hooks, REST routes, MCP/direct tools, direct skills and design-system apply operations use the same availability authority.
- Discovery: runtime capabilities and prompt/resource caches include the active integration state.
- UI: full settings are available in WP Admin. Bricks-only sections, composer styling and Bricks context choices are conditional. WordPress localized scalar flags are normalized before use.
- Bridge: each authenticated run receives server-owned integration availability from the direct-site session response. A stale browser cannot override this. Inactive sites discard stale canvas targets; resumed runs receive the current integration state.
- API execution: refresh the server tool catalogue on resumed turns too. Existing site authorization continues to apply.
- Site configurations are independent; there is no global current-builder switch in the Bridge.

## Two-factor authentication

Per the product decision, leaving Bricks disables the enabled flag and removes enforcement/login UI. Other settings, enrolments and styling are retained. Returning to Bricks leaves the flag disabled until an administrator enables it again. This is intentional; 2FA is not migrated into WordPress core.


Bricks implementation and its paired lifecycle tests are maintained in the separate Pro repository. Core retains the shared availability and browser/Bridge contracts; Free validates independently of a Pro checkout.
