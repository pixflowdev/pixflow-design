<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Admin\Gutenberg;

if (!defined('ABSPATH')) {
    exit;
}

final class GutenbergBlockRegistry
{
    public function __construct(
        private readonly GutenbergDocumentRepository $documents = new GutenbergDocumentRepository(),
        private readonly GutenbergIntegrationAdapterRegistry $adapters = new GutenbergIntegrationAdapterRegistry(),
    ) {
    }

    public function status(int $post_id): array|\WP_Error
    {
        $status = $this->documents->target_status($post_id);
        if ($status instanceof \WP_Error) return $status;
        return [
            'schema' => 'pixflow.wp-admin.gutenberg-status.v1',
            ...$status,
            'serverRegisteredBlockCount' => count($this->registered()),
            'certifiedCoreBlocks' => $this->adapters->certified_blocks(),
            'supportModel' => 'per_block_and_version',
            'abilityTree' => [
                'schema' => 'pixflow.wp-admin.gutenberg-ability-tree.v1',
                'revision' => '2026-08-29.1',
                'rootSkillId' => 'wordpress-gutenberg-authoring',
                'progressive' => true,
            ],
            'schemaAuthorities' => [
                ['priority' => 1, 'source' => 'target_post_editor_registry'],
                ['priority' => 2, 'source' => 'installed_wordpress_server_registry', 'version' => sanitize_text_field((string) get_bloginfo('version'))],
                ['priority' => 3, 'source' => 'installed_plugin_block_metadata'],
                ['priority' => 4, 'source' => 'pixflow_versioned_certification_fixtures'],
            ],
        ];
    }

    /** @return array<string, mixed>|\WP_Error */
    public function list(int $post_id, array $arguments = []): array|\WP_Error
    {
        $status = $this->status($post_id);
        if ($status instanceof \WP_Error) return $status;
        if (empty($status['usesBlockEditor'])) {
            return $this->error('gutenberg_editor_unavailable', 'The target does not use the WordPress Block Editor.', 422);
        }
        $search = strtolower(trim((string) ($arguments['search'] ?? '')));
        $per_page = max(1, min((int) ($arguments['perPage'] ?? 200), 500));
        $items = [];
        foreach ($this->registered() as $name => $block) {
            $item = $this->public_type($name, $block);
            if ($search !== '' && !str_contains(strtolower($name . ' ' . ($item['title'] ?? '')), $search)) continue;
            $items[] = $item;
            if (count($items) >= $per_page) break;
        }
        return [
            'schema' => 'pixflow.wp-admin.gutenberg-block-types.v1',
            'postId' => $post_id,
            'items' => $items,
            'serverRegistryOnly' => true,
            'browserDiscoveryRequired' => true,
        ];
    }

    /** @return array<string, mixed>|\WP_Error */
    public function get(int $post_id, string $name): array|\WP_Error
    {
        $status = $this->status($post_id);
        if ($status instanceof \WP_Error) return $status;
        $registered = $this->registered();
        if (!isset($registered[$name])) {
            return [
                'schema' => 'pixflow.wp-admin.gutenberg-block-type.v1',
                'postId' => $post_id,
                'block' => null,
                'requestedName' => $name,
                'serverRegistryOnly' => true,
                'browserDiscoveryRequired' => true,
            ];
        }
        return [
            'schema' => 'pixflow.wp-admin.gutenberg-block-type.v1',
            'postId' => $post_id,
            'block' => $this->public_type($name, $registered[$name]),
            'serverRegistryOnly' => true,
            'browserDiscoveryRequired' => true,
        ];
    }

    /** @return array<string, object> */
    private function registered(): array
    {
        if (!class_exists('WP_Block_Type_Registry')) return [];
        $registry = \WP_Block_Type_Registry::get_instance();
        $all = method_exists($registry, 'get_all_registered') ? $registry->get_all_registered() : [];
        if (!is_array($all)) return [];
        ksort($all);
        return $all;
    }

    /** @return array<string, mixed> */
    private function public_type(string $name, object $block): array
    {
        $support = $this->adapters->support($name);
        $string_list = static fn(mixed $value): array => array_values(array_filter(
            array_map(static fn(mixed $item): string => sanitize_text_field((string) $item), (array) $value),
            static fn(string $item): bool => $item !== '',
        ));
        return [
            'name' => $name,
            'title' => sanitize_text_field((string) ($block->title ?? $name)),
            'description' => sanitize_textarea_field((string) ($block->description ?? '')),
            'category' => sanitize_key((string) ($block->category ?? '')),
            'apiVersion' => (int) ($block->api_version ?? 1),
            'attributes' => is_array($block->attributes ?? null) ? $block->attributes : [],
            'supports' => is_array($block->supports ?? null) ? $block->supports : [],
            'parent' => array_values(array_filter((array) ($block->parent ?? []), 'is_string')),
            'ancestor' => array_values(array_filter((array) ($block->ancestor ?? []), 'is_string')),
            'allowedBlocks' => array_values(array_filter((array) ($block->allowed_blocks ?? []), 'is_string')),
            'usesContext' => array_values(array_filter((array) ($block->uses_context ?? []), 'is_string')),
            'providesContext' => is_array($block->provides_context ?? null) ? $block->provides_context : [],
            'selectors' => is_array($block->selectors ?? null) ? $block->selectors : [],
            'blockHooks' => is_array($block->block_hooks ?? null) ? $block->block_hooks : [],
            'isDynamic' => is_callable($block->render_callback ?? null),
            'assetHandles' => [
                'editorScripts' => $string_list($block->editor_script_handles ?? []),
                'scripts' => $string_list($block->script_handles ?? []),
                'viewScripts' => $string_list($block->view_script_handles ?? []),
                'viewScriptModules' => $string_list($block->view_script_module_ids ?? []),
                'editorStyles' => $string_list($block->editor_style_handles ?? []),
                'styles' => $string_list($block->style_handles ?? []),
            ],
            'serverRegistered' => true,
            'schemaSource' => [
                'authority' => 'installed_wordpress_registry',
                'wordpressVersion' => sanitize_text_field((string) get_bloginfo('version')),
            ],
            'support' => $support,
        ];
    }

    private function error(string $code, string $message, int $status): \WP_Error
    {
        return new \WP_Error($code, $message, ['status' => $status, 'retryable' => false]);
    }
}
