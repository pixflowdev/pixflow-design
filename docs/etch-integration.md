# Etch integration contract

Etch integration is optional premium functionality maintained in the separate Pixflow Design Pro repository. This guide describes its boundary with the shared browser/Bridge runtime; the Free plugin remains usable without Etch or Pro.

Etch is a plugin integration, independent of the active theme. Availability requires the active integration, an editable post and the current user's WordPress permission. The editor host reuses the shared floating panel, settings and conversation UI. Toolbar remounts must not create duplicate panels.

The native editor adapter feature-detects Etch's public API. Native block/style edits may remain buffered until native save; other namespaces can persist immediately. A script batch is not atomic. Preserve unrelated unsaved work before navigation and serialize Undo/Redo with editor settlement.

Shared Direct canvas transport uses a separate Etch mailbox namespace. Commands verify both canvas identity and the current native post immediately before execution. Failed result delivery retries delivery without replaying the edit; duplicate tabs receive separate canvas identities. Outgoing context follows native navigation and discards stale post metadata. CLI and API providers use the same site-side tools and authorization.

Structured tools cover native reads, blocks, styles, stylesheets, loops, components, fields and navigation. Trusted administrator scripts execute in the editor through `etch.run`; script files are sent as source, not executed on the agent's local machine. Native methods and save semantics remain authoritative. Planned third-party features are not proof of an installed capability.

Quick controls can open workspace, appearance, fonts, icons, sitemap, design systems and settings. Resource handoff prepares a composer brief and removable reference attachments without submitting a run. Availability follows the current builder context, including when Bricks and Etch coexist.

Google Fonts use local WordPress media and managed Etch font-face registration. Installation does not assign page typography. The shared font tools accept an explicit builder target. Removing a registration must preserve assets still referenced by another builder or site content.

Native editing feedback uses the shared cursor/outline/action presentation. Feedback respects reduced motion, clears after completion/cancellation and is never saved as page content. Global operations without localized native changes may have no target outline.

Managed icon selections register in Etch's attachment collections. Explicit pack updates/removal check site-database references before deleting owned SVG media. Referenced files, active editors, failed scans and uncertain ownership preserve media. External references outside the site database cannot be detected. Listing a collection does not trigger background cleanup.

See [design-system application](etch-design-systems.md), [capability boundaries](etch-feature-coverage.md) and [Direct transport](pixflow-direct-site-mode.md). Validation sources for premium Etch implementation belong in the Pro repository; shared transport regressions remain with the owning core app/package.
