# Pixflow Design Free — notes for directory review

These notes explain the separate WordPress.org package. They do not assert prior approval by the Plugins Team. Verify the accompanying artifact receipt and test report before submission.

## Distribution and premium boundary

The installed identity remains `pixflow-ai/pixflow-ai.php`. Directory Free omits the private website updater, its hooks and its automatic update-setting seed. WordPress.org supplies Free updates after acceptance. The separately installed Pro add-on owns its external updates. Existing website v2.0.4 deliveries retain their current updater and are built separately.

Free remains usable without a Pixflow licence or an installed Pro add-on. It includes the administration/Gutenberg chat panel, API and Local CLI execution, essential guidance, full history, compaction, export and storage information. Composio implementation, builder integrations and other premium functionality are in the separately distributed add-on. Saved credentials, entitlement records and chat/content identifiers are preserved across that boundary.

## AI service and executable-code tools

The plugin uses the AI API account explicitly configured by the user, or an optional separately installed local Bridge/CLI. The readme documents recipients, transmitted task/context data and service policies. Remote requests are not used to fetch arbitrary plugin updates, PHP modules or executable skill packages into directory Free. Optional language downloads are digest-pinned inert JSON/MO data; English and required guidance are bundled.

Free contains bounded native post/page, taxonomy, media metadata and basic settings operations. It contains no raw PHP runner, installation-file manager, direct database tool or custom plugin/theme code-project implementation. Those implementations and their guidance live in the separately distributed Pro add-on. Cached advanced calls receive a normal availability result with an explanation and https://pixflow.dev/free-pro#advanced-site-tools; no action is performed.

Pro's `DirectCodeAccess` checks `edit_plugins` at the operation boundary, respects `DISALLOW_FILE_EDIT`, `DISALLOW_FILE_MODS` and `wp_is_file_mod_allowed`, and requires super-admin status on multisite. Authenticated tool sessions and their site/user bindings are separately checked. A writable session does not confer code authority. Pro PHP execution has server-process authority and is not represented as a sandbox. Native WordPress editing and previously saved content are preserved.

The current directory FAQ explicitly excludes new plugins with arbitrary code execution and file-manager functionality, including AI-generated executable site code. Free's separation addresses that restriction; it does not claim that WordPress requires every paid feature or every database-backed operation to be Pro. Workspace page-building instructions use a live editor handoff. Free's content validation rejects newly introduced executable code while preserving unrelated existing content. No directory approval is claimed.

## Static-analysis context

The final audit retains every Plugin Check entry and a disposition with source context. No global suppression removes findings from the submitted evidence. Fresh database reads and compare-and-swap/transaction queries protect ownership, revision checking and duplicate-run prevention. Local file locks, containment checks and atomic renames protect private resources, language installation and exports. Replacing these mechanically with cached reads or non-atomic operations would alter those guarantees.

Exceptions and raw text/binary responses are reviewed at their actual output boundary. HTML escaping inside a JSON exception or downloadable payload would corrupt data. The accompanying triage records the particular call sites rather than claiming that every occurrence of an API is exempt.

## Build and minimum-version evidence

Free uses WordPress's React libraries. The archive includes the original Free source inputs, resolved build recipes and pinned build dependencies; the extracted source project can rebuild independently of the private repository. Essential guidance is shipped as ordinary files. Dependency and artwork provenance notices are supplied with the candidate.

The declared WordPress minimum is 6.2 and PHP minimum is 8.1. Use the final compatibility report for the versions and flows actually exercised. A newer-PHP run of WordPress 6.2 is not evidence of testing PHP 8.1.
