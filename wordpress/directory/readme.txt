=== Pixflow Design ===
Contributors: pixflowdev
Tags: gutenberg, ai, workflow
Requires at least: 6.2
Tested up to: 7.1
Requires PHP: 8.1
Stable tag: 2.0.6
License: Apache-2.0
License URI: https://www.apache.org/licenses/LICENSE-2.0

AI assistance for WordPress administration and live Gutenberg page editing, using your own AI account.

== Description ==

Pixflow Design adds an AI chat panel to WordPress administration and Gutenberg. Use your own supported AI API account or connect the optional Pixflow Design Bridge on your computer to use an installed text CLI agent. Provider accounts, charges and subscriptions are separate. Free does not require a Pixflow licence and does not expire.

Free includes live core Gutenberg editing, message queueing, supported steering, change review, complete chat history, working-context compaction, history export and storage information. Memory cleanup, export and existing content remain available without Pro. Essential AI guidance and English are included; no resource download is required for Free onboarding. Optional interface languages download when requested in Settings and apply without a page reload.

The separately installed Pixflow Design Pro add-on adds the Workspace, Bricks, Etch, Elementor and GenerateBlocks integrations, Composio connected apps and AI execution, annotations, voice features, advanced design tools, PHP/site-file/database development tools and the optional skill library. WordPress native editing and previously saved site content remain available when Pro is inactive. Learn more at https://pixflow.dev/free-pro.

== Installation ==

1. Install and activate Pixflow Design.
2. Open Pixflow from the WordPress admin toolbar.
3. Choose an API provider or connect the optional local Bridge. Review the selected service's policies before connecting an account.
4. Complete the connection test and start a chat.

Existing users retain saved preferences, licences, chats and content. If you already own Pro, obtain the separate add-on from your Pixflow account and install it through WordPress's normal plugin upload screen. Keep Free active alongside Pro.

== External services ==

AI requests send your prompt, relevant conversation context, selected attachments and the WordPress information needed for the requested task to the provider you configure. Connection tests send a short test prompt. Tool results may include site or connected-account data. Do not send information you are not authorised to share. Credentials are used to authenticate to the configured service. Model lists may be requested after configuration. Provider billing and data handling follow your account and the provider's policies.

= AI providers =

* OpenAI: https://openai.com/policies/terms-of-use/ and https://openai.com/policies/privacy-policy/
* Anthropic: https://www.anthropic.com/legal/commercial-terms and https://www.anthropic.com/legal/privacy
* Google Gemini: https://ai.google.dev/gemini-api/terms and https://policies.google.com/privacy
* Azure OpenAI: your configured Azure deployment; https://www.microsoft.com/licensing/terms/ and https://privacy.microsoft.com/privacystatement
* OpenRouter: https://openrouter.ai/terms and https://openrouter.ai/privacy
* Ollama: local installations use your configured server; cloud requests use https://ollama.com/terms and https://ollama.com/privacy
* DeepSeek: https://api.deepseek.com; terms https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html and privacy https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html
* MiniMax: the preset uses https://api.minimaxi.com; review your account region's policies at https://platform.minimaxi.com/zh/protocol/user-agreement and https://platform.minimaxi.com/zh/protocol/privacy-policy. International service policies are https://platform.minimax.io/protocol/terms-of-service and https://platform.minimax.io/protocol/privacy-policy.
* Xiaomi MiMo: https://token-plan-cn.xiaomimimo.com; terms https://platform.xiaomimimo.com/docs/terms/user-agreement and privacy https://privacy.mi.com/XiaomiMiMoPlatform/zh_CN/
* SenseAudio: https://api.senseaudio.cn; terms https://docs.senseaudio.cn/guides/agreement/user and privacy https://docs.senseaudio.cn/guides/agreement/policy
* AIHubMix: https://aihubmix.com/v1; terms https://aihubmix.com/legal/terms and privacy https://aihubmix.com/legal/privacy

Other supported or custom API endpoints send the same task data to the server you explicitly configure. Review that service's terms and privacy policy before saving its credentials. Changing a provider changes the recipient of subsequent requests; previously sent data remains subject to the original provider's policy.

= Pixflow services =

When you request a language download, pixflow.dev/api/languages/v1 serves a versioned JSON language file. The request identifies the language and content hash; normal HTTP metadata includes the server IP and user agent. No chat or licence is required for language downloads. English and essential guidance are bundled.

Bridge setup can request download metadata from pixflow.dev/downloads/pixflow-design-bridge. Optional licence validation for a saved Pro licence contacts Pixflow with the licence key, site identity, product/version and activation details. Existing customer activation information is preserved. This directory distribution does not use Pixflow's private Free plugin update service.

Pixflow policies: https://pixflow.dev/privacy and https://pixflow.dev/terms-of-service.

= Optional local Bridge =

The Bridge runs on your computer and is not required for API mode. Choosing Local CLI discovers and pairs with the local service. Approved requests send prompts, selected context and tool calls between this WordPress site, your browser and the Bridge; the installed agent then uses its own configured AI service. Review that agent provider's policies. Downloading the Bridge is a separate action; this plugin does not install desktop software.

== Frequently Asked Questions ==

= Does Free require a licence or trial? =

No. A supported AI account or local agent may require its own subscription or usage charges.

= What happens if Pro is deactivated or expires? =

Free remains usable. Existing content, chats, saved settings and installed assets are preserved. Pro-only authoring features require the separate add-on and eligible entitlement.

= Where are chats stored? =

WordPress stores durable history so the panel and Workspace can use the same conversations. Working-context compaction does not delete the complete history. You can inspect storage and export history in Free. Local CLI agents may also maintain their own local session files.

= Can an agent run PHP or change site files? =

Free uses native operations for posts, pages, taxonomies, existing media metadata and supported basic settings. It does not include arbitrary PHP execution, installation-file tools, custom plugin/theme development or direct database operations. These implementations live in the separately installed Pro add-on. An unavailable advanced action returns an explanation and an upgrade link without running the action. Read why at https://pixflow.dev/free-pro#advanced-site-tools.

Pro's advanced operations still require WordPress's edit_plugins capability, honour DISALLOW_FILE_EDIT and DISALLOW_FILE_MODS, and require a super administrator on multisite. PHP execution has the privileges of the WordPress server process; it is not a restricted sandbox. Review the requested task and configured AI service before sharing site data or authorising code changes. WordPress's own native editing is unchanged.

== Changelog ==

= Unreleased =

**Added**

* Connect eligible Pro installations to production Google services without manually configuring service API keys.
* Give Gutenberg, Elementor and Etch agents current site typography, colours and layout information to reuse existing styles without repeatedly rediscovering them.
* Show tagged skills and pasted web links as inline badges in sent chat messages. Link badges show the domain and favicon, and Copy prompt retains the original text.
* Use the same pinned chats, projects, recent chats and actions in Workspace and the floating panel, with changes and ordering synced between open views.
* Support SEO Audit in the WordPress Workspace and show its progress in the assistant panel. Restore the last Workspace view within the same browser tab.
* Inspect anonymous desktop and mobile public pages without an AI provider, through Bridge or the od inspect-page command.
* Run specialist reviews with Codex, Claude and Grok Build using supported parallel workers and provider timeout handling.
* Load available Grok models from the CLI and show only reasoning levels supported by the selected model.
* Show Grok account allowance and reset times in the composer and Settings.
* Support Blog Studio native-editor handoffs in the existing conversation, with readable checkpoints and downloadable article/brief attachments.
* Let contributed Workspace modules use authorized site tools and reuse generated WordPress images.

**Changed**

* Clarify in all supported languages that Design systems updates the Pixflow Framework and Bricks Theme Styles only when a system is applied.
* Reuse visually checked library images before generating new design imagery, including an installed Codex fallback for other CLI providers. Keep clearly marked WebP placeholders when suitable imagery or generation is unavailable.
* Show Design Layout, Design Critique and the other design operations under Skills with the shared package icon. Apply every selected design operation, even when it appears within a longer prompt.
* Fade long chat and project names and smoothly reveal them on hover. Recover older automatically shortened chat titles without changing custom names or saved messages.
* Use the updated, theme-aware Grok mark in provider menus.
* Use consistent Pixflow-styled chat controls across Workspace and floating panels while preserving themes, settings and saved conversations.
* Use searchable model choices, interactive questions, citation previews, compact code and tool details, and downloadable file attachments.
* Show clearer preparation, provider-wait and completion states; keep supplied reasoning separate from routine tool traces.
* Floating panel chats prepare saved history on open and after replies, show the first streamed text sooner, and keep your place when you scroll up. Plain Claude replies show Done as soon as Claude confirms completion.
* The Bridge keeps Codex ready between prompts and reuses the active conversation on eligible follow-ups. WordPress checks the site owner and current chat history on each Send so edits from another tab reach the next reply.

**Removed**

* Internal plugin files from generated-download lists; genuine agent output remains available to download.
* Ultra reasoning from specialist model options.

**Fixed**

* Keep the same chat, unsent text and page references when opening the Sitemap assistant, with shared conversation history and no duplicate composers.
* Keep floating and docked assistant panels consistently sized and rounded, and align completion details correctly.
* Keep Workspace navigation in sync across Core and Pro modules inside Bricks, so opening SEO Audit from another module does not reload the builder canvas.
* Improve Gutenberg typography guidance for inherited colours, palette collisions and saved-page layouts. Keep pending image-generation activity visibly working while later commentary streams.
* Keep the last floating-panel chat when reloading or moving between editors in the same browser tab; start empty in a new session without losing saved conversations.
* Prevent internal builder handoff notices from appearing as failed assistant replies when continuing a conversation in another editor; keep editor-target checks in place.
* Preserve existing resource files on restricted WordPress hosts with verified encrypted storage when a new private directory cannot be created.
* Recover renewed licences without re-entering a saved key. Preserve credentials during temporary failures, reject invalid proofs, and prevent delayed validation from undoing a reset or newer activation.
* Preserve and save a newer appended reply retained when reopening a chat, instead of replacing it with an earlier saved snapshot. Existing revision and conflict protections remain enforced.
* Prevent live builder commands from remaining stuck as busy because of stale WordPress caches. Preserve edits and command results without replaying operations.
* Preserve the original WordPress revision before an AI repair so the first edit can be recovered when revisions are enabled.
* Find Grok Build in its native installation folder without restarting the Bridge after a PATH change.
* Stream Grok replies and tool activity in Workspace and floating panels, retain native conversation context, and distinguish rejected requests from interrupted Bridge connections.
* Wait for saved chat hydration before starting a handoff; retain prior messages and add New chat with an empty state to floating panels.
* Keep streaming replies at the bottom when following, preserve scrollback while reading, and make room for queued messages. Right-align user squircle bubbles and centre Jump to latest.
* Apply consistent shimmer animation, question contrast and input focus styling. Question inputs keep their theme during reconnection, and account menus show concise CLI version numbers.
* Offer history recovery copies only for confirmed conflicts; temporary save failures retain Retry without suggesting duplicate histories.
* Detect Cursor CLI installed in its standard Windows location even when the Bridge was started before installation. Keep Cursor separate from other providers that use the `agent` command.

= 2.2.0 =

* Recover Pro access with the saved licence after a temporary verification failure. Licence settings offer Retry while the service is unavailable, and background WordPress requests preserve the installed key.
* Choose Continue without AI during setup to use the library and design tools without connecting a provider.
* Follow replies as they stream in Workspace and floating panels. New prompts stay in view, scrolling back preserves your place, and animations respect reduced-motion preferences.
* Expand a compact timeline of reported steps, reasoning summaries and tool results. Repeated Claude stream events no longer duplicate tool activity, and opening Workspace no longer marks a running floating-panel conversation as failed.
* Preview inline citations and expand Sources to see each cited page once. Long code blocks have visible Expand and Collapse controls.
* Switch between API and Local CLI across Workspace, floating panels and Execution settings without reloading. Tool pages keep their navigation rail, hide chat controls and warn before leaving unsaved changes.
* Export recent Pixflow licence, builder and tooling failures from Settings → About. Private site history retains up to 128 events for seven days, including when WordPress debugging is off.

Pixflow Design Bridge

* Keep Bridge responsive while Local CLI scans for providers. Onboarding, settings and composer checks share overlapping discovery work, allow slow sites time to answer and still report stopped sites as unavailable.
* Run Pro translation jobs using local Codex or Claude. The od agent-text and od site-translations commands support authenticated workflows, and longer translation requests have a dedicated timeout.
* Let Workspace agents read the connected site title and discover builder tools using their existing authorised session.
* Optionally include device characteristics, the selected Claude runtime and recent sign-in stages in a diagnostic export from the paired Bridge.

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

* Add live Gutenberg editing, durable chat history, context compaction, export and storage reporting.
* Add API execution, message queueing and supported steering; offer Composio through the separate Pro add-on.
* Introduce the separate Pro add-on while preserving existing settings and content.
* Refresh the interface, accessibility, language handling and Free onboarding.
* Security improvements.

== Source and build information ==

This directory candidate includes readable browser JavaScript and the original Free source inputs with a standalone, pinned build tool in source/. SOURCE.txt explains rebuilding without the private development repository. This is a review candidate; it must not be described as WordPress.org approved.
