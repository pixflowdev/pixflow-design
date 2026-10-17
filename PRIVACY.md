# Privacy and data handling

Pixflow Design Free runs inside WordPress. Its optional Bridge runs on the user's computer. An AI request is not an offline operation unless the selected provider itself runs locally.

## AI requests

When you configure a provider and send a task, prompts, selected content, relevant conversation context and tool results are sent to that provider. Local CLI mode sends the approved task to the paired Bridge; the installed agent uses its configured AI service. API keys and authentication details must be treated as secrets. Provider retention and processing rules are controlled by the selected service.

Review the service disclosures and policy links in [the WordPress readme](wordpress/directory/readme.txt). Custom endpoints receive the task data sent to the endpoint you configure.

## Saved information

WordPress stores complete chat history and settings. Working-context compaction does not delete the full transcript. Free includes history export and storage reporting. Local agents may also keep session files on the computer running the Bridge. Previously sent provider data is subject to that provider's policy even after local history is removed.

Keep exported chats, database backups, diagnostic captures and credentials private. Do not attach them to public issues without reviewing and redacting their contents.

## Pixflow requests

Optional language downloads request a versioned, hash-pinned language file from Pixflow. English and essential guidance are bundled. Language downloads do not require chat data or a licence. Normal HTTP metadata, including the requesting server's IP address, is visible to the service.

Bridge setup may request download metadata. Saved Pro licences can be validated with Pixflow using the licence, site identity, version and activation information. Free does not require a Pixflow licence. The directory distribution receives Free updates from WordPress.org; the website distribution uses its separate updater.

See [Pixflow's privacy policy](https://pixflow.dev/privacy) and [terms](https://pixflow.dev/terms-of-service), and the configured AI provider's policies, for service-specific information.
