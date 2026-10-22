=== Pixflow Design ===
Contributors: pixflowdev
Tags: wordpress, gutenberg, design, ai, workflow
Requires at least: 6.0
Tested up to: 6.8
Requires PHP: 8.1
Stable tag: 2.1.0-rc.2
License: Apache-2.0
License URI: https://www.apache.org/licenses/LICENSE-2.0

AI assistance for WordPress and Gutenberg, with optional Pixflow Design Pro integrations.

== Description ==

Pixflow Design Free provides the floating chat panel, WordPress administration and core Gutenberg page/post editing. Connect your own supported AI API account or use a text CLI through the local Pixflow Design Bridge. Provider charges or subscriptions are separate. Free does not require a Pixflow licence.

Free includes text-message queueing, supported steering, Gutenberg follower/review, memory cleanup and data export. Existing content and saved settings are preserved when Pro is unavailable.

The optional Pixflow Design Pro add-on provides the Workspace, Composio connected apps and AI execution, advanced PHP/site-file/database tools, and complete Bricks, Etch, Elementor and GenerateBlocks integrations, annotations, dictation, Codex Voice, design systems, sitemap planning, Google Font and icon-set managers, external MCP servers, custom skills and specialist plugin integrations. Pixflow's Site Editor, template and synced-pattern authoring tools also require Pro; WordPress's native editing remains available. Bricks layouts, components and extensions are Bricks-only.

Settings are available from the Pixflow toolbar menu and floating panel. Pro requires Free to remain installed and active, plus an eligible licence or active trial. Trial enrollment is available only when enabled on the Pixflow website; Free remains usable after expiry.

= Upgrading from v2.0.3 =

Update the Bridge before updating the plugin. Your existing plugin becomes Free. Eligible customers can download Pro from their Pixflow account, upload it through WordPress and activate it alongside Free using the existing licence and site activation. Premium functions are unavailable until Pro is active. Saved content, assets and settings remain intact. The Bricks 2FA extension must be manually enabled again after Pro activation; enrolled methods remain saved.

== Installation ==

1. Upload the plugin zip through Plugins > Add New > Upload Plugin.
2. Activate Pixflow Design.
3. Open Pixflow from WordPress Admin and complete onboarding. Choose your supported API provider or connect the optional Bridge.
4. For eligible Pro access, download the separate Pro ZIP from your Pixflow account, upload it and activate it while keeping Free active.

== Changelog ==

= 2.1.0-rc.2 =
* Improve durable chat recovery, provider selection and model-aware context compaction.
* Add shared integration contracts for optional Pro design guidance and focused operations.
* Pair with Pixflow Design Bridge 2.1.0-rc.2 for updated CLI behavior.

= 2.0.8 =
* Recover restored and interrupted chats without repeatedly reporting that messages have a newer saved version.
* Preserve complete saved replies and tool activity when older browser caches contain shortened display copies.
* Resume the same interrupted run safely while retaining protection against conflicting changes.
* Compatible with Pixflow Design Bridge 2.0.6; no Bridge update is required.

= 2.0.7 =
* Hotfix for restored chat history and Workspace links.
* Fix restored chat history blocking new agent requests when a display cache omitted saved events. Complete saved replies remain intact.
* Preserve full saved event history when restoring a chat, and fix Workspace links triggering a WordPress dashboard error.
* Compatible with Pixflow Design Bridge 2.0.6; no Bridge update is required.

= 2.0.6 =

* Let WordPress and builders manage native saving without Pixflow rejecting saves with an additional HTTP 409 guard.
* Preserve complete saved chat messages when older browser history is replayed, while retaining protection against conflicting changes.
* Avoid repeated working-context compaction caused by counting echoed instructions as new conversation content.
* Require Pixflow Design Bridge 2.0.6 for Local CLI. API execution does not require the Bridge.

= 2.0.5 =

* Prepare WordPress.org distribution with native directory updates.
* Clean up retired catalogue code and branding while preserving saved chats, settings and content.
* Improve WordPress compatibility and include readable build sources and updated third-party credits.

= 2.0.4 =

Pixflow Design 2.0.4 adds live Gutenberg editing, the separate Pro add-on, complete chat history and a refreshed Workspace. Existing customers keep their licence, saved chats, content and settings.

* Retire the inherited Community catalogue ahead of the Pixflow Resource Hub. Remove its browsing, download and settings entries, and automatically clean up the three retired downloaded packs to reclaim disk space. Existing WordPress content, custom settings and bundled AI/builder guidance remain intact. Free requires no optional resource downloads.

* Clean up the bundled skill catalogue, remove obsolete installation placeholders and unrelated workflows, and consolidate Pro design guidance with compatibility aliases for older skill mentions. Keep essential Free and Pro guidance available offline and preserve personal skills and saved content.

* Add individual Pro skill installation, updates, enable/disable and removal with a shared WordPress-owned library. Use compact library rows with accent-coloured update indicators and a Skills menu count, individual Update actions and Update all. Keep exact versions available for saved references and separate downloaded skills from personal skills. The signed catalogue is live for compatible Pro installations.

* Include ten original individually downloadable Pro skills: Design Brief, Website Audit, Website Animation, Motion Review, Brand Kit, Product Images, Site Structure & Navigation, Forms & Lead Capture, SEO-Safe Redesign and Landing Page Optimisation. Include attributed research, complete supporting guidance, appropriate discovery categories and checks for native content preservation, accessibility, image fidelity and reliable form/navigation workflows. Keep essential guidance bundled.

* Deliver Pro skill downloads and updates through the existing site connection, with verified packages. Preserve installed versions, disabled choices, saved skill references, personal skills and settings when updating or when downloads are unavailable. Pro users can manage optional skills without starting a trial.

* Expand the optional Pro library to 30 skills with 20 attributed WordPress adaptations for design refinement, typography, colour, responsive layouts, accessibility, quality testing, multilingual/RTL content, performance, debugging, copywriting, content planning, comparison pages, structured data, data-driven pages, analytics, experiments, pricing and banners. Show warnings for enabled skills with overlapping workflows without changing the user’s choices. On reopening Skills, group overlapping enabled installations first, then other installed skills, followed by available downloads; keep controls in place during installation.

* Keep Settings above floating chat, annotation and review panels. Opening Settings from a quick menu no longer opens the Workspace behind it; closing Settings preserves the previously open chat panel.

* Prevent annotation controls from stealing focus on load or conversation changes, keep hidden composers from claiming annotation follow-ups, and let foreground settings dialogs handle Escape. Preserve saved annotation drafts without automatically entering selection mode, and exclude Pixflow admin-bar controls from annotation targets.

* Hide cached Local CLI controls while the Bridge is disconnected, while preserving saved agent choices. Reduce repeated Settings requests with verified skill-catalogue caching, shared Abilities requests and deferred hidden-Workspace catalogues; explicit Refresh remains available.

New

* Keep everyday WordPress administration and live Gutenberg editing in Free, with advanced PHP, site-file, plugin/theme development and direct database tools in the separate Pro add-on. Explain unavailable advanced actions with an upgrade option and a Learn more link while preserving saved content, chats and settings.

* Keep complete saved chat history in shared WordPress storage for the floating panel and Workspace. Load recent messages first and retrieve earlier messages in pages, preserve existing transcripts and attachments, and retain unsaved changes for retry. Browser-context cleanup no longer removes saved conversations.

* Add full-chat JSON export from Workspace and the floating panel's Conversation history viewer, also accessible from Memory settings. Include every saved message and recorded tool detail, including older messages not loaded on screen, with media preserved as references. Support API, Local CLI and Composio histories without requiring a connected Bridge, and offer a safe retry if the chat changes during export. Available in Free without a licence.

* Add Chat storage reporting in Memory settings, showing saved message and chat counts, compressed storage usage, compression savings, retained project data and working-context usage for the current account. Keep usage refresh and history access available in Free, with clear exclusions for media, saved memories, browser caches, Bridge files and database overhead.

* Reduce chat-history storage with automatic lossless compression for API, Local CLI and Composio transcripts. Optimize existing messages in small background batches while preserving full text, tool results, attachments, message order, exports and saved revisions. Keep small messages uncompressed and retain complete history without automatic expiry.

* Compact the agent's working context in long API and Composio conversations while preserving complete saved chat history. Retain recent messages and important decisions, show compaction progress, and keep queued messages safe through preparation, cancellation and recovery. Use supported CLI providers' native context management and preserve accepted steering across reconnects.
* Add automatic Workspace handoff to Gutenberg, Bricks, Etch and Elementor. Choose an editor and a new draft or compatible existing page; Pixflow transfers the chat brief and reference files, opens the floating panel and starts the agent. Show progress, keep retries tied to the original draft and editor tab, and preserve source chats and unrelated page content.
* Refresh the Pro Workspace with the floating panel’s shared composer, a permanent page icon rail and a separate collapsible Chats/Projects sidebar. Group chats into projects, pin projects or individual chats, search and rename chats, and move chats without changing their files or history. Preserve saved organisation across visits, replace the old Home/chat tabs with a compact toolbar, and remove the old home chips and Recent projects cards.
* Fork a conversation into its own sidebar chat with the complete saved history through the selected reply, including older messages. Keep the original unchanged, retain a link back to it, and support safe retries and independent continuation.
* Add live Gutenberg page and post editing through the Bridge and API providers: discover available blocks, read the unsaved document, insert, update, move and remove blocks, select targets, save, and use native undo/redo. Preserve unrelated content and native block serialization.
* Add Gutenberg editor toolbar and quick-menu buttons, full-screen workspace access, and left/right floating-panel docking that reserves canvas space and restores saved placement.
* Extend originating-tab connections, reconnect/reload recovery and stale-save protection to Gutenberg. Keep runs attached to the intended document and preserve unsaved work when another editor has saved newer content.
* Add Gutenberg block-aware annotations, numbered pins, batched comments and variable/preset adjustments through Pro. Keep live block following and grouped, expandable change review in Free; targeted annotation follow-ups require Pro.
* Expand core Gutenberg block coverage across text, nested layouts, buttons, lists, tables, media, Details and Query Loops, using the installed editor's block schemas and nesting rules.
* Add Pro Site Editor tools for templates, template parts and synced patterns, including theme-provided templates, shared-document confirmation and targeted saves that preserve other unsaved entities. Support pattern discovery, categories, independent copies and shared updates.
* Add Gutenberg Global Styles support to Pro design systems: preview, apply, switch and restore prefixed presets, variables and reusable classes. Preserve theme files, existing styles and saved user overrides; require an explicit choice for site-wide typography and colours.
* Add local Google Fonts and open-source icon installation for WordPress/Gutenberg without requiring Bricks, Etch or Elementor. Include native editor/frontend registration, installed-asset controls and registration with supported builders activated later; installation and full management belong to Pro.
* Add a native GenerateBlocks integration in Pixflow Pro, covering the installed Free and Pro block capabilities with dedicated skills, live editor tools, native IDs, generated CSS and responsive controls.
* Support GenerateBlocks post queries and dynamic content, taxonomy filters, pagination and empty states, plus available Pro term, user, metadata, option and array loops, including native unlimited array-loop rendering.
* Support GenerateBlocks Pro global styles, shared classes and CSS variables, including hover/responsive rules, conflict detection and restoration while preserving existing styles. Recognize stable native IDs and generated CSS during content-only edits, including delayed browser callbacks. This covers Pro 2.7.1; the separate native Design Tokens interface in 2.8 release candidates is not included.
* Support GenerateBlocks accordions, tabs and carousels, navigation and mobile menus, forms and visibility conditions, and standard, anchored and mega-menu overlays with their available triggers and dismissal settings. Keep paired tab/panel additions together in undo and redo, and discover authorized draft forms and overlays. Preserve existing menus, form configuration and content.
* Support targeted edits to registered legacy GenerateBlocks Grid, Container, Headline and Button blocks alongside modern blocks, with native history and responsive rendering.

* Add a Home skill library with searchable Pro cards and direct installation, updates and management. Keep the Home composer at the top and refresh available composer skills after installation.

* Replace the inherited chat file workspace with a floating Summary panel for generated outputs, previews and downloads. Keep the shared chat stream and composer, navigate chats through the sidebar, and preserve existing conversations and file links.

Free and Pro

* Move advanced creative skills into the Pro package. Keep research, writing, accessibility and troubleshooting guidance in Free, and show available Pro skills as muted, non-selectable entries with Pro badges in the slash menu.
* Introduce a separate Pixflow Design Pro add-on that depends on the Free plugin. Move complete Bricks, Etch, Elementor and GenerateBlocks integrations into Pro, including their editor connections, settings, extensions, tools, skills and builder-specific assets. Activate integrations according to the installed theme/plugins; Bricks layouts and components remain Bricks-only.
* Keep WordPress administration, core Gutenberg page/post editing, the shared panel, onboarding, text AI through API providers or the Bridge, text-message queueing and supported steering in Free without a licence, including after a Pro trial expires.
* Move annotation authoring into Pro, including pins, screenshots, element options, comment batches, queueing and supported steering. Keep ordinary text-message queueing and steering available in Free.
* Move dictation and Codex Voice into Pro, including their settings, model management and audio controls, while retaining text-based provider access in Free.
* Move manual and AI design-system creation, library management, application/restore tools and visual sitemap planning into Pro. Keep previously applied styles and saved references available when Pro is inactive.
* Move Google Font and icon-set catalogues, installation, activation, subset management and builder synchronization into Pro. Keep existing fonts and icons rendering in Free, with basic installed-asset removal that preserves referenced content.
* Move External MCP configuration, setup templates and composer mentions into Pro, including provider forwarding and queue/steering integration. Keep the Bridge's core WordPress connection available in Free.
* Move custom skill creation, import, installation and managed discovery into Pro. Retain saved custom skills for reactivation and keep built-in WordPress skills and abilities in Free.
* Move specialist plugin integrations and their guides into Pro, including the existing ACF, JetEngine, WPCodeBox2 and Kadence/Spectra adapters. Preserve third-party content and WordPress's own native editing.
* Move Pixflow's specialist Site Editor, template, template-part and synced-pattern authoring into Pro. Keep existing references, rendering and native WordPress editing intact. Gutenberg follower/review, memory and tool-history cleanup, data export and content preservation do not require Pro.
* Recognize existing customer licences during migration. The existing plugin updates to Free; eligible customers receive instructions in WordPress Admin and License settings to download Pro from their account, upload it through WordPress and activate it alongside Free. Pro functionality resumes after activation; it is unavailable during the Free-only interval. Reuse the existing licence and site activation without starting a trial.
* Deliver Free updates without a licence and update the Pro add-on independently through WordPress. Verify downloaded packages and keep Free and Pro update notices separate, including bulk updates.
* Preserve saved content, settings, skills, design systems, font/icon registrations and enrolled 2FA methods across the split. Keep the shared composer and separately loaded Pro controls consistent as access changes; pending Pro authoring requires active access. Deactivating Pro disables the Bricks 2FA extension; manually re-enable it after Pro returns. Explain missing, inactive, incomplete or incompatible Pro installations in the migration interface.

Improved

* Preserve intentional paragraph breaks when sending chat messages, and keep older loaded history in chronological order when the latest replies refresh.

* Improve large-conversation performance across the floating panel and Workspace: load recent history first, avoid rebuilding unchanged historical replies while new text streams, and export long conversations in bounded batches. Validate pagination, reload and complete downloads with 1,000- and 5,000-message conversations while preserving saved chats and settings.
* Use shared history, working-context and memory controls across builders, including Bricks, and remove the obsolete Bricks-only retention section without deleting existing recovery data.
* Restrict Pixflow Workspace authoring to Pro while retaining existing project reads, export and cleanup. Keep saved project files readable when the Bridge is unavailable, and correct saved-file dates.
* Add the Pixflow settings-cog icon to the WordPress admin bar for active Pro users. Open Workspace, design tools and settings from the same quick menu used by the builders, while keeping the separate chat launcher available in Free.
* Align Settings switches with consistent accent-coloured tracks and clean thumbs. Simplify the Memory model controls and replace the Local CLI scanning animation with a compact, accessible status row that respects reduced motion. Remove the advanced proxy/custom-path form while preserving existing saved overrides.
* Simplify Free onboarding around API or Local CLI setup, automatically discover the Bridge, show its connected state accurately, and improve connection-result and help-link readability. Keep essential AI guidance bundled so missing optional downloads never block Free setup.
* Reduce repeated background connection checks when the Bridge is offline while keeping manual reconnect immediate. Remove unnecessary provider-logo preloads while retaining cached artwork.

* Move Bridge connect/reconnect controls into Execution settings > Local CLI, replacing the separate Local Bridge section and advanced CLI instructions. Restyle Pro licence and site-recovery controls with clearer status and actions.
* Redesign Google Fonts, Icon Packs and Resources settings with consistent theme-aware surfaces, aligned actions, expandable details and responsive layouts. Preserve installed assets, saved subsets and settings.
* Use the selected appearance accent for enabled toggle switches. Default new installations to Dark while preserving explicit Light or System preferences, and correct the floating-panel logo contrast in Light mode.
* Refine the floating change-review panel with a compact pill shape when collapsed and a smoothly expanding squircle layout. Align annotation and review toolbar backgrounds, icons and text, and automatically stack the annotation toolbar above change review as it expands or collapses, preventing overlap across Bricks, Etch and Elementor.
* Add a Disable change review switch, off by default, to hide the review panel while keeping the follower active. Retain collected changes so review can be shown again.
* Update translations across all 19 supported interface languages in Free and Pro, covering settings, onboarding, execution and connector controls, skills, abilities, memory, design systems, sitemaps, fonts, icons, annotations and recovery messages.
* Reduce plugin download size by bundling English and offering the other 18 languages as verified Pixflow downloads in Free and Pro. Download, update and apply languages directly from Appearance without reloading, including right-to-left layouts. Keep downloaded languages across plugin updates and preserve chats, drafts and language preferences if a download fails.
* Follow the logged-in WordPress user's language by default, including WordPress's site-language fallback. Add a WordPress language option in Appearance to restore automatic selection after a manual override; use English for unsupported languages. Standalone Pixflow follows the system/browser language instead.
* Translate native WordPress notices, floating-panel controls and Bridge connection menus through the shared language catalogues, including changing connection states. Keep separately loaded Pro features in sync with the selected interface language.
* Improve translated sentences, plural forms, counts and placeholder handling. Add packaging checks for missing translations and mismatched placeholders, while keeping user-written content, saved design and sitemap identifiers, provider/model values and executable commands unchanged. Keep translated design-system token labels and structured-question wording separate from saved identifiers and values.

* Add Composio AI execution in Pro through WordPress without requiring the Bridge or a separately configured CLI provider. Select connected AI providers and models from Execution settings and the composer menu, with official Composio and API-provider icons.
* Run connected-app actions through WordPress, including queued requests and supported steering. Retire the separate Bridge-managed Composio connection path; CLI agents use the same WordPress-selected accounts and write settings.
* Discover existing Composio accounts before requesting a new connection. Show GitHub usernames, connection dates and expandable connection details so users can choose the intended account.
* Include Composio connected-app accounts in Pro without a Pixflow account-count limit. Keep AI provider accounts separate, and preserve saved accounts, permissions and settings when Pro is unavailable. Free supports direct API and Local CLI execution.
* Refine the execution menu with aligned options, secondary setup guidance, full-width model controls and consistent light/dark styling.
* Restyle connector settings with theme-aware key fields, full-width search, a two-column app catalogue separate from AI execution settings, and neutral connection controls. Load available apps through WordPress with clear saved-key status and retryable connection errors. Add centered connector dialogs with connector logos, fixed headers and actions, scrollable content, searchable tool previews and expandable connection/tool details. Use consistent theme variables and light/dark styling, and remove input focus rings.
* Include the official Composio skill automatically when Composio is active, with guidance for the connected-app workflow.
* Add global and per-connector Composio write-access switches with clear warnings. When global writes are off, individual connectors can be enabled separately; connected-app actions check the current account selection and write settings.
* Reorder pending messages by dragging centred handles, with a moving-row preview and items shifting into their new positions instead of a drop-marker border. Retain keyboard reordering and lock ordering while a message is being delivered.
* Simplify Memory settings with searchable saved memories, explicit editing and deletion, JSON export, clearer storage cleanup, and separate advanced controls. Preserve existing data and keep cleanup/export in Free.

* Add Build in Gutenberg to workspace reference handoffs, selecting the actual connected editor even when other builders are installed. Attach removable reference files to the composer without automatically submitting a run.
* Restyle design-system application confirmation with clearer scope, generated-CSS review and spaced, consistent actions.
* Preserve Gutenberg and GenerateBlocks context through queued messages, reloads and supported steering, for both CLI and API editing workflows.
* Keep Free connected during licence resets and temporary licensing-service outages, and refresh paired capabilities when Pro access returns. Reflect current Pro availability in settings, skills and tools across WordPress and the Bridge.
* Upgrade the Bridge to Electron 44.7.0 and SQLite 13.0.3, select the matching native binding during platform packaging, and update browser-data cleanup for the current Chromium APIs. Preserve installed Bridge data, provider sessions, installer/update behaviour and tray restart support. The existing macOS 13 minimum remains unchanged.
* Refresh dependencies and Free/Pro packaging, and remove unused legacy helpers while preserving existing resource packs, project references and customer content.
* Security improvements.

Fixed

* Fix the builder follower showing a blank caption during edits. Keep a readable Updating… label with subtle working feedback, show Updated when the edit completes and Saved only after a confirmed save, and respect reduced-motion preferences.
* Fix right-to-left layout handling for Arabic and Persian across Pixflow panels, dialogs and menus, including overlays opened after changing language. Correct Settings header spacing and close-button placement so controls do not overlap, without changing the surrounding WordPress editor's direction.
* Fix the System appearance icon always showing a sun. Show the current operating-system light/dark preference and update the icon when that preference changes, independently of an explicit Pixflow theme choice.
* Preserve accepted steering messages in the conversation stream and after reconnecting or reloading, without duplicate bubbles. Wait for an in-progress Codex reply before delivering guidance, retain a normal queued follow-up when its final reply completes, and keep active-turn steering working without an empty response or a new Preparing state. Use the same Steer control in Workspace and the floating panel.
* Prevent unrelated settings saves from reapplying unchanged Bricks extension metadata to other content.

= 2.0.3 =

The plugin and Bridge versions are 2.0.3. Update the Bridge before the plugin for the new builder integrations. Existing resource packs remain compatible and do not need updating for this release.

New

* Expand Pixflow into a shared WordPress assistant with optional Bricks, Etch and Elementor integrations. Keep the floating panel, workspace, providers, voice, dictation, queueing, steering and annotations available independently of Bricks.
* Add native Etch editing and builder context, with skills and tools for elements, styles, stylesheets, variables, loops, dynamic content, reusable components, properties, slots, templates, custom fields, assets and Content Hub workflows. Use the installed editor's capabilities and preserve native document ownership when navigating between pages.
* Add native Elementor editing and builder context for classic and atomic elements, responsive controls, reusable styles and variables, templates and components. Support available Pro capabilities including dynamic content, loops, forms and Theme Builder documents, conditions and previews without requiring Angie.
* Add Etch and Elementor toolbar access, onboarding, quick actions and full-screen workspaces. Route creative-reference drafts to Build in Etch or Build in Elementor, with removable reference files attached to the floating-panel composer.
* Extend local Google Fonts installation to Etch and Elementor, including native font selection, editor refresh, activation and removal.
* Extend Pixflow icon packs to Etch asset collections and Elementor icon selection. Etch collections open their icon-set manager directly; manage collection names and removal through Pixflow to keep ownership consistent. Preserve assets already used by existing content when appropriate.
* Extend the shared manual and AI design-system builder to Etch and Elementor. Save multiple profiles, preview them, switch the applied system and restore previous applications. Use a managed Etch stylesheet or Elementor's native design settings, preserving unrelated user styles and requiring explicit choice for site-wide typography and colours.
* Add left and right floating-panel docking in Etch and Elementor. Reserve canvas space, respect Etch's rearrangeable panels, restore native widths when undocking, and move Elementor's Structure panel into the remaining visible area.

Improved

* Add 50 searchable MCP setup templates for WordPress, design, development, hosting and research, with publisher setup guides and labelled credential fields. Redesign the custom-server editor with compact controls, grouped fields and smooth disclosure, and remove visible input focus rings. Preserve spaces in command arguments and prevent saving over an unread configuration.
* Add enabled External MCP servers to the composer's @ menu with clean inline mentions and a settings shortcut. Preserve mentions through queued-message editing, automatic dispatch and Codex/OpenCode steering; prioritise the mentioned tools without restricting other tools or skills. Show only servers supported by the selected Bridge provider and keep MCP entries out of the WordPress / skill menu.
* Show the full settings interface in WordPress Admin. Activate Bricks functionality only with Bricks or a Bricks child theme; activate other builder integrations according to their installed, active plugins. Refresh skills, mentions, tools and capabilities after configuration changes, including sites with multiple builders.
* Separate skills from the Pixflow Abilities catalogue. Show integration availability automatically from the active theme and plugins instead of presenting ability enable/disable switches.
* Preserve saved Bricks settings when switching themes. Disable the Bricks 2FA extension and its WordPress login controls while Bricks is inactive; require manual re-enabling when Bricks returns, while retaining enrollment data and element styling.
* Tailor Design polish guidance to Bricks, Etch and Elementor, with native styling, responsive and saving conventions for the current builder in both CLI and API runs.
* Improve the design-system library layout, application controls and system selector, including clearer stylesheet scope, restore actions, spacing and theme styling.
* Give all three builders a consistent Pixflow quick-menu icon with a settings cog; use the plain Pixflow icon for the floating-panel toggle.
* Match docking previews across Bricks, Etch and Elementor with a clear blue outline, translucent blue fill and square corners.
* Simplify icon-pack settings: show installation actions for uninstalled sets, and activation, Manage and a bin button for installed sets, with consistent regular and hover styling.
* Refine agent question forms with compact choices, descriptions and free-text answers. Keep tool-activity disclosure arrows hidden until hover or keyboard focus.
* Extend annotations across WordPress Admin, Bricks, Etch and Elementor, with native builder context and readable chat labels. Enter or the annotation's submit button saves each comment into one counted composer attachment: “1 annotation”, “2 annotations” and so on. Keep comments and target data inside the attachment, review or edit individual comments, remove them with automatic pin renumbering, and send the complete batch from the composer. Shift+Enter inserts a new line.
* Queue complete annotation batches with any provider, and steer active Codex or OpenCode runs with them. Restore the counted attachment, comments, element context, style requests and images when editing a queued message. Ctrl/Cmd+Enter is an optional shortcut to send the batch immediately, or queue it while the agent is busy.
* Place numbered annotation pins at the exact clicked point, including inside scaled builder canvases. Keep pins aligned during scrolling and resizing, and click a pin to reopen its comment. Include element selectors and clearly labelled viewport, document and screenshot coordinates, plus the numbered marker in captured screenshots. Route screenshots as images only for models advertising image input; retain comments and element context for other providers.
* Add expanding annotation element options for colours, typography, spacing, size and layout. Preview changes temporarily, reset them, and send precise before/after values to the agent for native builder updates. Add a draggable annotation toolbar with browsing, pin visibility, original comparison, batch review, done and discard controls.
* Support CSS variables, nested fallbacks and calculated values in annotation options, with resolved colour swatches and validation for missing or incompatible variables. Keep variable expressions intact when sending adjustments and guide agents to preserve shared styles when changing one selected element.
* Paste reference images directly into annotation comments, with square thumbnails and individual remove controls. Attach captured screenshots directly to the annotation panel after browser permission, with no clipboard step. Preserve the comment when capture is cancelled and distinguish images with identical filenames across a batch.
* Refine annotation controls with consistent backgrounds, rounded shapes, centred icons, textarea spacing and smooth element-options expansion. Remove visible focus-ring outlines from the annotation controls and composer action buttons, while retaining keyboard operation.
* Unify Bricks, Etch and Elementor followers with a fine outline, compact caption and distinct arrival, working and completion feedback. Reveal offscreen targets, respect reduced motion, avoid floating controls and pause following after manual navigation until the user resumes it.
* Add a compact, expandable change review across all three builders. Distinguish editor changes from confirmed saves, navigate changed areas, expand group rows directly to inspect individual elements, and open a targeted annotation follow-up from either view.
* Guide generated-image workflows through media import and Etch's available image optimization tools, including resizing, cropping and compression, while retaining meaningful media metadata.

Fixed

* Use one composer action button across idle, active-run and voice states: disabled Send for an empty idle draft, Stop for an empty active draft, and Send/Queue when text, files or annotations are present.
* Fix External MCP settings in WordPress to save on the paired Bridge and forward enabled servers to Codex, OpenCode and Claude runs. Apply configuration changes to the next run, explain provider and transport support, and remove the internal Pixflow Design storage-path label.
* Fix Antigravity prompts failing from the floating panel by providing the required temporary prompt file, with cleanup after each run. Preserve the existing CLI invocation for older supported versions.
* Keep Steer and Stop working when browser storage is full, and show steering delivery errors beside queued messages. Bridge conversations retain their complete run logs on the Bridge with lightweight browser recovery; API runs can discard duplicate display logs without losing execution state.
* Add separate browser and Bridge tool-history cleanup controls in Memory settings. Protect active and interrupted runs, messages, attachments and native CLI sessions; apply the Bridge’s seven-day completed-run retention regularly while it stays running.
* Recover transient chat-stream and reattachment failures with bounded retries against the same run and event sequence, without resubmitting the prompt or replaying edits. Preserve Stop behavior and report persistent or authorization failures accurately.
* Prevent queued messages from starting before a restored active run finishes after a reload. Preserve explicit API/CLI selection and credentials when live preferences synchronize.
* Pin Bricks, Etch and Elementor runs to the editor tab where they started. Reconnect that tab in place, prevent another tab from taking over, and report disconnected or uncertain operations without replaying edits.
* Protect native builder saves from stale tabs overwriting newer document content. Block conflicting saves with recovery guidance, retain unsaved editor work, and allow saving again after reloading and reconciling the latest version.
* Improve native editor targeting, navigation acknowledgements and result serialization so edits and confirmations remain associated with the intended document, including during connection recovery.
* Correct live-builder request routing on sites using query-string WordPress REST URLs.
* Replace generic Bridge pairing/license errors with specific authorization, site-address, connection and certificate diagnostics. Correct installation-recovery permission checks to accept only successful administrator authorization.
* Fix Mac Bridge HTTPS connections to local development sites by including certificates trusted in the macOS Keychain alongside bundled and extra certificates. Preserve certificate verification and pass system trust to Node helpers launched by the Bridge.
* Fix floating-panel minimize height, drag-to-dock hit areas and accidental text selection while dragging. Keep the canvas visible and restore native panel layout after closing or undocking.
* Restore consistent squircle corners in the Bricks floating panel and improve compact change-review sizing, expansion animation and grouped accordion spacing.
* Keep annotation selection rings behind floating panels, prevent long chips from overflowing chat bubbles, and retain spacing between text fragments in element labels.
* Prevent annotation picking from intercepting composer attachment controls. Remove orphaned annotation images when their comment or batch is removed, and retain unrelated composer text and attachments.
* Keep annotation options and the bottom toolbar aligned with the selected light, dark or system theme. Show the correct grid/flex controls for variable-driven layouts and explain when inline overrides prevent a temporary preview.
* Fix follower timing while Elementor widgets render or content shifts. Follow the containing element until the precise target is available, preserve multiline caption spacing and prevent idle/composer interactions from pausing the next request.
* Replace raw live-builder connection errors with a readable notice and optional technical details. Stop reconnecting to Bricks when it is no longer active after a theme switch.
* Fix builder-specific design-system detection, including erroneous Bricks setup checks in Elementor, and correct application-option and dropdown alignment.
* Restore full-screen workspace sizing and Pixflow logos/community previews in new builder contexts. Remove the obsolete Claude Design alternative tagline.

= 2.0.2 =

* Add a native Intel Mac Bridge installer alongside Apple Silicon, with separate downloads for each architecture.

* Annotate page elements from the floating-panel composer in WordPress Admin and Bricks. Highlight and select elements, type or dictate comments, collect multiple annotations, then send, queue or add them to the composer. Show readable comments and compact element-context chips instead of raw JSON, while supplying the agent with page and native Bricks context without collecting form values.

* Rebuilt onboarding for WordPress Admin and Bricks with saved progress, clearer Bridge setup, and a choice of AI subscription, API key or no AI. Existing settings are recognized and optional frameworks/resources can be configured later.

* Fix restored Bricks conversations losing the beginning of streamed answers, provider identity and attachment ownership.
* Fix a Windows dictation CLI shutdown error after successful requests.
* Fix fresh message queues staying paused after an earlier failed run.

* Replaced the three Bricks panel toolbar controls with one toggle. Dock placement is preserved, drag docking remains available, and closing reliably restores the native Bricks panel width.

* Resource handoffs now include removable reference-file attachments in the Bricks composer, including the website prototype HTML where available.

* Creative Resources now offer Use in Bricks and Create media, preparing a reviewable floating-panel draft instead of an HTML workspace project. Existing drafts are preserved. Browsing is limited to 99 resources with supported destinations; older saved references remain compatible.
* Restore resource browsing in Settings and the workspace; fix catalogue authentication, style-reference previews and preview dialog layering.
* Curated skills and creative resources focus on Bricks, web design and media; saved references and personal content remain available.
* Clearer Creative Resources and Style References labels, with native Bricks guidance for retained web templates.
The plugin and Bridge versions are 2.0.2. Update the Bridge before the plugin to use the new runtime features. Existing resource packs remain compatible and do not need updating for this release.

New

* Queue follow-up messages with any provider and run them in order after the current request finishes. Edit queued messages in the composer, reorder them or remove them before sending.
* Steer active Codex and OpenCode runs with a queued message without canceling or restarting the current work. Other providers retain normal message queueing.
* Add optional on-device dictation through Pixflow Design Bridge. Speak into the composer, review the transcribed text before sending, and use a live audio waveform with finish and discard controls.
* Manage dictation in Settings: choose Base quantized, Small quantized or Small models, download with visible progress, disable the module or remove downloaded models. Retain downloaded models across Bridge updates; hide the composer control when no Bridge is available.
* Add Codex Voice to the floating panels with spoken requests and replies, voice selection and previews, an audio-reactive orb, microphone mute and clear connecting, listening and finishing states.
* Click the voice orb to start a conversation or finish after the current task; ending voice mutes audio immediately while accepted work completes. The main Stop control cancels immediately.
* Connect multiple licensed WordPress sites to one Bridge and work on them concurrently, with separate conversations, runtime data and site-bound requests.
* Add a shared Bridge connections popout in floating panels and the workspace, showing each site's domain and connection state, with Open admin, Free memory and Connect actions.
* Keep up to five idle site runtimes ready and release the oldest extras after a five-minute idle grace period. Active work is protected; a single site and the most recently used idle sites stay awake unless manually released. Normal requests wake sleeping sites and retain their conversations.

Improved

* Refine floating-panel headers, size controls, Bridge connections and menus with consistent light/dark surfaces, rounded corners, compact layouts, clear icons and shared scrollbar styling.
* Add smoother squircle corners to the composer, floating panel and provider popout where supported, with rounded-corner fallbacks. Keep the main floating panel shadow-free to avoid corner rendering artifacts.
* Redesign the composer and its file, context and skill pickers with inline mentions, searchable grouped menus and clearer descriptions. Align provider, model, reasoning, design and voice controls with the same menu styling.
* Move Codex voice selection and previews into Settings, keeping the voice orb and active-call mute control in the composer.

* Simplify floating-panel @mentions by retiring duplicate and internal shortcuts. Mentions provide relevant skill references without restricting other skills or research; saved shortcuts continue to resolve.

* Remove legacy mode overrides and obsolete mutation/approval restrictions from agent skills and their catalogue; cached Ask/Plan values now resolve to the unified agent instructions.
* Simplify WordPress, Bricks and Sitemap agents to one execution flow. Retire Ask/Plan/Design execution choices and the saved Guarded preference; keep Design styling and Design polish controls. Questions and planning requests continue to respect the user's requested scope.
* Give API-key providers native WordPress, database, file and live Bricks tools, with provider-specific tool messages, image inputs, complete-result paging, cancellation and reload checkpoints. Official OpenAI API runs use Responses, including Luna's reasoning/tool continuation.
* Fix duplicate JSON content-type headers on browser-to-Bridge requests, which could make stock-photo searches and other POST requests arrive with an unreadable body. Show structured service errors clearly.
* Keep conversations, questions, partial output and task outcomes attached to their original run and page across panel reopening, reloads and connection loss. Compatible Codex and OpenCode follow-ups reuse native sessions.
* Reattach to an existing run after a connection interruption without launching it again. Preserve interrupted work after a Bridge restart without automatically replaying native edits.
* Group thinking, commands and tool activity between responses into expandable shimmer summaries, with descriptive live labels, completed-action summaries, matching Tabler icons and visible error counts. Providers without detailed activity retain simpler status labels.
* Make long responses and conversation lists more responsive with batched stream rendering and event storage, lighter history loading and bounded thinking previews. Preserve event order, terminal updates and reduced-motion preferences.
* Render supported question cards from answer and thinking streams, and suppress malformed or unsupported card markup while preserving literal code examples.
* Enable Design polish (Beta) by default for new preferences while preserving an explicit off choice. Add maintained Pixflow Frontend guidance for composition, typography, imagery, responsive layouts and visual review, with MIT attribution for the adapted Design Taste guidance.
* Keep design guidance aligned with the brief, selected styling mode and native Bricks classes, variables and framework data, without adding a mandatory preflight or restricting research and skill choice.
* Refresh the lightweight live Bricks context as fonts, variables, classes, breakpoints and framework settings change. Prioritize design essentials and bound previews while retaining complete native records in the JSON companion.
* Improve multi-page live-builder guidance and page targeting, including Bricks Instant navigation and recovery when a full page navigation is needed.
* Scroll off-screen native Bricks edit targets into view for follower feedback, respecting canvas zoom and reduced motion without repeatedly interrupting user scrolling.
* Improve generated-image and stock-media feedback, native image assignment and session-owned progress cleanup after completion, failure or cancellation.
* Show provider discovery and reconnect progress instead of presenting stale providers as current. Refresh failed discovery after reconnection without requiring a manual rescan.
* Improve Bridge readiness checks, background Windows provider discovery, shutdown and recovery. Keep separate development and installed runtimes isolated, and hide background command windows while retaining intentional interactive login windows.
* Reduce background Windows process launches by sharing Codex app discovery between provider refreshes and voice previews, and combining simultaneous process scans. Preserve app-first detection, retain known app locations after temporary lookup failures, and fetch fresh process data for later operations.
* Add privacy-focused diagnostic exports with bounded run metadata and categorized errors, avoiding raw prompt, page-content and credential details in exported summaries.

Fixed

* Use a single hidden native Windows process-tree cleanup when stopping Codex Voice or ending agent runs, replacing the PowerShell shutdown scan and coalescing overlapping stop requests. Verified Voice Stop and orb-end on the development Bridge without terminal flashes.

* Allow library templates with empty placeholder links to pass native Bricks insertion validation while preserving valid page, dynamic-data and external links.
* Insert header and footer templates into their correct Bricks content areas, preventing content from being written into a separate page area and appearing twice in the canvas.
* Apply the Colour scheme control to live header and footer template collections in the Bricks canvas, including switching schemes and clearing back to Default.
* Allow the site identity header during automatic browser-to-Bridge pairing, fixing a connection failure that could leave provider discovery and dictation unavailable.

* Preserve the current installation identity, including recovered licenses, when upgrading a site from HTTP to HTTPS. Let the Windows Bridge and its agent helpers connect to LocalWP using certificates already trusted by Windows, with certificate verification enabled.

* Fix LocalWP onboarding on Windows where a site could appear in the Pixflow account but remain unlicensed locally because PHP could not create its installation key. Supply an operation-scoped OpenSSL configuration without changing host TLS settings.
* Restore Bricks toolbar initialization and floating-panel request identities on HTTP local domains where crypto.randomUUID is unavailable, while retaining cryptographic randomness for replay credentials.
* Use the Codex App's bundled runtime and current model discovery ahead of a separate CLI installation, and use the normal Codex sign-in instead of stale copied authentication.
* Keep pending or rejected native edits from appearing successful, preserve the original task and page identity, and prevent late results from overwriting a newer task's cancellation controls.
* Prevent overlapping native Bricks commands from overwriting pending work or being delivered twice, and prevent delayed acknowledgements from deleting newer commands.
* Preserve text-file encoding on Windows helper paths and clarify UTF-8 file-writing guidance for generated content.
* Correct floating-panel light/dark styling, popout overflow, label spacing and follower layering. Prevent Pixflow menu and modal actions from filling or changing unrelated Bricks and Advanced Themer inputs.
* Keep failed and retried commands inside grouped activity, remove the extra streaming prose cursor, and show canceled or interrupted work without misleading failure or offline messages.
* Improve voice transcript turn handling and response separation, remove stale Preparing feedback after connection, and avoid a failure card when ending a completed voice conversation.
* Recover automatic license pairing against the configured production authority instead of reusing an obsolete staging authority for new pairing.
* Keep other verified connections and their live activity visible when the current site sleeps, including after reopening or reloading the panel. Sleeping status checks do not wake the site, and managing another connection still requires current authorization.
* Wake a site safely when a new request arrives during sleep, coalesce simultaneous wake requests, and recover a confirmed exited site runtime without interrupting another connected site.

= 2.0.1.2 =
Requires Pixflow Design Bridge 2.0.1. Resource packs remain at 1.1.4; no bridge or resource update is required.

* Download the native macOS DMG instead of the Linux install script from onboarding, WordPress admin and Bricks panels, with clearer Apple Silicon guidance and an account download link.
* Keep Bricks extension headings readable in dark settings panels embedded in WordPress admin.
* Keep two-factor login, enrollment and account recovery available when the Pixflow license or installation entitlement is unavailable, while retaining all authentication and verification checks.
* Restore the 2FA challenge dialog when Bricks uses a custom login error message, and show a useful verification error when the challenge request fails instead of silently leaving an incorrect-password message.

= 2.0.1.1 =
Requires Pixflow Design Bridge 2.0.1. Resource packs remain at 1.1.4; no bridge or resource update is required.

* Fixed recovery for disabled sites when no license key is saved, with a clearer three-step recovery guide, copyable recovery request and improved bridge/recovery controls.

= 2.0.1 =

Requires Pixflow Design Bridge 2.0.1. Resource packs remain at 1.1.4; no resource update is required for this release.

New
* Added Unsplash search to live agent runs and Bricks image guidance, with Media Library records, descriptive titles and slugs, alt text and linked photographer credits. Images retain their original Unsplash CDN URLs.
* Added version-aware Automatic.css mapping for v3 and v4, including v4.0.1 support.

Improved
* Give agents a lightweight live Bricks context document covering the current canvas, classes, variables, fonts and breakpoints, refreshed as the builder changes.
* Allow related native builder edits to appear progressively with follower feedback and native Undo/Redo.
* Improved live-builder skills, compact tool help and focused inspection responses so agents can access relevant information with fewer calls.
* Clarified and restyled direct-site access and connection errors.

Fixed
* Use the production Pixflow Templates endpoint by default, keeping Library requests aligned with production licensing.
* Automatically recover bridge license pairing for an already licensed site when a protected request requires it, without a manual pairing step.
* Fixed Bricks class and CSS hydration during live edits, preserving styles and refreshing affected canvas elements.
* Fixed misleading follower completion popups for read-only operations and unchanged values.
* Fixed Unsplash connection tests in WordPress settings and replaced the unhelpful “Provider returned 0” message with meaningful errors.
* Fixed Core Framework setup detection when colour variables are supplied by Core Framework CSS.
* Fixed Automatic.css version detection and mappings for body colours, shadows, spacing and CSS expressions.
* Fixed live tool response handling and code-file arguments, and clarified native insertion ordering in the Bricks skills.

= 2.0.0 =

Requires Pixflow Design Bridge 2.0.0. Resource packs remain at 1.1.4; no resource update is required for this release.

New
* Build and edit directly in the live Bricks builder, with native Undo/Redo, shared classes, variables, query loops and conditions.
* Follow agent activity in the builder with an animated cursor, element highlighting and editing/saving feedback.
* Choose whether builds reuse the site's Bricks design variables and colours or give the agent more creative freedom.
* Plan and manage site hierarchies in the sitemap with planned, draft, private and published page states, section plans and a dedicated floating agent panel.
* Receive licensed plugin updates through the native WordPress Plugins screen using the new Pixflow release service.

Improved
* With Safe mode off, Design requests in Bricks, WordPress Admin and the sitemap run directly without the former preflight/proposal workflow. Ask and Plan remain read-only.
* Skill mentions provide relevant context without restricting access to other skills or research. Consolidated Bricks guidance and removed obsolete workflow restrictions.
* Synchronize sitemap pages with WordPress and native Bricks page lists, including external changes, hierarchy updates, reloads and concurrent edits.
* Simplified sitemap card actions and improved search, state filters, keyboard navigation, menu positioning and smaller-screen layouts.
* Moved licensing and protected downloads to the native Pixflow service, with signed installation entitlements, token renewal and preserved existing installation identity.
* Updated Library delivery while preserving remote template identities, class renaming, framework mapping, dependency setup, code signing and native Bricks insertion.
* Unified account downloads, plugin updates and resource discovery around versioned releases; refreshed resource metadata when the licensing authority changes.
* Prefer the Codex App's bundled CLI over a separately installed Codex CLI when both are available.

Fixed
* Fixed bridge pairing before site selection, slow site startup, connection recovery and Windows bridge version registration.
* Fixed live Bricks edits rejecting untouched elements with empty saved settings, while preserving the intended follower target.
* Fixed Core Framework preset imports on PHP installations without mbstring.
* Fixed stale WordPress update notices, extraction error handling and updates incorrectly activating inactive plugins.
* Fixed sitemap moves and removals changing unrelated page orders, and sibling-before insertion placing pages after the target.
* Fixed new sitemap pages being hidden by active filters and Space-key page selection also starting canvas panning.
* Fixed clipped sitemap menus, overlapping section controls and missing accessible names and focus indicators.
* Fixed cancellation appearing as an error; completed sitemap changes remain visible and retained after stopping an agent run.

= 1.1.5 =

== New ==

* Added a site-wide 2FA policy in Bricks extensions settings with required enrolment, selectable authenticator/email/passkey methods, per-role enforcement, and optional Google sign-in step-up verification. At least one method always remains active, and disabling a method preserves existing user credentials.
* Added Reset onboarding to Settings → About so administrators can replay license, framework, resource and connection setup, with the workspace and Bricks toolbar returning to onboarding immediately without a reload.
* Added catalogue-driven Codex Fast mode controls to Execution settings and both floating-panel provider menus. Fast only appears for models that advertise it through the installed Codex CLI, persists with the shared model preference, and is forwarded through workspace, Bricks, WP Admin, connection-test, daemon, and Bridge runs.
* Added a context-bound Undo control beside Copy for the latest reversible WP Admin agent run. Multi-action runs restore in reverse dependency order through the existing rollback/audit system, while stale, replayed, cross-site, cross-user, cross-conversation, and cross-tab undo requests fail closed. Bricks keeps its native Undo/Redo history.
* Added one shared agent-activity stream across the main workspace, Bricks panel, and WP Admin panel with provider-safe public thinking, meaningful tool phases, a live research shimmer, bounded source evidence, truthful cancellation, and no raw transport frames in chat.
* Added a WooCommerce Recently Viewed Products query type and Bricks conditions with cache-aware first-party product history.
* Added Google Site Kit Sign in with Google controls for Bricks login and registration forms, including setup guidance, supported-version checks, redirects, full-width buttons, and 2FA compatibility.
* Added a native Bricks Cookie Consent element with editable banner, preferences and blocked-content views, Google Consent Mode v2, Global Privacy Control, optional platform APIs, automatic detection and blocking, and immediate allow-all placeholders.
* Added native two-factor authentication for Bricks and WordPress login, registration, and account areas with authenticator-app QR setup, email codes, recovery codes, multiple passkeys/security keys, downloadable backups, and administrator recovery controls.
* Added builder previews and styling controls for Cookie Consent and 2FA panels, modals, verification inputs, buttons, blocked-content placeholders, and confirmation dialogs.
* Added modular Bricks extensions settings with independent module toggles, global consent-service configuration, and branded 2FA email settings.
* Added an optional native Bricks Gradient banding fix with per-element smoothing for linear, radial, conic, repeating, background, overlay, text, responsive, state, and custom-selector gradients while preserving clean native CSS output.
* Added the Pixflow floating agent to WordPress Admin with shared settings and memory, typed WordPress/ACF capabilities, managed code projects, plugin-source inspection, WPCodeBox 2 and JetEngine support, and matching od CLI commands.
* Added a first-class Pixflow Gutenberg ability tree with exact document grounding, live target-editor block schemas, Media Library bindings, explicit content-intent routing, one bounded schema repair, canonical preparation, atomic verified persistence, and evidence-based support levels.
* Added agent-selected, provider-independent online research to the WP Admin floating panel for documentation, troubleshooting, implementation evidence, and sourced content work, with bounded extraction, public-network safeguards, citations, and shared web/CLI access.
* Added the same agent-selected public-research capability to the Bricks floating panel for any Ask, Plan, or Design task where the semantic agent decides current evidence would improve the result, with shared research activity, bounded sources, and Local CLI/BYOK grounding parity.
* Added the canonical HTML-first Build in Bricks workflow: the selected agent authors semantic HTML/CSS/optional JavaScript and Pixflow validates, reviews, converts, inserts, and verifies native editable Bricks output.
* Added effective responsive Theme Style ledgers, deterministic validation and rendered-review reports, persisted handoff evidence, snapshot-drift protection, selected-agent visual review, and safe retained-source follow-up editing.

== Improved ==

* Redesigned onboarding as a responsive split-panel guided workflow using Pixflow Design's existing theme, clearer progress and step context, non-skippable license activation, integrated initial resource installation, live Bridge detection, and browser local-device permission guidance.
* Made the optional Bridge fully inactive in BYOK mode by suppressing Bridge status UI and heartbeat traffic while retaining direct provider execution; Local CLI onboarding detects a newly installed Bridge without a page reload.
* Removed Automations and Integrations from the main workspace navigation while keeping connector and MCP configuration available in Pixflow Design settings.
* Simplified About to the installed Pixflow and Bridge versions plus diagnostics export, moved Bridge install/update/repair controls to a shared download card, removed WordPress-only channel, runtime, platform, and architecture labels, and limited WP Admin Downloads to the relevant Bridge item while retaining resource downloads in builder/workspace settings. Every download now shows a clear Up to date, Update available, or Not installed status pill.
* Removed the superseded top-centre Bridge disconnected/reconnect banner while retaining heartbeat, update, site-switching, and reconnect support through the workspace header and floating panels, and reordered the Settings navigation into a clearer workflow sequence.
* Removed the redundant Pixflow Bridge WP Admin-bar item, added the shared status/reconnect control as the first Pixflow Design workspace action while retaining the event-driven heartbeat, and set project workspace tabs to a 130px minimum-width fallback.
* Warmed the selected Local CLI with a targeted non-generating readiness check across the main workspace, project workspace, WP Admin panel, and Bricks panel. Readiness is reused across navigation and reloads, isolated for different site CLI profiles, refreshed after heartbeat site switching without repeating on unchanged heartbeat ticks, and kept separate from BYOK, licensing, conversations, and write authority.
* Decoupled resource-pack releases from plugin releases with dedicated build/deploy commands and content revisions, added a Downloads update badge and live percentage progress, simplified each pack to its name, version and relevant actions, moved only the initial missing-resource install into onboarding, and removed the post-onboarding resource-required popup and update gate.
* Updated the shared agent activity shimmer contrast in light and dark themes while retaining its existing six-second animation.
* Changed ordinary Build to inherit effective Theme Styles and serialize only source-authored measured properties, preserving destination-responsive typography and spacing alongside genuine local overrides.
* Limited ordinary Build to one generation, one structured repair maximum, and one selected-agent aesthetic review maximum without provider mixing or hidden retry paths.
* Kept Website Clone and HTML-to-Bricks on their isolated source-fidelity policies while sharing the current Pixflow converter.
* Removed the manual WordPress Admin action approval panel. Valid Design actions now execute immediately while retaining internal permission, context, one-time authority, audit, readback, and rollback checks.

== Fixed ==

* Fixed Build in Bricks incorrectly surfacing a missing Bridge skill as an offline connection. The WordPress plugin now owns and supplies the fingerprint-verified HTML-first ability and complete Bricks converter guidance to both BYOK and Local CLI paths; the daemon validates and materializes converter Markdown per run, and the Bridge no longer owns or packages Pixflow skill Markdown.
* Updated provider connection-test feedback so quota exhaustion is reported plainly as **Usage limit reached** while confirming that the connection and configuration look valid, instead of exposing the internal rate-limit wording.
* Fixed Codex Local CLI authentication becoming stranded in a legacy Pixflow-managed site profile after the desktop account changed. The bridge now migrates legacy managed profiles to the namespaced site home and refreshes managed authentication immediately before each Codex spawn, while preserving explicitly configured custom `CODEX_HOME` values.
* Fixed Pixflow Library BEM renaming reusing an existing template's global-class IDs and renaming previously inserted copies. Renamed insertions now use isolated Bricks class records while genuine same-name shared classes are still reused.
* Fixed Pixflow Library insertions rejecting valid first-party Bricks Code payloads before insertion; executable content is validated, source-site signatures are removed before local signing, one-time Splide setup blocks are removed automatically, and required GSAP/Splide page settings are enabled for the inserted template.
* Fixed Bricks extension settings requiring a Builder reload before controls, groups, active methods and previews updated; definitions now rehydrate in place, inactive 2FA methods are excluded from previews, and previews clear when their element is deselected.
* Fixed 2FA setup and verification across native WordPress and Bricks login/registration, including WordPress-native presentation, role-aware forced enrolment, stable passkey challenge state, and correct custom Bricks login error handling during a valid verification challenge.
* Fixed missing default spacing between a Sign in with Google button positioned after a Bricks form and the form message.
* Fixed Downloads totals omitting the Pixflow Design Bridge in builder/workspace settings; totals now cover the complete catalogue, while WP Admin omits redundant aggregate counts because it shows only the Bridge. Also fixed dark-theme model selector contrast, kept searchable model popovers visible and fully dark-themed inside the full-screen Settings modal, and corrected their roughly 50px portal-position offset.
* Fixed About diagnostics exports downloading WordPress HTML as an invalid ZIP or appearing as Stopped when Chromium did not claim a synthetic Blob download. WordPress now owns an always-available, same-origin, short-lived, opaque, single-use HTTP ticket, so BYOK/API users can export without the optional Bridge and the browser owns the transfer. Bundles include bounded privacy-redacted WordPress, Pixflow, action/audit, and PHP/client diagnostics with integrity hashes and a 25 MiB limit; optional Bridge/provider runtime evidence may be added when available, while prompts, post content, credentials, media, host identity, and binary dumps remain excluded by default.
* Fixed Codex chat rows showing the Claude icon when provider identity arrived through the run-start event or was restored after navigation. Bricks memory now retains the historical provider, labels and icons use the same per-message evidence, and genuinely legacy rows use a neutral Assistant identity instead of a false Claude fallback.
* Fixed WP Admin floating-panel Settings so the shared modal opens across the full WordPress viewport, with Skills and Bricks Extensions hidden from the admin-specific settings profile.
* Fixed completed or canceled **Request understood** activity retaining an animated spinner, and preserved Bricks semantic-preflight and source-generation activity through the shared provider-neutral chat renderer.
* Fixed Bricks floating-panel scratch-project and public-research requests being misrouted between WordPress and the local Bridge. Durable and temporary project identities now match, research always uses the Bridge daemon, intentional cancellation cannot report a false Bridge disconnection, and internal semantic-contract JSON stays out of chat.
* Fixed Gutenberg replacements failing exact readback when WordPress assigned a default category to an intentionally uncategorised post, and made compensating rollback restore the original modification timestamps.
* Fixed Gutenberg full-document actions accepting empty or contradictory browser serialization evidence; canonical content and block counts are now independently verified before approval and commit, with exact rollback on readback mismatch.
* Fixed WordPress and Bridge project-file synchronization on sites using query-style REST URLs (index.php?rest_route=...), while preserving normal pretty /wp-json/... routing and request query parameters.
* Fixed icon-set setup failing with an incorrect storage-directory error on servers where the WordPress uploads path is exposed through a symlink or mounted path.
* Fixed partial plugin updates causing a fatal error when the entry file loaded before src/autoload.php had been replaced; bootstrap now exits safely for that request.
* Fixed responsive Theme Style storage/preview parity, canonical snapshot hashing, semantic-content validation, structured repair findings, deterministic report persistence, and actionable pre-conversion failures.
* Fixed browser, renderer, inherited Theme Style, and host-shell values leaking into pixflow-measured classes; ordinary Build now persists only attributable source-owned styles while retaining explicit overrides.
* Fixed native grid track geometry, hidden/decorative overflow handling, persisted root ownership, heading cascade parity, and fluid responsive ownership found during live multi-viewport acceptance.
* Fixed hosted/BYOK complete-source parsing and retained follow-ups, plus conversational retained placement, nested insertion, media context, transactional rollback, and bounded semantic-preflight failure without deterministic prompt routing.

= 1.1.4 =
* Rebuilt HTML to Bricks around a standalone, Pixflow-owned canonical source contract for complete HTML documents and saved-page bundles, including versioned manifests, rendered-source snapshots, safe project references, supporting CSS and JavaScript, local media, and precise source diagnostics.
* Kept HTML to Bricks independent from Website Clone and retained the Pixflow converter as the production authority without calling or depending on Bricks' native converter.
* Rebuilt Website Clone as a bounded public-URL acquisition flow that saves the settled document and required assets as a local bundle, removes tracking and unrelated runtime code, and feeds the same Pixflow HTML-to-Bricks converter without invoking Prototype Stage A.
* Added a versioned Bricks compatibility layer and improved deterministic structure recognition, CSS cascade and ownership, native controls, responsive layouts, global classes, colours, variables, framework reuse, forms, media, icons, positioned content, and page-wide style placement.
* Added one rollback-safe Pixflow page-foundation Theme Style for fresh full-page HTML-to-Bricks runs without stacking shared isolation styles or changing section/component Theme Styles.
* Inserted deterministic converted JSON into the live Bricks canvas as the completed initial result for both Build in Bricks and HTML to Bricks, giving users an immediate editable baseline before any model-led cleanup.
* Routed Handoff to Bricks from completed Build HTML workspaces through the same current Pixflow HTML-to-Bricks baseline converter as the floating-panel flow, leaving cleanup as an optional Next Action.
* Prioritised adjacent CSS, JavaScript, images, SVG, video, and font files in workspace handoff bundles while excluding reports and generated output from earlier handoff runs.
* Added Clean up and refine the build as an optional Next Action after verified HTML-to-Bricks conversion, matching Build in Bricks and reusing the applied baseline instead of forcing Stage B during the initial run.
* Reduced optional Stage B to one bounded evidence-led model pass; structurally safe results remain applied when parity is low or cleanup cannot complete so the user can keep the page or use Bricks Undo instead of receiving a failed run.
* Added converter-only multi-viewport QA, runtime audits, structural/editability metrics, compatibility diagnostics, and frozen saved-page fixtures so conversion quality can be tested without Stage B token usage.
* Added AI-led semantic preflight for Ask, Plan, and Design, selecting installed skills and bounded Bricks capabilities from the user's meaning and preserving the original brief through conversational clarification and continuation.
* Replaced mandatory intent question forms with conversational agent clarification and asks whether page/section builds should use generated or placeholder images only when the prompt is ambiguous.
* Shipped a canonical Pixflow placeholder image and routes explicit placeholder requests without invoking image generation.
* Expanded native compound Bricks mutations for conditions, Query Loops, interactions, dynamic data, accessibility, full-page copy, images, and media with exact target resolution and native Undo.
* Fixed invalid or prose HTML being misreported as ARTIFACT_NOT_FOUND; invalid source, persistence failure, and genuinely missing output now have distinct retryable diagnostics.
* Fixed large saved-page bundles failing with HTTP 413 by compacting compatibility context and transferring source files and referenced assets through bounded project references without truncation.
* Fixed nonvisual application/framework scripts leaking into visible Bricks text or invalid dynamic tags while retaining required page-visible animation code.
* Fixed reusable source CSS being pushed into page or element custom CSS unnecessarily; native global classes and controls now own representable styling, with scoped fallback CSS reserved for complex selectors and effects.
* Fixed responsive gaps, intrinsic sizing, heading specificity, header/main ownership, deterministic ID collisions, native forms, positioned overlays, landmarks, inline controls, screen-reader content, and icon dimensions exposed by visual testing.
* Fixed standalone HTML files without companion folders, unresolved and 404 media, and SVG fallbacks so missing media uses the plugin-shipped placeholder without interrupting conversion.
* Fixed source entrance animations, tabs, testimonial sliders, navigation arrows, document flow, non-wrapping navigation, accent colours, blockquote resets, and authored spacing through general converter rules.
* Fixed local and relative media, remote fonts, font sidecars, legacy Pixflow palettes, Theme Style ownership, reruns, rollback journals, and global-reference validation so pages keep their real assets and restore the exact pre-run state safely.
* Fixed broken generated-image workspace previews after successful WordPress uploads, plus floating-panel generation and existing Media Library replacement so native attachment IDs, URLs, metadata, and alt text stay synchronized.
* Fixed selected/current element targeting so it only uses the live Bricks selection; ambiguous requests now require an exact ID, grounded description, or agent clarification.
* Fixed valid conditions, Query Loops, interactions, dynamic data, and multi-target mutations being repeatedly rejected while unknown fields and invented targets continue to fail closed.
* Fixed duplicate repaired Design responses, empty Ask/API completions appearing successful, and premature Done states before the real Ask response arrived.
* Fixed the Understanding what you want me to do… shimmer flashing during handoff and the @ mention menu jumping to the top when background result sources finished loading.
* Fixed completed clarification banners and run cancellation so question completion is shown consistently and an active non-skippable clarification can still be stopped.
* Fixed Build in Bricks briefly showing validated Stage A HTML or CSS as Invalid while deterministic conversion started; the source view now preserves observed content and reports temporarily unavailable validated sidecars as Accepted.
* Fixed temporary .stage-a-* implementation classes leaking into saved Bricks data so verified converter baselines retain source-owned classes without pipeline-only references.
* Fixed workspace Build HTML handoffs invoking the Stage B default, reattaching previous run reports, or colliding with another project's global Bricks colour categories when both documents were named index.html; generated colour identities are now project-scoped.
* Fixed responsive desktop grid placement leaking into Bricks base/mobile widths and pushing hero content or images off-canvas; inactive placement now resets to auto in the shared Website Clone and HTML-to-Bricks converter.
* Fixed measured desktop single-line headings being frozen to nowrap on mobile while retaining intentional one-line navigation and CTA labels.
* Fixed safe reruns colliding with ownerless legacy Pixflow colour categories by adopting only categories with strong Pixflow variable provenance and continuing to protect user-owned categories.
* Fixed the Pixflow Library retaining its previous search, filters, active template, and BEM class rename value when reopened in the same Bricks session while preserving its cached catalog.
* Fixed About showing Bridge version details as unavailable while connected and now shows Up to date instead of Install latest when the installed Bridge needs no update.
* Fixed icon previews intermittently appearing dark in the dark Build your set modal by applying preview contrast from the modal's active theme across the portal boundary.
* Fixed required-resource, license, and Bridge blocking modals retaining light surfaces in dark mode by giving every gate its own active theme scope and shared surface tokens.
* Fixed Local CLI onboarding requiring a successful manual test before continuing; selecting an available CLI discovered through the Bridge is now sufficient, with Test connection retained as an optional diagnostic.

= 1.1.3 =
* Fixed license validation races and cached entitlement handling so a successful onboarding validation remains active after refresh instead of reopening the missing or invalid license gate.
* Fixed Local CLI entitlement synchronization so the selected Pixflow Design Bridge can be tested immediately after license activation without a stale response returning HTTP 402.
* Improved floating-panel memory with durable conversation restoration, longer context, explicit New conversation and Clear current context actions, and true retry continuation for repair events.
* Relaxed non-security Bricks mutation gates so the agent can make normal multi-element changes while Bricks validation, structured repairs, and recoverable undo snapshots remain in place.
* Added provider-aware image, video, and audio project handling for Local CLI and BYOK/API sessions, including WordPress-backed project storage when the optional Bridge is unavailable.
* Added Google AI Studio media support through the existing Nano Banana credential slot, including Nano Banana image models, Veo 3.1, Veo 3.1 Fast, and Gemini Omni Flash, plus resilient AI Hub Mix video model discovery.
* Added required floating-panel provider/model questions for image and video generation, showing every configured model per provider and removing the skip path for media requests.
* Added native generated-media actions that create or replace Bricks image and video elements with WordPress Media Library attachments, including multi-target patches and structured repair context.
* Added request-scoped Local CLI credentials and direct WordPress media generation/polling for BYOK/API sessions so valid browser-owned keys do not depend on stale daemon credentials.
* Added WordPress project-file CRUD, authenticated previews/raw URLs, and Bridge-to-WordPress synchronization so generated media and edited files persist and reopen correctly.
* Added provider-aware model identities, composer overrides, and media metadata handling across workspace and floating-panel chats.
* Fixed image-chip runs entering the Prototype/HTML pipeline; image projects now keep only the generated binary output and safely remove stray HTML/preview companions.
* Added Google AI Studio Veo and Gemini Omni video rendering with progress reporting, safe downloads, and provider-specific errors.
* Fixed generated media filenames and WordPress attachment metadata so uploads receive descriptive names, titles, alt text, captions, and descriptions instead of prompt-shaped or unnamed placeholders.
* Fixed floating-panel media preparation, provider preflight, native Media Library binding, canvas hydration, and reopened-project synchronization so valid runs do not appear stopped while generation is still completing.

= 1.1.2 =
* Brought the floating-panel Build in Bricks Stage A into parity with the current Prototype HTML planning, design, skills, responsive-preview, and repair pipeline.
* Kept only the Bricks-specific generation requirements for semantic BEM classes and no headers or footers unless explicitly requested.
* Moved framework-variable mapping and other Bricks implementation details into the converter so the design agent retains Prototype HTML's creative freedom and quality focus.
* Changed the initial Build in Bricks run to finish after deterministic conversion, persistence, and live-canvas hydration, with model-led cleanup offered as an optional post-generation action.
* Replaced the duplicate Bricks completion and rollback card with the canonical Prototype HTML Next Actions experience while retaining Bricks' native Undo recovery.
* Reduced repeated post-generation work by reusing the verified converted baseline and limiting optional refinement to concrete structural, responsive, or visual findings.
* Added one reusable Pixflow Design Isolated Bricks Theme Style for full-page builds, automatically adding an Individual-page condition for every generated page while leaving section and component builds on their existing Theme Styles.
* Added an enabled-by-default Use true sizing for empty divs setting that removes Bricks' editor-only 90px empty-div minimum inside the live builder canvas, including during manual building, without saving override CSS into page or frontend styles.
* Prevented valid converted pages from failing or rolling back when optional visual parity, subjective quality, QA, or model-led repair does not reach its target; the build now remains applied with a review-and-Undo warning.
* Made malformed model output, quiet runners with completed artifacts, failed repair commands, and unexpected optional-cleanup errors fall back to the verified conversion, while genuine structural, persistence, authentication, and transport failures still stop safely.
* Preserved generated BEM class names and class-owned styling through conversion and optional cleanup without replacing semantic classes, inventing alternate names, or moving class styles into element ID controls.
* Improved general conversion of CSS cascade and selectors, custom properties, page spacing, containers, responsive controls, forms, remote images, and managed assets.
* Fixed post-conversion hydration so class styles, global-class data, page spacing, installed fonts, and content update immediately in both the open Bricks canvas and the front end after the initial build and optional cleanup.
* Fixed Design Your System saves so added, changed, and removed colour schemes immediately rebuild Bricks' live global-class lookup and update the data control and canvas without reloading the builder.
* Fixed Bricks colour-scheme selection so the current element setting overrides stale initial builder data, each selected scheme renders its matching canvas colours, and clearing reliably returns the element to Default.
* Fixed full-page scope so complete-page and homepage prompts retain all generated sections while leaving site headers and footers to their dedicated Bricks template workflows.
* Improved retry so the existing conversation remains visible, the stale error card clears when retry begins, and the run keeps its prior context.
* Added consistent three-letter collision prefixes for complete affected source-class trees while preserving all non-conflicting class names.
* Fixed converted source classes being written into Bricks custom HTML attributes; source, framework, and utility classes now use native Bricks global-class references and remain available in the class controls.
* Fixed OpenCode bridge runs so the selected model begins the requested work directly with a bounded Bricks context and without unrelated title requests or hidden permission waits.
* Removed converter-generated .brx-draggable CSS from saved global classes; empty-div sizing is now controlled only by the live builder preference and never reaches frontend output.
* Fixed floating-panel @Query Loops auto-apply to use the same reactive Apply-to-Bricks path, preventing canvas flashing, [object Object] query state, and missed hydration while retaining a verified Bricks Undo entry.

= 1.1.1 =
* Improved the onboarding Connect step with clearer Local CLI and BYOK choices, Bridge guidance, provider usage information, and API-cost guidance.
* Local CLI onboarding now requires the Pixflow Design Bridge to be installed and successfully connected before continuing, while BYOK can continue without the Bridge.
* Fixed license activation and settings so license keys can be validated without the Pixflow Design Bridge installed or running.
* Fixed the Bricks floating panel so it works directly with the configured provider and API key in BYOK mode without requiring the Local CLI Bridge.
* Fixed left docking for the Bricks floating panel so its outer frame and the complete Bricks left panel resize together without retained rounded corners.
* Hidden Bridge health and attention notices in BYOK mode and until initial onboarding is complete.
* Disabled the floating-panel controls before onboarding, with a clear onboarding tooltip explaining why they are unavailable.
* Updated the pre-onboarding Bricks toolbar menu to show Start onboarding and hide Design tools and Settings until setup is complete.
* Fixed onboarding state migration so cleared WordPress settings return users to the natural first-run flow while already-onboarded sites remain completed after upgrading.
* Improved Build in Bricks so untagged natural-language creation requests and the explicit @Build in Bricks mention both route reliably to isolated full-page, section, or component builds.
* Added capability-aware visual review that uses the selected vision-capable model, optionally uses another available visual reviewer when enabled, and safely falls back to deterministic validation when no visual reviewer is available.
* Upgraded Build in Bricks Stage A with refined Prototype HTML planning, composition and context evidence, responsive visual critique, focused repair passes, canonical split-source artifacts, and the active framework route's tokens without restricting creative direction.
* Streamlined Stage B around a deterministic visible baseline and evidence-led certification, avoiding redundant model work when conversion and automated checks already prove the payload while retaining bounded repair for concrete issues.
* Added optional BYOK Unsplash image search in Settings with an enable toggle, access-key testing, remaining rate-limit feedback, attribution-aware results, and a safe placeholder fallback.
* Changed page-scoped Build in Bricks requests to generate page content only, leaving headers and footers to their separate Bricks template workflows.
* Prevented stale or failed model routes from authorizing later mutations and preserved exactly-once dispatch with the originating user-message identity.
* Preserved existing framework and project classes while enforcing coherent, collision-safe BEM names for generated Bricks components.
* Improved preview-to-Bricks parity for native flex, alignment, spacing, sizing, and responsive controls.
* Added bounded multi-stage rollback that restores generated content, settings, and owned classes without overwriting unrelated concurrent global-class changes.
* Strengthened final desktop/mobile visual verification and safe rollback for structural failures, including packaged-runtime browser capture support and one focused repair attempt.
* Kept structurally valid Build in Bricks results applied when final visual capture is unavailable or below the automated parity target, with a review-and-Undo warning instead of a late rollback, and rejected HTTP error pages such as WordPress draft 404s as invalid visual evidence.
* Fixed HTML-to-Bricks handoffs for full-page imports with more than 512 generated global classes by using a serialized storage budget for rollback journals.
* Prevented raw WordPress critical-error HTML from appearing in the floating-panel chat and added structured handoff error responses.
* Fixed WordPress Media Library HTML attachments with Unicode filenames on local Windows sites by loading them through an authenticated REST endpoint.
* Fixed safe rollback to an empty pre-handoff Bricks page after a failed run.
* Preserved explicit complete-page and homepage Build in Bricks requests by resolving scope from the original user turn instead of narrowed router prose.
* Allowed fixable Prototype Bricks responsive validation failures, including missing media queries, to enter the bounded repair loop before rejection.
* Fixed Prototype Bricks media dispatch on Windows so agents use the native PowerShell command instead of an unavailable bash wrapper.
* Fixed scoped section and component placement so baseline and final content retain the requested slot during persistence and live-builder replay, with a safe fallback only when the target no longer exists.
* Fixed Bricks 2.4 handoff QA to accept its native integer-zero root-parent format instead of rejecting valid existing pages as rootless.
* Added a native raw-file fallback for canonical Stage A HTML, CSS, and JavaScript when the WordPress project-file broker cannot read a valid split-source artifact.
* Improved conversion of semantic Bricks forms, remote image URLs, responsive layout controls, and managed page assets for closer Stage A-to-Bricks fidelity.
* Fixed remote stock-image delivery so invalid responses cannot create broken canvas images and a usable placeholder remains available when delivery fails.
* Fixed newly installed agent-selected Google Fonts so they appear immediately in the open Bricks builder without a page reload.
* Updated Design Your System to open in its own light theme with an independent theme switcher, live preview enabled by default, and the correct undo and redo controls.
* Improved the Design Your System font picker with separate Installed in Bricks and Google Fonts groups, local-install guidance based on Bricks' Google Fonts setting, and a recommendation to disable remote Google Fonts and install them locally through Pixflow Design.
* Fixed the Pixflow color-scheme control so its choices immediately match the saved design system after schemes are added or removed, retired Pixflow palettes no longer linger in Bricks, and selected schemes render correctly in the builder canvas without a reload.
* Fixed the Design Your System live preview so it stays responsively scaled, centered, evenly spaced, and within the visible Bricks overlay when the window is resized, without showing the WordPress admin bar.
* Fixed missing selected Google Fonts so saving a design system installs them locally when Bricks' Disable Google Fonts setting is enabled, including fonts selected before the setting changed, and kept Save available while an installation is pending.
* Left Google Font delivery to Bricks without duplicate local installation when Bricks Google Fonts remain enabled, while showing the appropriate recommendation instead of an installation notice.
* Corrected dark-theme contrast for Design Your System primary actions, live-preview controls, and color-scheme delete overlays, with delete-control colors now based on the card beneath them.
* Restored the complete Google Fonts logo and corrected foreground contrast on accent-filled Google Fonts controls in dark mode.

= 1.1.0 =
* First stable release of the complete Pixflow Design workspace inside Bricks Builder.
* Added the full-screen workspace, floating Ask/Plan/Design agent, contextual mentions, attachments, and synchronized Local CLI/BYOK model settings.
* Added safe native Bricks generation and editing for text, headings, links, images, layout, attributes, forms, query loops, dynamic data, visibility conditions, and Code element HTML/PHP, CSS, and JavaScript.
* Added Build in Bricks, Build HTML, HTML to Bricks, Website Clone, and Pixflow Library workflows with controlled preview, conversion, insertion, and native Undo.
* Added the Pixflow Library catalog, page assembly, responsive template previews, and custom design-token mapping to native Bricks variables.
* Added the AI-assisted Sitemap Builder with page hierarchy, section planning, generation recipes, homepage/policy workflows, and controlled WordPress page synchronization.
* Added framework design systems, route context, Google Fonts, icon packs, color schemes, Pixflow Media, and WordPress Media Library attachments.
* Added bounded typed floating-panel working memory, model-led target selection, live page/field/fingerprint validation, ambiguity clarification, and fail-closed mutation safety.
* Added the optional Pixflow Design Bridge with packaged installers, system-tray runtime, health/update handling, rich Bricks/Pixflow MCP skills, and multi-agent Local CLI support.
* Added native WordPress plugin updates and backward-compatible migration from existing Pixflow AI installations.
* Fixed bridge startup and reconnection, Bricks 2.4 toolbar compatibility, duplicate or truncated agent replies, provider error messaging, custom token mapping, template image delivery, Code element normalization, and release-build preflight.
