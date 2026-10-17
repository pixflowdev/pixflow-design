<?php

declare(strict_types=1);

/** Phase 17 red specification for the bounded site-presentation read view. */

function assert_wp_admin_read_settings_boundary(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$service = (string) file_get_contents(dirname(__DIR__) . '/src/Admin/WpAdminSettingsCapabilityService.php');

assert_wp_admin_read_settings_boundary(
    str_contains($service, "'showOnFront'")
    && str_contains($service, "get_option('show_on_front'")
    && str_contains($service, "'pageOnFront'")
    && str_contains($service, "'pageForPosts'"),
    'The read-only settings result must expose the live homepage presentation without adding those keys to the writable allowlist.',
);
assert_wp_admin_read_settings_boundary(
    str_contains($service, "'activeTheme'")
    && str_contains($service, 'wp_get_theme()')
    && str_contains($service, "'stylesheet'"),
    'The read-only settings result must expose bounded active-theme identity.',
);

echo "wp-admin-read-settings-boundary: ok\n";
