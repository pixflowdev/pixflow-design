# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- Prevent live builder commands from remaining stuck as busy when a persistent WordPress object cache hides the queued command. Preserve edits and command results without replaying operations.

## [2.1.3] - Unreleased
- Restore the Send button after opening a new, empty chat without creating an unnecessary saved conversation.
- Load selected conversations with fewer requests while retaining access checks and unsaved-message recovery.

- Prevent failed protected-resource requests, including local or staging identity mismatches, from incorrectly disabling a saved licence. Licence expiry and revocation checks remain enforced.

- Open slash commands after a space or on a new line while composing, preserving surrounding text and avoiding commands inside URLs or file paths.

- Show a compact Codex and Claude usage ring beside the composer account menu, with hover summaries, reset times and refreshable details in Workspace and floating panels.
- Read remaining allowances from the selected Desktop-managed or installed CLI runtime; display only reported limits and show unavailable when usage cannot be confirmed.
- Refresh Claude usage when the selected model changes, including applicable model-specific limits without retaining the allowance of the previous model.
- Keep usage popovers aligned with their buttons and preserve Pixflow styling in WordPress and builder panels.

## [2.1.2]

- Find the optional Chrome extension in Execution > Local CLI settings; hide the install banner when the extension is detected on the current site.

- Use the Claude Desktop-managed runtime first on Windows and macOS, with an installed Claude CLI as the fallback; no separate CLI installation is needed when the app runtime is available.
- Sign in with Claude from Execution settings, with a visible waiting state, cancellation and automatic connection refresh after browser authorization.
- Discover Claude models and supported effort levels from the selected runtime instead of showing a fixed, outdated model list.
- Identify Desktop-app runtimes in Execution settings and improve provider-card spacing, active-row hover states and sign-in controls.
- Remove misleading dollar estimates from chat response footers while preserving recorded usage and token information.
- Show whether Bridge is connected directly or through the Chrome extension in Execution settings, matching the Bridge and account menus.
- Let Connect and Reconnect request the optional extension connection from Execution settings and chat controls, opening its approval popup when needed while retaining direct Bridge access. Requires Chrome extension 1.0.3 or later.
- Allow provider connection tests through the extension connection. The matching extension update also corrects connection status when several sites are approved and adds a Close button to its popup; these changes are available in Chrome extension 1.0.3.
- Update Pixflow Design Bridge to 2.1.2 for Local CLI. Existing content, chats, credentials and settings are preserved; API execution does not require Bridge.

## [2.1.1]

- Show a notification dot in Settings when the active language pack needs updating; keep the update available after a failed download and clear it after a successful retry.
- Translate editor-handoff recovery guidance and refresh downloadable language packs for the new chat, design-command and Bridge connection wording.

- Show whether Bridge is connected directly or through the optional Chrome extension in the Bridge popover and Account & settings menu. Chrome extension support is pending Chrome Web Store approval.

- Restore the floating-panel Bridge control immediately when switching from API to Local CLI, including panels first opened in API mode.

- Keep queued messages attached to their original chat while switching conversations; pause sending during the switch and resume that queue when its chat is reopened.
- Recover completed replies and clear stale Working or save-warning states after reloading or moving between Workspace and the floating panel, without replaying edits.
- Show more specific Bridge connection failures and recovery steps, distinguishing an unavailable Bridge from browser access, site authorization and version problems. Direct Bridge connections remain supported.

- Keep numbered and bulleted chat lists visible when a builder such as Etch resets list markers; website content is unchanged.

- Browse saved chats from the floating-panel header and continue the same conversation in Workspace or a supported editor without copying its history.
- Keep unsent drafts scoped to their conversation when switching chats; close the chat drawer after selection.
- Restore the last-active saved chat in a new tab or after logout/login in the same browser, separately for each site and WordPress user. Recheck access before loading; explicit chat links and New chat take priority.

- Show a distinct, translated description for each Pro design slash command in the shared composer.
- Copy only the displayed agent reply instead of a larger saved text snapshot, preserving message boundaries in the floating panel and Workspace.
- Improve copy-button and timestamp contrast in light and dark themes, and reveal older reply actions when reached with the keyboard.

- Make live review feedback more responsive by avoiding repeated updates to unchanged controls. Review the changed content instead of an untouched containing section, and prefer captions below the review frame.

- Keep Design Your System toolbar requests available while Pro loads, and keep the settings overlay visible and dismissible if loading fails.

- Refresh saved Pro access during active editor use when scheduled licence renewal has not run, and recover stale entitlement caches without asking users to re-enter their saved key. Existing licence and permission checks remain enforced.
- Keep the same floating-panel conversation, active response and selected provider/model when moving between supported editor screens in the same tab. Show a loading indicator while the conversation reconnects.
- Preserve the latest saved chat revisions when restoring an active run, avoiding false history conflicts caused by an older recovery snapshot.
- Recover from navigation immediately after Send instead of leaving Preparing stuck. Keep the unsent message and explain when it needs to be sent again.
- Allow an active Bricks conversation to reconnect to the same page in Gutenberg without rejecting its original editor identity. Retain page permissions and prevent another tab from taking over.
- Handle pending builder commands safely during navigation: distinguish commands that never ran from edits whose outcome is still unconfirmed, without automatically repeating edits.
- Use Pixflow Design Bridge 2.1.1 for Local CLI. API execution does not require Bridge.

## [2.1.0] - 2026-10-22

- Preserve conflicting saved chat versions, recover older browser snapshots safely and refresh newer messages across open floating panels and Workspace chats without silently overwriting history.
- Keep provider selection and saved credentials consistent across open settings panels and when switching between API, Local CLI and Composio execution.
- Use model-aware working-context budgets, avoid repeatedly compacting unchanged context and recover safely when summary generation is unavailable.
- Return smaller tool schemas and targeted skill lookups while keeping complete tool results available through accurate saved-result paths.
- Validate API tool arguments before dispatch, report malformed calls clearly, accept losslessly encoded numeric WordPress content IDs and check requested edits against native tool readback before claiming completion or saving. Target and permission checks remain enforced.
- Reconnect the owned live editor after navigation to another permitted document, including when the previous document is no longer editable. Validate the current target permissions before accepting edits.
- Add shared composer support for optional Pro design references, clarification questions and focused operations. Preserve explicit multiline queued design commands when automatic design guidance is disabled; the design foundation, design-source settings and audit engine require Pro.
- Expose live change-review selections to optional Pro controls and update all 18 downloadable language packs for the new guidance and review actions. English remains bundled.
- Improve Local CLI startup instructions, native session context, site-tool argument handling and saved-result retrieval through Pixflow Design Bridge.
- Pair with Pixflow Design Pro 2.1.0. Local CLI requires Pixflow Design Bridge 2.1.0; update Bridge before updating the plugins. API execution does not require Bridge. Existing website updates, installed plugin identities, chats and settings are preserved.

## [2.0.8] - Hotfix

### Fixed

- Recover restored and interrupted chats without repeatedly reporting that messages have a newer saved version.
- Preserve complete saved replies and tool activity when older browser caches contain shortened display copies.
- Resume the same interrupted run safely while retaining protection against conflicting changes.

### Compatibility

- Continues to use Pixflow Design Bridge 2.0.6. No Bridge update is required.

## [2.0.7] - Hotfix

### Fixed

- Recover restored chat display copies without overwriting complete saved replies or blocking subsequent agent requests.
- Preserve genuine conflict protection for changed messages and active runs.
- Prevent restored display snapshots from replacing complete saved event history.
- Fix Workspace chat links triggering a WordPress dashboard error; existing links remain supported.

### Compatibility

- Continues to use Pixflow Design Bridge 2.0.6. No Bridge update is required.

## [2.0.6]

### Fixed

- Let WordPress and builders own native saving instead of blocking it with Pixflow's additional HTTP 409 save guard. Agent editing remains available through the live editor.
- Preserve full durable chat history when an older browser cache is replayed, and acknowledge saved revisions without weakening real conflict checks.
- Avoid redundant context compaction when provider history includes echoed system instructions.

### Compatibility

- Local CLI requires Pixflow Design Bridge 2.0.6. Install the Bridge update before updating the plugin; API execution remains independent of the Bridge.
- Website packages retain the existing website updater. The separate WordPress.org candidate uses directory updates and preserves the installed pixflow-ai identity.

## [2.0.4]

Pixflow Design 2.0.4 adds live Gutenberg editing, the separate Pro add-on, complete chat history and a refreshed Workspace. Existing customers keep their licence, saved chats, content and settings.

- Retire the inherited Community catalogue ahead of the Pixflow Resource Hub. Remove its browsing, download and settings entries, and automatically clean up the three retired downloaded packs to reclaim disk space. Existing WordPress content, custom settings and bundled AI/builder guidance remain intact. Free requires no optional resource downloads.

- Clean up the bundled skill catalogue, remove obsolete installation placeholders and unrelated workflows, and consolidate Pro design guidance with compatibility aliases for older skill mentions. Keep essential Free and Pro guidance available offline and preserve personal skills and saved content.

- Add individual Pro skill installation, updates, enable/disable and removal with a shared WordPress-owned library. Use compact library rows with accent-coloured update indicators and a Skills menu count, individual Update actions and Update all. Keep exact versions available for saved references and separate downloaded skills from personal skills. The signed catalogue is live for compatible Pro installations.

- Include ten original individually downloadable Pro skills: Design Brief, Website Audit, Website Animation, Motion Review, Brand Kit, Product Images, Site Structure & Navigation, Forms & Lead Capture, SEO-Safe Redesign and Landing Page Optimisation. Include attributed research, complete supporting guidance, appropriate discovery categories and checks for native content preservation, accessibility, image fidelity and reliable form/navigation workflows. Keep essential guidance bundled.

- Deliver Pro skill downloads and updates through the existing site connection, with verified packages. Preserve installed versions, disabled choices, saved skill references, personal skills and settings when updating or when downloads are unavailable. Pro users can manage optional skills without starting a trial.

- Expand the optional Pro library to 30 skills with 20 attributed WordPress adaptations for design refinement, typography, colour, responsive layouts, accessibility, quality testing, multilingual/RTL content, performance, debugging, copywriting, content planning, comparison pages, structured data, data-driven pages, analytics, experiments, pricing and banners. Show warnings for enabled skills with overlapping workflows without changing the userâ€™s choices. On reopening Skills, group overlapping enabled installations first, then other installed skills, followed by available downloads; keep controls in place during installation.

- Keep Settings above floating chat, annotation and review panels. Opening Settings from a quick menu no longer opens the Workspace behind it; closing Settings preserves the previously open chat panel.

- Prevent annotation controls from stealing focus on load or conversation changes, keep hidden composers from claiming annotation follow-ups, and let foreground settings dialogs handle Escape. Preserve saved annotation drafts without automatically entering selection mode, and exclude Pixflow admin-bar controls from annotation targets.

- Hide cached Local CLI controls while the Bridge is disconnected, while preserving saved agent choices. Reduce repeated Settings requests with verified skill-catalogue caching, shared Abilities requests and deferred hidden-Workspace catalogues; explicit Refresh remains available.

### New

- Keep everyday WordPress administration and live Gutenberg editing in Free, with advanced PHP, site-file, plugin/theme development and direct database tools in the separate Pro add-on. Explain unavailable advanced actions with an upgrade option and a Learn more link while preserving saved content, chats and settings.

- Keep complete saved chat history in shared WordPress storage for the floating panel and Workspace. Load recent messages first and retrieve earlier messages in pages, preserve existing transcripts and attachments, and retain unsaved changes for retry. Browser-context cleanup no longer removes saved conversations.

- Add full-chat JSON export from Workspace and the floating panel's Conversation history viewer, also accessible from Memory settings. Include every saved message and recorded tool detail, including older messages not loaded on screen, with media preserved as references. Support API, Local CLI and Composio histories without requiring a connected Bridge, and offer a safe retry if the chat changes during export. Available in Free without a licence.

- Add Chat storage reporting in Memory settings, showing saved message and chat counts, compressed storage usage, compression savings, retained project data and working-context usage for the current account. Keep usage refresh and history access available in Free, with clear exclusions for media, saved memories, browser caches, Bridge files and database overhead.

- Reduce chat-history storage with automatic lossless compression for API, Local CLI and Composio transcripts. Optimize existing messages in small background batches while preserving full text, tool results, attachments, message order, exports and saved revisions. Keep small messages uncompressed and retain complete history without automatic expiry.

- Compact the agent's working context in long API and Composio conversations while preserving complete saved chat history. Retain recent messages and important decisions, show compaction progress, and keep queued messages safe through preparation, cancellation and recovery. Use supported CLI providers' native context management and preserve accepted steering across reconnects.
- Add automatic Workspace handoff to Gutenberg, Bricks, Etch and Elementor. Choose an editor and a new draft or compatible existing page; Pixflow transfers the chat brief and reference files, opens the floating panel and starts the agent. Show progress, keep retries tied to the original draft and editor tab, and preserve source chats and unrelated page content.
- Refresh the Pro Workspace with the floating panelâ€™s shared composer, a permanent page icon rail and a separate collapsible Chats/Projects sidebar. Group chats into projects, pin projects or individual chats, search and rename chats, and move chats without changing their files or history. Preserve saved organisation across visits, replace the old Home/chat tabs with a compact toolbar, and remove the old home chips and Recent projects cards.
- Fork a conversation into its own sidebar chat with the complete saved history through the selected reply, including older messages. Keep the original unchanged, retain a link back to it, and support safe retries and independent continuation.
- Add live Gutenberg page and post editing through the Bridge and API providers: discover available blocks, read the unsaved document, insert, update, move and remove blocks, select targets, save, and use native undo/redo. Preserve unrelated content and native block serialization.
- Add Gutenberg editor toolbar and quick-menu buttons, full-screen workspace access, and left/right floating-panel docking that reserves canvas space and restores saved placement.
- Extend originating-tab connections, reconnect/reload recovery and stale-save protection to Gutenberg. Keep runs attached to the intended document and preserve unsaved work when another editor has saved newer content.
- Add Gutenberg block-aware annotations, numbered pins, batched comments and variable/preset adjustments through Pro. Keep live block following and grouped, expandable change review in Free; targeted annotation follow-ups require Pro.
- Expand core Gutenberg block coverage across text, nested layouts, buttons, lists, tables, media, Details and Query Loops, using the installed editor's block schemas and nesting rules.
- Add Pro Site Editor tools for templates, template parts and synced patterns, including theme-provided templates, shared-document confirmation and targeted saves that preserve other unsaved entities. Support pattern discovery, categories, independent copies and shared updates.
- Add Gutenberg Global Styles support to Pro design systems: preview, apply, switch and restore prefixed presets, variables and reusable classes. Preserve theme files, existing styles and saved user overrides; require an explicit choice for site-wide typography and colours.
- Add local Google Fonts and open-source icon installation for WordPress/Gutenberg without requiring Bricks, Etch or Elementor. Include native editor/frontend registration, installed-asset controls and registration with supported builders activated later; installation and full management belong to Pro.
- Add a native GenerateBlocks integration in Pixflow Pro, covering the installed Free and Pro block capabilities with dedicated skills, live editor tools, native IDs, generated CSS and responsive controls.
- Support GenerateBlocks post queries and dynamic content, taxonomy filters, pagination and empty states, plus available Pro term, user, metadata, option and array loops, including native unlimited array-loop rendering.
- Support GenerateBlocks Pro global styles, shared classes and CSS variables, including hover/responsive rules, conflict detection and restoration while preserving existing styles. Recognize stable native IDs and generated CSS during content-only edits, including delayed browser callbacks. This covers Pro 2.7.1; the separate native Design Tokens interface in 2.8 release candidates is not included.
- Support GenerateBlocks accordions, tabs and carousels, navigation and mobile menus, forms and visibility conditions, and standard, anchored and mega-menu overlays with their available triggers and dismissal settings. Keep paired tab/panel additions together in undo and redo, and discover authorized draft forms and overlays. Preserve existing menus, form configuration and content.
- Support targeted edits to registered legacy GenerateBlocks Grid, Container, Headline and Button blocks alongside modern blocks, with native history and responsive rendering.

- Add a Home skill library with searchable Pro cards and direct installation, updates and management. Keep the Home composer at the top and refresh available composer skills after installation.

- Replace the inherited chat file workspace with a floating Summary panel for generated outputs, previews and downloads. Keep the shared chat stream and composer, navigate chats through the sidebar, and preserve existing conversations and file links.

### Free and Pro

- Move advanced creative skills into the Pro package. Keep research, writing, accessibility and troubleshooting guidance in Free, and show available Pro skills as muted, non-selectable entries with Pro badges in the slash menu.
- Introduce a separate Pixflow Design Pro add-on that depends on the Free plugin. Move complete Bricks, Etch, Elementor and GenerateBlocks integrations into Pro, including their editor connections, settings, extensions, tools, skills and builder-specific assets. Activate integrations according to the installed theme/plugins; Bricks layouts and components remain Bricks-only.
- Keep WordPress administration, core Gutenberg page/post editing, the shared panel, onboarding, text AI through API providers or the Bridge, text-message queueing and supported steering in Free without a licence, including after a Pro trial expires.
- Move annotation authoring into Pro, including pins, screenshots, element options, comment batches, queueing and supported steering. Keep ordinary text-message queueing and steering available in Free.
- Move dictation and Codex Voice into Pro, including their settings, model management and audio controls, while retaining text-based provider access in Free.
- Move manual and AI design-system creation, library management, application/restore tools and visual sitemap planning into Pro. Keep previously applied styles and saved references available when Pro is inactive.
- Move Google Font and icon-set catalogues, installation, activation, subset management and builder synchronization into Pro. Keep existing fonts and icons rendering in Free, with basic installed-asset removal that preserves referenced content.
- Move External MCP configuration, setup templates and composer mentions into Pro, including provider forwarding and queue/steering integration. Keep the Bridge's core WordPress connection available in Free.
- Move custom skill creation, import, installation and managed discovery into Pro. Retain saved custom skills for reactivation and keep built-in WordPress skills and abilities in Free.
- Move specialist plugin integrations and their guides into Pro, including the existing ACF, JetEngine, WPCodeBox2 and Kadence/Spectra adapters. Preserve third-party content and WordPress's own native editing.
- Move Pixflow's specialist Site Editor, template, template-part and synced-pattern authoring into Pro. Keep existing references, rendering and native WordPress editing intact. Gutenberg follower/review, memory and tool-history cleanup, data export and content preservation do not require Pro.
- Recognize existing customer licences during migration. The existing plugin updates to Free; eligible customers receive instructions in WordPress Admin and License settings to download Pro from their account, upload it through WordPress and activate it alongside Free. Pro functionality resumes after activation; it is unavailable during the Free-only interval. Reuse the existing licence and site activation without starting a trial.
- Deliver Free updates without a licence and update the Pro add-on independently through WordPress. Verify downloaded packages and keep Free and Pro update notices separate, including bulk updates.
- Preserve saved content, settings, skills, design systems, font/icon registrations and enrolled 2FA methods across the split. Keep the shared composer and separately loaded Pro controls consistent as access changes; pending Pro authoring requires active access. Deactivating Pro disables the Bricks 2FA extension; manually re-enable it after Pro returns. Explain missing, inactive, incomplete or incompatible Pro installations in the migration interface.

### Improved

- Preserve intentional paragraph breaks when sending chat messages, and keep older loaded history in chronological order when the latest replies refresh.

- Improve large-conversation performance across the floating panel and Workspace: load recent history first, avoid rebuilding unchanged historical replies while new text streams, and export long conversations in bounded batches. Validate pagination, reload and complete downloads with 1,000- and 5,000-message conversations while preserving saved chats and settings.
- Use shared history, working-context and memory controls across builders, including Bricks, and remove the obsolete Bricks-only retention section without deleting existing recovery data.
- Restrict Pixflow Workspace authoring to Pro while retaining existing project reads, export and cleanup. Keep saved project files readable when the Bridge is unavailable, and correct saved-file dates.
- Add the Pixflow settings-cog icon to the WordPress admin bar for active Pro users. Open Workspace, design tools and settings from the same quick menu used by the builders, while keeping the separate chat launcher available in Free.
- Align Settings switches with consistent accent-coloured tracks and clean thumbs. Simplify the Memory model controls and replace the Local CLI scanning animation with a compact, accessible status row that respects reduced motion. Remove the advanced proxy/custom-path form while preserving existing saved overrides.
- Simplify Free onboarding around API or Local CLI setup, automatically discover the Bridge, show its connected state accurately, and improve connection-result and help-link readability. Keep essential AI guidance bundled so missing optional downloads never block Free setup.
- Reduce repeated background connection checks when the Bridge is offline while keeping manual reconnect immediate. Remove unnecessary provider-logo preloads while retaining cached artwork.

- Move Bridge connect/reconnect controls into Execution settings > Local CLI, replacing the separate Local Bridge section and advanced CLI instructions. Restyle Pro licence and site-recovery controls with clearer status and actions.
- Redesign Google Fonts, Icon Packs and Resources settings with consistent theme-aware surfaces, aligned actions, expandable details and responsive layouts. Preserve installed assets, saved subsets and settings.
- Use the selected appearance accent for enabled toggle switches. Default new installations to Dark while preserving explicit Light or System preferences, and correct the floating-panel logo contrast in Light mode.
- Refine the floating change-review panel with a compact pill shape when collapsed and a smoothly expanding squircle layout. Align annotation and review toolbar backgrounds, icons and text, and automatically stack the annotation toolbar above change review as it expands or collapses, preventing overlap across Bricks, Etch and Elementor.
- Add a Disable change review switch, off by default, to hide the review panel while keeping the follower active. Retain collected changes so review can be shown again.
- Update translations across all 19 supported interface languages in Free and Pro, covering settings, onboarding, execution and connector controls, skills, abilities, memory, design systems, sitemaps, fonts, icons, annotations and recovery messages.
- Reduce plugin download size by bundling English and offering the other 18 languages as verified Pixflow downloads in Free and Pro. Download, update and apply languages directly from Appearance without reloading, including right-to-left layouts. Keep downloaded languages across plugin updates and preserve chats, drafts and language preferences if a download fails.
- Follow the logged-in WordPress user's language by default, including WordPress's site-language fallback. Add a WordPress language option in Appearance to restore automatic selection after a manual override; use English for unsupported languages. Standalone Pixflow follows the system/browser language instead.
- Translate native WordPress notices, floating-panel controls and Bridge connection menus through the shared language catalogues, including changing connection states. Keep separately loaded Pro features in sync with the selected interface language.
- Improve translated sentences, plural forms, counts and placeholder handling. Add packaging checks for missing translations and mismatched placeholders, while keeping user-written content, saved design and sitemap identifiers, provider/model values and executable commands unchanged. Keep translated design-system token labels and structured-question wording separate from saved identifiers and values.

- Add Composio AI execution in Pro through WordPress without requiring the Bridge or a separately configured CLI provider. Select connected AI providers and models from Execution settings and the composer menu, with official Composio and API-provider icons.
- Run connected-app actions through WordPress, including queued requests and supported steering. Retire the separate Bridge-managed Composio connection path; CLI agents use the same WordPress-selected accounts and write settings.
- Discover existing Composio accounts before requesting a new connection. Show GitHub usernames, connection dates and expandable connection details so users can choose the intended account.
- Include Composio connected-app accounts in Pro without a Pixflow account-count limit. Keep AI provider accounts separate, and preserve saved accounts, permissions and settings when Pro is unavailable. Free supports direct API and Local CLI execution.
- Refine the execution menu with aligned options, secondary setup guidance, full-width model controls and consistent light/dark styling.
- Restyle connector settings with theme-aware key fields, full-width search, a two-column app catalogue separate from AI execution settings, and neutral connection controls. Load available apps through WordPress with clear saved-key status and retryable connection errors. Add centered connector dialogs with connector logos, fixed headers and actions, scrollable content, searchable tool previews and expandable connection/tool details. Use consistent theme variables and light/dark styling, and remove input focus rings.
- Include the official Composio skill automatically when Composio is active, with guidance for the connected-app workflow.
- Add global and per-connector Composio write-access switches with clear warnings. When global writes are off, individual connectors can be enabled separately; connected-app actions check the current account selection and write settings.
- Reorder pending messages by dragging centred handles, with a moving-row preview and items shifting into their new positions instead of a drop-marker border. Retain keyboard reordering and lock ordering while a message is being delivered.
- Simplify Memory settings with searchable saved memories, explicit editing and deletion, JSON export, clearer storage cleanup, and separate advanced controls. Preserve existing data and keep cleanup/export in Free.

- Add Build in Gutenberg to workspace reference handoffs, selecting the actual connected editor even when other builders are installed. Attach removable reference files to the composer without automatically submitting a run.
- Restyle design-system application confirmation with clearer scope, generated-CSS review and spaced, consistent actions.
- Preserve Gutenberg and GenerateBlocks context through queued messages, reloads and supported steering, for both CLI and API editing workflows.
- Keep Free connected during licence resets and temporary licensing-service outages, and refresh paired capabilities when Pro access returns. Reflect current Pro availability in settings, skills and tools across WordPress and the Bridge.
- Upgrade the Bridge to Electron 44.7.0 and SQLite 13.0.3, select the matching native binding during platform packaging, and update browser-data cleanup for the current Chromium APIs. Preserve installed Bridge data, provider sessions, installer/update behaviour and tray restart support. The existing macOS 13 minimum remains unchanged.
- Refresh dependencies and Free/Pro packaging, and remove unused legacy helpers while preserving existing resource packs, project references and customer content.
- Security improvements.

### Fixed

- Fix the builder follower showing a blank caption during edits. Keep a readable Updatingâ€¦ label with subtle working feedback, show Updated when the edit completes and Saved only after a confirmed save, and respect reduced-motion preferences.
- Fix right-to-left layout handling for Arabic and Persian across Pixflow panels, dialogs and menus, including overlays opened after changing language. Correct Settings header spacing and close-button placement so controls do not overlap, without changing the surrounding WordPress editor's direction.
- Fix the System appearance icon always showing a sun. Show the current operating-system light/dark preference and update the icon when that preference changes, independently of an explicit Pixflow theme choice.
- Preserve accepted steering messages in the conversation stream and after reconnecting or reloading, without duplicate bubbles. Wait for an in-progress Codex reply before delivering guidance, retain a normal queued follow-up when its final reply completes, and keep active-turn steering working without an empty response or a new Preparing state. Use the same Steer control in Workspace and the floating panel.
- Prevent unrelated settings saves from reapplying unchanged Bricks extension metadata to other content.





