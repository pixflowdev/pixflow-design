<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Admin\Gutenberg;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Exact, bounded normalizer for model-authored Gutenberg block trees.
 *
 * This deliberately does not use sanitize_text_field() or
 * sanitize_textarea_field(). Block attributes can contain significant HTML,
 * comments, whitespace, and nested JSON that must survive until the real
 * editor runtime validates and serializes it.
 */
final class GutenbergBlockTreeNormalizer
{
    private const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
    private const MAX_BLOCKS = 500;
    private const MAX_BLOCK_DEPTH = 24;
    private const MAX_ATTRIBUTE_DEPTH = 32;
    private const MAX_ATTRIBUTE_ITEMS = 1024;
    private const MAX_ATTRIBUTE_VALUES = 20000;
    private const MAX_STRING_BYTES = 512 * 1024;

    /** @return list<array<string, mixed>>|\WP_Error */
    public function normalize(mixed $value): array|\WP_Error
    {
        if (!is_array($value) || !array_is_list($value)) {
            return $this->error('gutenberg_invalid_block_tree', 'blocks must be an ordered array.', 400);
        }

        $encoded = function_exists('wp_json_encode')
            ? wp_json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
            : json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if (!is_string($encoded) || strlen($encoded) > self::MAX_DOCUMENT_BYTES) {
            return $this->error('gutenberg_document_too_large', 'The proposed block document exceeds the bounded input size.', 413);
        }

        $block_count = 0;
        $attribute_values = 0;
        $normalized = $this->normalize_blocks($value, 0, $block_count, $attribute_values, 'blocks');
        if ($normalized instanceof \WP_Error) {
            return $normalized;
        }

        return $normalized;
    }

    /**
     * @param list<mixed> $blocks
     * @return list<array<string, mixed>>|\WP_Error
     */
    private function normalize_blocks(array $blocks, int $depth, int &$block_count, int &$attribute_values, string $path): array|\WP_Error
    {
        if ($depth > self::MAX_BLOCK_DEPTH) {
            return $this->error('gutenberg_block_tree_too_deep', "{$path} exceeds the supported block nesting depth.", 400);
        }

        $out = [];
        foreach ($blocks as $index => $raw_block) {
            $block_count++;
            if ($block_count > self::MAX_BLOCKS) {
                return $this->error('gutenberg_too_many_blocks', 'The proposed document contains too many blocks.', 400);
            }
            if (!is_array($raw_block) || array_is_list($raw_block)) {
                return $this->error('gutenberg_invalid_block', "{$path}.{$index} must be a block object.", 400);
            }

            $allowed_fields = ['name', 'attributes', 'innerBlocks', 'mediaBindings'];
            foreach (array_keys($raw_block) as $field) {
                if (!in_array((string) $field, $allowed_fields, true)) {
                    return $this->error('gutenberg_unknown_block_field', "{$path}.{$index}.{$field} is not allowed in a proposed block tree.", 400);
                }
            }

            $name = $this->valid_string($raw_block['name'] ?? null, 160, "{$path}.{$index}.name");
            if ($name instanceof \WP_Error) {
                return $name;
            }
            if (preg_match('/^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/', $name) !== 1) {
                return $this->error('gutenberg_invalid_block_name', "{$path}.{$index}.name must be an exact namespace/name block identifier.", 400);
            }

            $attributes = $raw_block['attributes'] ?? [];
            if (!is_array($attributes) || (array_is_list($attributes) && $attributes !== [])) {
                return $this->error('gutenberg_invalid_attributes', "{$path}.{$index}.attributes must be an object.", 400);
            }
            $normalized_attributes = $this->normalize_attribute_value(
                $attributes,
                0,
                $attribute_values,
                "{$path}.{$index}.attributes",
            );
            if ($normalized_attributes instanceof \WP_Error) {
                return $normalized_attributes;
            }
            $normalized_attributes = $this->apply_known_block_defaults(
                $name,
                $normalized_attributes,
                "{$path}.{$index}.attributes",
            );
            if ($normalized_attributes instanceof \WP_Error) {
                return $normalized_attributes;
            }

            $inner_blocks = $raw_block['innerBlocks'] ?? [];
            if (!is_array($inner_blocks) || !array_is_list($inner_blocks)) {
                return $this->error('gutenberg_invalid_inner_blocks', "{$path}.{$index}.innerBlocks must be an ordered array.", 400);
            }
            $normalized_inner = $this->normalize_blocks(
                $inner_blocks,
                $depth + 1,
                $block_count,
                $attribute_values,
                "{$path}.{$index}.innerBlocks",
            );
            if ($normalized_inner instanceof \WP_Error) {
                return $normalized_inner;
            }

            $normalized_block = [
                'name' => $name,
                'attributes' => $normalized_attributes,
                'innerBlocks' => $normalized_inner,
            ];
            if (array_key_exists('mediaBindings', $raw_block)) {
                $bindings = $this->normalize_media_bindings($raw_block['mediaBindings'], "{$path}.{$index}.mediaBindings");
                if ($bindings instanceof \WP_Error) {
                    return $bindings;
                }
                $normalized_block['mediaBindings'] = $bindings;
            }
            $out[] = $normalized_block;
        }

        return $out;
    }

    /** @param array<string, mixed> $attributes @return array<string, mixed>|\WP_Error */
    private function apply_known_block_defaults(string $name, array $attributes, string $path): array|\WP_Error
    {
        if ($name !== 'core/table') return $attributes;
        foreach (['head', 'body', 'foot'] as $section) {
            if (!array_key_exists($section, $attributes)) continue;
            $rows = $attributes[$section];
            if (!is_array($rows) || !array_is_list($rows)) {
                return $this->error('gutenberg_invalid_table_attributes', "{$path}.{$section} must be an ordered row array.", 400);
            }
            foreach ($rows as $row_index => $row) {
                if (!is_array($row) || array_is_list($row) || !is_array($row['cells'] ?? null) || !array_is_list($row['cells'])) {
                    return $this->error('gutenberg_invalid_table_attributes', "{$path}.{$section}.{$row_index}.cells must be an ordered cell array.", 400);
                }
                foreach ($row['cells'] as $cell_index => $cell) {
                    if (!is_array($cell) || array_is_list($cell)) {
                        return $this->error('gutenberg_invalid_table_attributes', "{$path}.{$section}.{$row_index}.cells.{$cell_index} must be a cell object.", 400);
                    }
                    $tag = $cell['tag'] ?? 'td';
                    if (!is_string($tag) || !in_array($tag, ['td', 'th'], true)) {
                        return $this->error('gutenberg_invalid_table_attributes', "{$path}.{$section}.{$row_index}.cells.{$cell_index}.tag must be td or th.", 400);
                    }
                    $attributes[$section][$row_index]['cells'][$cell_index]['tag'] = $tag;
                }
            }
        }
        return $attributes;
    }

    private function normalize_attribute_value(mixed $value, int $depth, int &$value_count, string $path): mixed
    {
        $value_count++;
        if ($value_count > self::MAX_ATTRIBUTE_VALUES) {
            return $this->error('gutenberg_attributes_too_large', 'The proposed block attributes contain too many values.', 400);
        }
        if ($depth > self::MAX_ATTRIBUTE_DEPTH) {
            return $this->error('gutenberg_attributes_too_deep', "{$path} exceeds the supported attribute nesting depth.", 400);
        }
        if (is_string($value)) {
            if (strlen($value) > self::MAX_STRING_BYTES) {
                return $this->error('gutenberg_attribute_string_too_long', "{$path} is too long.", 400);
            }
            return wp_check_invalid_utf8($value);
        }
        if (is_int($value) || is_bool($value) || $value === null) {
            return $value;
        }
        if (is_float($value)) {
            return is_finite($value)
                ? $value
                : $this->error('gutenberg_invalid_number', "{$path} must be a finite number.", 400);
        }
        if (!is_array($value) || count($value) > self::MAX_ATTRIBUTE_ITEMS) {
            return $this->error('gutenberg_invalid_attribute_value', "{$path} is not a supported bounded JSON value.", 400);
        }

        $out = [];
        foreach ($value as $key => $child) {
            if (!array_is_list($value)) {
                $key = (string) $key;
                if (preg_match('/^[A-Za-z0-9_.:-]{1,128}$/', $key) !== 1) {
                    return $this->error('gutenberg_invalid_attribute_key', "{$path} contains an invalid attribute key.", 400);
                }
            }
            $normalized = $this->normalize_attribute_value($child, $depth + 1, $value_count, "{$path}.{$key}");
            if ($normalized instanceof \WP_Error) {
                return $normalized;
            }
            $out[$key] = $normalized;
        }
        if (!array_is_list($value)) {
            ksort($out);
        }
        return $out;
    }

    /** @return list<array<string, mixed>>|\WP_Error */
    private function normalize_media_bindings(mixed $value, string $path): array|\WP_Error
    {
        if (!is_array($value) || !array_is_list($value) || count($value) > 64) {
            return $this->error('gutenberg_invalid_media_bindings', "{$path} must be a bounded ordered array.", 400);
        }
        $out = [];
        foreach ($value as $index => $binding) {
            if (!is_array($binding) || array_is_list($binding)) {
                return $this->error('gutenberg_invalid_media_binding', "{$path}.{$index} must be an object.", 400);
            }
            foreach (array_keys($binding) as $field) {
                if (!in_array((string) $field, ['role', 'attachmentId', 'sizeSlug', 'altPolicy', 'altText'], true)) {
                    return $this->error('gutenberg_unknown_media_binding_field', "{$path}.{$index}.{$field} is not allowed.", 400);
                }
            }
            $role = $this->valid_slug($binding['role'] ?? null, 64, "{$path}.{$index}.role");
            if ($role instanceof \WP_Error) return $role;
            $attachment_id = $binding['attachmentId'] ?? null;
            if (is_string($attachment_id) && ctype_digit($attachment_id)) $attachment_id = (int) $attachment_id;
            if (!is_int($attachment_id) || $attachment_id < 1) {
                return $this->error('gutenberg_invalid_attachment_id', "{$path}.{$index}.attachmentId must be a positive integer.", 400);
            }
            $size_slug = $this->valid_slug($binding['sizeSlug'] ?? 'full', 64, "{$path}.{$index}.sizeSlug");
            if ($size_slug instanceof \WP_Error) return $size_slug;
            $alt_policy = $this->valid_slug($binding['altPolicy'] ?? 'use-library-alt', 40, "{$path}.{$index}.altPolicy");
            if ($alt_policy instanceof \WP_Error) return $alt_policy;
            if (!in_array($alt_policy, ['use-library-alt', 'decorative', 'empty', 'custom'], true)) {
                return $this->error('gutenberg_invalid_alt_policy', "{$path}.{$index}.altPolicy is not supported.", 400);
            }
            $normalized = [
                'role' => $role,
                'attachmentId' => $attachment_id,
                'sizeSlug' => $size_slug,
                'altPolicy' => $alt_policy,
            ];
            if ($alt_policy === 'custom') {
                $alt_text = $this->valid_string($binding['altText'] ?? null, 500, "{$path}.{$index}.altText");
                if ($alt_text instanceof \WP_Error) return $alt_text;
                $normalized['altText'] = $alt_text;
            }
            $out[] = $normalized;
        }
        return $out;
    }

    private function valid_string(mixed $value, int $max_length, string $path): string|\WP_Error
    {
        if (!is_string($value) || $value === '' || strlen($value) > $max_length) {
            return $this->error('gutenberg_invalid_string', "{$path} must be a non-empty bounded string.", 400);
        }
        return wp_check_invalid_utf8($value);
    }

    private function valid_slug(mixed $value, int $max_length, string $path): string|\WP_Error
    {
        $value = $this->valid_string($value, $max_length, $path);
        if ($value instanceof \WP_Error) return $value;
        if (preg_match('/^[a-z0-9][a-z0-9_-]*$/', $value) !== 1) {
            return $this->error('gutenberg_invalid_slug', "{$path} must be a lowercase identifier.", 400);
        }
        return $value;
    }

    private function error(string $code, string $message, int $status): \WP_Error
    {
        return new \WP_Error($code, $message, ['status' => $status, 'retryable' => false]);
    }
}
