<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Modules;
if (!defined('ABSPATH')) exit;

/** Free owns only the optional-feature boundary and preserves all saved development records. */
final class AdvancedSiteAccess
{
    public static function available(): bool { return FeatureContributions::available('advanced-site-tools'); }

    public static function owns_capability(string $id): bool
    {
        return str_starts_with($id, 'pixflow/wp-admin/code/') || str_starts_with($id, 'pixflow/wp-admin/plugin-source/');
    }

    public static function owns_handler(string $handler): bool
    {
        return str_starts_with($handler, 'code_') || str_starts_with($handler, 'plugin_source_');
    }

    public static function not_allowed(): array
    {
        return [
            'allowed' => false,
            'code' => 'pro_required',
            'message' => 'Pixflow Design Free cannot perform this advanced site action. Upgrade to Pixflow Design Pro and activate its licence to use PHP, code projects, site files, database tools and plugin source inspection.',
            'learnMore' => [
                'label' => 'Why is this blocked in Free? Learn more',
                'url' => 'https://pixflow.dev/free-pro#advanced-site-tools',
            ],
            'guidance' => 'Explain this limitation and the Pro upgrade option to the user. Include the returned learnMore label and URL as a Markdown link. Continue any permitted WordPress administration and Gutenberg tasks. Do not silently substitute another tool to perform the restricted action.',
        ];
    }
}
