<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Admin\Gutenberg;
if (!defined('ABSPATH')) exit;

/** An additive theme layer, never a replacement of theme files or wp_global_styles. */
class SavedGutenbergDesignSystem
{
    protected const OPTION = 'pixflow_design_gutenberg_system_state';
    protected static array $base = [];
    public static function register(): void
    {
        add_filter('wp_theme_json_data_theme', [self::class,'theme_data'], 99);
        add_action('enqueue_block_assets', [self::class,'enqueue']);
    }
    public static function theme_data($data)
    {
        $theme = get_stylesheet();
        self::$base[$theme] = $data->get_data();
        $state = (array) get_option(self::OPTION, []);
        $layer = $state[$theme]['layer'] ?? null;
        if (!$layer || !wp_is_block_theme()) return $data;
        try { $merged = self::merge(self::$base[$theme], $layer); }
        catch (\RuntimeException) { return $data; } // A later theme update must not lose its own presets.
        return $data->update_with($merged);
    }
    public static function merge(array $base, array $layer): array
    {
        foreach (['color'=>['palette'], 'typography'=>['fontFamilies','fontSizes'], 'spacing'=>['spacingSizes']] as $group=>$keys) foreach ($keys as $key) {
            $raw = $base['settings'][$group][$key] ?? [];
            $existing = $raw['theme'] ?? $raw;
            $incoming = $layer['settings'][$group][$key] ?? [];
            if (array_intersect(array_column($existing,'slug'), array_column($incoming,'slug'))) throw new \RuntimeException('The theme already uses a reserved Pixflow preset name. No changes were made.');
            $base['settings'][$group][$key] = isset($raw['theme']) ? array_replace($raw, ['theme'=>array_merge($existing,$incoming)]) : array_merge($existing,$incoming);
        }
        $base['styles'] = array_replace_recursive($base['styles'] ?? [], $layer['styles'] ?? []);
        return $base;
    }
    public static function enqueue(): void
    {
        if (!wp_is_block_theme()) return;
        $all = (array) get_option(self::OPTION, []);
        $css = $all[get_stylesheet()]['layer']['css'] ?? '';
        if (!$css) return;
        wp_register_style('pixflow-gutenberg-design-system',false,[],null);
        wp_enqueue_style('pixflow-gutenberg-design-system');
        wp_add_inline_style('pixflow-gutenberg-design-system',$css);
    }
}
