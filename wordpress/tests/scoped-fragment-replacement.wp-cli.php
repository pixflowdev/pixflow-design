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
    throw new RuntimeException('The scoped replacement harness requires one local administrator.');
}
wp_set_current_user((int) $admin_ids[0]);

$post_id = wp_insert_post([
    'post_type' => 'page',
    'post_status' => 'draft',
    'post_title' => 'Pixflow scoped replacement persistence proof',
], true);
if (is_wp_error($post_id)) {
    throw new RuntimeException($post_id->get_error_message());
}
$post_id = (int) $post_id;

$areas = new ContentArea();
$service = new HtmlInitialInsertService();
$global_classes_before = get_option('bricks_global_classes', []);
$handoff_result = $read_json('bricks-handoff-result.json');
$handoff_qa = is_file($handoff_dir . DIRECTORY_SEPARATOR . 'stage-b-qa.json')
    ? $read_json('stage-b-qa.json')
    : $read_json('bricks-handoff-qa.json');

$request = static function (
    string $handoff_id,
    string $fragment_namespace,
    array $replace_element_ids = [],
    array $replace_global_class_ids = []
) use ($post_id, $handoff_result, $handoff_qa, $target_id): array {
    return [
        'postId' => $post_id,
        'bricksHandoffResult' => $handoff_result,
        'handoffQa' => $handoff_qa,
        'sourceFile' => [
            'path' => 'build-source/source/index.html',
            'name' => 'index.html',
        ],
        'handoffArtifacts' => [
            'handoffId' => $handoff_id,
            'artifactStage' => 'build_source_conversion',
        ],
        'frameworkContext' => [],
        'generationScope' => 'section',
        'sourceContract' => 'build-in-bricks-html-first',
        'themeStylePolicy' => 'inherit_effective',
        'replaceExisting' => false,
        'replaceElementIds' => $replace_element_ids,
        'replaceGlobalClassIds' => $replace_global_class_ids,
        'fragmentNamespace' => $fragment_namespace,
        'position' => [
            'mode' => 'before',
            'targetId' => $target_id,
        ],
    ];
};

try {
    $source_elements = $areas->read($source_post_id, 'content');
    // Seed the fixture as existing persisted state. Running the clone itself
    // through Save_Pipeline would correctly classify every Code element as a
    // newly authored executable payload, which is not what this harness is
    // proving. The operation below still uses the production controlled-write
    // path and must preserve any pre-existing signed/code-sensitive payload.
    update_post_meta($post_id, $areas->meta_key($post_id, 'content'), wp_slash($source_elements));
    update_post_meta($post_id, $areas->editor_mode_meta_key(), 'bricks');

    $initial = $service->handle($request(
        'scoped-replacement-initial',
        'pixflow-section-scoped-replacement-initial'
    ));
    if (($initial['ok'] ?? false) !== true) {
        throw new RuntimeException('Initial scoped insertion failed: ' . wp_json_encode($initial));
    }

    $element_ids = is_array($initial['changedIds']['elementIds'] ?? null)
        ? $initial['changedIds']['elementIds']
        : [];
    $global_class_ids = is_array($initial['changedIds']['globalClassIds'] ?? null)
        ? $initial['changedIds']['globalClassIds']
        : [];
    if ($element_ids === []) {
        throw new RuntimeException('Initial scoped insertion did not report owned element ids.');
    }

    $replacement = $service->handle($request(
        'scoped-replacement-follow-up',
        'pixflow-section-scoped-replacement-follow-up',
        $element_ids,
        $global_class_ids
    ));
    $persisted = is_array($replacement['persisted'] ?? null) ? $replacement['persisted'] : [];
    $controlled_persisted = is_array($replacement['insert']['persisted'] ?? null)
        ? $replacement['insert']['persisted']
        : [];

    $content_matches = ($persisted['contentMatches'] ?? false) === true
        && ($controlled_persisted['contentMatches'] ?? false) === true;
    if (($replacement['ok'] ?? false) !== true || !$content_matches) {
        throw new RuntimeException('Scoped replacement did not persist the exact intended Bricks content: ' . wp_json_encode([
            'ok' => $replacement['ok'] ?? false,
            'code' => $replacement['code'] ?? null,
            'message' => $replacement['message'] ?? null,
            'persisted' => $persisted,
            'controlledPersisted' => $controlled_persisted,
            'rollback' => $replacement['rollback'] ?? null,
        ]));
    }

    echo wp_json_encode([
        'ok' => true,
        'postId' => $post_id,
        'replacedElementCount' => count($element_ids),
        'replacedGlobalClassCount' => count($global_class_ids),
        'persistedElementCount' => (int) ($persisted['actualCount'] ?? 0),
        'expectedHash' => $persisted['expectedHash'] ?? null,
        'actualHash' => $persisted['actualHash'] ?? null,
        'contentMatches' => $content_matches,
    ], JSON_PRETTY_PRINT) . PHP_EOL;
} finally {
    update_option('bricks_global_classes', $global_classes_before, false);
    wp_delete_post($post_id, true);
}
