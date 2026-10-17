<?php

declare(strict_types=1);

/** Phase 6 red specifications at the WordPress memory authority boundary. */

function assert_phase6_memory(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$root = dirname(__DIR__);
$memory = (string) file_get_contents($root . '/src/Od/MemoryService.php');
$routes = (string) file_get_contents($root . '/src/Http/RestController.php');

assert_phase6_memory(str_contains($memory, 'MAX_LIST_LIMIT') && str_contains($memory, 'nextCursor') && str_contains($memory, 'decode_cursor'), 'WP memory listing must be bounded and cursor-paginated.');
assert_phase6_memory(str_contains($memory, 'memory_version_conflict') && str_contains($memory, 'expectedVersion') && str_contains($memory, 'etag'), 'Memory writes must use optimistic version/ETag protection.');
assert_phase6_memory(str_contains($memory, 'deletedAt') && str_contains($memory, 'RETENTION_MS'), 'Memory deletion must be explicit soft-delete with retention.');
assert_phase6_memory(str_contains($memory, 'candidates') && str_contains($memory, 'safe_memory_text') && !str_contains($memory, 'wp_memory_llm_extraction_not_implemented'), 'Structured model-led extraction must validate content and no longer be an unimplemented skip.');
assert_phase6_memory(str_contains($memory, 'api[_ -]?key') && str_contains($memory, 'approval[_ -]?token'), 'Memory extraction must reject credential and approval-token content.');
assert_phase6_memory(str_contains($routes, "get_param('cursor')") && str_contains($routes, '409'), 'REST memory routes must expose bounded cursors and version conflicts.');

echo "wp-admin-memory-boundary: ok\n";
