<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Fonts;
if (!defined('ABSPATH')) exit;
/** Read-only compatibility for already-installed font assets after an add-on is removed.
 * Retains rendering and deletion protection; never creates registrations or downloads.
 */
final class SavedFontAssets
{
    private const OPTION = 'pixflow_design_etch_google_fonts';
    public const SHEET = 'pixflow-google-fonts';
    public static function register(): void
    {
        add_action('wp_enqueue_scripts', [self::class, 'enqueue_elementor'], 25);
        add_action('elementor/editor/after_enqueue_styles', [self::class, 'enqueue_elementor']);
        add_filter('option_etch_global_stylesheets', [self::class, 'stylesheets']);
        add_filter('default_option_etch_global_stylesheets', [self::class, 'stylesheets']);
    }
    /** Rendering survives removal of Pro; no picker, download or mutation hooks. */
    public static function enqueue_elementor(): void
    {
        if (!defined('ELEMENTOR_VERSION')) return;
        $css = self::css('elementor');
        if ($css !== '') {
            wp_register_style('pixflow-elementor-fonts', false, [], null);
            wp_enqueue_style('pixflow-elementor-fonts');
            wp_add_inline_style('pixflow-elementor-fonts', $css);
        }

    }

    public static function records(string $builder = 'etch'): array
    {
        $value = get_option($builder === 'elementor' ? 'pixflow_design_elementor_google_fonts' : self::OPTION, []);
        return is_array($value) ? $value : [];
    }

    public static function uses_attachment(int $id): bool
    {
        foreach (['etch', 'elementor'] as $builder) foreach (self::records($builder) as $font) foreach ($font['files'] ?? [] as $file) {
            if ((int) $file['attachmentId'] === $id) return true;
        }
        return false;
    }

    private static function quote(string $value): string
    {
        return '"' . str_replace(['\\', '"', "\n", "\r", '<', '>'], ['\\\\', '\\"', '', '', '\\3c ', '\\3e '], $value) . '"';
    }

    public static function css(string $builder = 'etch'): string
    {
        $rules = [];
        foreach (self::records($builder) as $font) {
            if (empty($font['enabled'])) continue;
            foreach ($font['files'] as $file) {
                $url = wp_get_attachment_url((int) $file['attachmentId']);
                if (!$url) continue;
                $variant = $file['variant'];
                $style = str_contains($variant, 'italic') ? 'italic' : 'normal';
                $weight = (int) $variant ?: 400;
                $range = $font['weightRange'] ?? null;
                $weight = $range ? (int) $range['min'] . ' ' . (int) $range['max'] : (string) $weight;
                $rules[] = '@font-face{font-family:' . self::quote($font['family']) . ';src:url(' . self::quote($url) . ');font-weight:' . $weight . ';font-style:' . $style . ';font-display:swap;}';
            }
        }
        return implode("\n", $rules);
    }

    /** Etch reads this managed stylesheet normally, including its preview frame.
     * Derive it from registration so an older open editor cannot restore removed fonts. */
    public static function stylesheets($sheets): array
    {
        $sheets = is_array($sheets) ? $sheets : [];
        
        // Do not make a fresh Etch installation look initialized before it has
        // created its Main and Custom Media stylesheets.
        if (!isset($sheets[self::SHEET]) && self::records() === []) return $sheets;
        $sheets[self::SHEET] = ['name' => 'Pixflow Google Fonts', 'css' => self::css(), 'type' => 'default'];
        return $sheets;
    }

}
