<?php

declare(strict_types=1);

/** Phase 4 red specifications at the source boundary. */

function assert_wp_admin_capability_boundary(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$registry = (string) file_get_contents(dirname(__DIR__) . '/src/Admin/WpAdminCapabilityRegistry.php');
$plane = (string) file_get_contents(dirname(__DIR__) . '/src/Admin/WpAdminCapabilitySafetyPlane.php');
$pairing = (string) file_get_contents(dirname(__DIR__) . '/src/Admin/WpAdminPairingService.php');
$routes = (string) file_get_contents(dirname(__DIR__) . '/src/Http/WpAdminCapabilityRestController.php');

assert_wp_admin_capability_boundary(str_contains($registry, "'wordpress-core'") && str_contains($registry, "'pixflow/wp-admin/get-post'"), 'The explicit Pixflow core manifest must exist.');
assert_wp_admin_capability_boundary(str_contains($registry, 'if (!$is_available && !$is_status_capability) continue;') && str_contains($registry, 'native_definition'), 'Unavailable integrations must expose only diagnostic status, never guessed executable capabilities.');
assert_wp_admin_capability_boundary(str_contains($registry, 'upgrader_process_complete') && str_contains($registry, 'invalidate'), 'Family detection cache must have lifecycle invalidation.');
assert_wp_admin_capability_boundary(str_contains($plane, 'normalise_schema') && str_contains($plane, 'schema_unknown_field'), 'Execution must validate and reject unsafe schema input.');
assert_wp_admin_capability_boundary(str_contains($plane, "current_user_can('edit_post', \$post_id)") && str_contains($plane, "in_array('edit_post', \$required, true)"), 'Post-specific permissions must be checked with the live target ID.');
assert_wp_admin_capability_boundary(
    str_contains($plane, "\$target_type === 'media'")
        && str_contains($plane, "current_user_can('read_post', \$attachment_id)"),
    'Media-target reads must check read_post against the exact attachment ID instead of calling the meta capability without an object.',
);
assert_wp_admin_capability_boundary(str_contains($plane, "if (\$mode !== 'design' && \$risk !== 'read_only')"), 'Ask and Plan must be denied at the server mutation boundary.');
assert_wp_admin_capability_boundary(str_contains($plane, 'consume_approval') && str_contains($plane, 'approval_replayed'), 'Approvals must be bound and one-time.');
assert_wp_admin_capability_boundary(str_contains($plane, 'idempotency_key_reused') && str_contains($plane, 'find_operation_for_request'), 'Idempotency and indeterminate-operation lookup must be explicit.');
assert_wp_admin_capability_boundary(str_contains($plane, 'rollback_conflict') && str_contains($plane, 'dispatch_rollback') && str_contains($plane, 'live_fingerprint'), 'Rollback must fail closed and detect target conflicts.');
assert_wp_admin_capability_boundary(str_contains($plane, "\$result['rollback']['afterFingerprint']") && str_contains($plane, 'after_fingerprint'), 'Rollback fingerprints must preserve nested create-operation receipts.');
assert_wp_admin_capability_boundary(str_contains($plane, "unset(\$operation['arguments']") && str_contains($plane, 'redactedArgumentsHash'), 'Audit and operation responses must not expose raw arguments or secrets.');
assert_wp_admin_capability_boundary(
    str_contains($plane, "['code', 'content', 'original_code']") && str_contains($plane, 'wp_check_invalid_utf8($bounded)'),
    'Bounded source results must retain PHP, HTML, CSS, and JavaScript syntax instead of being text-sanitised.',
);
assert_wp_admin_capability_boundary(str_contains($pairing, 'tokenHash') && str_contains($pairing, 'revokedAt') && str_contains($pairing, 'site_id'), 'CLI pairing must be hashed, revocable, and site-bound.');
assert_wp_admin_capability_boundary(str_contains($pairing, 'bin2hex(random_bytes(32))') && !str_contains($pairing, 'wp_generate_password(48, true, true)'), 'Issued CLI tokens must always match the safe authentication alphabet.');
assert_wp_admin_capability_boundary(str_contains($pairing, 'HTTP_AUTHORIZATION') && str_contains($pairing, 'REDIRECT_HTTP_AUTHORIZATION'), 'CLI authentication must tolerate common PHP server header forwarding variants.');
assert_wp_admin_capability_boundary(str_contains($routes, "'/wp-admin/approvals'") && str_contains($routes, "'/wp-admin/execute'") && str_contains($routes, "'/wp-admin/rollback'"), 'Discovery, approval, execution, and rollback routes must exist.');
assert_wp_admin_capability_boundary(str_contains($routes, 'authenticate_request'), 'Capability routes must accept only the browser policy or explicit pairing token.');

echo "wp-admin-capability-safety-boundary: ok\n";
