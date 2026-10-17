<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Media;
if (!defined('ABSPATH')) { exit; }

/** Media records whose images remain on the provider CDN. */
final class UnsplashMediaLibrary
{
    private const META = '_pixflow_unsplash_photo';

    public function register(): void
    {
        add_filter('wp_get_attachment_url', fn($url, $id) => $this->photo((int) $id)['url'] ?? $url, 10, 2);
        add_filter('image_downsize', function ($result, $id) {
            $p = $this->photo((int) $id);
            return $p ? [$p['url'], $p['width'], $p['height'], false] : $result;
        }, 10, 2);
        add_filter('wp_prepare_attachment_for_js', function ($response, $attachment) {
            $p = $this->photo((int) $attachment->ID);
            if (!$p || !is_array($response)) return $response;
            $response['url'] = $p['url'];
            $response['filename'] = $attachment->post_name . '.jpg';
            $response['width'] = $p['width'];
            $response['height'] = $p['height'];
            $response['sizes'] = ['full' => ['url' => $p['url'], 'width' => $p['width'], 'height' => $p['height'], 'orientation' => $p['width'] >= $p['height'] ? 'landscape' : 'portrait']];
            unset($response['nonces']['edit']);
            return $response;
        }, 10, 2);
    }

    private function photo(int $id): ?array
    {
        $p = get_post_meta($id, self::META, true);
        return is_array($p) && self::valid_url((string) ($p['url'] ?? ''), ['images.unsplash.com', 'plus.unsplash.com']) ? $p : null;
    }

    public static function valid_url(string $url, array $hosts): bool
    {
        $p = wp_parse_url($url);
        return is_array($p) && ($p['scheme'] ?? '') === 'https'
            && in_array(strtolower((string) ($p['host'] ?? '')), $hosts, true)
            && !isset($p['user']) && !isset($p['pass']) && !isset($p['port']);
    }

    public function create(array $args): array
    {
        if (!current_user_can('upload_files')) throw new \RuntimeException('This WordPress user cannot upload media.');
        $p = is_array($args['photo'] ?? null) ? $args['photo'] : [];
        $id = (string) ($p['id'] ?? '');
        if (!preg_match('/^[A-Za-z0-9_-]+$/', $id)
            || !self::valid_url((string) ($p['url'] ?? ''), ['images.unsplash.com', 'plus.unsplash.com'])
            || !self::valid_url((string) ($p['photographerUrl'] ?? ''), ['unsplash.com'])
            || !self::valid_url((string) ($p['sourceUrl'] ?? ''), ['unsplash.com'])) {
            throw new \InvalidArgumentException('Original Unsplash CDN and attribution URLs are required.');
        }
        $title = sanitize_text_field((string) ($args['title'] ?? ''));
        $alt = sanitize_text_field((string) ($args['altText'] ?? $p['alt'] ?? ''));
        $name = sanitize_text_field((string) ($p['photographer'] ?? ''));
        $width = max(0, (int) ($p['width'] ?? 0)); $height = max(0, (int) ($p['height'] ?? 0));
        if (!$width || !$height || !$title || !$alt || !$name) throw new \InvalidArgumentException('Title, alt text, photographer and dimensions are required.');
        $caption = 'Photo by <a href="' . esc_url($p['photographerUrl']) . '">' . esc_html($name) . '</a> on <a href="' . esc_url($p['sourceUrl']) . '">Unsplash</a>';
        $ids = get_posts(['post_type' => 'attachment', 'post_status' => 'inherit', 'fields' => 'ids', 'posts_per_page' => 1, 'meta_key' => '_pixflow_unsplash_id', 'meta_value' => $id]);
        $attachment = $ids[0] ?? wp_insert_attachment(['post_title' => $title, 'post_name' => sanitize_title(pathinfo((string) ($args['filename'] ?? $title), PATHINFO_FILENAME)), 'post_mime_type' => 'image/jpeg', 'post_status' => 'inherit', 'post_excerpt' => $caption], false, 0, true);
        if (is_wp_error($attachment)) throw new \RuntimeException($attachment->get_error_message());
        if (!$ids) {
            update_post_meta($attachment, self::META, ['id' => $id, 'url' => $p['url'], 'width' => $width, 'height' => $height, 'photographer' => $name, 'photographerUrl' => $p['photographerUrl'], 'sourceUrl' => $p['sourceUrl']]);
            update_post_meta($attachment, '_pixflow_unsplash_id', $id);
            update_post_meta($attachment, '_pixflow_design_media', '1');
            update_post_meta($attachment, '_pixflow_design_media_source', 'unsplash');
            update_post_meta($attachment, '_wp_attachment_image_alt', $alt);
            wp_update_attachment_metadata($attachment, ['width' => $width, 'height' => $height, 'sizes' => []]);
        }
        return ['id' => (int) $attachment, 'url' => wp_get_attachment_url($attachment), 'title' => get_the_title($attachment), 'altText' => $alt, 'caption' => $caption, 'source' => 'unsplash', 'remote' => true, 'reused' => (bool) $ids];
    }
}
