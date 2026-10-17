<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "This Phase 13 fixture installer is CLI-only.\n");
    exit(1);
}

$wp_load = isset($argv[1]) ? (string) $argv[1] : '';
if ($wp_load === '' || !is_file($wp_load)) {
    fwrite(STDERR, "Usage: php install-live-checkpoint-a-theme-style.php <absolute-path-to-wp-load.php> [post-id ...]\n");
    exit(1);
}

require $wp_load;
require __DIR__ . '/live-checkpoint-a-theme-style.php';

$administrators = get_users(['role' => 'administrator', 'number' => 1, 'fields' => 'ID']);
if ($administrators === []) {
    fwrite(STDERR, "No local administrator is available to write the controlled Bricks fixture.\n");
    exit(1);
}
wp_set_current_user((int) $administrators[0]);

$existing = get_page_by_path('pixflow-theme-style-native-preflight', OBJECT, 'page');
$post_id = $existing instanceof WP_Post
    ? (int) $existing->ID
    : wp_insert_post([
        'post_type' => 'page',
        'post_status' => 'publish',
        'post_title' => 'Pixflow Theme Style Native Preflight',
        'post_name' => 'pixflow-theme-style-native-preflight',
    ]);
if (is_wp_error($post_id) || (int) $post_id <= 0) {
    fwrite(STDERR, is_wp_error($post_id) ? $post_id->get_error_message() . "\n" : "Could not create the preflight page.\n");
    exit(1);
}
$post_id = (int) $post_id;

$requested_post_ids = array_values(array_filter(array_map('intval', array_slice($argv, 2)), static fn(int $id): bool => $id > 0));
$fixture_post_ids = array_values(array_unique([...$requested_post_ids, $post_id]));
$fixture = pixflow_live_checkpoint_a_theme_style_fixture($fixture_post_ids);
$styles = get_option('bricks_theme_styles', []);
$styles = is_array($styles) ? $styles : [];
$replaced = false;
foreach ($styles as $index => $style) {
    if (is_array($style) && (string) ($style['id'] ?? '') === (string) $fixture['id']) {
        $styles[$index] = $fixture;
        $replaced = true;
        break;
    }
}
if (!$replaced) {
    $styles[] = $fixture;
}

update_option('bricks_theme_styles', $styles, false);
update_post_meta($post_id, '_bricks_page_content_2', pixflow_live_checkpoint_a_preflight_elements());
update_post_meta($post_id, '_bricks_editor_mode', 'bricks');
update_post_meta($post_id, '_bricks_template_type', 'content');

echo wp_json_encode([
    'schema' => 'pixflow.live_checkpoint_a.theme_style_preflight.v1',
    'themeStyleId' => $fixture['id'],
    'postId' => $post_id,
    'url' => get_permalink($post_id),
    'nativeBreakpointSemantics' => [
        'desktop' => ['minimumExclusiveTabletPx' => 991, 'expectedH1Px' => 45.0],
        'tablet_portrait' => ['maxWidthPx' => 991, 'expectedH1Px' => 32.5],
        'mobile_portrait' => ['maxWidthPx' => 478, 'expectedH1Px' => 22.5],
    ],
    'requiredFrontendChecks' => [
        'h1FontSize',
        'buttonPadding',
        'sectionPadding',
        'containerPadding',
    ],
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;
