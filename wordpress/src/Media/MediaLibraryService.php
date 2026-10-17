<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Media;

if (!defined('ABSPATH')) {
    exit;
}

final class MediaLibraryService
{
    private const MAX_ATTACHMENT_CONTENT_BYTES = 16 * 1024 * 1024;
    private const META_PIXFLOW_MEDIA = '_pixflow_design_media';
    private const META_SOURCE = '_pixflow_design_media_source';
    private const META_PROJECT_UUID = '_pixflow_design_project_uuid';
    private const META_PROMPT = '_pixflow_design_prompt';
    private const META_PROVIDER = '_pixflow_design_provider';
    private const META_SURFACE = '_pixflow_design_surface';
    private const META_CONTENT_SHA256 = '_pixflow_design_media_sha256';

    public function list(array $args = []): array
    {
        $page = max(1, (int) ($args['page'] ?? 1));
        $per_page = min(100, max(1, (int) ($args['perPage'] ?? 40)));
        $type = sanitize_key((string) ($args['type'] ?? 'all'));
        $source = sanitize_key((string) ($args['source'] ?? 'all'));
        $search = sanitize_text_field((string) ($args['search'] ?? ''));

        $query_args = [
            'post_type' => 'attachment',
            'post_status' => 'inherit',
            'posts_per_page' => $per_page,
            'paged' => $page,
            'orderby' => 'date',
            'order' => 'DESC',
            'post_mime_type' => in_array($type, ['image', 'video', 'audio'], true)
                ? $type
                : ['image', 'video', 'audio'],
        ];

        if ($search !== '') {
            $query_args['s'] = $search;
        }

        if ($source === 'pixflow') {
            $query_args['meta_query'] = [
                [
                    'key' => self::META_PIXFLOW_MEDIA,
                    'value' => '1',
                    'compare' => '=',
                ],
            ];
        }

        $query = new \WP_Query($query_args);
        $items = [];
        foreach ($query->posts as $post) {
            if (!$post instanceof \WP_Post) {
                continue;
            }
            $item = $this->format_item((int) $post->ID);
            if ($item !== null) {
                $items[] = $item;
            }
        }

        return [
            'items' => $items,
            'total' => (int) $query->found_posts,
            'page' => $page,
            'perPage' => $per_page,
        ];
    }

    /** @return array<string, mixed>|\WP_Error */
    public function get(int $attachment_id): array|\WP_Error
    {
        if ($attachment_id <= 0 || get_post_type($attachment_id) !== 'attachment') {
            return new \WP_Error('pixflow_media_attachment_not_found', 'The selected WordPress attachment was not found.', ['status' => 404]);
        }
        if (!current_user_can('read_post', $attachment_id)) {
            return new \WP_Error('pixflow_media_attachment_forbidden', 'The current user cannot read this attachment.', ['status' => 403]);
        }
        $item = $this->format_item($attachment_id);
        return is_array($item)
            ? $item
            : new \WP_Error('pixflow_media_attachment_unsupported', 'The selected attachment is not supported by Pixflow Media.', ['status' => 422]);
    }

    public function import_wp_attachments(array $attachment_ids): array
    {
        $items = [];
        foreach ($attachment_ids as $attachment_id) {
            $attachment_id = (int) $attachment_id;
            if (!$this->is_supported_attachment($attachment_id) || !current_user_can('edit_post', $attachment_id)) {
                continue;
            }
            $this->mark_pixflow_media($attachment_id, 'wp-library');
            $item = $this->format_item($attachment_id);
            if ($item !== null) {
                $items[] = $item;
            }
        }
        return $items;
    }

    /**
     * Read an authenticated attachment through PHP. This avoids depending on
     * the development web server's handling of Unicode upload filenames.
     */
    public function read_attachment_content(int $attachment_id): array|\WP_Error
    {
        if ($attachment_id <= 0 || get_post_type($attachment_id) !== 'attachment') {
            return new \WP_Error('pixflow_media_attachment_not_found', 'The selected WordPress attachment was not found.', ['status' => 404]);
        }
        if (!current_user_can('read_post', $attachment_id)) {
            return new \WP_Error('pixflow_media_attachment_forbidden', 'The current user cannot read this attachment.', ['status' => 403]);
        }

        $file = get_attached_file($attachment_id);
        if (!is_string($file) || $file === '' || !is_file($file) || !is_readable($file)) {
            return new \WP_Error('pixflow_media_attachment_unreadable', 'The selected WordPress attachment file could not be read.', ['status' => 404]);
        }

        $size = filesize($file);
        if (!is_int($size) || $size < 0) {
            return new \WP_Error('pixflow_media_attachment_unreadable', 'The selected WordPress attachment size could not be read.', ['status' => 500]);
        }
        if ($size > self::MAX_ATTACHMENT_CONTENT_BYTES) {
            return new \WP_Error('pixflow_media_attachment_too_large', 'The selected WordPress attachment is too large to attach in chat.', ['status' => 413]);
        }

        $content = file_get_contents($file);
        if (!is_string($content)) {
            return new \WP_Error('pixflow_media_attachment_unreadable', 'The selected WordPress attachment file could not be read.', ['status' => 500]);
        }

        $filename = sanitize_file_name(basename($file));
        return [
            'attachmentId' => $attachment_id,
            'filename' => $filename !== '' ? $filename : sprintf('attachment-%d', $attachment_id),
            'mimeType' => sanitize_mime_type((string) get_post_mime_type($attachment_id)) ?: 'application/octet-stream',
            'contentBase64' => base64_encode($content),
            'sizeBytes' => $size,
        ];
    }

    public function handle_upload(string $field = 'file', array $metadata = []): array|\WP_Error
    {
        if (empty($_FILES[$field]) || !is_array($_FILES[$field])) {
            return new \WP_Error('pixflow_media_missing_file', 'No upload file was provided.', ['status' => 400]);
        }

        $original_filename = sanitize_file_name((string) ($_FILES[$field]['name'] ?? 'pixflow-media'));
        $mime = sanitize_mime_type((string) ($_FILES[$field]['type'] ?? ''));
        if (!$this->is_supported_mime($mime)) {
            return new \WP_Error('pixflow_media_unsupported_type', 'Only image, video, and audio files can be added to Pixflow Media.', ['status' => 400]);
        }

        // Generated files come through the same upload endpoint as ordinary
        // user uploads. Give them a meaningful, collision-safe name before
        // WordPress creates the attachment instead of preserving provider
        // placeholders such as "unnamed-file".
        $metadata = $this->prepare_generated_metadata($metadata, $original_filename, $mime);
        if (sanitize_key((string) ($metadata['source'] ?? '')) === 'generated'
            && !empty($metadata['filename'])
        ) {
            $_FILES[$field]['name'] = (string) $metadata['filename'];
        }

        $this->load_media_includes();
        $attachment_id = media_handle_upload($field, 0);
        if (is_wp_error($attachment_id)) {
            return $attachment_id;
        }

        $this->mark_pixflow_media((int) $attachment_id, 'upload');
        $this->apply_metadata((int) $attachment_id, $metadata);
        return $this->format_item((int) $attachment_id) ?? [];
    }

    public function save_generated(array $input): array|\WP_Error
    {
        $filename = sanitize_file_name((string) ($input['filename'] ?? 'pixflow-media'));
        $mime = sanitize_mime_type((string) ($input['mimeType'] ?? ''));
        $source_url = esc_url_raw((string) ($input['url'] ?? ''));
        $content_base64 = (string) ($input['contentBase64'] ?? '');
        $content_sha256 = '';

        if ($filename === '') {
            $filename = 'pixflow-media';
        }

        $input = $this->prepare_generated_metadata($input, $filename, $mime);
        $filename = sanitize_file_name((string) ($input['filename'] ?? $filename)) ?: $filename;

        if ($content_base64 !== '') {
            $decoded = base64_decode($content_base64, true);
            if (is_string($decoded) && $decoded !== '') {
                $content_sha256 = hash('sha256', $decoded);
                $existing_id = $this->find_attachment_by_content_hash($content_sha256, $mime);
                if ($existing_id > 0) {
                    // Reuse mutates both SVG dimensions and user metadata.
                    if (!current_user_can('edit_post', $existing_id)) {
                        return new \WP_Error('pixflow_media_attachment_forbidden', 'The current user cannot update this attachment.', ['status' => 403]);
                    }
                    $this->ensure_svg_attachment_dimensions($existing_id);
                    $this->apply_metadata($existing_id, $input);
                    $existing = $this->format_item($existing_id);
                    if (is_array($existing)) {
                        return [...$existing, 'reused' => true];
                    }
                }
            }
        }

        if ($source_url !== '') {
            $attachment_id = $this->sideload_url($source_url, $filename);
        } elseif ($content_base64 !== '' && $mime !== '') {
            $attachment_id = $this->insert_base64($content_base64, $filename, $mime);
        } else {
            return new \WP_Error('pixflow_media_missing_source', 'Provide a generated media URL or base64 payload.', ['status' => 400]);
        }

        if (is_wp_error($attachment_id)) {
            return $attachment_id;
        }

        $id = (int) $attachment_id;
        $this->mark_pixflow_media($id, 'generated');
        $this->apply_metadata($id, $input);
        if ($content_sha256 !== '') {
            update_post_meta($id, self::META_CONTENT_SHA256, $content_sha256);
        }

        return $this->format_item($id) ?? [];
    }

    /**
     * Resolve a generated project-file copy to the native attachment that
     * WordPress already serves reliably. Generated attachment filenames are
     * intentionally rewritten from the prompt, so content identity is the
     * stable join between the project canvas file and Media Library.
     */
    public function generated_attachment_url_for_path(string $path): string
    {
        if ($path === '' || !is_file($path) || !is_readable($path)) return '';
        $sha256 = hash_file('sha256', $path);
        if (!is_string($sha256) || !preg_match('/^[a-f0-9]{64}$/', $sha256)) return '';

        $query = new \WP_Query([
            'post_type' => 'attachment',
            'post_status' => 'inherit',
            'posts_per_page' => 1,
            'fields' => 'ids',
            'no_found_rows' => true,
            'meta_query' => [[
                'key' => self::META_CONTENT_SHA256,
                'value' => $sha256,
                'compare' => '=',
            ]],
        ]);
        $attachment_id = (int) ($query->posts[0] ?? 0);
        if ($attachment_id <= 0 || !current_user_can('read_post', $attachment_id)) return '';
        $url = wp_get_attachment_url($attachment_id);
        return is_string($url) && $url !== '' ? esc_url_raw($url) : '';
    }

    private function find_attachment_by_content_hash(string $sha256, string $mime): int
    {
        if (!preg_match('/^[a-f0-9]{64}$/', $sha256)) {
            return 0;
        }
        $query = new \WP_Query([
            'post_type' => 'attachment',
            'post_status' => 'inherit',
            'posts_per_page' => 1,
            'fields' => 'ids',
            'no_found_rows' => true,
            'meta_query' => [[
                'key' => self::META_CONTENT_SHA256,
                'value' => $sha256,
                'compare' => '=',
            ]],
        ]);
        $attachment_id = isset($query->posts[0]) ? (int) $query->posts[0] : 0;
        if ($attachment_id <= 0) {
            return 0;
        }
        $stored_mime = sanitize_mime_type((string) get_post_mime_type($attachment_id));
        return $mime === '' || $stored_mime === sanitize_mime_type($mime) ? $attachment_id : 0;
    }

    private function sideload_url(string $url, string $filename): int|\WP_Error
    {
        $this->load_media_includes();
        $tmp = download_url($url);
        if (is_wp_error($tmp)) {
            return $tmp;
        }

        $validation = $this->validate_sideload_file((string) $tmp, $filename);
        if (is_wp_error($validation)) {
            @unlink((string) $tmp);
            return $validation;
        }

        $attachment_id = media_handle_sideload([
            'name' => $filename,
            'tmp_name' => $tmp,
        ], 0);

        if (is_wp_error($attachment_id)) {
            @unlink($tmp);
            return $attachment_id;
        }

        return (int) $attachment_id;
    }

    /**
     * Reject transport wrappers, HTML error pages, and other non-media bytes
     * before WordPress creates an attachment that Bricks cannot render.
     */
    private function validate_sideload_file(string $file, string $filename): bool|\WP_Error
    {
        $size = is_file($file) ? (int) filesize($file) : 0;
        if ($size <= 0 || $size > self::MAX_ATTACHMENT_CONTENT_BYTES) {
            return new \WP_Error(
                'pixflow_media_invalid_download',
                'The downloaded media file is empty or exceeds the Pixflow media limit.',
                ['status' => 422]
            );
        }

        $extension = strtolower((string) pathinfo($filename, PATHINFO_EXTENSION));
        if ($extension === 'svg') {
            $svg = file_get_contents($file);
            if (!is_string($svg) || is_wp_error($this->sanitize_svg($svg))) {
                return new \WP_Error(
                    'pixflow_media_invalid_image',
                    'The downloaded file is not a valid SVG image.',
                    ['status' => 422]
                );
            }
            return true;
        }

        if (in_array($extension, ['avif', 'bmp', 'gif', 'jpeg', 'jpg', 'png', 'webp'], true)) {
            $image = @getimagesize($file);
            $mime = is_array($image) ? strtolower((string) ($image['mime'] ?? '')) : '';
            if (!is_array($image) || !str_starts_with($mime, 'image/')) {
                return new \WP_Error(
                    'pixflow_media_invalid_image',
                    'The downloaded file did not contain a valid image.',
                    ['status' => 422]
                );
            }
            return true;
        }

        $finfo = function_exists('finfo_open') ? @finfo_open(FILEINFO_MIME_TYPE) : false;
        $mime = $finfo ? strtolower((string) @finfo_file($finfo, $file)) : '';
        if ($finfo) {
            finfo_close($finfo);
        }
        if ($mime === '' || !$this->is_supported_mime($mime)) {
            return new \WP_Error(
                'pixflow_media_invalid_download',
                'The downloaded file did not contain supported image, video, or audio media.',
                ['status' => 422]
            );
        }

        return true;
    }

    private function insert_base64(string $content_base64, string $filename, string $mime): int|\WP_Error
    {
        if (!$this->is_supported_mime($mime)) {
            return new \WP_Error('pixflow_media_unsupported_type', 'Only image, video, and audio files can be saved to Pixflow Media.', ['status' => 400]);
        }

        $bytes = base64_decode($content_base64, true);
        if (!is_string($bytes) || $bytes === '') {
            return new \WP_Error('pixflow_media_invalid_payload', 'Generated media payload is not valid base64.', ['status' => 400]);
        }

        $is_svg = strtolower($mime) === 'image/svg+xml';
        $svg_dimensions = [];
        if ($is_svg) {
            $sanitized_svg = $this->sanitize_svg($bytes);
            if (is_wp_error($sanitized_svg)) {
                return $sanitized_svg;
            }
            $bytes = $sanitized_svg;
            $svg_dimensions = $this->extract_svg_dimensions($bytes);
            if (strtolower((string) pathinfo($filename, PATHINFO_EXTENSION)) !== 'svg') {
                $filename = sanitize_file_name((string) pathinfo($filename, PATHINFO_FILENAME)) . '.svg';
            }
        }

        $allow_svg = static function (array $mimes): array {
            $mimes['svg'] = 'image/svg+xml';
            return $mimes;
        };
        if ($is_svg) {
            add_filter('upload_mimes', $allow_svg);
        }
        try {
            $upload = wp_upload_bits($filename, null, $bytes);
        } finally {
            if ($is_svg) {
                remove_filter('upload_mimes', $allow_svg);
            }
        }
        if (!empty($upload['error'])) {
            return new \WP_Error('pixflow_media_upload_failed', (string) $upload['error'], ['status' => 500]);
        }

        $attachment_id = wp_insert_attachment([
            'post_mime_type' => $mime,
            'post_title' => sanitize_text_field(pathinfo($filename, PATHINFO_FILENAME)),
            'post_content' => '',
            'post_status' => 'inherit',
        ], (string) $upload['file']);

        if (is_wp_error($attachment_id)) {
            return $attachment_id;
        }

        $this->load_media_includes();
        $metadata = wp_generate_attachment_metadata((int) $attachment_id, (string) $upload['file']);
        $metadata = is_array($metadata) ? $metadata : [];
        if (isset($svg_dimensions['width'], $svg_dimensions['height'])) {
            // Bricks builds its lazy placeholder and intrinsic aspect ratio
            // from WordPress attachment metadata. Core does not generate SVG
            // dimensions, so preserve the sanitized document's real canvas.
            $metadata['width'] = $svg_dimensions['width'];
            $metadata['height'] = $svg_dimensions['height'];
        }
        if (is_array($metadata)) {
            wp_update_attachment_metadata((int) $attachment_id, $metadata);
        }

        return (int) $attachment_id;
    }

    private function sanitize_svg(string $svg): string|\WP_Error
    {
        if (strlen($svg) > 8 * 1024 * 1024 || preg_match('/<!DOCTYPE|<!ENTITY/i', $svg)) {
            return new \WP_Error('pixflow_media_unsafe_svg', 'The SVG contains a disallowed document declaration.', ['status' => 400]);
        }

        $previous = libxml_use_internal_errors(true);
        $document = new \DOMDocument();
        $loaded = $document->loadXML($svg, LIBXML_NONET | LIBXML_NOBLANKS | LIBXML_NOERROR | LIBXML_NOWARNING);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);
        if (!$loaded || !$document->documentElement || strtolower($document->documentElement->localName) !== 'svg') {
            return new \WP_Error('pixflow_media_invalid_svg', 'The SVG document could not be parsed safely.', ['status' => 400]);
        }

        $blocked_elements = ['script', 'iframe', 'object', 'embed', 'foreignobject', 'link', 'meta'];
        $nodes = [];
        foreach ($document->getElementsByTagName('*') as $node) {
            $nodes[] = $node;
        }
        foreach ($nodes as $node) {
            $element_name = strtolower($node->localName);
            if (in_array($element_name, $blocked_elements, true)) {
                return new \WP_Error('pixflow_media_unsafe_svg', 'The SVG contains an executable or embedded document element.', ['status' => 400]);
            }
            if ($element_name === 'style' && $this->svg_css_is_unsafe((string) $node->textContent)) {
                return new \WP_Error('pixflow_media_unsafe_svg', 'The SVG contains unsafe stylesheet content.', ['status' => 400]);
            }
            if (!$node->hasAttributes()) {
                continue;
            }
            foreach (iterator_to_array($node->attributes) as $attribute) {
                $name = strtolower($attribute->localName);
                $value = html_entity_decode(trim($attribute->value), ENT_QUOTES | ENT_HTML5, 'UTF-8');
                if (str_starts_with($name, 'on')) {
                    return new \WP_Error('pixflow_media_unsafe_svg', 'The SVG contains an event-handler attribute.', ['status' => 400]);
                }
                if (in_array($name, ['href', 'xlink:href'], true)) {
                    if (str_starts_with($value, '#')) {
                        continue;
                    }
                    if (preg_match('#^data:image/(?:png|jpe?g|gif|webp);base64,([a-z0-9+/=\s]+)$#i', $value, $match)) {
                        $embedded = base64_decode(preg_replace('/\s+/', '', (string) ($match[1] ?? '')), true);
                        if (is_string($embedded) && $embedded !== '' && strlen($embedded) <= 6 * 1024 * 1024) {
                            continue;
                        }
                    }
                    return new \WP_Error('pixflow_media_unsafe_svg', 'The SVG contains an external or unsafe embedded resource.', ['status' => 400]);
                }
                if ($this->svg_css_is_unsafe($value)) {
                    return new \WP_Error('pixflow_media_unsafe_svg', 'The SVG contains an unsafe CSS or URL value.', ['status' => 400]);
                }
            }
        }

        $sanitized = $document->saveXML($document->documentElement);
        if (!is_string($sanitized) || trim($sanitized) === '') {
            return new \WP_Error('pixflow_media_invalid_svg', 'The sanitized SVG was empty.', ['status' => 400]);
        }
        return $sanitized;
    }

    /**
     * @return array{width:int,height:int}|array{}
     */
    private function extract_svg_dimensions(string $svg): array
    {
        $previous = libxml_use_internal_errors(true);
        $document = new \DOMDocument();
        $loaded = $document->loadXML($svg, LIBXML_NONET | LIBXML_NOBLANKS | LIBXML_NOERROR | LIBXML_NOWARNING);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);
        if (!$loaded || !$document->documentElement || strtolower($document->documentElement->localName) !== 'svg') {
            return [];
        }

        $root = $document->documentElement;
        $parse_length = static function (string $value): int {
            if (!preg_match('/^\s*([0-9]+(?:\.[0-9]+)?)(?:px)?\s*$/i', $value, $match)) {
                return 0;
            }
            return max(0, (int) round((float) $match[1]));
        };
        $width = $parse_length($root->getAttribute('width'));
        $height = $parse_length($root->getAttribute('height'));

        if (($width <= 0 || $height <= 0) && preg_match('/^\s*[-+0-9.e]+[\s,]+[-+0-9.e]+[\s,]+([0-9.e+-]+)[\s,]+([0-9.e+-]+)\s*$/i', $root->getAttribute('viewBox'), $match)) {
            if ($width <= 0) {
                $width = max(0, (int) round((float) $match[1]));
            }
            if ($height <= 0) {
                $height = max(0, (int) round((float) $match[2]));
            }
        }

        return $width > 0 && $height > 0 ? ['width' => $width, 'height' => $height] : [];
    }

    private function ensure_svg_attachment_dimensions(int $attachment_id): void
    {
        if (sanitize_mime_type((string) get_post_mime_type($attachment_id)) !== 'image/svg+xml') {
            return;
        }
        $metadata = wp_get_attachment_metadata($attachment_id);
        $metadata = is_array($metadata) ? $metadata : [];
        if ((int) ($metadata['width'] ?? 0) > 0 && (int) ($metadata['height'] ?? 0) > 0) {
            return;
        }
        $file = get_attached_file($attachment_id);
        if (!is_string($file) || $file === '' || !is_file($file)) {
            return;
        }
        $svg = file_get_contents($file);
        if (!is_string($svg) || $svg === '') {
            return;
        }
        $svg_dimensions = $this->extract_svg_dimensions($svg);
        if (!isset($svg_dimensions['width'], $svg_dimensions['height'])) {
            return;
        }
        $metadata['width'] = $svg_dimensions['width'];
        $metadata['height'] = $svg_dimensions['height'];
        wp_update_attachment_metadata($attachment_id, $metadata);
    }

    private function svg_css_is_unsafe(string $value): bool
    {
        if (preg_match('/(?:javascript\s*:|@import|expression\s*\(|behavior\s*:)/i', $value)) {
            return true;
        }
        if (!preg_match_all('/url\(\s*([\'"]?)(.*?)\1\s*\)/i', $value, $matches)) {
            return false;
        }
        foreach ($matches[2] ?? [] as $target) {
            if (!preg_match('/^#[a-z0-9_.:-]+$/i', trim((string) $target))) {
                return true;
            }
        }
        return false;
    }

    private function mark_pixflow_media(int $attachment_id, string $source): void
    {
        update_post_meta($attachment_id, self::META_PIXFLOW_MEDIA, '1');
        update_post_meta($attachment_id, self::META_SOURCE, sanitize_key($source));
    }

    private function apply_metadata(int $attachment_id, array $metadata): void
    {
        $source = sanitize_key((string) ($metadata['source'] ?? ''));
        if ($source !== '') {
            update_post_meta($attachment_id, self::META_SOURCE, $source);
        }
        $this->set_optional_meta($attachment_id, self::META_PROJECT_UUID, sanitize_text_field((string) ($metadata['projectUuid'] ?? '')));
        $this->set_optional_meta($attachment_id, self::META_PROMPT, sanitize_textarea_field((string) ($metadata['prompt'] ?? '')));
        $this->set_optional_meta($attachment_id, self::META_PROVIDER, sanitize_text_field((string) ($metadata['provider'] ?? '')));
        $this->set_optional_meta($attachment_id, self::META_SURFACE, sanitize_key((string) ($metadata['surface'] ?? '')));

        $title = sanitize_text_field((string) ($metadata['title'] ?? ''));
        $caption = sanitize_textarea_field((string) ($metadata['caption'] ?? ''));
        $description = sanitize_textarea_field((string) ($metadata['description'] ?? ''));
        if ($title !== '' || $caption !== '' || $description !== '') {
            $post_update = ['ID' => $attachment_id];
            if ($title !== '') $post_update['post_title'] = $title;
            if ($caption !== '') $post_update['post_excerpt'] = $caption;
            if ($description !== '') $post_update['post_content'] = $description;
            wp_update_post($post_update);
        }

        $alt_text = sanitize_text_field((string) ($metadata['altText'] ?? $metadata['alt'] ?? ''));
        if ($alt_text !== '') {
            update_post_meta($attachment_id, '_wp_attachment_image_alt', $alt_text);
        }
    }

    /**
     * Add human-readable WordPress attachment metadata for generated media.
     * User uploads retain their original filename and metadata behavior.
     */
    private function prepare_generated_metadata(array $metadata, string $filename, string $mime): array
    {
        if (sanitize_key((string) ($metadata['source'] ?? '')) !== 'generated') {
            return $metadata;
        }

        $prompt = sanitize_textarea_field((string) ($metadata['prompt'] ?? ''));
        $title = sanitize_text_field((string) ($metadata['title'] ?? ''));
        if ($title === '') {
            $title = GeneratedMediaNaming::title($prompt, (string) ($metadata['surface'] ?? 'media'));
        }

        $extension = $this->generated_extension($filename, $mime, (string) ($metadata['surface'] ?? ''));
        $slug = GeneratedMediaNaming::filename_stem($title, $prompt, (string) ($metadata['surface'] ?? 'media'));
        // Explicit import names are caller-authored metadata, not provider
        // prompt text. Keep the safe basename while normalizing the extension.
        $requested_filename = sanitize_file_name((string) ($metadata['filename'] ?? ''));
        $requested_stem = (string) pathinfo($requested_filename, PATHINFO_FILENAME);
        $safe_filename = sanitize_file_name(($requested_stem !== '' ? $requested_stem : $slug) . '.' . $extension);

        return [
            ...$metadata,
            'filename' => $safe_filename,
            'title' => $title,
            'altText' => sanitize_text_field((string) ($metadata['altText'] ?? $title)),
            'caption' => sanitize_textarea_field((string) ($metadata['caption'] ?? ('Generated ' . ($metadata['surface'] ?? 'media') . ': ' . $title))),
            'description' => sanitize_textarea_field((string) ($metadata['description'] ?? ($prompt !== '' ? 'Generated by Pixflow Design from this brief: ' . $prompt : 'Generated by Pixflow Design.'))),
        ];
    }

    /**
     * Provider placeholders such as "unnamed-file" are not extensions. Keep
     * the real media type from the upload/provider response when the source
     * filename is absent or synthetic.
     */
    private function generated_extension(string $filename, string $mime, string $surface = ''): string
    {
        $extension = strtolower((string) pathinfo($filename, PATHINFO_EXTENSION));
        $allowed = [
            'avif', 'bmp', 'gif', 'jpeg', 'jpg', 'png', 'webp', 'svg',
            'mp4', 'webm', 'mov', 'm4v', 'mp3', 'wav', 'ogg', 'm4a', 'aac',
        ];
        if (in_array($extension, $allowed, true)) {
            return $extension === 'jpeg' ? 'jpg' : $extension;
        }

        $from_mime = match (strtolower(trim(explode(';', $mime)[0]))) {
            'image/jpeg' => 'jpg',
            'image/webp' => 'webp',
            'image/gif' => 'gif',
            'image/svg+xml' => 'svg',
            'image/avif' => 'avif',
            'video/mp4' => 'mp4',
            'video/webm' => 'webm',
            'video/quicktime' => 'mov',
            'audio/mpeg' => 'mp3',
            'audio/wav', 'audio/x-wav' => 'wav',
            'audio/ogg' => 'ogg',
            'audio/mp4' => 'm4a',
            default => '',
        };
        if ($from_mime !== '') return $from_mime;

        return match ($surface) {
            'video' => 'mp4',
            'audio' => 'mp3',
            default => 'png',
        };
    }

    private function set_optional_meta(int $attachment_id, string $key, string $value): void
    {
        if ($value === '') {
            delete_post_meta($attachment_id, $key);
            return;
        }
        update_post_meta($attachment_id, $key, $value);
    }

    private function is_supported_attachment(int $attachment_id): bool
    {
        if ($attachment_id <= 0 || get_post_type($attachment_id) !== 'attachment') {
            return false;
        }
        return $this->is_supported_mime((string) get_post_mime_type($attachment_id));
    }

    private function is_supported_mime(string $mime): bool
    {
        return str_starts_with($mime, 'image/')
            || str_starts_with($mime, 'video/')
            || str_starts_with($mime, 'audio/');
    }

    private function format_item(int $attachment_id): ?array
    {
        if (!$this->is_supported_attachment($attachment_id) || !current_user_can('read_post', $attachment_id)) {
            return null;
        }

        $post = get_post($attachment_id);
        if (!$post instanceof \WP_Post) {
            return null;
        }

        $file = get_attached_file($attachment_id);
        $url = wp_get_attachment_url($attachment_id);
        if (!is_string($url) || $url === '') {
            return null;
        }

        $metadata = wp_get_attachment_metadata($attachment_id);
        $mime = (string) get_post_mime_type($attachment_id);
        $filename = is_string($file) && $file !== '' ? basename($file) : basename((string) wp_parse_url($url, PHP_URL_PATH));

        $width = is_array($metadata) && isset($metadata['width']) ? (int) $metadata['width'] : null;
        $height = is_array($metadata) && isset($metadata['height']) ? (int) $metadata['height'] : null;
        $available_sizes = str_starts_with($mime, 'image/') ? $this->available_image_sizes($attachment_id, $metadata, $url) : [];
        $thumbnail_url = $url;
        foreach ($available_sizes as $available_size) {
            if (($available_size['slug'] ?? '') === 'thumbnail' && is_string($available_size['url'] ?? null)) {
                $thumbnail_url = $available_size['url'];
                break;
            }
        }

        return [
            'id' => (string) $attachment_id,
            'attachmentId' => $attachment_id,
            'title' => sanitize_text_field(get_the_title($attachment_id) ?: $filename),
            'altText' => sanitize_text_field((string) get_post_meta($attachment_id, '_wp_attachment_image_alt', true)),
            'caption' => sanitize_textarea_field((string) $post->post_excerpt),
            'description' => sanitize_textarea_field((string) $post->post_content),
            'filename' => sanitize_file_name($filename),
            'url' => esc_url_raw($url),
            'mimeType' => sanitize_mime_type($mime),
            'type' => $this->mime_to_type($mime),
            'width' => $width,
            'height' => $height,
            'availableSizes' => $available_sizes,
            'thumbnailUrl' => esc_url_raw($thumbnail_url),
            'orientation' => $width && $height ? ($width === $height ? 'square' : ($width > $height ? 'landscape' : 'portrait')) : null,
            'aspectRatio' => $width && $height ? round($width / $height, 6) : null,
            'status' => sanitize_key($post->post_status),
            'accessible' => current_user_can('read_post', $attachment_id),
            'sizeBytes' => is_string($file) && is_file($file) ? (int) filesize($file) : 0,
            'createdAt' => mysql_to_rfc3339($post->post_date_gmt ?: $post->post_date),
            'modifiedAt' => mysql_to_rfc3339($post->post_modified_gmt ?: $post->post_modified),
            'source' => sanitize_key((string) (get_post_meta($attachment_id, self::META_SOURCE, true) ?: 'wp-library')),
            'projectUuid' => sanitize_text_field((string) get_post_meta($attachment_id, self::META_PROJECT_UUID, true)),
            'prompt' => sanitize_textarea_field((string) get_post_meta($attachment_id, self::META_PROMPT, true)),
            'provider' => sanitize_text_field((string) get_post_meta($attachment_id, self::META_PROVIDER, true)),
            'surface' => sanitize_key((string) get_post_meta($attachment_id, self::META_SURFACE, true)),
            'isPixflowMedia' => get_post_meta($attachment_id, self::META_PIXFLOW_MEDIA, true) === '1',
        ];
    }

    /** @return list<array{slug:string,url:string,width:?int,height:?int}> */
    private function available_image_sizes(int $attachment_id, mixed $metadata, string $full_url): array
    {
        $items = [];
        $full_width = is_array($metadata) && isset($metadata['width']) ? (int) $metadata['width'] : null;
        $full_height = is_array($metadata) && isset($metadata['height']) ? (int) $metadata['height'] : null;
        $items[] = [
            'slug' => 'full',
            'url' => esc_url_raw($full_url),
            'width' => $full_width,
            'height' => $full_height,
        ];
        $size_names = function_exists('get_intermediate_image_sizes') ? get_intermediate_image_sizes() : [];
        foreach (array_values(array_unique(array_filter((array) $size_names, 'is_string'))) as $size_name) {
            $source = wp_get_attachment_image_src($attachment_id, $size_name);
            if (!is_array($source) || !is_string($source[0] ?? null) || $source[0] === '') continue;
            $items[] = [
                'slug' => sanitize_key($size_name),
                'url' => esc_url_raw($source[0]),
                'width' => isset($source[1]) ? (int) $source[1] : null,
                'height' => isset($source[2]) ? (int) $source[2] : null,
            ];
        }
        return $items;
    }

    private function mime_to_type(string $mime): string
    {
        if (str_starts_with($mime, 'image/')) {
            return 'image';
        }
        if (str_starts_with($mime, 'video/')) {
            return 'video';
        }
        if (str_starts_with($mime, 'audio/')) {
            return 'audio';
        }
        return 'file';
    }

    private function load_media_includes(): void
    {
        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/media.php';
        require_once ABSPATH . 'wp-admin/includes/image.php';
    }
}
