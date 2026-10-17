<?php

declare(strict_types=1);

define('ABSPATH', __DIR__ . '/fixture/');
define('PIXFLOW_DESIGN_PLUGIN_DIR', dirname(__DIR__) . '/');

final class WP_Error
{
    public function __construct(private string $code, private string $message, private array $data = []) {}
    public function get_error_code(): string { return $this->code; }
}

final class WP_Post
{
    public string $post_type = 'page';
    public string $post_status = 'draft';
    public string $post_title = 'Test Page';
    public string $post_name = 'test-page';
    public string $post_content = '<!-- wp:image {"id":17} --><figure><img class="wp-image-17" /></figure><!-- /wp:image -->';
    public string $post_excerpt = '';
    public string $post_modified_gmt = '2026-08-30 00:00:00';
    public int $post_author = 2;
    public int $post_parent = 0;

    public function __construct(public int $ID) {}
}

$GLOBALS['pixflow_trash_posts'] = [113 => new WP_Post(113), 17 => new WP_Post(17)];
$GLOBALS['pixflow_trash_posts'][17]->post_type = 'attachment';
$GLOBALS['pixflow_trash_posts'][17]->post_status = 'inherit';
$GLOBALS['pixflow_trash_previous_status'] = [];

function sanitize_key(string $value): string { return preg_replace('/[^a-z0-9_-]/', '', strtolower($value)) ?? ''; }
function sanitize_text_field(string $value): string { return trim(strip_tags($value)); }
function sanitize_textarea_field(string $value): string { return trim(strip_tags($value)); }
function sanitize_title(string $value): string { return trim(preg_replace('/[^a-z0-9-]+/', '-', strtolower($value)) ?? '', '-'); }
function esc_url_raw(string $value): string { return $value; }
function wp_kses_post(string $value): string { return $value; }
function wp_json_encode(mixed $value): string|false { return json_encode($value); }
function current_user_can(string $capability, mixed ...$args): bool { return true; }
function get_current_user_id(): int { return 2; }
function get_post(int $post_id): ?WP_Post { return isset($GLOBALS['pixflow_trash_posts'][$post_id]) ? clone $GLOBALS['pixflow_trash_posts'][$post_id] : null; }
function get_post_thumbnail_id(int $post_id): int { return 0; }
function get_permalink(WP_Post $post): string { return 'http://example.test/?p=' . $post->ID; }
function get_post_meta(int $post_id, string $key, bool $single = true): string { return ''; }
function get_object_taxonomies(string $post_type, string $output): array { return []; }
function wp_get_post_terms(int $post_id, string $taxonomy, array $args = []): array { return []; }
function wp_check_post_lock(int $post_id): false { return false; }
function wp_get_post_autosave(int $post_id): false { return false; }
function wp_get_post_revisions(mixed $post_id = 0, mixed $args = null): array { return []; }
function wp_trash_post(int $post_id): WP_Post|false
{
    if (!isset($GLOBALS['pixflow_trash_posts'][$post_id])) return false;
    $GLOBALS['pixflow_trash_previous_status'][$post_id] = $GLOBALS['pixflow_trash_posts'][$post_id]->post_status;
    $GLOBALS['pixflow_trash_posts'][$post_id]->post_status = 'trash';
    return clone $GLOBALS['pixflow_trash_posts'][$post_id];
}
function wp_untrash_post(int $post_id): WP_Post|false
{
    if (!isset($GLOBALS['pixflow_trash_posts'][$post_id])) return false;
    $GLOBALS['pixflow_trash_posts'][$post_id]->post_status = $GLOBALS['pixflow_trash_previous_status'][$post_id] ?? 'draft';
    return clone $GLOBALS['pixflow_trash_posts'][$post_id];
}

require dirname(__DIR__) . '/src/autoload.php';

use PixflowDesign\WordPress\Admin\WpAdminCapabilityRegistry;
use PixflowDesign\WordPress\Admin\WpAdminWordPressCapabilityService;

function expect_trash(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$registry = new WpAdminCapabilityRegistry();
$definition = $registry->native_definition('pixflow/wp-admin/trash-post');
expect_trash(is_array($definition), 'The agent capability registry must expose reversible post trashing.');
expect_trash(($definition['handler'] ?? '') === 'trash_post', 'The trash capability must use its dedicated adapter.');
expect_trash(($definition['requiresApproval'] ?? false) === true, 'Destructive trashing must retain an internal exact-action approval token even though no user-facing approval panel is shown.');
$restore_definition = $registry->native_definition('pixflow/wp-admin/restore-post');
expect_trash(is_array($restore_definition) && ($restore_definition['handler'] ?? '') === 'restore_post', 'The agent capability registry must expose exact restoration from trash.');

$service = new WpAdminWordPressCapabilityService();
$stale = $service->trash_post(['postId' => 113, 'expectedModifiedGmt' => '2026-08-30 00:00:00', 'expectedFingerprint' => 'sha256:stale']);
expect_trash($stale instanceof WP_Error && $stale->get_error_code() === 'stale_revision', 'A mismatched full fingerprint must fail before trashing.');
expect_trash(($GLOBALS['pixflow_trash_posts'][113]->post_status ?? '') === 'draft', 'A stale trash request must not mutate the post.');

$result = $service->trash_post([
    'postId' => 113,
    'expectedModifiedGmt' => '2026-08-30 00:00:00',
    'expectedFingerprint' => $service->fingerprint(113),
]);
expect_trash(is_array($result) && ($result['result'] ?? '') === 'trashed', 'The exact draft must be moved to trash.');
expect_trash(($GLOBALS['pixflow_trash_posts'][113]->post_status ?? '') === 'trash', 'The requested post must be trashed.');
expect_trash(($GLOBALS['pixflow_trash_posts'][17]->post_status ?? '') === 'inherit', 'Trashing a post must not delete or trash referenced media.');

$restored = $service->rollback_trashed_post($result);
expect_trash(is_array($restored) && ($restored['result'] ?? '') === 'restored', 'A trashed post must support rollback.');
expect_trash(($GLOBALS['pixflow_trash_posts'][113]->post_status ?? '') === 'draft', 'Rollback must restore the original draft status.');

$trashed_again = $service->trash_post([
    'postId' => 113,
    'expectedModifiedGmt' => '2026-08-30 00:00:00',
    'expectedFingerprint' => $service->fingerprint(113),
]);
expect_trash(is_array($trashed_again), 'The restored fixture must be trashable again.');
$restored_action = $service->restore_post([
    'postId' => 113,
    'expectedModifiedGmt' => '2026-08-30 00:00:00',
    'expectedFingerprint' => $service->fingerprint(113),
]);
expect_trash(is_array($restored_action) && ($restored_action['result'] ?? '') === 'restored', 'The typed restore capability must restore an exact trashed post.');
expect_trash(($GLOBALS['pixflow_trash_posts'][113]->post_status ?? '') === 'draft', 'The typed restore capability must restore the previous status.');
expect_trash(($GLOBALS['pixflow_trash_posts'][17]->post_status ?? '') === 'inherit', 'Restoring content must not alter referenced Media Library attachments.');
$retrashed = $service->rollback_restored_post($restored_action);
expect_trash(is_array($retrashed) && ($retrashed['result'] ?? '') === 'retrashed', 'A restore action must support compensating rollback.');
expect_trash(($GLOBALS['pixflow_trash_posts'][113]->post_status ?? '') === 'trash', 'Restore rollback must return the post to trash.');

echo "wp-admin trash-post regression tests passed\n";
