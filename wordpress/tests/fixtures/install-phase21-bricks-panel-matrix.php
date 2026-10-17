<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "This Phase 21 fixture installer is CLI-only.\n");
    exit(1);
}

$wp_load = isset($argv[1]) ? (string) $argv[1] : '';
if ($wp_load === '' || !is_file($wp_load)) {
    fwrite(STDERR, "Usage: php install-phase21-bricks-panel-matrix.php <absolute-path-to-wp-load.php>\n");
    exit(1);
}

require $wp_load;

$administrators = get_users(['role' => 'administrator', 'number' => 1, 'fields' => 'ID']);
if ($administrators === []) {
    fwrite(STDERR, "No administrator is available for the controlled Bricks fixture.\n");
    exit(1);
}
wp_set_current_user((int) $administrators[0]);

$existing = get_page_by_path('pixflow-bricks-panel-matrix', OBJECT, 'page');
$post_id = $existing instanceof WP_Post
    ? (int) $existing->ID
    : wp_insert_post([
        'post_type' => 'page',
        'post_status' => 'publish',
        'post_title' => 'Pixflow Bricks Panel Matrix',
        'post_name' => 'pixflow-bricks-panel-matrix',
    ]);
if (is_wp_error($post_id) || (int) $post_id <= 0) {
    fwrite(STDERR, is_wp_error($post_id) ? $post_id->get_error_message() . "\n" : "Could not create the matrix page.\n");
    exit(1);
}
$post_id = (int) $post_id;

$image_id = 17;
$image_url = (string) wp_get_attachment_url($image_id);
$elements = [
    ['id' => 'p21s01', 'name' => 'section', 'settings' => ['_cssId' => 'hero'], 'children' => ['p21c01'], 'parent' => 0],
    ['id' => 'p21c01', 'name' => 'container', 'settings' => [], 'children' => ['p21h01', 'p21t01', 'p21b01'], 'parent' => 'p21s01'],
    ['id' => 'p21h01', 'name' => 'heading', 'settings' => ['tag' => 'h1', 'text' => 'A clear heading for the studio'], 'children' => [], 'parent' => 'p21c01'],
    ['id' => 'p21t01', 'name' => 'text-basic', 'settings' => ['text' => 'Our studio helps growing businesses communicate clearly and confidently.'], 'children' => [], 'parent' => 'p21c01'],
    ['id' => 'p21b01', 'name' => 'button', 'settings' => ['text' => 'Talk to us', 'link' => ['type' => 'external', 'url' => '#services']], 'children' => [], 'parent' => 'p21c01'],
    ['id' => 'p21s02', 'name' => 'section', 'settings' => ['_cssId' => 'services'], 'children' => ['p21c02'], 'parent' => 0],
    ['id' => 'p21c02', 'name' => 'container', 'settings' => [], 'children' => ['p21t02', 'p21i01'], 'parent' => 'p21s02'],
    ['id' => 'p21t02', 'name' => 'text-basic', 'settings' => ['text' => 'This supporting text should remain in place while the image is repositioned.'], 'children' => [], 'parent' => 'p21c02'],
    ['id' => 'p21i01', 'name' => 'image', 'settings' => ['image' => ['id' => $image_id, 'url' => $image_url, 'size' => 'full']], 'children' => [], 'parent' => 'p21c02'],
    ['id' => 'p21s03', 'name' => 'section', 'settings' => ['_cssId' => 'cards'], 'children' => ['p21c03'], 'parent' => 0],
    ['id' => 'p21c03', 'name' => 'container', 'settings' => ['_direction' => 'row', '_columnGap' => '24px'], 'children' => ['p21d01', 'p21d02', 'p21d03'], 'parent' => 'p21s03'],
    ['id' => 'p21d01', 'name' => 'div', 'settings' => ['_background' => ['color' => ['hex' => '#f4f0e6']], '_padding' => ['top' => '24px', 'right' => '24px', 'bottom' => '24px', 'left' => '24px']], 'children' => ['p21h11', 'p21t11', 'p21b11'], 'parent' => 'p21c03'],
    ['id' => 'p21h11', 'name' => 'heading', 'settings' => ['tag' => 'h3', 'text' => 'Strategy'], 'children' => [], 'parent' => 'p21d01'],
    ['id' => 'p21t11', 'name' => 'text-basic', 'settings' => ['text' => 'Clear direction for ambitious teams.'], 'children' => [], 'parent' => 'p21d01'],
    ['id' => 'p21b11', 'name' => 'button', 'settings' => ['text' => 'Learn more', 'link' => ['type' => 'external', 'url' => '/strategy']], 'children' => [], 'parent' => 'p21d01'],
    ['id' => 'p21d02', 'name' => 'div', 'settings' => [], 'children' => ['p21h12', 'p21t12', 'p21b12'], 'parent' => 'p21c03'],
    ['id' => 'p21h12', 'name' => 'heading', 'settings' => ['tag' => 'h3', 'text' => 'Design'], 'children' => [], 'parent' => 'p21d02'],
    ['id' => 'p21t12', 'name' => 'text-basic', 'settings' => ['text' => 'Useful design that supports real goals.'], 'children' => [], 'parent' => 'p21d02'],
    ['id' => 'p21b12', 'name' => 'button', 'settings' => ['text' => 'Learn more', 'link' => ['type' => 'external', 'url' => '/design']], 'children' => [], 'parent' => 'p21d02'],
    ['id' => 'p21d03', 'name' => 'div', 'settings' => [], 'children' => ['p21h13', 'p21t13', 'p21b13'], 'parent' => 'p21c03'],
    ['id' => 'p21h13', 'name' => 'heading', 'settings' => ['tag' => 'h3', 'text' => 'Growth'], 'children' => [], 'parent' => 'p21d03'],
    ['id' => 'p21t13', 'name' => 'text-basic', 'settings' => ['text' => 'Practical improvements that compound.'], 'children' => [], 'parent' => 'p21d03'],
    ['id' => 'p21b13', 'name' => 'button', 'settings' => ['text' => 'Learn more', 'link' => ['type' => 'external', 'url' => '/growth']], 'children' => [], 'parent' => 'p21d03'],
    ['id' => 'p21s04', 'name' => 'section', 'settings' => ['_cssId' => 'posts'], 'children' => ['p21c04'], 'parent' => 0],
    ['id' => 'p21c04', 'name' => 'container', 'settings' => [], 'children' => ['p21h20', 'p21d20'], 'parent' => 'p21s04'],
    ['id' => 'p21h20', 'name' => 'heading', 'settings' => ['tag' => 'h2', 'text' => 'Latest insights'], 'children' => [], 'parent' => 'p21c04'],
    ['id' => 'p21d20', 'name' => 'div', 'settings' => [], 'children' => ['p21i20', 'p21h21', 'p21t21', 'p21b21'], 'parent' => 'p21c04'],
    ['id' => 'p21i20', 'name' => 'image', 'settings' => ['image' => ['id' => $image_id, 'url' => $image_url, 'size' => 'full']], 'children' => [], 'parent' => 'p21d20'],
    ['id' => 'p21h21', 'name' => 'heading', 'settings' => ['tag' => 'h3', 'text' => 'Example article'], 'children' => [], 'parent' => 'p21d20'],
    ['id' => 'p21t21', 'name' => 'text-basic', 'settings' => ['text' => 'Published 30 August 2026'], 'children' => [], 'parent' => 'p21d20'],
    ['id' => 'p21b21', 'name' => 'button', 'settings' => ['text' => 'Read article', 'link' => ['type' => 'external', 'url' => '#']], 'children' => [], 'parent' => 'p21d20'],
    ['id' => 'p21s05', 'name' => 'section', 'settings' => ['_cssId' => 'contact'], 'children' => ['p21c05'], 'parent' => 0],
    ['id' => 'p21c05', 'name' => 'container', 'settings' => [], 'children' => ['p21h30', 'p21f01'], 'parent' => 'p21s05'],
    ['id' => 'p21h30', 'name' => 'heading', 'settings' => ['tag' => 'h2', 'text' => 'Contact us'], 'children' => [], 'parent' => 'p21c05'],
    ['id' => 'p21f01', 'name' => 'form', 'settings' => ['fields' => [['id' => 'name', 'type' => 'text', 'label' => 'Name'], ['id' => 'email', 'type' => 'email', 'label' => 'Email']], 'actions' => ['email'], 'submitButtonText' => 'Send enquiry'], 'children' => [], 'parent' => 'p21c05'],
    ['id' => 'p21s06', 'name' => 'section', 'settings' => ['_cssId' => 'code'], 'children' => ['p21c06'], 'parent' => 0],
    ['id' => 'p21c06', 'name' => 'container', 'settings' => [], 'children' => ['p21cd1'], 'parent' => 'p21s06'],
    ['id' => 'p21cd1', 'name' => 'code', 'settings' => ['code' => '<div class="status">Waiting</div>', 'javascriptCode' => ''], 'children' => [], 'parent' => 'p21c06'],
];

update_post_meta($post_id, '_bricks_page_content_2', $elements);
update_post_meta($post_id, '_bricks_editor_mode', 'bricks');
update_post_meta($post_id, '_bricks_template_type', 'content');

echo wp_json_encode([
    'schema' => 'pixflow.phase21.bricks-panel-matrix.v1',
    'postId' => $post_id,
    'url' => add_query_arg('bricks', 'run', get_permalink($post_id)),
    'elementCount' => count($elements),
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;
