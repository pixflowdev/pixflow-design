<?php

use PixflowDesign\WordPress\Bricks\ContentMutationService;
use PixflowDesign\WordPress\Bricks\ScopedFragmentPlacement;

if (!defined('ABSPATH')) {
    fwrite(STDERR, "Run this acceptance harness through WP-CLI eval-file.\n");
    exit(1);
}

$admin_ids = get_users([
    'role' => 'administrator',
    'fields' => 'ids',
    'number' => 1,
]);
if (!is_array($admin_ids) || $admin_ids === []) {
    throw new RuntimeException('The deterministic placement harness requires one local administrator.');
}
wp_set_current_user((int) $admin_ids[0]);

$post_id = wp_insert_post([
    'post_type' => 'page',
    'post_status' => 'draft',
    'post_title' => 'Pixflow deterministic scoped placement proof',
], true);
if (is_wp_error($post_id)) {
    throw new RuntimeException($post_id->get_error_message());
}
$post_id = (int) $post_id;

$elements = static function (array $ids): array {
    $parents = [
        'conh01' => 'cons01',
        'basc01' => 'base01',
        'finc01' => 'fina01',
    ];
    $names = [
        'hero01' => 'section',
        'cons01' => 'section',
        'conh01' => 'heading',
        'base01' => 'section',
        'basc01' => 'text-basic',
        'fina01' => 'section',
        'finc01' => 'text-basic',
    ];
    return array_map(static fn(string $id): array => [
        'id' => $id,
        'name' => $names[$id],
        'parent' => $parents[$id] ?? '',
        'children' => [],
        'settings' => str_contains($id, 'heading') || str_contains($id, 'copy')
            ? ['text' => $id]
            : [],
    ], $ids);
};

try {
    $mutations = new ContentMutationService();
    $initial = $elements(['hero01', 'cons01', 'conh01']);
    $initial_write = $mutations->set_content($post_id, 'content', $initial);
    if (($initial_write['ok'] ?? false) !== true) {
        throw new RuntimeException('Could not seed the deterministic Bricks page.');
    }

    $baseline = $elements(['base01', 'basc01']);
    $baseline_placement = ScopedFragmentPlacement::insert($initial, $baseline, [
        'mode' => 'before',
        'targetId' => 'cons01',
    ]);
    $baseline_write = $mutations->set_content($post_id, 'content', $baseline_placement['elements']);
    $baseline_saved = $mutations->get_content($post_id, 'content');
    $baseline_ids = array_column($baseline_saved['elements'] ?? [], 'id');
    if (($baseline_write['ok'] ?? false) !== true || $baseline_ids !== [
        'hero01',
        'base01',
        'basc01',
        'cons01',
        'conh01',
    ]) {
        throw new RuntimeException('The real Bricks persistence layer did not retain baseline placement.');
    }

    $final = $elements(['fina01', 'finc01']);
    $final_placement = ScopedFragmentPlacement::replace_owned(
        $baseline_saved['elements'],
        $final,
        ['base01', 'basc01'],
        ['mode' => 'before', 'targetId' => 'cons01']
    );
    $final_write = $mutations->set_content($post_id, 'content', $final_placement['elements']);
    $final_saved = $mutations->get_content($post_id, 'content');
    $final_ids = array_column($final_saved['elements'] ?? [], 'id');
    if (($final_write['ok'] ?? false) !== true || $final_ids !== [
        'hero01',
        'fina01',
        'finc01',
        'cons01',
        'conh01',
    ]) {
        throw new RuntimeException('The real Bricks persistence layer moved the final fragment out of the baseline slot.');
    }

    echo wp_json_encode([
        'ok' => true,
        'postId' => $post_id,
        'baselineOrder' => $baseline_ids,
        'finalOrder' => $final_ids,
        'finalAppliedPosition' => $final_placement['appliedPosition'],
    ], JSON_PRETTY_PRINT) . PHP_EOL;
} finally {
    wp_delete_post($post_id, true);
}
