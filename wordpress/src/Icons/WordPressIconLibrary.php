<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Icons;
if (!defined('ABSPATH')) exit;

/** Native Icon collections where available; ordinary Image patterns on older WP. */
final class WordPressIconLibrary
{
    private const ARCHIVE = 'pixflow_design_wordpress_icon_archive';
    private const SETS = 'pixflow_ai_icon_sets_installed';
    private static array $contents = [];

    public static function register(): void
    {
        add_action('init', [self::class, 'register_icons'], 30);
        add_filter('render_block_core/icon', [self::class, 'render_icon'], 10, 2);
        // Retain identity before a pack/subset is removed. Files are still cleaned
        // by the shared usage scanner; this index is not itself a media consumer.
        add_filter('pre_update_option_' . self::SETS, static function ($next, $previous) {
            $archive = (array) get_option(self::ARCHIVE, []);
            foreach (array_merge(array_values((array) $previous), array_values((array) $next)) as $set) {
                foreach (self::entries([$set], false) as $entry) $archive[$entry['name']] = $entry;
            }
            update_option(self::ARCHIVE, $archive, false);
            return $next;
        }, 10, 2);
        add_filter('rest_post_dispatch', [self::class, 'filter_picker'], 10, 3);
        add_action('delete_attachment', static function ($id) {
            $archive = (array) get_option(self::ARCHIVE, []);
            $next = array_filter($archive, static fn($entry) => (int) $entry['attachmentId'] !== (int) $id);
            if ($archive !== $next) update_option(self::ARCHIVE, $next, false);
        });
    }

    public static function native(): bool { return function_exists('wp_register_icon_collection') && function_exists('wp_register_icon'); }

    public static function entries(array $sets, bool $enabled_only = true): array
    {
        $entries = [];
        foreach ($sets as $set) {
            if (!is_array($set) || empty($set['id'])) continue;
            if ($enabled_only && ($set['enabled'] ?? true) === false) continue;
            $collection = 'pixflow-' . sanitize_key((string) $set['id']);
            foreach ($set['icons'] ?? [] as $icon) {
                $id = (int) ($icon['attachment_id'] ?? 0);
                if (!$id || get_post_mime_type($id) !== 'image/svg+xml') continue;
                $url = wp_get_attachment_url($id); if (!$url) continue;
                $label = sanitize_text_field((string) ($icon['name'] ?? $icon['id'] ?? 'Icon'));
                // Attachment ID keeps names stable, unambiguous and discoverable by
                // the shared stored/unsaved media usage scanner.
                $name = $collection . '/' . (sanitize_title((string) ($icon['id'] ?? $label)) ?: 'icon') . '-' . $id;
                $entries[] = ['name' => $name, 'label' => $label, 'collection' => $collection,
                    'collectionLabel' => 'Pixflow · ' . sanitize_text_field((string) ($set['name'] ?? $set['id'])),
                    'attachmentId' => $id, 'url' => $url];
            }
        }
        return $entries;
    }

    public static function state(): array
    {
        return ['native' => self::native(), 'icons' => array_map(static function ($entry) {
            $extras = [];
            foreach (\PixflowDesign\WordPress\Modules\BuilderIntegrations::all() as $integration) {
                if (isset($integration['wordpressIcon'])) $extras += ($integration['wordpressIcon'])($entry);
            }
            return $entry + $extras + ['block' => self::native()
                ? ['name' => 'core/icon', 'attributes' => ['icon' => $entry['name']]]
                : ['name' => 'core/image', 'attributes' => ['id' => $entry['attachmentId'], 'url' => $entry['url'], 'alt' => '', 'sizeSlug' => 'full', 'linkDestination' => 'none']]];
        }, self::entries((array) get_option(self::SETS, [])))];
    }

    /** Read only a managed SVG beneath the installed icon directory. */
    public static function content(array $entry): string
    {
        if (isset(self::$contents[$entry['name']])) return self::$contents[$entry['name']];
        $path = get_attached_file((int) $entry['attachmentId']);
        $uploads = wp_upload_dir(null, false);
        $root = realpath($uploads['basedir'] . '/pixflow-ai/icon-sets');
        $file = $path ? realpath($path) : false;
        if (!$root || !$file || !str_starts_with(wp_normalize_path($file), trailingslashit(wp_normalize_path($root))) || strtolower(pathinfo($file, PATHINFO_EXTENSION)) !== 'svg') return '';
        $svg = self::sanitize_content((string) file_get_contents($file));
        self::$contents[$entry['name']] = $svg;
        return $svg;
    }

    public static function register_icons(): void
    {
        $active = self::entries((array) get_option(self::SETS, []));
        if (!self::native()) {
            if (!function_exists('register_block_pattern')) return;
            register_block_pattern_category('pixflow-icons', ['label' => 'Pixflow icons']);
            foreach ($active as $entry) {
                $attributes = ['id' => $entry['attachmentId'], 'sizeSlug' => 'full', 'linkDestination' => 'none'];
                $html = '<figure class="wp-block-image size-full"><img src="' . esc_url($entry['url']) . '" alt="" class="wp-image-' . $entry['attachmentId'] . '"/></figure>';
                register_block_pattern($entry['name'], ['title' => $entry['label'], 'categories' => ['pixflow-icons'],
                    'description' => $entry['collectionLabel'], 'content' => '<!-- wp:image ' . wp_json_encode($attributes) . ' -->' . $html . '<!-- /wp:image -->']);
            }
            return;
        }
        $all = (array) get_option(self::ARCHIVE, []);
        foreach (self::entries((array) get_option(self::SETS, []), false) as $entry) $all[$entry['name']] = $entry;
        $collections = [];
        foreach ($all as $entry) {
            $path = get_attached_file((int) $entry['attachmentId']);
            $uploads = wp_upload_dir(null, false); $root = realpath($uploads['basedir'] . '/pixflow-ai/icon-sets');
            $file = $path ? realpath($path) : false;
            if (!$root || !$file || !str_starts_with(wp_normalize_path($file), trailingslashit(wp_normalize_path($root))) || strtolower(pathinfo($file, PATHINFO_EXTENSION)) !== 'svg') continue;
            if (!isset($collections[$entry['collection']])) {
                wp_register_icon_collection($entry['collection'], ['label' => $entry['collectionLabel']]);
                $collections[$entry['collection']] = true;
            }
            $svg = self::sanitize_content((string) file_get_contents($file));
            if ($svg === '') continue;
            self::$contents[$entry['name']] = $svg;
            wp_register_icon($entry['name'], ['label' => $entry['label'], 'content' => $svg]);
        }
    }

    /** Only inert SVG geometry is exposed; no scripts, links, styles or resources. */
    public static function sanitize_content(string $svg): string
    {
        $inspection = str_replace("\0", '', html_entity_decode($svg, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        if (str_contains($inspection, '\\') || preg_match('/<!DOCTYPE|<!ENTITY|<\s*(?:script|foreignObject|image|use)\b|\bon[a-z]+\s*=|\bhref\s*=|url\s*\(/i', $inspection) || preg_match_all('/<svg\b/i', $svg) !== 1) return '';
        $presentation = array_fill_keys(['fill', 'fill-rule', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'opacity', 'transform'], true);
        $geometry = ['svg'=>['viewbox','xmlns','width','height','preserveaspectratio'], 'g'=>[], 'path'=>['d'], 'rect'=>['x','y','width','height','rx','ry'], 'circle'=>['cx','cy','r'], 'ellipse'=>['cx','cy','rx','ry'], 'line'=>['x1','y1','x2','y2'], 'polyline'=>['points'], 'polygon'=>['points']];
        $allowed = [];
        foreach ($geometry as $tag => $attributes) $allowed[$tag] = $presentation + array_fill_keys($attributes, true);
        return wp_kses($svg, $allowed);
    }

    /** Core owns styling, semantics and transforms; replace only our icon geometry. */
    public static function render_icon(string $html, array $block): string
    {
        $svg = self::$contents[$block['attrs']['icon'] ?? ''] ?? '';
        if (!$svg || !$html) return $html;
        $original = new \WP_HTML_Tag_Processor($html);
        $replacement = new \WP_HTML_Tag_Processor($svg);
        if (!$original->next_tag('svg') || !$replacement->next_tag('svg')) return $html;
        foreach ($original->get_attribute_names_with_prefix('') ?? [] as $name) $replacement->set_attribute($name, $original->get_attribute($name));
        return preg_replace_callback('/<svg\b[^>]*>[\s\S]*?<\/svg>/i', static fn() => $replacement->get_updated_html(), $html, 1) ?? $html;
    }
    /** Disabled/removed icons still render, but are absent from discovery lists. */
    public static function filter_picker($response, $server, $request)
    {
        if (!is_object($response) || !method_exists($response, 'get_data') || $response->get_status() !== 200) return $response;
        $route = $request->get_route();
        // Core's native registry accepts fill paths only. Restore independently
        // sanitized outline geometry on our own REST records, including lookups
        // for already placed icons. Other collections are never changed.
        if (str_starts_with($route, '/wp/v2/icons')) {
            $data = $response->get_data();
            if (is_array($data)) {
                $restore = static function ($item) {
                    if (isset(self::$contents[$item['name'] ?? ''])) $item['content'] = self::$contents[$item['name']];
                    return $item;
                };
                $response->set_data(isset($data['name']) ? $restore($data) : array_map($restore, $data));
            }
        }
        $collections = $route === '/wp/v2/icon-collections';
        $icons = preg_match('#^/wp/v2/icons(?:/[^/]+)?$#', $route) === 1;
        if (!$collections && !$icons) return $response;
        $active = self::entries((array) get_option(self::SETS, []));
        $allowed = array_column($active, $collections ? 'collection' : 'name');
        $data = $response->get_data(); if (!is_array($data)) return $response;
        $response->set_data(array_values(array_filter($data, static function ($item) use ($collections, $allowed) {
            $name = $item[$collections ? 'slug' : 'name'] ?? '';
            return !str_starts_with($name, 'pixflow-') || in_array($name, $allowed, true);
        })));
        return $response;
    }
}
