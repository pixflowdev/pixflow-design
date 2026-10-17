<?php

use PixflowDesign\WordPress\Mcp\HtmlInitialInsertService;

if (!defined('ABSPATH')) {
    throw new RuntimeException('Run through WP-CLI eval-file.');
}

$fixture_root = rtrim((string) getenv('PIXFLOW_BRICKS_HANDOFF_FIXTURE'), '/\\');
$post_id = max(0, (int) getenv('PIXFLOW_BRICKS_HANDOFF_POST_ID'));
if ($fixture_root === '' || !is_dir($fixture_root) || $post_id <= 0) {
    throw new RuntimeException('Set PIXFLOW_BRICKS_HANDOFF_FIXTURE and PIXFLOW_BRICKS_HANDOFF_POST_ID.');
}

$admin = get_user_by('login', 'pixflow');
if (!$admin instanceof WP_User) {
    throw new RuntimeException('The pixflow administrator is unavailable.');
}
wp_set_current_user((int) $admin->ID);

$read_json = static function (string $path): array {
    $raw = file_get_contents($path);
    $value = is_string($raw) ? json_decode($raw, true) : null;
    if (!is_array($value)) {
        throw new RuntimeException("Could not read JSON fixture: {$path}");
    }

    return $value;
};

$project_root = dirname($fixture_root, 4);
$request_bundle = $read_json($project_root . '/build-source/context/request-bundle.json');
$framework_context = $read_json($fixture_root . '/framework-route.json');
$source_file = $read_json($fixture_root . '/source-artifact.json');
$handoff_result = $read_json($fixture_root . '/bricks-handoff-result.json');
$handoff_qa = $read_json($fixture_root . '/bricks-handoff-qa.json');
$theme_style = is_array($request_bundle['context']['themeStyle'] ?? null)
    ? $request_bundle['context']['themeStyle']
    : [];

$result = (new HtmlInitialInsertService())->handle([
    'postId' => $post_id,
    'bricksHandoffResult' => $handoff_result,
    'handoffQa' => $handoff_qa,
    'sourceFile' => $source_file,
    'handoffArtifacts' => [
        'handoffId' => basename($fixture_root),
        'artifactStage' => 'converter_baseline_final',
    ],
    'frameworkContext' => $framework_context,
    'generationScope' => 'section',
    'themeStylePolicy' => 'inherit_effective',
    'themeStyleContext' => $theme_style,
    'themeStyleSnapshotHash' => (string) ($theme_style['snapshotHash'] ?? ''),
    'sourceContract' => 'build-in-bricks-html-first',
    'replaceExisting' => false,
    'fragmentNamespace' => 'pixflow-section-live-diagnostic',
    'position' => [
        'mode' => 'after',
        'targetId' => 'p21s04',
        'targetLabel' => 'Latest insights',
    ],
]);

echo wp_json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;
