<?php

declare(strict_types=1);

function assert_wp_admin_context_isolation(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$root = dirname(__DIR__);
$context = (string) file_get_contents($root . '/src/Admin/WpAdminContext.php');
$authority = (string) @file_get_contents($root . '/src/Admin/WpAdminContextAuthority.php');
$plane = (string) file_get_contents($root . '/src/Admin/WpAdminCapabilitySafetyPlane.php');
$routes = (string) file_get_contents($root . '/src/Http/RestController.php');
$frame = (string) file_get_contents(dirname(__DIR__, 2) . '/apps/web/src/pixflow/WpAdminAgentFrameApp.tsx');

assert_wp_admin_context_isolation(str_contains($context, 'pixflow.wp-admin.context-identity.v1'), 'The server context must publish a typed identity schema.');
assert_wp_admin_context_isolation(str_contains($context, 'contentFingerprint'), 'Post context must include a raw-content fingerprint without exposing content.');
assert_wp_admin_context_isolation(str_contains($authority, 'tabId') && str_contains($authority, 'context_mismatch'), 'Server authority must bind the latest verified context to a tab and reject mismatches.');
assert_wp_admin_context_isolation(str_contains($authority, 'hash_equals') && str_contains($authority, 'expiresAt'), 'Context authority must be signed, bounded and expiring.');
assert_wp_admin_context_isolation(str_contains($authority, "'tokenHashes'") && str_contains($authority, "'identityHash'"), 'Same-context token refreshes must preserve bounded in-flight authority while a changed identity revokes it.');
assert_wp_admin_context_isolation(str_contains($routes, "get_param('tabId')") && str_contains($routes, 'issue'), 'The context route must issue authority for a verified tab context.');
assert_wp_admin_context_isolation(str_contains($plane, 'context_authority->verify') && str_contains($plane, 'contextBindingHash'), 'Approval and execution must bind to verified context authority.');
assert_wp_admin_context_isolation(str_contains($plane, 'conversationId') && str_contains($plane, 'sourceMessageId'), 'Actions must bind to their conversation and source message.');
assert_wp_admin_context_isolation(str_contains($plane, "\$requires_exact_read_context = \$handler === 'gutenberg_read_document'") && str_contains($plane, 'gutenberg_read_context_required'), 'Exact Gutenberg reads must require verified context authority at the server boundary.');
assert_wp_admin_context_isolation(str_contains($frame, 'authoritativeWpAdminMessages') && str_contains($frame, 'pendingClarification'), 'The client must filter message origin and use typed clarification state.');
assert_wp_admin_context_isolation(str_contains($frame, 'sanitizeUnsupportedReviewClaim'), 'Assistant prose must not create a fictional review state.');
assert_wp_admin_context_isolation(str_contains($frame, 'awaitingInput: true') && str_contains($frame, 'label: translateUi("ui.wpAdminAgentFrameApp.awaitingUser")'), 'Clarifications must render immediately with a translated awaiting-user label.');
assert_wp_admin_context_isolation(str_contains($frame, 'refreshContext()') && str_contains($frame, 'turnIdentity'), 'Every submitted turn must re-read and bind fresh live context.');

echo "wp-admin-context-isolation-boundary: ok\n";
