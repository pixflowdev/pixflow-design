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
