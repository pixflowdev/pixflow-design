<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Admin\Gutenberg;

use PixflowDesign\WordPress\Admin\Gutenberg\Adapters\CoreBlockAdapter;

if (!defined('ABSPATH')) {
    exit;
}

final class GutenbergIntegrationAdapterRegistry
{
    public function __construct(
        private readonly CoreBlockAdapter $core = new CoreBlockAdapter(),
    ) {}

    /** @return array<string,mixed> */
    public function support(string $block_name): array
    {
        $contribution = GutenbergExtensions::support($block_name);
        if ($contribution !== null) return $contribution;
        $core = $this->core->support($block_name);
        if ($core['level'] !== 'not_applicable') {
            return $core;
        }
        return [
            'level' => 'runtime_validation_required',
            'adapter' => null,
            'certified' => false,
            'allowed' => true,
        ];
    }

    /** @return list<string> */
    public function certified_blocks(): array
    {
        return $this->core->certified_blocks();
    }

    /** @return array<string, mixed> */
    public function post_commit(int $post_id, array $support): array
    {
        clean_post_cache($post_id);
        do_action('pixflow_design_gutenberg_document_applied', $post_id, $support);
        return ['postId' => $post_id, 'cacheCleared' => true, 'saveHooksRan' => true, 'support' => $support];
    }
}
