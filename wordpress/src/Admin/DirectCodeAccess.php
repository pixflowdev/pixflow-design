<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Admin;

if (!defined('ABSPATH')) exit;

/** Raw site access has plugin-code authority, not merely site-settings authority.
 * Recheck at each sink: a writable session never grants this capability itself.
 * File reads and raw SQL share this boundary because they expose credentials,
 * executable content and authorization records outside native content APIs.
 */
final class DirectCodeAccess
{
    public static function allowed(): bool
    {
        if (!current_user_can('edit_plugins')) return false;
        if ((defined('DISALLOW_FILE_MODS') && DISALLOW_FILE_MODS)
            || (defined('DISALLOW_FILE_EDIT') && DISALLOW_FILE_EDIT)) return false;
        if (function_exists('is_multisite') && is_multisite() && !is_super_admin()) return false;
        return !function_exists('wp_is_file_mod_allowed') || wp_is_file_mod_allowed('pixflow_direct_code');
    }

    public static function require_access(): void
    {
        if (!self::allowed()) throw new \RuntimeException('This operation requires WordPress executable-code authority. Your account or installation does not permit it. Native content editing remains available.');
    }

    public static function is_raw_tool(string $tool): bool
    {
        return $tool === 'wordpress.run' || str_starts_with($tool, 'files.') || str_starts_with($tool, 'database.');
    }
}
