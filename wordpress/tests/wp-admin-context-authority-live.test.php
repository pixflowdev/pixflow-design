<?php

use PixflowDesign\WordPress\Admin\WpAdminCapabilitySafetyPlane;
use PixflowDesign\WordPress\Admin\WpAdminContext;
use PixflowDesign\WordPress\Admin\WpAdminContextAuthority;

if (!defined('ABSPATH')) {
    fwrite(STDERR, "Run this test through wp eval-file.\n");
    exit(2);
}

function assert_live_context(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$user = get_user_by('login', 'pixflow');
assert_live_context($user instanceof WP_User, 'The local QA administrator is unavailable.');
wp_set_current_user((int) $user->ID);

$post42 = get_post(42);
$post54 = get_post(54);
assert_live_context($post42 instanceof WP_Post && $post54 instanceof WP_Post, 'Posts 42 and 54 must exist.');

$context = new WpAdminContext();
$authority = new WpAdminContextAuthority($context);
$plane = new WpAdminCapabilitySafetyPlane();
$tab = 'qa-context-live-' . wp_generate_uuid4();

$explicit_page = get_post(109);
assert_live_context($explicit_page instanceof WP_Post && $explicit_page->post_type === 'page', 'The explicit page fixture is unavailable.');
$inferred_page_context = $context->snapshot(['screenId' => 'post', 'base' => 'post', 'postId' => 109]);
assert_live_context(
    ($inferred_page_context['identity']['objectKind'] ?? '') === 'post'
    && ($inferred_page_context['identity']['objectType'] ?? '') === 'page'
    && (int) ($inferred_page_context['identity']['objectId'] ?? 0) === 109,
    'A fresh explicit target context must resolve the authoritative post type from WordPress when the caller supplies only a post ID.'
);
$issued_explicit_page = $authority->issue($inferred_page_context, $tab, 'explicit_user_target');
assert_live_context(!is_wp_error($issued_explicit_page), 'Fresh explicit page authority could not be issued.');

$mislabelled_page_context = $context->snapshot([
    'screenId' => 'post',
    'base' => 'post',
    'postType' => 'post',
    'postId' => 109,
]);
assert_live_context(
    ($mislabelled_page_context['identity']['objectKind'] ?? '') === 'post'
    && ($mislabelled_page_context['identity']['objectType'] ?? '') === 'page'
    && (int) ($mislabelled_page_context['identity']['objectId'] ?? 0) === 109
    && ($mislabelled_page_context['screen']['postType'] ?? '') === 'page',
    'A client-supplied post-type hint must not override the authoritative WordPress type for an explicit numeric target.'
);

// Refreshing an existing authority record must promote it to the newest slot.
// Otherwise one later explicit-target read can evict the freshly refreshed
// site-level token used by the first action in a mixed site/post batch.
$retained_tab = 'qa-retained-' . wp_generate_uuid4();
$dashboard_context = $context->snapshot(['screenId' => 'dashboard', 'base' => 'dashboard']);
$retained = $authority->issue($dashboard_context, $retained_tab, 'active_context_target');
assert_live_context(!is_wp_error($retained), 'Initial retained dashboard authority could not be issued.');
for ($index = 0; $index < 15; $index++) {
    $filler = $authority->issue($dashboard_context, 'qa-filler-' . $index . '-' . wp_generate_uuid4(), 'active_context_target');
    assert_live_context(!is_wp_error($filler), 'Authority-store filler could not be issued.');
}
$retained = $authority->issue($dashboard_context, $retained_tab, 'active_context_target');
assert_live_context(!is_wp_error($retained), 'Retained dashboard authority could not be refreshed.');
$overflow = $authority->issue($inferred_page_context, 'qa-overflow-' . wp_generate_uuid4(), 'explicit_user_target');
assert_live_context(!is_wp_error($overflow), 'Authority-store overflow record could not be issued.');
$retained_binding = [
    'contextIdentity' => $retained['identity'],
    'contextAuthority' => $retained['token'],
    'tabId' => $retained_tab,
    'targetProvenance' => 'active_context_target',
];
assert_live_context(
    !is_wp_error($authority->verify($retained_binding)),
    'Refreshing an existing authority record did not protect it from bounded-store eviction.'
);

$snapshot42 = $context->snapshot(['screenId' => 'post', 'base' => 'post', 'postType' => 'post', 'postId' => 42]);
$issued42 = $authority->issue($snapshot42, $tab, 'active_context_target');
assert_live_context(!is_wp_error($issued42), 'Post-42 context authority could not be issued.');
$binding42 = [
    'contextIdentity' => $issued42['identity'],
    'contextAuthority' => $issued42['token'],
    'contextScope' => 'live-post-42',
    'conversationId' => 'live-conversation-42',
    'sourceMessageId' => 'live-source-42',
    'tabId' => $tab,
    'targetProvenance' => 'active_context_target',
];

// A same-tab refresh of the exact same immutable context must not revoke an
// in-flight request that was bound immediately before the refresh.
$refreshed42 = $authority->issue($snapshot42, $tab, 'active_context_target');
assert_live_context(!is_wp_error($refreshed42), 'Post-42 context authority could not be refreshed.');
$verified_original42 = $authority->verify($binding42);
assert_live_context(!is_wp_error($verified_original42), 'Refreshing an unchanged post context revoked the in-flight authority token.');

$request42 = [
    'surface' => 'wp_admin',
    'sessionId' => 'live-context-isolation',
    'mode' => 'design',
    'capabilityId' => 'pixflow/wp-admin/update-post',
    'arguments' => [
        'postId' => 42,
        'expectedModifiedGmt' => (string) $post42->post_modified_gmt,
        'fields' => ['title' => (string) $post42->post_title],
    ],
    'contextBinding' => $binding42,
];

$approval = $plane->request_approval($request42);
if (is_wp_error($approval)) {
    throw new RuntimeException('A correctly bound post-42 review could not be prepared: ' . $approval->get_error_code() . ' — ' . $approval->get_error_message());
}
assert_live_context(!is_wp_error($approval), 'A correctly bound post-42 review could not be prepared.');

$snapshot54 = $context->snapshot(['screenId' => 'post', 'base' => 'post', 'postType' => 'post', 'postId' => 54]);
$issued54 = $authority->issue($snapshot54, $tab, 'active_context_target');
assert_live_context(!is_wp_error($issued54), 'Post-54 context authority could not be issued.');

$stale_prepare = $plane->request_approval($request42);
assert_live_context(is_wp_error($stale_prepare) && $stale_prepare->get_error_code() === 'context_mismatch', 'Stale preparation was not rejected after tab navigation.');

$stale_execute = $plane->execute($request42 + [
    'approvalToken' => (string) $approval['approval']['token'],
    'operationId' => (string) $approval['operation']['operationId'],
    'idempotencyKey' => 'live-context-mismatch-' . wp_generate_uuid4(),
]);
assert_live_context(is_wp_error($stale_execute) && $stale_execute->get_error_code() === 'context_mismatch', 'Stale approval execution was not rejected after tab navigation.');

$fresh42 = get_post(42);
assert_live_context($fresh42 instanceof WP_Post, 'Post 42 disappeared during the test.');
assert_live_context((string) $fresh42->post_title === (string) $post42->post_title, 'A rejected stale action changed the post title.');
assert_live_context(hash('sha256', (string) $fresh42->post_content) === hash('sha256', (string) $post42->post_content), 'A rejected stale action changed post content.');

$audit_response = $plane->audit_events(20);
$audit = is_array($audit_response['events'] ?? null) ? $audit_response['events'] : [];
$rejected = array_values(array_filter($audit, static fn(array $event): bool => ($event['event'] ?? '') === 'rejected' && ($event['detail'] ?? '') === 'context_mismatch'));
assert_live_context(count($rejected) >= 2, 'Preparation and execution context mismatches were not audited.');

echo wp_json_encode([
    'schema' => 'pixflow.wp-admin.context-isolation-live-proof.v1',
    'post42Conversation' => $binding42['conversationId'],
    'post42SourceMessage' => $binding42['sourceMessageId'],
    'post42ContextRevision' => $issued42['identity']['contextRevision'],
    'post42ContentFingerprint' => $issued42['identity']['contentFingerprint'],
    'post54ContextRevision' => $issued54['identity']['contextRevision'],
    'post54ContentFingerprint' => $issued54['identity']['contentFingerprint'],
    'reviewOperationId' => $approval['operation']['operationId'],
    'reviewTokenId' => $approval['approval']['tokenId'],
    'prepareMismatch' => $stale_prepare->get_error_code(),
    'executeMismatch' => $stale_execute->get_error_code(),
    'rejectedAuditCount' => count($rejected),
    'post42TitleHash' => hash('sha256', (string) $fresh42->post_title),
    'post42ContentHash' => hash('sha256', (string) $fresh42->post_content),
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
