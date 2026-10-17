# Etch capability boundaries

The optional Pro integration discovers installed native capabilities rather than promising every feature listed in Etch documentation or a roadmap. Shared Direct transport remains in core; premium implementation and its tests belong to the Pro repository.

| Area | Integration path | Boundary |
| --- | --- | --- |
| Content and structure | Native block reads/edits and administrator scripts | Preserve native IDs, component references, instance properties and unrelated unsaved work. |
| Styling and responsive behavior | Native styles, stylesheets and CSS | Feature-detect installed methods; verify editor and saved frontend separately. |
| Components, loops and fields | Installed native schemas and WordPress data APIs | Nested scope, empty values and numeric zero need explicit handling. Unsupported field factories remain unavailable. |
| Media and collections | WordPress media plus native attachment collections | Preserve source bytes and unrelated memberships; browser image transforms do not imply a headless transform API. |
| Fonts and design systems | Shared services with the active builder adapter | Registration and stylesheet application are separate from assigning typography. |
| Templates and routing | Native templates and registered WordPress routes | Creation does not imply assignment support; verify the actual route and main-query behavior. |
| Save and recovery | Native save/history plus authenticated Direct delivery | A lost acknowledgement must not repeat an edit. A terminated provider process requires explicit continuation. |
| Third-party features | Installed API, route schema and owning plugin | Roadmap/WIP descriptions and absent convenience tools are not availability evidence. |

Use disposable fixtures for acceptance. Check native editor state, saved content, frontend rendering, responsive layout and unrelated-data preservation. Keep naturally prompted agent acceptance separate from coached API diagnostics. Test version-dependent WIP features before relying on them; this document does not assert exhaustive compatibility with every Etch release or provider.
