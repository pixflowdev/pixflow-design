<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Fonts;
if (!defined('ABSPATH')) exit;

/** Locally hosted WordPress presets. Never edits theme files or saved Global Styles. */
class WordPressFontManager
{
    private const OPTION = 'pixflow_design_wordpress_google_fonts';

    public static function register(): void
    {
        add_filter('wp_theme_json_data_theme', [self::class, 'theme_data'], 90);
        // Classic themes also need faces, including their iframe block editor.
        add_action('enqueue_block_assets', [self::class, 'enqueue']);
        add_action('wp_enqueue_scripts', [self::class, 'enqueue']);
        add_filter('block_editor_settings_all', [self::class, 'editor_settings']);
        // 6.0 has no theme-json data filter. Its Site Editor fetches this base
        // configuration independently of block_editor_settings_all, including
        // via REST preloading. Never touch the saved user Global Styles route.
        if (version_compare((string) get_bloginfo('version'), '6.1', '<')) {
            add_filter('rest_request_after_callbacks', [self::class, 'legacy_theme_response'], 10, 3);
        }
    }

    public static function records(): array { return (array) get_option(self::OPTION, []); }

    public static function legacy_theme_response($response, $handler, $request)
    {
        if ($request->get_method() !== 'GET'
            || $request->get_route() !== '/wp/v2/global-styles/themes/' . get_stylesheet()
            || !($response instanceof \WP_REST_Response) || $response->get_status() !== 200) return $response;
        $data = $response->get_data();
        if (!is_array($data) || !isset($data['settings']) || !is_array($data['settings'])) return $response;
        $settings = self::editor_settings(['__experimentalFeatures' => $data['settings']]);
        $data['settings'] = $settings['__experimentalFeatures'];
        $response->set_data($data);
        return $response;
    }

    /** WordPress 6.0 predates theme-json data filters; seed its native controls too. */
    public static function editor_settings(array $settings): array
    {
        $presets = self::presets();
        $theme = $settings['__experimentalFeatures']['typography']['fontFamilies']['theme'] ?? [];
        $slugs = array_column($theme, 'slug');
        foreach ($presets as $preset) {
            if (in_array($preset['slug'], $slugs, true)) continue;
            unset($preset['fontFace']);
            $theme[] = $preset;
        }
        $settings['__experimentalFeatures']['typography']['fontFamilies']['theme'] = $theme;
        $settings['pixflowFontSlugs'] = array_column($presets, 'slug');
        return $settings;
    }

    public static function uses_attachment(int $id): bool
    {
        foreach (self::records() as $font) foreach ($font['files'] as $file) {
            if ((int) $file['attachmentId'] === $id) return true;
        }
        return false;
    }

    public static function remove(string $id): array
    {
        $records = self::records();
        if (!isset($records[$id])) throw new \RuntimeException('Installed WordPress font was not found.');
        unset($records[$id]); self::save($records);
        return ['removed' => true] + self::state();
    }

    protected static function save(array $records): void
    {
        if (!update_option(self::OPTION, $records, false) && self::records() !== $records) throw new \RuntimeException('Could not save the font registration.');
        if (class_exists('WP_Theme_JSON_Resolver')) \WP_Theme_JSON_Resolver::clean_cached_data();
        if (function_exists('wp_clean_theme_json_cache')) wp_clean_theme_json_cache();
    }

    public static function presets(): array
    {
        $presets = [];
        foreach (self::records() as $font) {
            if (empty($font['enabled'])) continue;
            $faces = [];
            foreach ($font['files'] as $file) {
                $url = wp_get_attachment_url((int) $file['attachmentId']);
                if (!$url) continue;
                $variant = $file['variant']; $range = $font['weightRange'];
                $faces[] = ['fontFamily' => $font['family'], 'fontStyle' => str_contains($variant, 'italic') ? 'italic' : 'normal',
                    'fontWeight' => $range ? (int) $range['min'] . ' ' . (int) $range['max'] : (string) ((int) $variant ?: 400),
                    'fontDisplay' => 'swap', 'src' => [$url]];
            }
            if ($faces) $presets[] = ['name' => $font['family'], 'slug' => $font['slug'], 'fontFamily' => $font['family'], 'fontFace' => $faces];
        }
        return $presets;
    }

    public static function theme_data($data)
    {
        $base = $data->get_data(); $raw = $base['settings']['typography']['fontFamilies'] ?? [];
        $existing = $raw['theme'] ?? $raw;
        $slugs = array_column($existing, 'slug');
        // The theme wins even if it happens to use our prefix.
        $added = array_values(array_filter(self::presets(), static fn($p) => !in_array($p['slug'], $slugs, true)));
        // Our enqueue owns the faces in both classic and block themes.
        foreach ($added as &$preset) unset($preset['fontFace']);
        unset($preset);
        $base['settings']['typography']['fontFamilies'] = isset($raw['theme']) ? array_replace($raw, ['theme' => array_merge($existing, $added)]) : array_merge($existing, $added);
        return $data->update_with($base);
    }

    public static function css(): string
    {
        $rules = [];
        foreach (self::presets() as $preset) {
            $quote = static fn($s) => '"' . str_replace(['\\', '"', "\n", "\r", '<', '>'], ['\\\\', '\\"', '', '', '\\3c ', '\\3e '], $s) . '"';
            $slug = $preset['slug'];
            $rules[] = ':root{--wp--preset--font-family--' . $slug . ':' . $quote($preset['fontFamily']) . ';}.has-' . $slug . '-font-family{font-family:var(--wp--preset--font-family--' . $slug . ')!important;}';
            foreach ($preset['fontFace'] as $face) {
                $rules[] = '@font-face{font-family:' . $quote($face['fontFamily']) . ';src:url(' . $quote($face['src'][0]) . ');font-weight:' . $face['fontWeight'] . ';font-style:' . $face['fontStyle'] . ';font-display:swap;}';
            }
        }
        return implode("\n", $rules);
    }

    public static function enqueue(): void
    {
        if (wp_style_is('pixflow-wordpress-fonts', 'enqueued')) return;
        $css = self::css(); if ($css === '') return;
        wp_register_style('pixflow-wordpress-fonts', false, [], null);
        wp_enqueue_style('pixflow-wordpress-fonts'); wp_add_inline_style('pixflow-wordpress-fonts', $css);
    }

    public static function state(): array
    {
        return ['builder' => 'wordpress', 'installedFonts' => array_values(self::records()),
            'wordpressFontState' => ['css' => self::css(), 'presets' => self::presets()],
            'message' => 'Fonts are hosted locally and available in WordPress typography controls. Existing typography stays unchanged. Removing a registration keeps shared font files.'];
    }
}
