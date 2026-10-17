<?php

use PixflowDesign\WordPress\Admin\Gutenberg\GutenbergDocumentRepository;
use PixflowDesign\WordPress\Admin\WpAdminContext;
use PixflowDesign\WordPress\Admin\WpAdminWordPressCapabilityService;

if (!defined('ABSPATH')) {
    throw new RuntimeException('Run this test through WP-CLI eval-file.');
}

function expect_gutenberg_read(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

function read_binding(int $post_id, string $tab = 'qa-read-tab', string $conversation = 'qa-read-conversation'): array
{
    $post = get_post($post_id);
    expect_gutenberg_read($post instanceof WP_Post, "Post {$post_id} is missing.");
    $context = (new WpAdminContext())->snapshot(['postId' => $post_id, 'postType' => $post->post_type, 'screenId' => 'post', 'base' => 'post']);
    return [
        'sessionId' => 'qa-read-session', 'conversationId' => $conversation,
        'sourceMessageId' => 'qa-read-source', 'tabId' => $tab,
        'contextIdentity' => $context['identity'],
    ];
}

$repository = new GutenbergDocumentRepository();
$post54 = get_post(54);
expect_gutenberg_read($post54 instanceof WP_Post, 'Post 54 fixture is missing.');
$before54 = [
    hash('sha256', (string) $post54->post_content), (string) $post54->post_modified_gmt,
    count(wp_get_post_revisions(54, ['check_enabled' => false])), (int) get_post_thumbnail_id(54),
    wp_get_post_terms(54, 'category', ['fields' => 'ids']), wp_get_post_terms(54, 'post_tag', ['fields' => 'ids']),
];
$metadata54 = (new WpAdminWordPressCapabilityService())->get_post_metadata(54);
expect_gutenberg_read(is_array($metadata54) && ($metadata54['schema'] ?? '') === 'pixflow.wp-admin.post-metadata.v1', 'Generic get-post must expose an explicit metadata-only schema.');
expect_gutenberg_read(($metadata54['contentMode'] ?? '') === 'metadata_only' && ($metadata54['contentIncluded'] ?? true) === false, 'Generic get-post must not pretend body content was inspected.');
$read54 = $repository->read(54, ['postId' => 54], read_binding(54));
expect_gutenberg_read(is_array($read54), 'Post 54 exact read failed.');
expect_gutenberg_read(($read54['schema'] ?? '') === 'pixflow.wp-admin.gutenberg-read.v2', 'Post 54 must use the v2 read schema.');
expect_gutenberg_read(($read54['readMode'] ?? '') === 'inline' && ($read54['contentComplete'] ?? false) === true && ($read54['contentTruncated'] ?? true) === false, 'Post 54 must be a complete inline read.');
expect_gutenberg_read(($read54['document']['serializedBytes'] ?? 0) === 4405, 'Post 54 byte length changed.');
expect_gutenberg_read(($read54['document']['contentSha256'] ?? '') === 'sha256:081026a7343f18ed4bfed17e4b8afd598d50ca8c717e7779a93f99f4f6421553', 'Post 54 raw content hash changed.');
expect_gutenberg_read(($read54['document']['topLevelBlockCount'] ?? 0) === 47 && ($read54['document']['totalBlockCount'] ?? 0) === 60, 'Post 54 WordPress parser block counts do not match the fixture.');
expect_gutenberg_read(($read54['document']['editableTopLevelBlockCount'] ?? 0) === 24 && ($read54['document']['editableTotalBlockCount'] ?? 0) === 37, 'Post 54 compact editable block counts do not match the fixture.');
expect_gutenberg_read(($read54['document']['namedBlockCount'] ?? 0) === 37, 'Post 54 named block count does not match the fixture.');
expect_gutenberg_read(!array_filter((array) ($read54['blocks'] ?? []), static fn(array $block): bool => ($block['name'] ?? '') === 'core/freeform' && trim((string) ($block['attributes']['content'] ?? '')) === ''), 'Delimiter whitespace must not become empty freeform blocks in the editable tree.');
$raw54 = (string) ($read54['contentRaw'] ?? '');
foreach (['PF-READ-FIRST', 'PF-READ-MIDDLE', 'PF-READ-FINAL'] as $marker) expect_gutenberg_read(str_contains($raw54, $marker), "Post 54 is missing {$marker}.");
$inline_ids = array_values(array_unique(array_map(static fn(array $item): int => (int) ($item['attachmentId'] ?? 0), (array) ($read54['inlineMedia'] ?? []))));
sort($inline_ids);
expect_gutenberg_read($inline_ids === [17, 18], 'Post 54 inline media must be attachments 17 and 18.');
expect_gutenberg_read(($read54['post']['featuredMediaId'] ?? 0) === 19, 'Post 54 featured media must be attachment 19.');
expect_gutenberg_read(!str_contains((string) wp_json_encode($read54['blocks']), 'sourceMarkup'), 'Compact read blocks must not duplicate sourceMarkup.');
$after54 = get_post(54);
expect_gutenberg_read($after54 instanceof WP_Post && $before54 === [
    hash('sha256', (string) $after54->post_content), (string) $after54->post_modified_gmt,
    count(wp_get_post_revisions(54, ['check_enabled' => false])), (int) get_post_thumbnail_id(54),
    wp_get_post_terms(54, 'category', ['fields' => 'ids']), wp_get_post_terms(54, 'post_tag', ['fields' => 'ids']),
], 'Reading post 54 must not mutate content, metadata, media, terms, or revisions.');

$binding55 = read_binding(55, 'qa-read-large-tab', 'qa-read-large-conversation');
$read55 = $repository->read(55, ['postId' => 55], $binding55);
expect_gutenberg_read(is_array($read55) && ($read55['readMode'] ?? '') === 'chunked', 'Post 55 must use a chunked snapshot.');
expect_gutenberg_read(($read55['contentComplete'] ?? true) === false && ($read55['contentTruncated'] ?? true) === false, 'The post 55 index must be incomplete but not truncated.');
$snapshot_id = (string) ($read55['snapshotId'] ?? '');
$chunk_count = (int) ($read55['chunkCount'] ?? 0);
expect_gutenberg_read($snapshot_id !== '' && $chunk_count > 1, 'Post 55 must expose a multi-chunk snapshot.');
$reassembled = '';
for ($cursor = 0; $cursor < $chunk_count; $cursor++) {
    $chunk = $repository->read(55, ['postId' => 55, 'snapshotId' => $snapshot_id, 'cursor' => $cursor], $binding55);
    expect_gutenberg_read(is_array($chunk) && ($chunk['chunkIndex'] ?? -1) === $cursor, "Post 55 chunk {$cursor} failed.");
    expect_gutenberg_read(($chunk['chunkSha256'] ?? '') === 'sha256:' . hash('sha256', (string) ($chunk['contentFragment'] ?? '')), "Post 55 chunk {$cursor} hash failed.");
    expect_gutenberg_read(($chunk['contentComplete'] ?? true) === false, "Post 55 chunk {$cursor} must not claim to contain the complete document.");
    expect_gutenberg_read(($chunk['isFinalChunk'] ?? false) === ($cursor === $chunk_count - 1), "Post 55 chunk {$cursor} final-chunk evidence is wrong.");
    expect_gutenberg_read(($chunk['hasMore'] ?? false) === ($cursor < $chunk_count - 1), "Post 55 chunk {$cursor} continuation evidence is wrong.");
    $reassembled .= (string) ($chunk['contentFragment'] ?? '');
}
expect_gutenberg_read(strlen($reassembled) === 675490, 'Post 55 reassembled byte length changed.');
expect_gutenberg_read('sha256:' . hash('sha256', $reassembled) === 'sha256:7e653bde1731d32b73e7183c65d38d7d51b87b7d2a02d3f91339f29ebbf1f59f', 'Post 55 reassembled hash changed.');
foreach (['PF-LONG-BEGIN', 'PF-LONG-MIDDLE', 'PF-LONG-END'] as $marker) expect_gutenberg_read(str_contains($reassembled, $marker), "Post 55 is missing {$marker} after reassembly.");
$wrong_tab = $binding55;
$wrong_tab['tabId'] = 'another-tab';
$reused = $repository->read(55, ['postId' => 55, 'snapshotId' => $snapshot_id, 'cursor' => 0], $wrong_tab);
expect_gutenberg_read($reused instanceof WP_Error && $reused->get_error_code() === 'gutenberg_read_snapshot_mismatch', 'A different tab must not reuse a read snapshot.');
$wrong_conversation = $binding55;
$wrong_conversation['conversationId'] = 'another-conversation';
$reused = $repository->read(55, ['postId' => 55, 'snapshotId' => $snapshot_id, 'cursor' => 0], $wrong_conversation);
expect_gutenberg_read($reused instanceof WP_Error && $reused->get_error_code() === 'gutenberg_read_snapshot_mismatch', 'A different conversation must not reuse a read snapshot.');
$snapshot_key = 'pixflow_gbrs_' . hash('sha256', $snapshot_id);
$snapshot_record = get_transient($snapshot_key);
expect_gutenberg_read(is_array($snapshot_record), 'The post 55 snapshot record must exist.');
$snapshot_record['fingerprint'] = 'sha256:' . str_repeat('0', 64);
set_transient($snapshot_key, $snapshot_record, 600);
$stale = $repository->read(55, ['postId' => 55, 'snapshotId' => $snapshot_id, 'cursor' => 0], $binding55);
expect_gutenberg_read($stale instanceof WP_Error && $stale->get_error_code() === 'gutenberg_read_snapshot_mismatch', 'A stale snapshot fingerprint must be rejected.');
$snapshot_record['fingerprint'] = $read55['fingerprint'];
$snapshot_record['expiresAt'] = time() - 1;
set_transient($snapshot_key, $snapshot_record, 600);
$expired = $repository->read(55, ['postId' => 55, 'snapshotId' => $snapshot_id, 'cursor' => 0], $binding55);
expect_gutenberg_read($expired instanceof WP_Error && $expired->get_error_code() === 'gutenberg_read_snapshot_expired', 'An expired snapshot must be rejected.');

echo "wp-admin-gutenberg-read-grounding-live: ok\n";
