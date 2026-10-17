<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Assets;
if (!defined('ABSPATH')) exit;

/** Saved assets and basic removal survive Pro deactivation. No catalogue or downloads. */
final class InstalledAssets
{
    private const FONTS = [
        'wordpress' => 'pixflow_design_wordpress_google_fonts',
        'etch' => 'pixflow_design_etch_google_fonts',
        'elementor' => 'pixflow_design_elementor_google_fonts',
        'bricks' => 'pixflow_ai_google_fonts_installed',
    ];
    public static function register(): void
    {
        add_action('rest_api_init', static function () {
            foreach (['' => 'GET', '/remove' => 'POST'] as $suffix => $method) {
                register_rest_route('pixflow-design/v1', '/assets/installed' . $suffix, [
                    'methods' => $method, 'permission_callback' => static fn() => current_user_can('manage_options'),
                    'callback' => static function ($request) use ($suffix) {
                        try { return new \WP_REST_Response($suffix ? self::remove((array) $request->get_json_params()) : self::state()); }
                        catch (\Throwable $error) { return new \WP_REST_Response(['message' => $error->getMessage()], 400); }
                    },
                ]);
            }
        });
    }
    public static function state(): array
    {
        $items = [];
        foreach (self::FONTS as $builder => $option) foreach ((array) get_option($option, []) as $id => $font) {
            if (!is_array($font)) continue;
            $items[] = ['kind' => 'font', 'id' => (string) $id, 'builder' => $builder, 'name' => (string) ($font['family'] ?? $font['name'] ?? $id)];
        }
        foreach ((array) get_option('pixflow_ai_icon_sets_installed', []) as $id => $set) {
            if (is_array($set)) $items[] = ['kind' => 'icons', 'id' => (string) $id, 'builder' => 'site', 'name' => (string) ($set['name'] ?? $id)];
        }
        return ['items' => $items];
    }
    public static function remove(array $args): array
    {
        if (!current_user_can('manage_options')) throw new \RuntimeException('Removing installed assets requires a WordPress administrator.');
        $id = (string) ($args['id'] ?? ''); $kind = (string) ($args['kind'] ?? '');
        if ($kind === 'icons') {
            $sets = (array) get_option('pixflow_ai_icon_sets_installed', []);
            if (!isset($sets[$id])) throw new \RuntimeException('Installed icon set was not found.');
            unset($sets[$id]);
            if (!update_option('pixflow_ai_icon_sets_installed', $sets, false)) throw new \RuntimeException('Could not remove the icon set.');
            \PixflowDesign\WordPress\Modules\BuilderIntegrations::sync_icons($sets);
            $sync = \PixflowDesign\WordPress\Modules\BuilderIntegrations::get('bricks', 'syncIconRegistry'); if ($sync) $sync();
            $cleanup = \PixflowDesign\WordPress\Icons\IconMediaCleanup::run($id, $sets);
            return self::state() + ['message' => \PixflowDesign\WordPress\Icons\IconMediaCleanup::message($cleanup), 'cleanup' => $cleanup];
        }
        $builder = (string) ($args['builder'] ?? '');
        if ($kind !== 'font' || !isset(self::FONTS[$builder])) throw new \RuntimeException('Choose an installed font or icon set.');
        $option = self::FONTS[$builder]; $fonts = (array) get_option($option, []);
        if (!isset($fonts[$id])) throw new \RuntimeException('Installed font was not found.');
        $post = $builder === 'bricks' ? (int) ($fonts[$id]['postId'] ?? 0) : 0;
        if ($post && get_post($post) && (string) get_post_meta($post, '_pixflow_ai_google_font_id', true) !== $id) {
            throw new \RuntimeException('This font registration is no longer owned by Pixflow.');
        }
        // Record intent before removal: Pro must never resurrect this registration.
        $seen = (array) get_option('pixflow_design_font_registration_history', []);
        $seen[$builder][$id] = true;
        if (!update_option('pixflow_design_font_registration_history', $seen, false)
            && get_option('pixflow_design_font_registration_history') !== $seen) throw new \RuntimeException('Could not record font removal.');
        if ($builder === 'bricks') {
            // Remove only our native registration; shared font attachments remain intact.
            if ($post && get_post($post)) {
                if (!wp_delete_post($post, true)) throw new \RuntimeException('Could not remove the font registration.');
            }
        }
        unset($fonts[$id]);
        if (!update_option($option, $fonts, false)) throw new \RuntimeException('Could not remove the font registration.');
        if ($builder === 'bricks') {
            // This is cleanup of an existing native registration, not an editor adapter.
            $cache = defined('BRICKS_DB_CUSTOM_FONT_FACE_RULES') ? (string) BRICKS_DB_CUSTOM_FONT_FACE_RULES : 'bricks_font_face_rules';
            delete_option($cache);
            if (class_exists('Bricks\\Custom_Fonts') && method_exists('Bricks\\Custom_Fonts', 'get_custom_fonts')) {
                \Bricks\Custom_Fonts::$fonts = false;
                \Bricks\Custom_Fonts::$font_face_rules = '';
                \Bricks\Custom_Fonts::get_custom_fonts();
                update_option($cache, (string) \Bricks\Custom_Fonts::$font_face_rules, false);
            }
        }
        if (class_exists('WP_Theme_JSON_Resolver')) \WP_Theme_JSON_Resolver::clean_cached_data();
        if (function_exists('wp_clean_theme_json_cache')) wp_clean_theme_json_cache();
        return self::state() + ['message' => 'Font registration removed. Shared font files are preserved. Reload open editors to refresh their typography controls.',
            'wordpressFontState' => \PixflowDesign\WordPress\Fonts\WordPressFontManager::state()['wordpressFontState']];
    }
}
