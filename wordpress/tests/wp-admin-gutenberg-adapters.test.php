<?php

declare(strict_types=1);

define('ABSPATH', __DIR__);

function get_bloginfo(string $key): string { return $key === 'version' ? '6.8.2' : ''; }
function clean_post_cache(int $post_id): void { $GLOBALS['pixflow_gutenberg_cleaned'] = $post_id; }
function do_action(string $hook, mixed ...$arguments): void { $GLOBALS['pixflow_gutenberg_hook'] = [$hook, $arguments]; }

require_once dirname(__DIR__) . '/src/autoload.php';
require_once dirname(__DIR__) . '/src/Admin/Gutenberg/Adapters/CoreBlockAdapter.php';

require_once dirname(__DIR__) . '/src/Admin/Gutenberg/GutenbergIntegrationAdapterRegistry.php';

use PixflowDesign\WordPress\Admin\Gutenberg\GutenbergIntegrationAdapterRegistry;

function assert_adapter(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$registry = new GutenbergIntegrationAdapterRegistry();
assert_adapter(($registry->support('core/paragraph')['certified'] ?? false) === true, 'A standard core article block must be certified.');

$evidence = $registry->post_commit(42, ['core/paragraph' => $registry->support('core/paragraph')]);
assert_adapter(($evidence['cacheCleared'] ?? false) === true && ($GLOBALS['pixflow_gutenberg_cleaned'] ?? 0) === 42, 'Post-commit cache invalidation evidence is missing.');
assert_adapter(($GLOBALS['pixflow_gutenberg_hook'][0] ?? '') === 'pixflow_design_gutenberg_document_applied', 'The bounded integration post-commit hook did not run.');

echo "wp-admin-gutenberg-adapters: ok\n";
