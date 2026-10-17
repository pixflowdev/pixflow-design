<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Admin\Gutenberg;

if (!defined('ABSPATH')) {
    exit;
}

final class GutenbergBlockTreeValidator
{
    public function __construct(
        private readonly GutenbergBlockRegistry $registry = new GutenbergBlockRegistry(),
        private readonly GutenbergIntegrationAdapterRegistry $adapters = new GutenbergIntegrationAdapterRegistry(),
        private readonly GutenbergMediaResolver $media = new GutenbergMediaResolver(),
    ) {
    }

    /** @param list<array<string, mixed>> $blocks */
    public function validate(int $post_id, array $blocks): array|\WP_Error
    {
        $listed = $this->registry->list($post_id, ['perPage' => 500]);
        if ($listed instanceof \WP_Error) return $listed;
        $types = [];
        foreach ((array) ($listed['items'] ?? []) as $item) {
            if (is_array($item) && is_string($item['name'] ?? null)) $types[$item['name']] = $item;
        }
        $errors = [];
        $warnings = [];
        $support = [];
        $block_count = 0;
        $walk = function (array $items, ?string $parent, array $ancestors, string $path) use (&$walk, &$errors, &$warnings, &$support, &$block_count, $types): void {
            foreach ($items as $index => $block) {
                if (!is_array($block)) continue;
                $block_count++;
                $name = (string) ($block['name'] ?? '');
                $block_path = "{$path}.{$index}";
                $type = $types[$name] ?? null;
                $level = $this->adapters->support($name);
                $support[$name] = $level;
                if (!is_array($type)) {
                    if (($level['allowed'] ?? true) !== true) {
                        $errors[] = ['path' => $block_path, 'code' => 'integration_unavailable', 'message' => "{$name} requires an active, compatible integration version."];
                    } else {
                        $warnings[] = ['path' => $block_path, 'code' => 'browser_registration_required', 'message' => "{$name} is not server-registered and must be discovered in the actual target editor."];
                    }
                } else {
                    $required_parents = (array) ($type['parent'] ?? []);
                    if ($required_parents !== [] && ($parent === null || !in_array($parent, $required_parents, true))) {
                        $errors[] = ['path' => $block_path, 'code' => 'parent_constraint', 'message' => "{$name} is not allowed under the proposed parent."];
                    }
                    $required_ancestors = (array) ($type['ancestor'] ?? []);
                    if ($required_ancestors !== [] && array_intersect($required_ancestors, $ancestors) === []) {
                        $errors[] = ['path' => $block_path, 'code' => 'ancestor_constraint', 'message' => "{$name} requires a missing ancestor."];
                    }
                    if ($parent !== null && is_array($types[$parent] ?? null)) {
                        $allowed = (array) ($types[$parent]['allowedBlocks'] ?? []);
                        if ($allowed !== [] && !in_array($name, $allowed, true)) {
                            $errors[] = ['path' => $block_path, 'code' => 'allowed_blocks_constraint', 'message' => "{$name} is not allowed by its proposed parent."];
                        }
                    }
                    $attribute_errors = $this->validate_attributes((array) ($block['attributes'] ?? []), (array) ($type['attributes'] ?? []), $block_path);
                    $errors = [...$errors, ...$attribute_errors];
                }
                if (($level['certified'] ?? false) !== true) {
                    $warnings[] = ['path' => $block_path, 'code' => 'browser_validation_required', 'message' => "{$name} is not adapter-certified and requires validation in the target editor runtime."];
                }
                $walk(
                    is_array($block['innerBlocks'] ?? null) ? $block['innerBlocks'] : [],
                    $name,
                    [...$ancestors, $name],
                    "{$block_path}.innerBlocks",
                );
            }
        };
        $walk($blocks, null, [], 'blocks');

        $media = $this->media->resolve_tree($blocks);
        $errors = [...$errors, ...(array) ($media['errors'] ?? [])];
        ksort($support);

        return [
            'schema' => 'pixflow.wp-admin.gutenberg-validation.v1',
            'postId' => $post_id,
            'valid' => $errors === [],
            'blockCount' => $block_count,
            'errors' => $errors,
            'warnings' => $warnings,
            'support' => $support,
            'media' => (array) ($media['items'] ?? []),
            'requiresBrowserValidation' => true,
            'treeHash' => 'sha256:' . hash('sha256', (string) wp_json_encode($blocks, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)),
        ];
    }

    /** @return list<array<string, string>> */
    private function validate_attributes(array $attributes, array $schema, string $block_path): array
    {
        $errors = [];
        foreach ($attributes as $key => $value) {
            $definition = is_array($schema[$key] ?? null) ? $schema[$key] : null;
            if ($definition === null) {
                $errors[] = ['path' => "{$block_path}.attributes.{$key}", 'code' => 'unknown_attribute', 'message' => "{$key} is not declared by the current block registration."];
                continue;
            }
            $type = (string) ($definition['type'] ?? '');
            $valid = match ($type) {
                'string' => is_string($value),
                'number' => is_int($value) || is_float($value),
                'integer' => is_int($value),
                'boolean' => is_bool($value),
                'array' => is_array($value) && array_is_list($value),
                'object' => is_array($value) && (!array_is_list($value) || $value === []),
                'null' => $value === null,
                default => true,
            };
            if (!$valid) $errors[] = ['path' => "{$block_path}.attributes.{$key}", 'code' => 'attribute_type', 'message' => "{$key} does not match the current registered attribute type."];
        }
        return $errors;
    }
}
