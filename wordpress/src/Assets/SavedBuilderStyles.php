<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Assets;
if (!defined('ABSPATH')) exit;

/** Read-only frontend compatibility for already-applied design systems.
 * Authoring adapters live in Pro. Deactivation never removes a site's CSS.
 */
final class SavedBuilderStyles
{
    public static function register(): void
    {
        add_action('wp_enqueue_scripts', [self::class, 'enqueue'], 30);
    }
    public static function enqueue(): void
    {
        if (!defined('ELEMENTOR_VERSION')) return;
        $kitId = (int) get_option('elementor_active_kit');
        $state = (array) get_option('pixflow_design_elementor_system_state', []);
        $css = $state[$kitId]['css'] ?? '';
        if (!is_string($css) || $css === '') return;
        wp_register_style('pixflow-elementor-design-system', false, [], null);
        wp_enqueue_style('pixflow-elementor-design-system');
        wp_add_inline_style('pixflow-elementor-design-system', $css);
    }
}
