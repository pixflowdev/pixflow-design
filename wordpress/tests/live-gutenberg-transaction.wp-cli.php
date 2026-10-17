<?php

use PixflowDesign\WordPress\Admin\Gutenberg\GutenbergDocumentRepository;
use PixflowDesign\WordPress\Admin\Gutenberg\GutenbergSerializationTicketStore;
use PixflowDesign\WordPress\Admin\Gutenberg\WpAdminGutenbergCapabilityService;

if (!defined('ABSPATH')) {
    throw new RuntimeException('Run this file through WP-CLI eval-file.');
}

$post_id = wp_insert_post([
    'post_type' => 'post',
    'post_status' => 'draft',
    'post_title' => 'Pixflow live Gutenberg transaction fixture',
    'post_excerpt' => 'Original excerpt.',
    'post_content' => "<!-- wp:paragraph -->\n<p>Original content.</p>\n<!-- /wp:paragraph -->",
    'post_author' => get_current_user_id(),
], true);
if (is_wp_error($post_id)) {
    throw new RuntimeException($post_id->get_error_message());
}

try {
    $post_id = (int) $post_id;
    global $wpdb;
    $wpdb->update($wpdb->posts, [
        'post_author' => 0,
        'post_name' => 'pixflow-live-gutenberg-transaction-fixture',
    ], ['ID' => $post_id], ['%d', '%s'], ['%d']);
    wp_set_post_terms($post_id, [], 'category', false);
    clean_post_cache($post_id);
    $write_snapshots = [];
    $capture_write = static function (int $updated_post_id, WP_Post $updated_post) use ($post_id, &$write_snapshots): void {
        if ($updated_post_id !== $post_id) {
            return;
        }
        $write_snapshots[] = [
            'title' => $updated_post->post_title,
            'authorId' => (int) $updated_post->post_author,
            'slug' => $updated_post->post_name,
            'contentHash' => 'sha256:' . hash('sha256', $updated_post->post_content),
            'modified' => $updated_post->post_modified,
            'modifiedGmt' => $updated_post->post_modified_gmt,
        ];
    };
    add_action('wp_insert_post', $capture_write, 999, 2);
    $session_id = 'pixflow-live-gutenberg-transaction';
    $documents = new GutenbergDocumentRepository();
    $tickets = new GutenbergSerializationTicketStore();
    $service = new WpAdminGutenbergCapabilityService(tickets: $tickets);
    $blocks = [
        ['name' => 'core/paragraph', 'attributes' => ['content' => 'Replacement introduction.'], 'innerBlocks' => []],
        ['name' => 'core/heading', 'attributes' => ['content' => 'Replacement heading', 'level' => 2], 'innerBlocks' => []],
        ['name' => 'core/paragraph', 'attributes' => ['content' => 'Replacement conclusion.'], 'innerBlocks' => []],
    ];
    $content = implode("\n\n", [
        "<!-- wp:paragraph -->\n<p>Replacement introduction.</p>\n<!-- /wp:paragraph -->",
        "<!-- wp:heading -->\n<h2 class=\"wp-block-heading\">Replacement heading</h2>\n<!-- /wp:heading -->",
        "<!-- wp:paragraph -->\n<p>Replacement conclusion.</p>\n<!-- /wp:paragraph -->",
    ]);
    $expected = $documents->fingerprint($post_id);
    $ticket = $tickets->prepare([
        'postId' => $post_id,
        'sessionId' => $session_id,
        'expectedFingerprint' => $expected,
        'blocks' => $blocks,
    ]);
    if (is_wp_error($ticket)) {
        throw new RuntimeException($ticket->get_error_code() . ': ' . $ticket->get_error_message());
    }
    $receipt = $tickets->accept_browser_result([
        'ticketId' => $ticket['ticketId'],
        'resolvedTreeHash' => $ticket['resolvedTreeHash'],
        'content' => $content,
        'validation' => ['valid' => true, 'errors' => [], 'blockCount' => 3],
    ]);
    if (is_wp_error($receipt)) {
        throw new RuntimeException($receipt->get_error_code() . ': ' . $receipt->get_error_message());
    }
    $before = get_post($post_id);
    $result = $service->apply_document([
        'postId' => $post_id,
        'expectedFingerprint' => $expected,
        'preparedReceiptId' => $receipt['preparedReceiptId'],
        'preparedSessionId' => $session_id,
        'contentIntent' => 'replace',
        'post' => ['title' => 'Pixflow live replacement result', 'status' => 'draft'],
    ]);
    $after = get_post($post_id);
    echo wp_json_encode([
        'postId' => $post_id,
        'resultType' => is_wp_error($result) ? 'error' : 'success',
        'errorCode' => is_wp_error($result) ? $result->get_error_code() : null,
        'errorData' => is_wp_error($result) ? $result->get_error_data() : null,
        'before' => [
            'title' => $before?->post_title,
            'contentHash' => $before instanceof WP_Post ? 'sha256:' . hash('sha256', $before->post_content) : null,
            'modified' => $before?->post_modified,
            'modifiedGmt' => $before?->post_modified_gmt,
        ],
        'after' => [
            'title' => $after?->post_title,
            'contentHash' => $after instanceof WP_Post ? 'sha256:' . hash('sha256', $after->post_content) : null,
            'modified' => $after?->post_modified,
            'modifiedGmt' => $after?->post_modified_gmt,
        ],
        'receipt' => [
            'contentHash' => $receipt['contentHash'],
            'serializedBytes' => $receipt['serializedBytes'],
            'topLevelBlockCount' => $receipt['topLevelBlockCount'],
            'blockCount' => $receipt['blockCount'],
        ],
        'writeSnapshots' => $write_snapshots,
        'result' => is_array($result) ? $result : null,
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), "\n";
    remove_action('wp_insert_post', $capture_write, 999);
} finally {
    if (isset($post_id) && is_int($post_id) && $post_id > 0) {
        wp_delete_post($post_id, true);
    }
}
