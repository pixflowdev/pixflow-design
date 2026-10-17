<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Admin\Gutenberg;

if (!defined('ABSPATH')) {
    exit;
}

/** Exact, read-only Gutenberg documents with explicit inline/chunked delivery. */
final class GutenbergDocumentRepository
{
    private const INLINE_CONTENT_BYTES = 96 * 1024;
    private const CHUNK_TARGET_BYTES = 64 * 1024;

    public function __construct(private readonly GutenbergReadSnapshotStore $snapshots = new GutenbergReadSnapshotStore())
    {
    }

    /** @return array<string, mixed>|\WP_Error */
    public function target_status(int $post_id): array|\WP_Error
    {
        $post = $post_id > 0 ? get_post($post_id) : null;
        if (!$post instanceof \WP_Post) return $this->error('gutenberg_post_not_found', 'The target post was not found.', 404);
        if (!current_user_can('read_post', $post_id)) return $this->error('gutenberg_target_forbidden', 'The current user cannot read the target post.', 403);
        if ($this->builder_owned($post)) return $this->error('gutenberg_builder_owned_target', 'Builder-managed content requires its dedicated capability.', 422);
        $supports_editor = post_type_supports($post->post_type, 'editor');
        $uses_block_editor = $supports_editor;
        if (function_exists('use_block_editor_for_post')) $uses_block_editor = (bool) use_block_editor_for_post($post);
        elseif (function_exists('use_block_editor_for_post_type')) $uses_block_editor = (bool) use_block_editor_for_post_type($post->post_type);
        return [
            'postId' => (int) $post->ID,
            'postType' => sanitize_key($post->post_type),
            'status' => sanitize_key($post->post_status),
            'supportsEditor' => $supports_editor,
            'usesBlockEditor' => $uses_block_editor,
            'editable' => current_user_can('edit_post', $post_id),
            'fingerprint' => $this->fingerprint_for_post($post),
            'contentFingerprint' => 'sha256:' . hash('sha256', (string) $post->post_content),
            'modifiedGmt' => sanitize_text_field($post->post_modified_gmt),
            'browserDiscoveryRequired' => true,
        ];
    }

    /** @param array<string,mixed> $arguments @param array<string,mixed> $binding @return array<string, mixed>|\WP_Error */
    public function read(int $post_id, array $arguments = [], array $binding = []): array|\WP_Error
    {
        if (is_string($arguments['snapshotId'] ?? null) && (string) $arguments['snapshotId'] !== '') {
            return $this->snapshots->chunk((string) $arguments['snapshotId'], (int) ($arguments['cursor'] ?? 0), $post_id, $binding, $this->fingerprint($post_id));
        }
        $status = $this->target_status($post_id);
        if ($status instanceof \WP_Error) return $status;
        if (empty($status['supportsEditor']) || empty($status['usesBlockEditor'])) return $this->error('gutenberg_editor_unavailable', 'The target does not use the WordPress Block Editor.', 422);
        $post = get_post($post_id);
        if (!$post instanceof \WP_Post) return $this->error('gutenberg_post_not_found', 'The target post was not found.', 404);
        $content = wp_check_invalid_utf8((string) $post->post_content);
        $parsed = function_exists('parse_blocks') ? parse_blocks($content) : [];
        $parsed = is_array($parsed) ? $parsed : [];
        $blocks = $this->public_blocks($parsed);
        $document = $this->document_evidence($post, $content, $parsed, $blocks);
        $identity = is_array($binding['contextIdentity'] ?? null) ? $binding['contextIdentity'] : [];
        $document['contextIdentity'] = $identity;
        $document['contextRevision'] = sanitize_text_field((string) ($identity['contextRevision'] ?? ''));
        $document['readAuthority'] = [
            'sessionId' => sanitize_text_field((string) ($binding['sessionId'] ?? '')),
            'conversationId' => sanitize_text_field((string) ($binding['conversationId'] ?? '')),
            'sourceMessageId' => sanitize_text_field((string) ($binding['sourceMessageId'] ?? '')),
            'tabId' => sanitize_text_field((string) ($binding['tabId'] ?? '')),
        ];
        if (strlen($content) <= self::INLINE_CONTENT_BYTES) {
            return [...$document, 'readMode' => 'inline', 'contentRaw' => $content, 'contentComplete' => true, 'contentTruncated' => false, 'blockTreeComplete' => true, 'blocks' => $blocks];
        }
        $chunk_set = $this->chunks($content, $parsed);
        $snapshot = $this->snapshots->create($post, $document, $chunk_set, $binding);
        if ($snapshot instanceof \WP_Error) return $snapshot;
        return [
            ...$document, 'readMode' => 'chunked', 'contentRaw' => null, 'contentComplete' => false,
            'contentTruncated' => false, 'blockTreeComplete' => false, 'blocks' => [],
            'snapshotId' => $snapshot['snapshotId'], 'chunkCount' => $snapshot['chunkCount'],
            'chunkBoundaryType' => $snapshot['chunkBoundaryType'], 'nextCursor' => 0,
            'snapshotExpiresAt' => $snapshot['expiresAt'], 'omitted' => ['contentRaw', 'blocks'],
        ];
    }

    public function fingerprint(int $post_id): string
    {
        $post = $post_id > 0 ? get_post($post_id) : null;
        return $post instanceof \WP_Post ? $this->fingerprint_for_post($post) : '';
    }

    private function fingerprint_for_post(\WP_Post $post): string
    {
        $payload = [
            'id' => (int) $post->ID, 'type' => (string) $post->post_type, 'modifiedGmt' => (string) $post->post_modified_gmt,
            'title' => (string) $post->post_title, 'excerpt' => (string) $post->post_excerpt, 'status' => (string) $post->post_status,
            'contentSha256' => hash('sha256', (string) $post->post_content), 'terms' => $this->terms($post),
            'featuredMediaId' => (int) get_post_thumbnail_id($post->ID),
        ];
        return 'sha256:' . hash('sha256', (string) wp_json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    }

    /** @param list<array<string,mixed>> $parsed @param list<array<string,mixed>> $blocks @return array<string,mixed> */
    private function document_evidence(\WP_Post $post, string $content, array $parsed, array $blocks): array
    {
        $inventory = [];
        $inline_media = [];
        $this->collect_evidence($blocks, [], $inventory, $inline_media, (int) get_post_thumbnail_id($post->ID));
        ksort($inventory);
        $inventory_rows = [];
        foreach ($inventory as $name => $count) $inventory_rows[] = ['name' => $name, 'count' => $count];
        return [
            'schema' => 'pixflow.wp-admin.gutenberg-read.v2', 'version' => 2,
            'post' => [
                'id' => (int) $post->ID, 'type' => sanitize_key($post->post_type),
                'title' => wp_check_invalid_utf8($post->post_title), 'excerpt' => wp_check_invalid_utf8($post->post_excerpt),
                'status' => sanitize_key($post->post_status), 'slug' => sanitize_title($post->post_name),
                'authorId' => (int) $post->post_author, 'dateGmt' => sanitize_text_field((string) $post->post_date_gmt),
                'modifiedGmt' => sanitize_text_field($post->post_modified_gmt),
                'featuredMediaId' => (int) get_post_thumbnail_id($post->ID), 'terms' => $this->terms($post),
            ],
            'document' => [
                'source' => 'persisted_wordpress', 'contentSha256' => 'sha256:' . hash('sha256', $content),
                'serializedBytes' => strlen($content), 'topLevelBlockCount' => count($parsed),
                'totalBlockCount' => $this->count_parsed_blocks($parsed), 'namedBlockCount' => $this->count_named_blocks($blocks),
                'editableTopLevelBlockCount' => count($blocks), 'editableTotalBlockCount' => $this->count_blocks($blocks),
            ],
            'inlineMedia' => $inline_media, 'blockTypeInventory' => $inventory_rows,
            'fingerprint' => $this->fingerprint_for_post($post), 'contentFingerprint' => 'sha256:' . hash('sha256', $content),
            'readAt' => gmdate('c'),
        ];
    }

    /** @param list<array<string,mixed>> $blocks @return list<array<string,mixed>> */
    private function public_blocks(array $blocks): array
    {
        $out = [];
        foreach ($blocks as $block) {
            if (!is_array($block)) continue;
            $public = $this->public_block($block);
            if (is_array($public)) $out[] = $public;
        }
        return $out;
    }

    /** @param array<string,mixed> $block */
    private function public_block(array $block): ?array
    {
        $name = is_string($block['blockName'] ?? null) ? (string) $block['blockName'] : '';
        if ($name === '') {
            $content = wp_check_invalid_utf8((string) ($block['innerHTML'] ?? ''));
            if (trim($content) === '') return null;
            return ['name' => 'core/freeform', 'attributes' => ['content' => $content], 'innerBlocks' => []];
        }
        return [
            'name' => $name,
            'attributes' => is_array($block['attrs'] ?? null) ? $block['attrs'] : [],
            'innerBlocks' => $this->public_blocks(is_array($block['innerBlocks'] ?? null) ? $block['innerBlocks'] : []),
        ];
    }

    /** @param list<array<string,mixed>> $blocks @param list<int> $path @param array<string,int> $inventory @param list<array<string,mixed>> $media */
    private function collect_evidence(array $blocks, array $path, array &$inventory, array &$media, int $featured_id): void
    {
        foreach ($blocks as $index => $block) {
            $block_path = [...$path, $index];
            $name = (string) ($block['name'] ?? 'core/freeform');
            $inventory[$name] = ($inventory[$name] ?? 0) + 1;
            $attrs = is_array($block['attributes'] ?? null) ? $block['attributes'] : [];
            $ids = [];
            if (in_array($name, ['core/image', 'core/cover', 'core/media-text'], true) && (int) ($attrs['id'] ?? $attrs['mediaId'] ?? 0) > 0) $ids[] = (int) ($attrs['id'] ?? $attrs['mediaId']);
            if ($name === 'core/gallery' && is_array($attrs['ids'] ?? null)) $ids = array_merge($ids, array_map('intval', $attrs['ids']));
            foreach (array_values(array_unique(array_filter($ids))) as $attachment_id) {
                $media[] = [
                    'attachmentId' => $attachment_id, 'blockPath' => $block_path,
                    'role' => $name === 'core/gallery' ? 'gallery_image' : 'image',
                    'sizeSlug' => is_string($attrs['sizeSlug'] ?? null) ? sanitize_key((string) $attrs['sizeSlug']) : null,
                    'alt' => is_string($attrs['alt'] ?? null) ? wp_check_invalid_utf8((string) $attrs['alt']) : null,
                    'alsoFeatured' => $featured_id > 0 && $attachment_id === $featured_id,
                ];
            }
            $this->collect_evidence(is_array($block['innerBlocks'] ?? null) ? $block['innerBlocks'] : [], $block_path, $inventory, $media, $featured_id);
        }
    }

    /** @param list<array<string,mixed>> $parsed @return array{boundaryType:string,chunks:list<array<string,mixed>>} */
    private function chunks(string $content, array $parsed): array
    {
        $fragments = [];
        $fragment_blocks = [];
        if (function_exists('serialize_block')) foreach ($parsed as $block) if (is_array($block)) {
            $fragments[] = (string) serialize_block($block);
            $public = $this->public_block($block);
            $fragment_blocks[] = is_array($public) ? [$public] : [];
        }
        $boundary = implode('', $fragments) === $content ? 'top_level_blocks' : 'utf8_bytes';
        if ($boundary === 'utf8_bytes') {
            $fragments = [];
            $fragment_blocks = [];
            for ($offset = 0, $length = strlen($content); $offset < $length;) {
                $size = min(self::CHUNK_TARGET_BYTES, $length - $offset);
                while ($size > 0 && !preg_match('//u', substr($content, $offset, $size))) $size--;
                if ($size < 1) $size = min(self::CHUNK_TARGET_BYTES, $length - $offset);
                $fragments[] = substr($content, $offset, $size); $offset += $size;
            }
        }
        $chunks = []; $buffer = ''; $chunk_blocks = []; $start = 0; $cursor = 0; $semantic_cursor = 0;
        foreach ($fragments as $fragment_index => $fragment) {
            if ($buffer !== '' && strlen($buffer) + strlen($fragment) > self::CHUNK_TARGET_BYTES) {
                $chunks[] = $this->chunk_record($buffer, $start, max($start, $semantic_cursor - 1), $chunk_blocks);
                $buffer = ''; $chunk_blocks = []; $start = $semantic_cursor;
            }
            $buffer .= $fragment;
            $current_blocks = $boundary === 'top_level_blocks' ? (array) ($fragment_blocks[$fragment_index] ?? []) : [];
            $chunk_blocks = [...$chunk_blocks, ...$current_blocks];
            $semantic_cursor += count($current_blocks);
            $cursor++;
        }
        if ($buffer !== '' || $chunks === []) $chunks[] = $this->chunk_record($buffer, $start, max($start, $semantic_cursor - 1), $chunk_blocks);
        return ['boundaryType' => $boundary, 'chunks' => $chunks];
    }

    /** @param list<array<string,mixed>> $blocks @return array<string,mixed> */
    private function chunk_record(string $fragment, int $start, int $end, array $blocks): array
    {
        return ['topLevelStart' => $start, 'topLevelEnd' => $end, 'contentFragment' => $fragment, 'blocks' => $blocks, 'chunkSha256' => 'sha256:' . hash('sha256', $fragment)];
    }

    /** @return array<string, list<int>> */
    private function terms(\WP_Post $post): array
    {
        $out = [];
        foreach (get_object_taxonomies($post->post_type, 'objects') as $taxonomy => $object) {
            if (!$object instanceof \WP_Taxonomy || empty($object->show_ui)) continue;
            $ids = wp_get_post_terms($post->ID, (string) $taxonomy, ['fields' => 'ids']);
            if (is_array($ids) && $ids !== []) $out[sanitize_key((string) $taxonomy)] = array_values(array_map('intval', $ids));
        }
        ksort($out); return $out;
    }

    /** @param list<array<string,mixed>> $blocks */
    private function count_blocks(array $blocks): int { $count = 0; foreach ($blocks as $block) { $count++; $count += $this->count_blocks(is_array($block['innerBlocks'] ?? null) ? $block['innerBlocks'] : []); } return $count; }
    /** @param list<array<string,mixed>> $blocks */
    private function count_parsed_blocks(array $blocks): int { $count = 0; foreach ($blocks as $block) { if (!is_array($block)) continue; $count++; $count += $this->count_parsed_blocks(is_array($block['innerBlocks'] ?? null) ? $block['innerBlocks'] : []); } return $count; }
    /** @param list<array<string,mixed>> $blocks */
    private function count_named_blocks(array $blocks): int { $count = 0; foreach ($blocks as $block) { if (($block['name'] ?? 'core/freeform') !== 'core/freeform') $count++; $count += $this->count_named_blocks(is_array($block['innerBlocks'] ?? null) ? $block['innerBlocks'] : []); } return $count; }
    private function builder_owned(\WP_Post $post): bool
    {
        if (str_contains(strtolower($post->post_type), 'bricks')) return true;
        foreach (['_bricks_page_content_2', '_bricks_page_header_2', '_bricks_page_footer_2', '_elementor_data', '_breakdance_data', '_fl_builder_data'] as $key) {
            if (get_post_meta($post->ID, $key, true) !== '') return true;
        }
        // Etch uses both its own block namespace and metadata on core blocks.
        // Parse attributes so metadata key order and nested blocks do not matter.
        $pending = parse_blocks($post->post_content);
        while ($pending) {
            $block = array_pop($pending);
            if (str_starts_with((string) ($block['blockName'] ?? ''), 'etch/') || isset($block['attrs']['metadata']['etch'])) return true;
            foreach (($block['innerBlocks'] ?? []) as $child) $pending[] = $child;
        }
        return false;
    }
    private function error(string $code, string $message, int $status): \WP_Error { return new \WP_Error($code, $message, ['status' => $status, 'retryable' => false]); }
}
