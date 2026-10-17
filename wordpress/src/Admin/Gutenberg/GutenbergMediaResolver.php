<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Admin\Gutenberg;

use PixflowDesign\WordPress\Media\MediaLibraryService;

if (!defined('ABSPATH')) {
    exit;
}

final class GutenbergMediaResolver
{
    public function __construct(private readonly MediaLibraryService $media = new MediaLibraryService())
    {
    }

    /** @return array<string, mixed>|\WP_Error */
    public function resolve(array $binding): array|\WP_Error
    {
        $attachment_id = (int) ($binding['attachmentId'] ?? 0);
        if ($attachment_id < 1 || !current_user_can('read_post', $attachment_id)) {
            return $this->error('gutenberg_media_forbidden', 'The selected attachment is unavailable to the current user.', 403);
        }
        $item = $this->media->get($attachment_id);
        if ($item instanceof \WP_Error) return $item;
        if (($item['type'] ?? '') !== 'image') {
            return $this->error('gutenberg_media_type_unsupported', 'The selected binding requires an image attachment.', 422);
        }
        $size_slug = (string) ($binding['sizeSlug'] ?? 'full');
        $sizes = is_array($item['availableSizes'] ?? null) ? $item['availableSizes'] : [];
        $selected = null;
        foreach ($sizes as $size) {
            if (is_array($size) && ($size['slug'] ?? '') === $size_slug) {
                $selected = $size;
                break;
            }
        }
        if ($size_slug !== 'full' && $selected === null) {
            return $this->error('gutenberg_media_size_unavailable', 'The requested attachment size is unavailable.', 422);
        }
        if ($selected === null) {
            $selected = [
                'slug' => 'full',
                'url' => $item['url'] ?? '',
                'width' => $item['width'] ?? null,
                'height' => $item['height'] ?? null,
            ];
        }
        return [
            'role' => (string) ($binding['role'] ?? 'image'),
            'attachment' => $item,
            'selectedSize' => $selected,
            'altText' => match ((string) ($binding['altPolicy'] ?? 'use-library-alt')) {
                'decorative', 'empty' => '',
                'custom' => (string) ($binding['altText'] ?? ''),
                default => (string) ($item['altText'] ?? ''),
            },
        ];
    }

    /** @param list<array<string, mixed>> $blocks */
    public function resolve_tree(array $blocks): array
    {
        $resolved = [];
        $errors = [];
        $walk = function (array $items, string $path) use (&$walk, &$resolved, &$errors): void {
            foreach ($items as $index => $block) {
                if (!is_array($block)) continue;
                foreach ((array) ($block['mediaBindings'] ?? []) as $binding_index => $binding) {
                    if (!is_array($binding)) continue;
                    $result = $this->resolve($binding);
                    if ($result instanceof \WP_Error) {
                        $errors[] = [
                            'path' => "{$path}.{$index}.mediaBindings.{$binding_index}",
                            'code' => $result->get_error_code(),
                            'message' => $result->get_error_message(),
                        ];
                    } else {
                        $resolved[] = ['path' => "{$path}.{$index}.mediaBindings.{$binding_index}", ...$result];
                    }
                }
                $walk(is_array($block['innerBlocks'] ?? null) ? $block['innerBlocks'] : [], "{$path}.{$index}.innerBlocks");
            }
        };
        $walk($blocks, 'blocks');
        return ['items' => $resolved, 'errors' => $errors];
    }

    /** @param list<array<string, mixed>> $blocks */
    public function bind_tree(array $blocks): array|\WP_Error
    {
        $media = [];
        $bind = function (array $items, string $path) use (&$bind, &$media): array|\WP_Error {
            $out = [];
            foreach ($items as $index => $block) {
                if (!is_array($block)) continue;
                $name = (string) ($block['name'] ?? '');
                $attributes = is_array($block['attributes'] ?? null) ? $block['attributes'] : [];
                $inner = $bind(is_array($block['innerBlocks'] ?? null) ? $block['innerBlocks'] : [], "{$path}.{$index}.innerBlocks");
                if ($inner instanceof \WP_Error) return $inner;
                $bindings = is_array($block['mediaBindings'] ?? null) ? $block['mediaBindings'] : [];
                $resolved_bindings = [];
                foreach ($bindings as $binding_index => $binding) {
                    if (!is_array($binding)) continue;
                    $resolved = $this->resolve($binding);
                    if ($resolved instanceof \WP_Error) return $resolved;
                    $resolved_bindings[] = $resolved;
                    $media[] = ['path' => "{$path}.{$index}.mediaBindings.{$binding_index}", ...$resolved];
                }

                if ($resolved_bindings !== []) {
                    if ($name === 'core/gallery') {
                        $inner = [];
                        foreach ($resolved_bindings as $resolved) {
                            $inner[] = [
                                'name' => 'core/image',
                                'attributes' => $this->image_attributes([], $resolved),
                                'innerBlocks' => [],
                            ];
                        }
                    } elseif ($name === 'core/image') {
                        $attributes = $this->image_attributes($attributes, $resolved_bindings[0]);
                    } elseif ($name === 'core/cover') {
                        $attributes = $this->cover_attributes($attributes, $resolved_bindings[0]);
                    } elseif ($name === 'core/media-text') {
                        $attributes = $this->media_text_attributes($attributes, $resolved_bindings[0]);
                    } else {
                        return $this->error('gutenberg_media_adapter_unavailable', "{$name} does not have a certified media-binding adapter.", 422);
                    }
                }

                $out[] = ['name' => $name, 'attributes' => $attributes, 'innerBlocks' => $inner];
            }
            return $out;
        };

        $bound = $bind($blocks, 'blocks');
        return $bound instanceof \WP_Error ? $bound : ['blocks' => $bound, 'media' => $media];
    }

    /** @param array<string, mixed> $attributes @param array<string, mixed> $resolved */
    private function image_attributes(array $attributes, array $resolved): array
    {
        $attachment = (array) ($resolved['attachment'] ?? []);
        $size = (array) ($resolved['selectedSize'] ?? []);
        return array_replace($attributes, [
            'id' => (int) ($attachment['attachmentId'] ?? 0),
            'url' => (string) ($size['url'] ?? $attachment['url'] ?? ''),
            'alt' => (string) ($resolved['altText'] ?? ''),
            'sizeSlug' => (string) ($size['slug'] ?? 'full'),
            // WordPress 7.1 registers core/image width and height as strings.
            // Numeric values serialize but fail the editor's parse/validate
            // round trip, so bind the registered attribute type exactly.
            'width' => isset($size['width']) ? (string) $size['width'] : null,
            'height' => isset($size['height']) ? (string) $size['height'] : null,
        ]);
    }

    /** @param array<string, mixed> $attributes @param array<string, mixed> $resolved */
    private function cover_attributes(array $attributes, array $resolved): array
    {
        $attachment = (array) ($resolved['attachment'] ?? []);
        $size = (array) ($resolved['selectedSize'] ?? []);
        return array_replace($attributes, [
            'id' => (int) ($attachment['attachmentId'] ?? 0),
            'url' => (string) ($size['url'] ?? $attachment['url'] ?? ''),
            'alt' => (string) ($resolved['altText'] ?? ''),
            'backgroundType' => 'image',
        ]);
    }

    /** @param array<string, mixed> $attributes @param array<string, mixed> $resolved */
    private function media_text_attributes(array $attributes, array $resolved): array
    {
        $attachment = (array) ($resolved['attachment'] ?? []);
        $size = (array) ($resolved['selectedSize'] ?? []);
        return array_replace($attributes, [
            'mediaId' => (int) ($attachment['attachmentId'] ?? 0),
            'mediaUrl' => (string) ($size['url'] ?? $attachment['url'] ?? ''),
            'mediaType' => 'image',
            'mediaAlt' => (string) ($resolved['altText'] ?? ''),
        ]);
    }

    private function error(string $code, string $message, int $status): \WP_Error
    {
        return new \WP_Error($code, $message, ['status' => $status, 'retryable' => false]);
    }
}
