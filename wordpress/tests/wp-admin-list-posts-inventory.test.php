<?php

declare(strict_types=1);

define('ABSPATH', __DIR__ . '/fixture/');
define('PIXFLOW_DESIGN_PLUGIN_DIR', dirname(__DIR__) . '/');

final class WP_Error {}

final class WP_Post
{
    public string $post_status = 'draft';
    public string $post_excerpt = '';
    public string $post_modified_gmt = '2026-08-30 00:00:00';
    public int $post_author = 2;
    public int $post_parent = 0;
    public string $post_name;
    public string $post_content = '';

    public function __construct(
        public int $ID,
        public string $post_type,
        public string $post_title,
    ) {
        $this->post_name = strtolower(str_replace(' ', '-', $post_title));
    }
}

final class WP_Post_Type
{
    public bool $show_ui = true;
    public object $cap;

    public function __construct(public string $name)
    {
        $this->cap = (object) ['edit_posts' => 'edit_posts', 'create_posts' => 'edit_posts', 'publish_posts' => 'publish_posts'];
    }
}

$GLOBALS['pixflow_inventory_posts'] = [
    new WP_Post(10, 'post', 'Services Update'),
    new WP_Post(20, 'page', 'Services New'),
];
$GLOBALS['pixflow_inventory_last_query'] = [];

function sanitize_key(string $value): string { return preg_replace('/[^a-z0-9_-]/', '', strtolower($value)) ?? ''; }
function sanitize_text_field(string $value): string { return trim(strip_tags($value)); }
function sanitize_textarea_field(string $value): string { return trim(strip_tags($value)); }
function sanitize_title(string $value): string { return trim(preg_replace('/[^a-z0-9-]+/', '-', strtolower($value)) ?? '', '-'); }
function esc_url_raw(string $value): string { return $value; }
function wp_kses_post(string $value): string { return $value; }
function wp_json_encode(mixed $value): string|false { return json_encode($value); }
function current_user_can(string $capability, mixed ...$args): bool { return true; }
function get_post_thumbnail_id(int $post_id): int { return 0; }
function get_permalink(WP_Post $post): string { return 'http://example.test/?p=' . $post->ID; }
function get_post_meta(int $post_id, string $key, bool $single = true): string { return ''; }
function get_object_taxonomies(string $post_type, string $output): array { return []; }
function wp_get_post_terms(int $post_id, string $taxonomy, array $args = []): array { return []; }
function get_post_stati(array $args, string $output): array { return ['publish', 'draft', 'pending', 'private', 'future']; }
function get_post_type_object(string $post_type): ?WP_Post_Type
{
    return in_array($post_type, ['post', 'page', 'bricks_template'], true) ? new WP_Post_Type($post_type) : null;
}
function get_post_types(array $args, string $output): array
{
    return [
        'post' => new WP_Post_Type('post'),
        'page' => new WP_Post_Type('page'),
        'bricks_template' => new WP_Post_Type('bricks_template'),
    ];
}
function get_posts(array $query): array
{
    $GLOBALS['pixflow_inventory_last_query'] = $query;
    $types = (array) ($query['post_type'] ?? 'post');
    $search = strtolower((string) ($query['s'] ?? ''));
    return array_values(array_filter(
        $GLOBALS['pixflow_inventory_posts'],
        static fn(WP_Post $post): bool => in_array($post->post_type, $types, true)
            && ($search === '' || str_contains(strtolower($post->post_title), $search)),
    ));
}

require dirname(__DIR__) . '/src/autoload.php';

use PixflowDesign\WordPress\Admin\WpAdminWordPressCapabilityService;

function expect_inventory(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$service = new WpAdminWordPressCapabilityService();
$all_types = $service->list_posts(['search' => 'Services New', 'status' => 'any']);
expect_inventory(is_array($all_types) && count($all_types) === 1, 'An omitted postType must search all editable content types.');
expect_inventory(($all_types[0]['id'] ?? 0) === 20, 'The cross-type inventory must surface the matching page.');
expect_inventory(($GLOBALS['pixflow_inventory_last_query']['post_type'] ?? null) === ['post', 'page'], 'Builder/system types must remain excluded from the all-type inventory.');

$posts_only = $service->list_posts(['postType' => 'post', 'search' => 'Services', 'status' => 'any']);
expect_inventory(is_array($posts_only) && count($posts_only) === 1 && ($posts_only[0]['id'] ?? 0) === 10, 'An explicit postType must remain a strict filter.');

echo "wp-admin list-posts inventory regression tests passed\n";
