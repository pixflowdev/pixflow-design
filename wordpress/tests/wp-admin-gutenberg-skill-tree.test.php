<?php

declare(strict_types=1);

$root = dirname(__DIR__);
define('ABSPATH', $root . '/');
$manifest = require $root . '/resources/mcp-skills/wp-admin/manifest.php';
$by_id = [];
foreach ($manifest as $entry) {
    if (is_array($entry) && isset($entry['id'])) $by_id[(string) $entry['id']] = $entry;
}

$required = [
    'wordpress-gutenberg-authoring',
    'wordpress-gutenberg-route-intent',
    'wordpress-gutenberg-context-exact-read',
    'wordpress-gutenberg-registry-block-schema',
    'wordpress-gutenberg-author-create-article',
    'wordpress-gutenberg-author-contextual-edit',
    'wordpress-gutenberg-author-metadata-preservation',
    'wordpress-gutenberg-blocks-text',
    'wordpress-gutenberg-blocks-media',
    'wordpress-gutenberg-blocks-layout',
    'wordpress-gutenberg-blocks-dynamic',
    'wordpress-gutenberg-media-bindings',
    'wordpress-gutenberg-prepare-canonicalize',
    'wordpress-gutenberg-prepare-repair',
    'wordpress-gutenberg-apply-transaction',
    'wordpress-gutenberg-compatibility-support-levels',
    'wordpress-gutenberg-compatibility-third-party',
    'wordpress-gutenberg-resources-boundary',
];

foreach ($required as $id) {
    if (!isset($by_id[$id])) throw new RuntimeException("Missing Gutenberg skill leaf: {$id}");
    $file = $root . '/resources/mcp-skills/wp-admin/' . (string) ($by_id[$id]['file'] ?? '');
    if (!is_readable($file) || trim((string) file_get_contents($file)) === '') {
        throw new RuntimeException("Unreadable Gutenberg skill leaf: {$id}");
    }
}

$all = '';
foreach ($required as $id) {
    $all .= "\n" . (string) file_get_contents($root . '/resources/mcp-skills/wp-admin/' . $by_id[$id]['file']);
}
foreach (['preserve', 'replace', 'clear', 'target editor', 'server', 'rollback', 'runtime validated'] as $needle) {
    if (stripos($all, $needle) === false) throw new RuntimeException("Missing Gutenberg tree invariant: {$needle}");
}

if (preg_match('/execute\s+(?:arbitrary\s+)?php|wp-cli|generic third-party ability proxy/i', $all)) {
    throw new RuntimeException('The Gutenberg skill tree crossed the typed capability boundary.');
}

echo "WP Admin Gutenberg skill tree tests passed\n";
