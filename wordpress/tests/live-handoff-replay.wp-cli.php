<?php

use PixflowDesign\WordPress\Bricks\ContentArea;
use PixflowDesign\WordPress\Mcp\HtmlInitialInsertService;

if (!defined('ABSPATH')) {
    fwrite(STDERR, "Run this acceptance harness through WP-CLI eval-file.\n");
    exit(1);
}

$handoff_dir = rtrim((string) getenv('PIXFLOW_HANDOFF_DIR'), "\\/");
$source_post_id = max(0, (int) getenv('PIXFLOW_SOURCE_POST_ID'));
$target_id = trim((string) getenv('PIXFLOW_TARGET_ELEMENT_ID'));
if ($handoff_dir === '' || $source_post_id <= 0 || $target_id === '') {
    throw new RuntimeException('PIXFLOW_HANDOFF_DIR, PIXFLOW_SOURCE_POST_ID, and PIXFLOW_TARGET_ELEMENT_ID are required.');
}

$read_json = static function (string $filename) use ($handoff_dir): array {
    $path = $handoff_dir . DIRECTORY_SEPARATOR . $filename;
    $decoded = json_decode((string) file_get_contents($path), true);
    if (!is_array($decoded)) {
        throw new RuntimeException(sprintf('Could not read %s.', $path));
    }

    return $decoded;
};

$admin_ids = get_users([
    'role' => 'administrator',
    'fields' => 'ids',
    'number' => 1,
]);
if (!is_array($admin_ids) || $admin_ids === []) {
    throw new RuntimeException('The replay harness requires one local administrator.');
}
wp_set_current_user((int) $admin_ids[0]);

$post_id = wp_insert_post([
    'post_type' => 'page',
    'post_status' => 'draft',
    'post_title' => 'Pixflow saved handoff replay proof',
], true);
if (is_wp_error($post_id)) {
    throw new RuntimeException($post_id->get_error_message());
}
$post_id = (int) $post_id;

$areas = new ContentArea();
$global_classes_before = get_option('bricks_global_classes', []);

try {
    $source_elements = $areas->read($source_post_id, 'content');
    $source_root_ids = [];
    foreach ($source_elements as $element) {
        if (!is_array($element)) {
            continue;
        }
        $parent = trim((string) ($element['parent'] ?? ''));
        if ($parent === '' || $parent === '0') {
            $source_root_ids[] = (string) ($element['id'] ?? '');
        }
    }
    $seed = $areas->write($post_id, 'content', $source_elements);
    if (($seed['ok'] ?? false) !== true) {
        throw new RuntimeException('Could not clone the source Bricks content into the replay page.');
    }

    $result = (new HtmlInitialInsertService())->handle([
        'postId' => $post_id,
        'bricksHandoffResult' => $read_json('bricks-handoff-result.json'),
        'handoffQa' => $read_json('stage-b-qa.json'),
        'sourceFile' => [
            'path' => 'stage-a/source/index.html',
            'name' => 'index.html',
        ],
        'handoffArtifacts' => [
            'handoffId' => 'saved-live-handoff-replay',
            'artifactStage' => 'pre_stage_b_baseline_preview',
        ],
        'frameworkContext' => [],
        'replaceExisting' => false,
        'fragmentNamespace' => 'pixflow-section-saved-live-handoff-replay',
        'position' => [
            'mode' => 'before',
            'targetId' => $target_id,
        ],
    ]);

    $persisted = is_array($result['persisted'] ?? null) ? $result['persisted'] : [];
    $controlled_persisted = is_array($result['insert']['persisted'] ?? null)
        ? $result['insert']['persisted']
        : [];
    $placed_elements = is_array($result['placement']['elements'] ?? null)
        ? $result['placement']['elements']
        : [];
    $root_ids = [];
    foreach ($placed_elements as $element) {
        if (!is_array($element)) {
            continue;
        }
        $parent = trim((string) ($element['parent'] ?? ''));
        if ($parent === '' || $parent === '0') {
            $root_ids[] = (string) ($element['id'] ?? '');
        }
    }
    $inserted_root_ids = array_values(array_diff($root_ids, $source_root_ids));
    $inserted_root_id = count($inserted_root_ids) === 1 ? $inserted_root_ids[0] : null;

    echo wp_json_encode([
        'keys' => array_keys($result),
        'ok' => $result['ok'] ?? false,
        'code' => $result['code'] ?? null,
        'message' => $result['message'] ?? null,
        'status' => $result['status'] ?? null,
        'errors' => $result['errors'] ?? null,
        'warnings' => $result['warnings'] ?? null,
        'handoffGate' => $result['handoffGate'] ?? null,
        'topLevelPersisted' => [
            'ok' => $persisted['ok'] ?? null,
            'contentMatches' => $persisted['contentMatches'] ?? null,
            'expectedCount' => $persisted['expectedCount'] ?? null,
            'actualCount' => $persisted['actualCount'] ?? null,
            'expectedHash' => $persisted['expectedHash'] ?? null,
            'actualHash' => $persisted['actualHash'] ?? null,
            'globalClasses' => $persisted['globalClasses'] ?? null,
        ],
        'operation' => $result['operation'] ?? null,
        'placement' => [
            'appliedPosition' => $result['placement']['appliedPosition'] ?? null,
            'warning' => $result['placement']['warning'] ?? null,
            'rootIds' => $root_ids,
            'insertedRootId' => $inserted_root_id,
            'insertedRootIndex' => $inserted_root_id !== null
                ? array_search($inserted_root_id, $root_ids, true)
                : false,
            'targetRootIndex' => array_search($target_id, $root_ids, true),
        ],
        'controlledInsert' => [
            'ok' => $result['insert']['ok'] ?? null,
            'code' => $result['insert']['code'] ?? null,
            'message' => $result['insert']['message'] ?? null,
            'persisted' => [
                'ok' => $controlled_persisted['ok'] ?? null,
                'contentMatches' => $controlled_persisted['contentMatches'] ?? null,
                'expectedCount' => $controlled_persisted['expectedCount'] ?? null,
                'actualCount' => $controlled_persisted['actualCount'] ?? null,
                'expectedHash' => $controlled_persisted['expectedHash'] ?? null,
                'actualHash' => $controlled_persisted['actualHash'] ?? null,
            ],
        ],
        'rollback' => $result['rollback'] ?? null,
    ], JSON_PRETTY_PRINT) . PHP_EOL;
} finally {
    update_option('bricks_global_classes', $global_classes_before, false);
    wp_delete_post($post_id, true);
}
