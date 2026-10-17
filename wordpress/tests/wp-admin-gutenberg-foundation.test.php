<?php

declare(strict_types=1);

function assert_gutenberg_foundation(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$root = dirname(__DIR__);
$registry = (string) file_get_contents($root . '/src/Admin/WpAdminCapabilityRegistry.php');
$plane = (string) file_get_contents($root . '/src/Admin/WpAdminCapabilitySafetyPlane.php');
$core = (string) file_get_contents($root . '/src/Admin/WpAdminWordPressCapabilityService.php');
$media = (string) file_get_contents($root . '/src/Media/MediaLibraryService.php');

$required = [
    '/src/Admin/Gutenberg/WpAdminGutenbergCapabilityService.php',
    '/src/Admin/Gutenberg/GutenbergDocumentRepository.php',
    '/src/Admin/Gutenberg/GutenbergBlockRegistry.php',
    '/src/Admin/Gutenberg/GutenbergBlockTreeNormalizer.php',
    '/src/Admin/Gutenberg/GutenbergBlockTreeValidator.php',
    '/src/Admin/Gutenberg/GutenbergMediaResolver.php',
    '/src/Admin/Gutenberg/GutenbergDocumentIntegrity.php',
    '/src/Admin/Gutenberg/GutenbergIntegrationAdapterRegistry.php',
    '/src/Admin/Gutenberg/Adapters/CoreBlockAdapter.php',
];
foreach ($required as $path) {
    assert_gutenberg_foundation(is_file($root . $path), "Missing Gutenberg foundation file: {$path}");
}

foreach ([
    'pixflow/wp-admin/gutenberg/status',
    'pixflow/wp-admin/gutenberg/list-block-types',
    'pixflow/wp-admin/gutenberg/get-block-type',
    'pixflow/wp-admin/gutenberg/read-document',
    'pixflow/wp-admin/gutenberg/validate-document',
] as $capability_id) {
    assert_gutenberg_foundation(str_contains($registry, $capability_id), "Missing capability: {$capability_id}");
}

assert_gutenberg_foundation(str_contains($registry, 'pixflow-gutenberg-block-tree'), 'The registry must declare the dedicated block-tree input format.');
assert_gutenberg_foundation(str_contains($plane, 'GutenbergBlockTreeNormalizer') && str_contains($plane, 'pixflow-gutenberg-block-tree'), 'The safety plane must route block trees through their dedicated normalizer.');
assert_gutenberg_foundation(str_contains($core, 'gutenberg_content_requires_dedicated_capability'), 'Generic post mutations must reject serialized block markup.');
assert_gutenberg_foundation(str_contains($media, 'availableSizes') && str_contains($media, 'public function get('), 'Gutenberg media discovery must delegate to the shared Media Library service.');

echo "wp-admin-gutenberg-foundation: ok\n";
