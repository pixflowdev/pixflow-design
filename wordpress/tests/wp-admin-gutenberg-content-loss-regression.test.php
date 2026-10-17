<?php

declare(strict_types=1);

define('ABSPATH', __DIR__ . '/fixture/');
define('PIXFLOW_DESIGN_PLUGIN_DIR', dirname(__DIR__) . '/');

final class WP_Error
{
    public function __construct(private string $code, private string $message, private array $data = []) {}
    public function get_error_code(): string { return $this->code; }
    public function get_error_message(): string { return $this->message; }
    public function get_error_data(): array { return $this->data; }
}

final class WP_Post
{
    public int $ID;
    public string $post_type = 'post';
    public string $post_status = 'draft';
    public string $post_title = 'Original title';
    public string $post_excerpt = 'Original excerpt';
    public string $post_content = '<!-- wp:paragraph --><p>Original content.</p><!-- /wp:paragraph -->';
    public string $post_name = 'original-title';
    public string $post_modified = '2026-08-28 00:00:00';
    public string $post_modified_gmt = '2026-08-28 00:00:00';
    public string $post_date = '2026-08-28 00:00:00';
    public string $post_date_gmt = '0000-00-00 00:00:00';
    public int $post_author = 7;
    public int $post_parent = 0;
    public int $menu_order = 0;
    public string $comment_status = 'open';
    public string $ping_status = 'open';

    public function __construct(int $id) { $this->ID = $id; }
}

final class WP_Post_Type
{
    public string $name = 'post';
    public object $cap;
    public function __construct() { $this->cap = (object) ['publish_posts' => 'publish_posts']; }
}

final class WP_Taxonomy
{
    public bool $show_ui = true;
    public bool $publicly_queryable = true;
    public object $cap;
    public function __construct() { $this->cap = (object) ['assign_terms' => 'edit_posts']; }
}

$fixture_attachment = new WP_Post(18);
$fixture_attachment->post_type = 'attachment';
$GLOBALS['pixflow_test_posts'] = [41 => new WP_Post(41), 18 => $fixture_attachment];
$GLOBALS['pixflow_test_transients'] = [];
$GLOBALS['pixflow_test_terms'] = [41 => ['category' => [3]]];
$GLOBALS['pixflow_test_thumbnail'] = [41 => 18];
$GLOBALS['pixflow_test_corrupt_next_content_write'] = false;
$GLOBALS['pixflow_test_default_category_on_write'] = false;

final class PixflowTestWpdb
{
    public string $posts = 'wp_posts';

    public function update(string $table, array $data, array $where, array $formats = [], array $where_formats = []): int|false
    {
        $post_id = (int) ($where['ID'] ?? 0);
        if ($table !== $this->posts || !isset($GLOBALS['pixflow_test_posts'][$post_id])) return false;
        $post = $GLOBALS['pixflow_test_posts'][$post_id];
        foreach (['post_modified', 'post_modified_gmt'] as $field) {
            if (array_key_exists($field, $data)) $post->{$field} = (string) $data[$field];
        }
        return 1;
    }
}

$GLOBALS['wpdb'] = new PixflowTestWpdb();

function sanitize_text_field(string $value): string { return trim(preg_replace('/[\r\n\t]+/', ' ', strip_tags($value)) ?? ''); }
function sanitize_textarea_field(string $value): string { return trim(str_replace("\r", '', strip_tags($value))); }
function sanitize_key(string $value): string { return trim(preg_replace('/[^a-z0-9_-]/', '', strtolower($value)) ?? ''); }
function sanitize_title(string $value): string { return trim(preg_replace('/[^a-z0-9-]+/', '-', strtolower($value)) ?? '', '-'); }
function wp_unique_post_slug(string $slug, int $post_id, string $status, string $post_type, int $parent_id): string { return $slug; }
function get_gmt_from_date(string $date): string { return $date; }
function wp_check_invalid_utf8(string $value): string { return $value; }
function wp_json_encode(mixed $value, int $flags = 0): string|false { return json_encode($value, $flags); }
function wp_generate_uuid4(): string { return bin2hex(random_bytes(4)) . '-0000-4000-8000-' . bin2hex(random_bytes(6)); }
function wp_slash(string $value): string { return addslashes($value); }
function wp_unslash(string $value): string { return stripslashes($value); }
function is_wp_error(mixed $value): bool { return $value instanceof WP_Error; }
function home_url(): string { return 'http://127.0.0.1:8088'; }
function untrailingslashit(string $value): string { return rtrim($value, '/\\'); }
function admin_url(string $path = ''): string { return home_url() . '/wp-admin/' . ltrim($path, '/'); }
function add_query_arg(array $args, string $url): string { return $url . '?' . http_build_query($args); }
function esc_url_raw(string $value): string { return $value; }
function get_current_user_id(): int { return 7; }
function current_user_can(string $capability, mixed ...$args): bool { return true; }
function get_post(int $post_id): ?WP_Post { return isset($GLOBALS['pixflow_test_posts'][$post_id]) ? clone $GLOBALS['pixflow_test_posts'][$post_id] : null; }
function get_post_meta(int $post_id, string $key, bool $single = true): string { return ''; }
function get_post_thumbnail_id(int $post_id): int { return (int) ($GLOBALS['pixflow_test_thumbnail'][$post_id] ?? 0); }
function get_object_taxonomies(string $post_type, string $output): array { return ['category' => new WP_Taxonomy()]; }
function wp_get_post_terms(int $post_id, string $taxonomy, array $args = []): array { return $GLOBALS['pixflow_test_terms'][$post_id][$taxonomy] ?? []; }
function wp_get_post_revisions(mixed $post_id, array $args = []): array { return []; }
function wp_check_post_lock(int $post_id): false { return false; }
function wp_get_post_autosave(int $post_id): false { return false; }
function get_post_type_object(string $post_type): WP_Post_Type { return new WP_Post_Type(); }
function get_taxonomy(string $taxonomy): WP_Taxonomy { return new WP_Taxonomy(); }
function is_object_in_taxonomy(string $post_type, string $taxonomy): bool { return $taxonomy === 'category'; }
function term_exists(int $term_id, string $taxonomy): bool { return $taxonomy === 'category' && $term_id === 3; }
function post_type_supports(string $post_type, string $feature): bool { return true; }
function use_block_editor_for_post(WP_Post $post): bool { return true; }
function get_post_mime_type(int $attachment_id): string { return 'image/png'; }
function clean_post_cache(int $post_id): void {}
function do_action(string $hook, mixed ...$args): void {}
function get_permalink(WP_Post $post): string { return home_url() . '/?p=' . $post->ID; }
function wp_kses_post(string $value): string { return $value; }
function set_post_thumbnail(int $post_id, int $attachment_id): bool { $GLOBALS['pixflow_test_thumbnail'][$post_id] = $attachment_id; return true; }
function delete_post_thumbnail(int $post_id): bool { $GLOBALS['pixflow_test_thumbnail'][$post_id] = 0; return true; }
function wp_set_post_terms(int $post_id, array $ids, string $taxonomy, bool $append = false): array {
    $GLOBALS['pixflow_test_terms'][$post_id][$taxonomy] = array_values($ids);
    return array_values($ids);
}
function set_transient(string $key, mixed $value, int $ttl): bool { $GLOBALS['pixflow_test_transients'][$key] = $value; return true; }
function get_transient(string $key): mixed { return $GLOBALS['pixflow_test_transients'][$key] ?? false; }
function parse_blocks(string $content): array
{
    preg_match_all('/<!--\s+wp:([a-z0-9-]+(?:\/[a-z0-9-]+)?)(?:\s+[^>]*)?\s*-->/', $content, $matches);
    return array_map(static fn(string $name): array => [
        'blockName' => str_contains($name, '/') ? $name : 'core/' . $name,
        'attrs' => [],
        'innerBlocks' => [],
        'innerHTML' => '',
    ], $matches[1] ?? []);
}
function wp_update_post(array $postarr, bool $wp_error = false): int|WP_Error
{
    $post_id = (int) ($postarr['ID'] ?? 0);
    if (!isset($GLOBALS['pixflow_test_posts'][$post_id])) return new WP_Error('missing', 'Missing post.');
    $post = $GLOBALS['pixflow_test_posts'][$post_id];
    if (($postarr['post_status'] ?? $post->post_status) === 'publish' && $post->post_name === '' && !array_key_exists('post_name', $postarr)) {
        $title = stripslashes((string) ($postarr['post_title'] ?? $post->post_title));
        $postarr['post_name'] = wp_unique_post_slug(sanitize_title($title), $post_id, 'publish', $post->post_type, $post->post_parent);
    }
    if (($postarr['post_status'] ?? $post->post_status) === 'publish' && ($postarr['post_date_gmt'] ?? $post->post_date_gmt) === '0000-00-00 00:00:00') {
        $postarr['post_date_gmt'] = get_gmt_from_date((string) ($postarr['post_date'] ?? $post->post_date));
    }
    if (
        in_array($post->post_status, ['draft', 'pending', 'auto-draft'], true)
        && empty($postarr['edit_date'])
        && $post->post_date_gmt === '0000-00-00 00:00:00'
    ) {
        $postarr['post_date'] = '2026-08-28 00:01:00';
        $postarr['post_date_gmt'] = '';
    }
    foreach ([
        'post_title', 'post_excerpt', 'post_status', 'post_content', 'post_name', 'post_date',
        'post_date_gmt', 'post_author', 'post_parent', 'menu_order', 'comment_status', 'ping_status',
    ] as $field) {
        if (!array_key_exists($field, $postarr)) continue;
        $value = is_string($postarr[$field]) ? stripslashes($postarr[$field]) : $postarr[$field];
        $post->{$field} = $value;
    }
    if ($GLOBALS['pixflow_test_corrupt_next_content_write'] && array_key_exists('post_content', $postarr)) {
        $post->post_content = '';
        $GLOBALS['pixflow_test_corrupt_next_content_write'] = false;
    }
    if ($GLOBALS['pixflow_test_default_category_on_write'] && array_key_exists('post_content', $postarr)) {
        $GLOBALS['pixflow_test_terms'][$post_id]['category'] = [3];
    }
    $post->post_modified = '2026-08-28 00:00:' . str_pad((string) (((int) substr($post->post_modified, -2)) + 1), 2, '0', STR_PAD_LEFT);
    $post->post_modified_gmt = '2026-08-28 00:00:' . str_pad((string) (((int) substr($post->post_modified_gmt, -2)) + 1), 2, '0', STR_PAD_LEFT);
    return $post_id;
}

require dirname(__DIR__) . '/src/autoload.php';

use PixflowDesign\WordPress\Admin\Gutenberg\GutenbergDocumentRepository;
use PixflowDesign\WordPress\Admin\Gutenberg\GutenbergSerializationTicketStore;
use PixflowDesign\WordPress\Admin\Gutenberg\WpAdminGutenbergCapabilityService;
use PixflowDesign\WordPress\Admin\WpAdminWordPressCapabilityService;

function expect_gutenberg_p0(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

function content_hash(string $content): string
{
    return 'sha256:' . hash('sha256', $content);
}

/** @return array<string, mixed> */
function mutation_state(int $post_id = 41): array
{
    $post = get_post($post_id);
    return [
        'title' => $post?->post_title,
        'content' => $post?->post_content,
        'excerpt' => $post?->post_excerpt,
        'slug' => $post?->post_name,
        'status' => $post?->post_status,
        'terms' => $GLOBALS['pixflow_test_terms'][$post_id] ?? [],
        'featuredMediaId' => $GLOBALS['pixflow_test_thumbnail'][$post_id] ?? 0,
        'date' => $post?->post_date,
        'dateGmt' => $post?->post_date_gmt,
        'modified' => $post?->post_modified,
        'modifiedGmt' => $post?->post_modified_gmt,
    ];
}

/** @return array{ticketId:string,expectedFingerprint:string,sessionId:string,blocks:array} */
function seed_serialization_ticket(int $post_id = 41): array
{
    $documents = new GutenbergDocumentRepository();
    $expected = $documents->fingerprint($post_id);
    $blocks = [[
        'name' => 'core/paragraph',
        'attributes' => ['content' => 'Replacement content.'],
        'innerBlocks' => [],
    ]];
    $tree_hash = content_hash((string) wp_json_encode($blocks, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    $ticket_id = 'gbt_' . str_repeat(dechex(count($GLOBALS['pixflow_test_transients']) + 10), 32);
    $ticket_id = substr($ticket_id, 0, 36);
    $ticket = [
        'ticketId' => $ticket_id,
        'purpose' => 'serialization',
        'contentIntent' => 'replace',
        'siteId' => hash('sha256', home_url()),
        'userId' => get_current_user_id(),
        'sessionId' => 'p0-session',
        'postId' => $post_id,
        'expectedFingerprint' => $expected,
        'latestRevisionId' => null,
        'treeHash' => $tree_hash,
        'resolvedTreeHash' => $tree_hash,
        'blocks' => $blocks,
        'resolvedBlocks' => $blocks,
        'validation' => ['valid' => true, 'blockCount' => 1, 'errors' => [], 'support' => []],
        'media' => [],
        'createdAt' => time(),
        'expiresAt' => time() + 600,
        'consumedAt' => null,
    ];
    set_transient('pixflow_gbt_' . hash('sha256', $ticket_id), $ticket, 600);
    return ['ticketId' => $ticket_id, 'expectedFingerprint' => $expected, 'sessionId' => 'p0-session', 'blocks' => $blocks];
}

function reset_test_post(): void
{
    $GLOBALS['pixflow_test_posts'][41] = new WP_Post(41);
    $GLOBALS['pixflow_test_terms'][41] = ['category' => [3]];
    $GLOBALS['pixflow_test_thumbnail'][41] = 18;
    $GLOBALS['pixflow_test_corrupt_next_content_write'] = false;
    $GLOBALS['pixflow_test_default_category_on_write'] = false;
}

/** @return array{receipt:array,arguments:array,content:string} */
function prepare_valid_receipt(GutenbergSerializationTicketStore $tickets, string $title = 'Replacement title'): array
{
    $seed = seed_serialization_ticket();
    $content = '<!-- wp:paragraph --><p>Replacement content.</p><!-- /wp:paragraph -->';
    $receipt = $tickets->accept_browser_result([
        'ticketId' => $seed['ticketId'],
        'resolvedTreeHash' => content_hash((string) wp_json_encode($seed['blocks'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)),
        'content' => $content,
        'validation' => ['valid' => true, 'errors' => [], 'blockCount' => 1],
    ]);
    expect_gutenberg_p0(is_array($receipt), 'A valid non-empty replacement must produce a prepared receipt.');
    return [
        'receipt' => $receipt,
        'content' => $content,
        'arguments' => [
            'postId' => 41,
            'expectedFingerprint' => $seed['expectedFingerprint'],
            'preparedReceiptId' => $receipt['preparedReceiptId'],
            'preparedSessionId' => $seed['sessionId'],
            'contentIntent' => 'replace',
            'post' => ['title' => $title, 'status' => 'draft'],
        ],
    ];
}

$tickets = new GutenbergSerializationTicketStore();

$clear_result = $tickets->prepare([
    'postId' => 41,
    'sessionId' => 'p0-session',
    'expectedFingerprint' => (new GutenbergDocumentRepository())->fingerprint(41),
    'blocks' => [],
]);
expect_gutenberg_p0($clear_result instanceof WP_Error && $clear_result->get_error_code() === 'gutenberg_clear_not_supported', 'An empty tree must be rejected as an unsupported clear intent, not treated as failed replacement output.');

$empty_before = mutation_state();
$empty = seed_serialization_ticket();
$empty_result = $tickets->accept_browser_result([
    'ticketId' => $empty['ticketId'],
    'resolvedTreeHash' => content_hash((string) wp_json_encode($empty['blocks'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)),
    'content' => '',
    'validation' => ['valid' => true, 'errors' => [], 'blockCount' => 0],
]);
expect_gutenberg_p0($empty_result instanceof WP_Error, 'A non-empty proposal with empty serialization must be rejected server-side.');
expect_gutenberg_p0(mutation_state() === $empty_before, 'Rejected empty serialization must not mutate any proposed post field.');

$missing_before = mutation_state();
$missing = seed_serialization_ticket();
$missing_result = $tickets->accept_browser_result([
    'ticketId' => $missing['ticketId'],
    'resolvedTreeHash' => content_hash((string) wp_json_encode($missing['blocks'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)),
    'validation' => ['valid' => true, 'errors' => [], 'blockCount' => 1],
]);
expect_gutenberg_p0($missing_result instanceof WP_Error && $missing_result->get_error_code() === 'gutenberg_serialized_content_missing', 'Missing serialization must fail closed.');
expect_gutenberg_p0(mutation_state() === $missing_before, 'Missing serialization must not fall back to metadata-only mutation.');

$timeout = seed_serialization_ticket();
$service = new WpAdminGutenbergCapabilityService(tickets: $tickets);
$timeout_approval = $service->validate_approval_arguments([
    'postId' => 41,
    'expectedFingerprint' => $timeout['expectedFingerprint'],
    'preparedReceiptId' => 'gbr_' . str_repeat('f', 32),
    'preparedSessionId' => $timeout['sessionId'],
    'contentIntent' => 'replace',
], $timeout['sessionId']);
expect_gutenberg_p0($timeout_approval instanceof WP_Error && $timeout_approval->get_error_code() === 'gutenberg_receipt_missing', 'A preparation timeout without a receipt must not become approvable.');

$forged_id = 'gbr_' . str_repeat('e', 32);
$forged_seed = seed_serialization_ticket();
$forged_blocks = $forged_seed['blocks'];
$forged_hash = content_hash((string) wp_json_encode($forged_blocks, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
set_transient('pixflow_gbr_' . hash('sha256', $forged_id), [
    'receiptId' => $forged_id,
    'ticketId' => $forged_seed['ticketId'],
    'contentIntent' => 'replace',
    'siteId' => hash('sha256', home_url()),
    'userId' => get_current_user_id(),
    'sessionId' => $forged_seed['sessionId'],
    'postId' => 41,
    'expectedFingerprint' => $forged_seed['expectedFingerprint'],
    'latestRevisionId' => null,
    'treeHash' => $forged_hash,
    'resolvedTreeHash' => $forged_hash,
    'content' => '',
    'contentHash' => 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'serializedBytes' => 0,
    'topLevelBlockCount' => 0,
    'blockCount' => 0,
    'proposedTopLevelBlockCount' => 1,
    'proposedBlockCount' => 1,
    'blockOutline' => [['name' => 'core/paragraph', 'depth' => 0]],
    'blocks' => $forged_blocks,
    'resolvedBlocks' => $forged_blocks,
    'media' => [],
    'serverValidation' => ['valid' => true, 'blockCount' => 1, 'support' => []],
    'browserValidation' => ['valid' => true, 'errors' => [], 'blockCount' => 0],
    'createdAt' => time(),
    'expiresAt' => time() + 600,
    'consumedAt' => null,
], 600);
$forged_approval = $service->validate_approval_arguments([
    'postId' => 41,
    'expectedFingerprint' => $forged_seed['expectedFingerprint'],
    'preparedReceiptId' => $forged_id,
    'preparedSessionId' => $forged_seed['sessionId'],
    'contentIntent' => 'replace',
], $forged_seed['sessionId']);
expect_gutenberg_p0($forged_approval instanceof WP_Error, 'A contradictory zero-block receipt must be rejected before approval.');
$forged_before = mutation_state();
$forged_commit = $service->apply_document([
    'postId' => 41,
    'expectedFingerprint' => $forged_seed['expectedFingerprint'],
    'preparedReceiptId' => $forged_id,
    'preparedSessionId' => $forged_seed['sessionId'],
    'contentIntent' => 'replace',
    'post' => ['title' => 'This must never persist'],
]);
expect_gutenberg_p0($forged_commit instanceof WP_Error, 'A contradictory receipt must remain uncommittable at the commit boundary.');
expect_gutenberg_p0(mutation_state() === $forged_before, 'A forged contradictory receipt must not mutate any post field.');

$hash_mismatch = prepare_valid_receipt($tickets, 'Hash mismatch must not persist');
$hash_mismatch_id = (string) $hash_mismatch['receipt']['preparedReceiptId'];
$hash_mismatch_key = 'pixflow_gbr_' . hash('sha256', $hash_mismatch_id);
$hash_mismatch_receipt = get_transient($hash_mismatch_key);
expect_gutenberg_p0(is_array($hash_mismatch_receipt), 'The prepared receipt fixture must be available for the forged-hash test.');
$hash_mismatch_receipt['contentHash'] = 'sha256:' . str_repeat('0', 64);
set_transient($hash_mismatch_key, $hash_mismatch_receipt, 600);
$hash_mismatch_before = mutation_state();
$hash_mismatch_approval = $service->validate_approval_arguments($hash_mismatch['arguments'], 'p0-session');
expect_gutenberg_p0($hash_mismatch_approval instanceof WP_Error && $hash_mismatch_approval->get_error_code() === 'gutenberg_receipt_integrity_mismatch', 'A browser-supplied or forged content hash must be recomputed and rejected server-side.');
expect_gutenberg_p0(mutation_state() === $hash_mismatch_before, 'A forged receipt hash must not mutate any post field.');

reset_test_post();
$success = prepare_valid_receipt($tickets);
expect_gutenberg_p0(($success['receipt']['blockCount'] ?? 0) > 0, 'The server receipt must report a positive parsed block count.');
expect_gutenberg_p0(($success['receipt']['serializedBytes'] ?? 0) > 0, 'The server receipt must report a positive byte length.');
expect_gutenberg_p0(($success['receipt']['contentHash'] ?? '') !== 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'A valid receipt must not use the empty-content hash.');
$approval_check = $service->validate_approval_arguments($success['arguments'], 'p0-session');
expect_gutenberg_p0(is_array($approval_check) && ($approval_check['valid'] ?? false) === true, 'A valid receipt must pass the server approval boundary.');
$committed = $service->apply_document($success['arguments']);
expect_gutenberg_p0(is_array($committed), 'A valid non-empty replacement must commit; got ' . ($committed instanceof WP_Error ? $committed->get_error_code() . ' ' . $committed->get_error_message() : get_debug_type($committed)) . '.');
$committed_post = get_post(41);
expect_gutenberg_p0($committed_post instanceof WP_Post && $committed_post->post_title === 'Replacement title', 'The approved title must persist.');
expect_gutenberg_p0($committed_post instanceof WP_Post && content_hash($committed_post->post_content) === $success['receipt']['contentHash'], 'Persisted content must match the server-approved hash.');
expect_gutenberg_p0(($committed['blockCount'] ?? 0) === 1, 'The commit result must report the server-parsed block count.');

reset_test_post();
$GLOBALS['pixflow_test_terms'][41]['category'] = [];
$GLOBALS['pixflow_test_default_category_on_write'] = true;
$empty_terms = prepare_valid_receipt($tickets, 'Empty taxonomy state must persist');
$empty_terms_result = $service->apply_document($empty_terms['arguments']);
expect_gutenberg_p0(is_array($empty_terms_result), 'A content replacement must reapply an intentionally empty taxonomy state after WordPress assigns its default category.');
expect_gutenberg_p0(($GLOBALS['pixflow_test_terms'][41]['category'] ?? null) === [], 'An unrelated Gutenberg replacement must not silently assign the default category.');

reset_test_post();
$GLOBALS['pixflow_test_posts'][41]->post_name = '';
$GLOBALS['pixflow_test_posts'][41]->post_status = 'draft';
$GLOBALS['pixflow_test_posts'][41]->post_date_gmt = '0000-00-00 00:00:00';
$publish = prepare_valid_receipt($tickets, 'Published content');
$publish['arguments']['post'] = [
    'title' => 'Commercial Work',
    'excerpt' => 'Commercial services.',
    'status' => 'publish',
];
$published = $service->apply_document($publish['arguments']);
expect_gutenberg_p0(is_array($published), 'Publishing a new draft with a generated WordPress slug and GMT date must pass exact readback.');
$published_post = get_post(41);
expect_gutenberg_p0($published_post?->post_name === 'commercial-work', 'The WordPress-generated publish slug must be verified as derived transaction state.');
expect_gutenberg_p0($published_post?->post_date_gmt === $published_post?->post_date, 'The WordPress-generated publish GMT date must be verified as derived transaction state.');

reset_test_post();
$stale = prepare_valid_receipt($tickets, 'Stale title must not persist');
$GLOBALS['pixflow_test_posts'][41]->post_title = 'Changed outside Pixflow';
$stale_approval = $service->validate_approval_arguments($stale['arguments'], 'p0-session');
expect_gutenberg_p0($stale_approval instanceof WP_Error && $stale_approval->get_error_code() === 'gutenberg_stale_document', 'A receipt must be rejected at approval when the current post fingerprint changed.');
expect_gutenberg_p0(get_post(41)?->post_title === 'Changed outside Pixflow', 'A stale receipt rejection must not overwrite the concurrent post state.');

reset_test_post();
$before_mismatch_state = mutation_state();
$mismatch = prepare_valid_receipt($tickets, 'Must be rolled back');
$mismatch['arguments']['post']['excerpt'] = 'This excerpt must be rolled back.';
$mismatch['arguments']['post']['status'] = 'pending';
$mismatch['arguments']['terms'] = ['category' => []];
$mismatch['arguments']['featuredMediaId'] = 0;
$GLOBALS['pixflow_test_corrupt_next_content_write'] = true;
$mismatch_result = $service->apply_document($mismatch['arguments']);
expect_gutenberg_p0($mismatch_result instanceof WP_Error && $mismatch_result->get_error_code() === 'gutenberg_readback_failed', 'A persisted content mismatch must fail the transaction.');
expect_gutenberg_p0(($mismatch_result->get_error_data()['compensatingRollback']['succeeded'] ?? false) === true, 'A readback mismatch must record successful compensating rollback.');
expect_gutenberg_p0(mutation_state() === $before_mismatch_state, 'Compensating rollback must restore title, content, excerpt, slug, status, terms, and featured media exactly.');

reset_test_post();
$preserve_before_hash = content_hash((string) get_post(41)?->post_content);
$wordpress = new WpAdminWordPressCapabilityService();
$preserved = $wordpress->update_post([
    'postId' => 41,
    'expectedModifiedGmt' => (string) get_post(41)?->post_modified_gmt,
    'fields' => ['title' => 'Metadata-only title'],
]);
expect_gutenberg_p0(is_array($preserved), 'A metadata-only update must remain available through the preserve-content path.');
expect_gutenberg_p0(content_hash((string) get_post(41)?->post_content) === $preserve_before_hash, 'Metadata-only updates must omit post_content and preserve its raw hash.');

echo "wp-admin-gutenberg-content-loss-regression: ok\n";
