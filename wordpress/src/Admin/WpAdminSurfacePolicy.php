<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Admin;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Centralises the resource boundary for the WP Admin surface.
 *
 * The panel is useful to editors and authors who can edit content, so
 * `manage_options` is deliberately not the default launcher authority. The
 * capability remains filterable for installations with a custom role model.
 */
final class WpAdminSurfacePolicy
{
    public const CAPABILITY_FILTER = 'pixflow_design_wp_admin_capability';

    public static function capability(): string
    {
        $capability = apply_filters(self::CAPABILITY_FILTER, 'edit_posts');
        return is_string($capability) && $capability !== ''
            ? sanitize_key($capability)
            : 'edit_posts';
    }

    public static function can_use(): bool
    {
        return is_user_logged_in()
            && !self::is_network_admin()
            && current_user_can(self::capability());
    }

    /**
     * Asset/launcher gate. REST requests use can_use() because WordPress does
     * not reconstruct the originating admin screen while dispatching REST.
     */
    public static function can_render_admin_surface(): bool
    {
        if (!self::can_use() || !function_exists('is_admin') || !is_admin()) {
            return false;
        }

        if (function_exists('wp_doing_ajax') && wp_doing_ajax()) {
            return false;
        }

        // Gutenberg preparation uses a ticket-bound, same-origin editor iframe
        // so WordPress can canonicalize blocks through the real editor runtime.
        // That isolated document must load only its restricted serializer bridge:
        // mounting the general WP Admin panel there would refresh the parent
        // tab's active-context authority under the shared sessionStorage tab id.
        if (self::is_gutenberg_serializer_frame()) {
            return false;
        }

        return !self::is_builder_screen();
    }

    private static function is_gutenberg_serializer_frame(): bool
    {
        $marker = $_GET['pixflow-gutenberg-serializer'] ?? null;
        if (!is_scalar($marker)) {
            return false;
        }

        $value = function_exists('wp_unslash')
            ? wp_unslash((string) $marker)
            : (string) $marker;

        return $value === '1';
    }

    public static function is_builder_screen(): bool
    {
        $screen = function_exists('get_current_screen') ? get_current_screen() : null;
        if ($screen !== null) {
            $parts = [
                (string) ($screen->id ?? ''),
                (string) ($screen->base ?? ''),
                (string) ($screen->post_type ?? ''),
            ];
            foreach ($parts as $part) {
                if ($part !== '' && str_contains(strtolower($part), 'bricks')) {
                    return true;
                }
            }
        }

        // Bricks also exposes a builder route before get_current_screen() has
        // finished on some AJAX/redirect paths. Treat the marker as a routing
        // hint only; it never grants access to the WP Admin surface.
        return isset($_GET['bricks']) || isset($_GET['bricks_builder']);
    }

    private static function is_network_admin(): bool
    {
        return function_exists('is_network_admin') && is_network_admin();
    }
}
