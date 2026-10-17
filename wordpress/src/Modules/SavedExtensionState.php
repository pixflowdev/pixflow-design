<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Modules;
if (!defined('ABSPATH')) exit;

/** Disabling an integration preserves its records, but never silently re-enables login 2FA. */
final class SavedExtensionState
{
    public static function register(): void
    {
        add_action('plugins_loaded', [self::class, 'reconcile'], 30);
        add_action('switch_theme', [self::class, 'reconcile'], 30);
        add_action('plugins_loaded', static function (): void { add_filter('pre_update_option_pixflow_design_app_config', [self::class, 'filter']); }, 29);
    }
    public static function filter(mixed $config): mixed
    {
        if (!BuilderIntegrations::present('bricks') && is_array($config) && isset($config['bricksExtensions']['twoFactorAuthentication']['enabled'])) {
            $config['bricksExtensions']['twoFactorAuthentication']['enabled'] = false;
        }
        return $config;
    }
    public static function reconcile(): void
    {
        $stored = get_option('pixflow_design_app_config', []);
        $next = self::filter($stored);
        if ($next !== $stored) update_option('pixflow_design_app_config', $next, false);
    }
}
