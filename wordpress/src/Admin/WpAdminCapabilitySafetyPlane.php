<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Admin;

if (!defined('ABSPATH')) {
    exit;
}

use PixflowDesign\WordPress\Admin\WpAdminContext;
use PixflowDesign\WordPress\Admin\Gutenberg\GutenbergBlockTreeNormalizer;
use PixflowDesign\WordPress\Admin\Gutenberg\WpAdminGutenbergCapabilityService;

/**
 * Shared server boundary for WP Admin discovery, approval, execution, audit,
 * idempotency, reconciliation, and rollback descriptors.
 *
 * This class intentionally starts with read-only WordPress handlers. Future
 * Core/ACF/Bricks adapters register explicit handler names in the manifest;
 * an unknown handler always fails closed and never falls through to update_option,
 * arbitrary post meta, filesystem, PHP, WP-CLI, or third-party ability calls.
 */
final class WpAdminCapabilitySafetyPlane
{
    private const OPERATIONS_OPTION = 'pixflow_design_wp_admin_operations_v1';
    private const AUDIT_OPTION = 'pixflow_design_wp_admin_audit_v1';
    private const APPROVAL_META = 'pixflow_design_wp_admin_approvals_v1';
    private const MAX_OPERATIONS = 256;
    private const MAX_AUDIT = 512;
    private const APPROVAL_TTL = 300;

    /** Legacy constructor slots stay nullable; Pro handlers resolve through authorized feature contributions. */
    public function __construct(
        private readonly WpAdminCapabilityRegistry $registry = new WpAdminCapabilityRegistry(),
        private readonly WpAdminContext $context = new WpAdminContext(),
        private readonly WpAdminPairingService $pairing = new WpAdminPairingService(),
        private readonly WpAdminWordPressCapabilityService $wordpress = new WpAdminWordPressCapabilityService(),
        ?object $plugin_source = null,
        private readonly WpAdminSettingsCapabilityService $settings = new WpAdminSettingsCapabilityService(),
        private readonly WpAdminIntegrationStatusService $integrations = new WpAdminIntegrationStatusService(),
        ?object $code_projects = null,
        private readonly GutenbergBlockTreeNormalizer $gutenberg_normalizer = new GutenbergBlockTreeNormalizer(),
        private readonly WpAdminGutenbergCapabilityService $gutenberg = new WpAdminGutenbergCapabilityService(),
        private readonly WpAdminContextAuthority $context_authority = new WpAdminContextAuthority(),
    ) {
    }

    /** @return array<string, mixed> */
    public function summary(): array
    {
        $summary = $this->registry->family_summary();
        $this->audit('discovered', 'pixflow/wp-admin/capability-summary', 'read_only', null, null, 'summary');
        return [
            'schema' => 'pixflow.wp-admin.capability-api.v1',
            'version' => 1,
            'surface' => 'wp_admin',
            'families' => array_values($summary['families']),
            'unavailable' => array_values($summary['unavailable']),
        ];
    }

    /** @return array<string, mixed>|\WP_Error */
    public function detail(string $capability_id): array|\WP_Error
    {
        if (($unavailable = $this->advanced_unavailable($capability_id)) !== null) return $unavailable;
        $capability = $this->registry->find($capability_id);
        if ($capability === null) return $this->error('pixflow_capability_unavailable', 'Capability is unavailable or not adopted.', 404);
        $this->audit('detailed', (string) $capability['id'], (string) ($capability['annotations']['risk'] ?? 'unknown'), null, null, 'detail');
        return [
            'schema' => 'pixflow.wp-admin.capability-api.v1',
            'version' => 1,
            'surface' => 'wp_admin',
            'capability' => $capability,
        ];
    }

    /** @return array<string, mixed>|\WP_Error */
    public function request_approval(array $input): array|\WP_Error
    {
        if (($unavailable = $this->advanced_unavailable((string) ($input['capabilityId'] ?? $input['capability_id'] ?? ''))) !== null) return $unavailable;
        $validated = $this->validate_request($input, true);
        if ($validated instanceof \WP_Error) return $validated;
        $capability = $validated['capability'];
        $risk = (string) ($capability['annotations']['risk'] ?? 'unknown');
        $mode = (string) $validated['mode'];
        if ($risk === 'read_only') return $this->error('approval_not_required', 'Read-only capabilities do not require approval.', 400);
        if ($mode !== 'design') return $this->error('mode_forbids_mutation', 'Ask and Plan cannot request a mutation approval.', 403);
        if ($risk === 'unknown') return $this->error('risk_not_approved', 'Unknown risk cannot be approved.', 403);

        $operation = $this->new_operation($validated, 'proposed');
        $token_id = 'approval_' . wp_generate_uuid4();
        $token_secret = function_exists('wp_generate_password') ? wp_generate_password(48, true, true) : bin2hex(random_bytes(32));
        $token = 'pfa_' . $token_id . '_' . $token_secret;
        $now = time();
        $record = [
            'tokenId' => $token_id,
            'tokenHash' => hash('sha256', $token),
            'siteId' => $this->pairing->site_id(),
            'userId' => (string) get_current_user_id(),
            'sessionId' => $validated['sessionId'],
            'capabilityId' => $capability['id'],
            'argumentsHash' => $validated['argumentsHash'],
            'dependencyHash' => $validated['dependencyHash'],
            'contextBindingHash' => $validated['contextBindingHash'],
            'conversationId' => $validated['conversationId'],
            'sourceMessageId' => $validated['sourceMessageId'],
            'tabId' => $validated['tabId'],
            'operationId' => $operation['operationId'],
            'issuedAt' => $now,
            'expiresAt' => $now + self::APPROVAL_TTL,
            'consumedAt' => null,
        ];
        $this->save_approvals(array_slice([$token_id => $record] + $this->approvals(), 0, 64, true));
        $operation['status'] = 'approved';
        $operation['updatedAt'] = $this->now_ms();
        $this->save_operation($operation);
        $this->audit('approved', (string) $capability['id'], $risk, $operation['operationId'], $validated['argumentsHash'], 'approval_issued');

        return [
            'schema' => 'pixflow.wp-admin.capability-api.v1',
            'version' => 1,
            'approval' => [
                'tokenId' => $token_id,
                'token' => $token,
                'siteId' => $record['siteId'],
                'userId' => $record['userId'],
                'sessionId' => $record['sessionId'],
                'capabilityId' => $record['capabilityId'],
                'argumentsHash' => $record['argumentsHash'],
                'issuedAt' => $record['issuedAt'],
                'expiresAt' => $record['expiresAt'],
                'consumedAt' => null,
            ],
            'operation' => $this->safe_operation($operation),
        ];
    }

    /** @return array<string, mixed>|\WP_Error */
    public function execute(array $input): array|\WP_Error
    {
        if (($unavailable = $this->advanced_unavailable((string) ($input['capabilityId'] ?? $input['capability_id'] ?? ''))) !== null) return $unavailable;
        $validated = $this->validate_request($input, false);
        if ($validated instanceof \WP_Error) return $validated;
        $capability = $validated['capability'];
        $risk = (string) ($capability['annotations']['risk'] ?? 'unknown');
        $mode = (string) $validated['mode'];

        // Resolve an idempotent committed operation before consuming another
        // one-time approval token. This makes safe retries deterministic.
        $existing = $this->find_operation_for_request($validated);
        if ($existing !== null
            && ((string) ($existing['siteId'] ?? '') !== $this->pairing->site_id()
                || (string) ($existing['userId'] ?? '') !== (string) get_current_user_id())) {
            return $this->error('operation_forbidden', 'Operation belongs to another site or user.', 403);
        }
        if ($existing !== null) {
            if ((string) ($existing['capabilityId'] ?? '') !== (string) $capability['id']
                || ($existing['normalisedArgumentsHash'] ?? '') !== $validated['argumentsHash']
                || ($existing['dependencyHash'] ?? hash('sha256', wp_json_encode([]))) !== $validated['dependencyHash']
                || (string) ($existing['contextBindingHash'] ?? '') !== $validated['contextBindingHash']) {
                return $this->error('idempotency_key_reused', 'The operation is already bound to different capability arguments.', 409);
            }
            if (in_array((string) ($existing['status'] ?? ''), ['committed', 'reconciled'], true)) {
                return $this->execution_response($existing);
            }
        }

        $approval = null;
        if ($risk !== 'read_only') {
            if ($mode !== 'design') return $this->reject($capability, 'mode_forbids_mutation', 'Ask and Plan cannot execute mutations.');
            $approval = $this->consume_approval((string) ($validated['approvalToken'] ?? ''), $validated);
            if ($approval instanceof \WP_Error) return $approval;
        }

        $operation = $existing ?? $this->new_operation($validated, $approval !== null ? 'approved' : 'proposed');
        $operation['status'] = 'started';
        $operation['updatedAt'] = $this->now_ms();
        $this->save_operation($operation);
        $this->audit('started', (string) $capability['id'], $risk, $operation['operationId'], $validated['argumentsHash'], 'execution_started');

        try {
            $result = $this->dispatch(
                (string) ($this->registry->native_definition((string) $capability['id'])['handler'] ?? ''),
                $validated['arguments'],
                [
                    'sessionId' => $validated['sessionId'],
                    'conversationId' => $validated['conversationId'],
                    'sourceMessageId' => $validated['sourceMessageId'],
                    'tabId' => $validated['tabId'],
                    'contextIdentity' => is_array($validated['contextIdentity'] ?? null) ? $validated['contextIdentity'] : [],
                ],
            );
            if ($result instanceof \WP_Error) {
                $operation['status'] = 'failed';
                $operation['updatedAt'] = $this->now_ms();
                $operation['error'] = $result->get_error_code();
                $this->save_operation($operation);
                $this->audit('failed', (string) $capability['id'], $risk, $operation['operationId'], $validated['argumentsHash'], $result->get_error_code());
                return $result;
            }
            if (($result['allowed'] ?? null) === false && ($result['code'] ?? '') === 'pro_required') {
                $operation['status'] = 'failed';
                $operation['updatedAt'] = $this->now_ms();
                $operation['error'] = 'pro_required';
                $this->save_operation($operation);
                $this->audit('rejected', (string) $capability['id'], $risk, $operation['operationId'], $validated['argumentsHash'], 'pro_required');
                return $result;
            }
            $operation['status'] = 'committed';
            $operation['updatedAt'] = $this->now_ms();
            if (is_array($result) && is_scalar($result['beforeFingerprint'] ?? null)) {
                $operation['beforeFingerprint'] = (string) $result['beforeFingerprint'];
            }
            if (is_array($result) && is_array($result['rollback'] ?? null)) {
                $operation['rollback'] = $result['rollback'];
            }
            // Integration adapters may place the rollback fingerprint in a
            // nested rollback envelope (create-post/create-template), while
            // update/settings adapters expose it at the result root. Store
            // the same live fingerprint that rollback() will compare.
            $after_fingerprint = is_array($result)
                ? ($result['afterFingerprint'] ?? (is_array($result['rollback'] ?? null) ? ($result['rollback']['afterFingerprint'] ?? null) : null))
                : null;
            $operation['afterFingerprint'] = is_scalar($after_fingerprint)
                ? (string) $after_fingerprint
                : $this->target_fingerprint($validated['arguments']);
            // Keep the server-side rollback journal intact; all external
            // operation responses pass through safe_result below.
            $operation['result'] = is_array($result) ? $result : ['value' => $result];
            $this->save_operation($operation);
            $this->audit('committed', (string) $capability['id'], $risk, $operation['operationId'], $validated['argumentsHash'], 'execution_committed');
            return $this->execution_response($operation);
        } catch (\Throwable $exception) {
            $operation['status'] = 'failed';
            $operation['updatedAt'] = $this->now_ms();
            $operation['error'] = 'exception';
            $this->save_operation($operation);
            $this->audit('failed', (string) $capability['id'], $risk, $operation['operationId'], $validated['argumentsHash'], 'execution_exception');
            return $this->error('pixflow_capability_failed', 'Capability execution failed.', 500);
        }
    }

    /** @return array<string, mixed>|\WP_Error */
    public function operation(string $operation_id): array|\WP_Error
    {
        $operation = $this->operation_record($operation_id);
        if ($operation === null) return $this->error('operation_not_found', 'Operation was not found.', 404);
        if ((string) ($operation['userId'] ?? '') !== (string) get_current_user_id()) return $this->error('operation_forbidden', 'Operation belongs to another user.', 403);
        $operation['result'] = $this->safe_result($operation['result'] ?? null);
        return $this->safe_operation($operation);
    }

    /** @return array<string, mixed> */
    public function audit_events(int $limit = 100): array
    {
        $limit = max(1, min($limit, 200));
        $events = array_values(array_filter($this->audits(), static fn(array $event): bool => (string) ($event['userId'] ?? '') === (string) get_current_user_id()));
        usort($events, static fn(array $left, array $right): int => ((int) ($right['createdAt'] ?? 0)) <=> ((int) ($left['createdAt'] ?? 0)));
        return ['events' => array_slice($events, 0, $limit)];
    }

    /** @return array<string, mixed>|\WP_Error */
    public function rollback(array $input): array|\WP_Error
    {
        $operation = $this->operation_record((string) ($input['operationId'] ?? ''));
        if ($operation === null) return $this->error('operation_not_found', 'Operation was not found.', 404);
        if ((string) ($operation['siteId'] ?? '') !== $this->pairing->site_id()) return $this->error('operation_forbidden', 'Operation belongs to another site.', 403);
        if ((string) ($operation['userId'] ?? '') !== (string) get_current_user_id()) return $this->error('operation_forbidden', 'Operation belongs to another user.', 403);
        if (($unavailable = $this->advanced_unavailable((string) ($operation['capabilityId'] ?? ''))) !== null) return $unavailable;
        $capability = $this->registry->find((string) ($operation['capabilityId'] ?? ''));
        if ($capability === null || !$this->check_target_permission($capability, (array) ($operation['arguments'] ?? []))) {
            return $this->error('target_permission_denied', 'Your current permissions do not allow rolling back this operation.', 403);
        }
        if ((string) ($operation['status'] ?? '') !== 'committed') {
            $this->audit('rejected', (string) ($operation['capabilityId'] ?? ''), (string) ($operation['risk'] ?? 'unknown'), $operation['operationId'], null, 'rollback_operation_not_committed');
            return $this->error('rollback_unavailable', 'Only a currently committed operation can be rolled back.', 409);
        }
        if (sanitize_key((string) ($input['reason'] ?? '')) === 'manual_user_undo') {
            foreach (['sessionId', 'conversationId', 'sourceMessageId', 'tabId'] as $binding_field) {
                $provided = sanitize_text_field((string) ($input[$binding_field] ?? ''));
                $expected = (string) ($operation[$binding_field] ?? '');
                if ($provided === '' || $expected === '' || !hash_equals($expected, $provided)) {
                    $this->audit('rejected', (string) ($operation['capabilityId'] ?? ''), (string) ($operation['risk'] ?? 'unknown'), $operation['operationId'], null, 'rollback_binding_mismatch');
                    return $this->error('rollback_binding_mismatch', 'The undo request no longer belongs to this operation, conversation, source message, and browser tab.', 409);
                }
            }
        }
        if (($operation['rollback']['supported'] ?? false) !== true) {
            return [
                'operationId' => $operation['operationId'],
                'status' => 'unavailable',
                'observedFingerprint' => (string) ($operation['afterFingerprint'] ?? ''),
                'message' => 'This capability did not declare a rollback handler.',
            ];
        }
        foreach ($this->operations() as $candidate) {
            if (!is_array($candidate) || (string) ($candidate['status'] ?? '') !== 'committed') continue;
            $dependencies = is_array($candidate['dependsOnOperationIds'] ?? null) ? $candidate['dependsOnOperationIds'] : [];
            if (!in_array((string) $operation['operationId'], $dependencies, true)) continue;
            $this->audit('rejected', (string) ($operation['capabilityId'] ?? ''), (string) ($operation['risk'] ?? 'unknown'), $operation['operationId'], null, 'rollback_dependency_committed');
            return [
                'operationId' => $operation['operationId'],
                'status' => 'conflicted',
                'observedFingerprint' => (string) ($operation['afterFingerprint'] ?? ''),
                'message' => 'A later committed action still depends on this result; roll back dependent actions first.',
            ];
        }
        $observed = $this->live_fingerprint($operation);
        if (($unavailable = $this->advanced_unavailable((string) ($operation['capabilityId'] ?? ''))) !== null) return $unavailable;
        if (!hash_equals((string) ($input['expectedAfterFingerprint'] ?? ''), $observed)) {
            $operation['status'] = 'conflicted';
            $this->save_operation($operation);
            $this->audit('rejected', (string) ($operation['capabilityId'] ?? ''), (string) ($operation['risk'] ?? 'unknown'), $operation['operationId'], null, 'rollback_conflict');
            return [
                'operationId' => $operation['operationId'],
                'status' => 'conflicted',
                'observedFingerprint' => $observed,
                'message' => 'The target changed after the operation; a new conflict decision is required.',
            ];
        }
        $rolled_back = $this->dispatch_rollback($operation);
        if ($rolled_back instanceof \WP_Error) return $rolled_back;
        if (($rolled_back['allowed'] ?? null) === false && ($rolled_back['code'] ?? '') === 'pro_required') return $rolled_back;
        $operation['status'] = 'rolled_back';
        $operation['updatedAt'] = $this->now_ms();
        $this->save_operation($operation);
        $this->audit('rolled_back', (string) ($operation['capabilityId'] ?? ''), (string) ($operation['risk'] ?? 'unknown'), $operation['operationId'], null, 'rollback_committed');
        return [
            'operationId' => $operation['operationId'],
            'status' => 'rolled_back',
            'observedFingerprint' => $observed,
            'message' => 'Rollback completed through the owning integration adapter.',
            'result' => $rolled_back,
        ];
    }

    /** Optional feature absence is an ordinary tool result, including previously discovered IDs. */
    private function advanced_unavailable(string $id): ?array
    {
        return \PixflowDesign\WordPress\Modules\AdvancedSiteAccess::owns_capability($id)
            && !\PixflowDesign\WordPress\Modules\AdvancedSiteAccess::available()
            ? \PixflowDesign\WordPress\Modules\AdvancedSiteAccess::not_allowed() : null;
    }

    /** @return array<string, mixed>|\WP_Error */
    private function validate_request(array $input, bool $for_approval): array|\WP_Error
    {
        if (($input['surface'] ?? 'wp_admin') !== 'wp_admin') return $this->error('invalid_surface', 'The WP Admin capability surface is required.', 400);
        $session_id = sanitize_text_field((string) ($input['sessionId'] ?? $input['session_id'] ?? ''));
        if ($session_id === '' || strlen($session_id) > 191) return $this->error('invalid_session', 'A bounded session id is required.', 400);
        $mode = sanitize_key((string) ($input['mode'] ?? 'ask'));
        if (!in_array($mode, ['ask', 'chat', 'plan', 'design'], true)) return $this->error('invalid_mode', 'Unknown WP Admin interaction mode.', 400);
        $capability_id = sanitize_text_field((string) ($input['capabilityId'] ?? $input['capability_id'] ?? ''));
        $capability = $this->registry->find($capability_id);
        if ($capability === null) return $this->error('pixflow_capability_unavailable', 'Capability is unavailable or not adopted.', 404);
        $raw_arguments = $input['arguments'] ?? [];
        if (!is_array($raw_arguments)) return $this->error('invalid_arguments', 'Capability arguments must be a JSON object.', 400);
        $arguments = $this->normalise_schema($raw_arguments, (array) ($capability['inputSchema'] ?? ['type' => 'object']));
        if ($arguments instanceof \WP_Error) return $arguments;
        $dependency_ids = $input['dependsOnOperationIds'] ?? [];
        if (!is_array($dependency_ids) || count($dependency_ids) > 12) return $this->error('invalid_operation_dependencies', 'Operation dependencies must be a bounded list.', 400);
        $dependency_ids = array_values(array_unique(array_map(static fn($value): string => sanitize_text_field((string) $value), $dependency_ids)));
        foreach ($dependency_ids as $dependency_id) {
            if (preg_match('/^op_[a-zA-Z0-9_-]+$/', $dependency_id) !== 1) return $this->error('invalid_operation_dependencies', 'An operation dependency id is invalid.', 400);
            $dependency = $this->operation_record($dependency_id);
            if ($dependency === null || (string) ($dependency['siteId'] ?? '') !== $this->pairing->site_id()
                || (string) ($dependency['userId'] ?? '') !== (string) get_current_user_id()) {
                return $this->error('operation_dependency_unavailable', 'An operation dependency is unavailable to this user and site.', 409);
            }
            if ((string) ($dependency['status'] ?? '') !== 'committed') return $this->error('operation_dependency_not_committed', 'Every operation dependency must still be committed.', 409);
        }
        $risk = (string) ($capability['annotations']['risk'] ?? 'unknown');
        $allowed_modes = (array) ($capability['allowedModes'] ?? []);
        if ($allowed_modes !== [] && !in_array($mode, $allowed_modes, true)) return $this->error('mode_not_allowed', 'This capability is not available in the selected mode.', 403);
        if ($risk === 'unknown') return $this->error('unknown_risk', 'Unknown capability risk fails closed.', 403);
        if ($for_approval && $risk === 'read_only') return $this->error('approval_not_required', 'Read-only capabilities do not require approval.', 400);
        if ($mode !== 'design' && $risk !== 'read_only') return $this->error('mode_forbids_mutation', 'Ask and Plan cannot mutate WordPress state.', 403);
        if (!$this->check_target_permission($capability, $arguments)) return $this->error('target_permission_denied', 'The current user cannot access the requested live target.', 403);
        $handler = (string) ($this->registry->native_definition($capability_id)['handler'] ?? '');
        $requires_exact_read_context = $handler === 'gutenberg_read_document';
        $context_binding = is_array($input['contextBinding'] ?? null) ? $input['contextBinding'] : [];
        if ($requires_exact_read_context && $context_binding === []) {
            return $this->error('gutenberg_read_context_required', 'Exact Gutenberg reads require current session, conversation, source-message, tab, and post authority.', 409);
        }
        $context_payload = null;
        if ($risk !== 'read_only' || $context_binding !== [] || $requires_exact_read_context) {
            $context_payload = $this->context_authority->verify($context_binding);
            if ($context_payload instanceof \WP_Error) {
                $this->audit('rejected', $capability_id, $risk, null, $this->arguments_hash($arguments), (string) $context_payload->get_error_code());
                return $context_payload;
            }
            $identity = is_array($context_payload['identity'] ?? null) ? $context_payload['identity'] : [];
            $target_type = (string) ($capability['permission']['targetType'] ?? 'site');
            if ($target_type === 'post') {
                $target_id = (int) ($arguments['postId'] ?? $arguments['templateId'] ?? 0);
                if (($identity['objectKind'] ?? '') !== 'post' || (int) ($identity['objectId'] ?? 0) !== $target_id) {
                    $this->audit('rejected', $capability_id, $risk, null, $this->arguments_hash($arguments), 'context_mismatch');
                    return $this->error('context_mismatch', 'The action target differs from the verified WordPress Admin post context.', 409);
                }
            }
        }
        $conversation_id = sanitize_text_field((string) ($context_binding['conversationId'] ?? ''));
        $source_message_id = sanitize_text_field((string) ($context_binding['sourceMessageId'] ?? ''));
        $tab_id = sanitize_text_field((string) ($context_binding['tabId'] ?? ''));
        if (($risk !== 'read_only' || $requires_exact_read_context) && ($conversation_id === '' || $source_message_id === '' || $tab_id === '')) {
            return $this->error('context_binding_incomplete', 'The operation must be bound to its conversation, source message, and tab.', 409);
        }
        if ($handler === 'gutenberg_apply_document') {
            $receipt_validation = $this->gutenberg->validate_approval_arguments($arguments, $session_id);
            if ($receipt_validation instanceof \WP_Error) return $receipt_validation;
        }

        return [
            'surface' => 'wp_admin',
            'sessionId' => $session_id,
            'mode' => $mode,
            'capability' => $capability,
            'arguments' => $arguments,
            'argumentsHash' => $this->arguments_hash($arguments),
            'dependsOnOperationIds' => $dependency_ids,
            'dependencyHash' => hash('sha256', wp_json_encode($dependency_ids)),
            'contextBindingHash' => hash('sha256', $this->canonical_json($context_binding)),
            'conversationId' => $conversation_id,
            'sourceMessageId' => $source_message_id,
            'tabId' => $tab_id,
            'contextIdentity' => is_array($context_payload['identity'] ?? null) ? $context_payload['identity'] : [],
            'approvalToken' => is_string($input['approvalToken'] ?? null) ? (string) $input['approvalToken'] : null,
            'idempotencyKey' => sanitize_text_field((string) ($input['idempotencyKey'] ?? $input['idempotency_key'] ?? '')),
            'operationId' => sanitize_text_field((string) ($input['operationId'] ?? $input['operation_id'] ?? '')),
        ];
    }

    private function check_target_permission(array $capability, array $arguments): bool
    {
        $required = (array) ($capability['permission']['required'] ?? []);
        if ((($capability['annotations']['risk'] ?? '') === 'code_filesystem' || in_array('edit_plugins', $required, true)) && !DirectCodeAccess::allowed()) return false;
        $target_type = (string) ($capability['permission']['targetType'] ?? 'site');
        if ($target_type === 'post') {
            $post_id = (int) ($arguments['postId'] ?? $arguments['templateId'] ?? 0);
            $post = $post_id > 0 ? get_post($post_id) : null;
            if (!$post || !current_user_can('read_post', $post_id)) return false;
            if (in_array('edit_post', $required, true) && !current_user_can('edit_post', $post_id)) return false;
            if (in_array('delete_post', $required, true) && !current_user_can('delete_post', $post_id)) return false;
        }
        if ($target_type === 'media') {
            $attachment_id = (int) ($arguments['attachmentId'] ?? 0);
            $attachment = $attachment_id > 0 ? get_post($attachment_id) : null;
            if (!$attachment || $attachment->post_type !== 'attachment' || !current_user_can('read_post', $attachment_id)) return false;
            if (in_array('edit_post', $required, true) && !current_user_can('edit_post', $attachment_id)) return false;
            if (in_array('delete_post', $required, true) && !current_user_can('delete_post', $attachment_id)) return false;
        }
        foreach ($required as $capability_name) {
            if (in_array($capability_name, ['read_post', 'edit_post', 'delete_post'], true) && in_array($target_type, ['post', 'media'], true)) continue;
            if (!current_user_can((string) $capability_name)) return false;
        }
        return true;
    }

    /** @return array<string, mixed>|\WP_Error */
    /** @param array<string,mixed> $binding */
    private function dispatch(string $handler, array $arguments, array $binding = []): array|\WP_Error
    {
        if (\PixflowDesign\WordPress\Modules\AdvancedSiteAccess::owns_handler($handler) && !\PixflowDesign\WordPress\Modules\AdvancedSiteAccess::available()) return \PixflowDesign\WordPress\Modules\AdvancedSiteAccess::not_allowed();
        foreach (\PixflowDesign\WordPress\Modules\BuilderIntegrations::all() as $integration) {
            $callback = $integration['capabilityDispatch'] ?? null;
            if ($callback && ($response = $callback($handler, $arguments)) !== null) return $response;
        }
        foreach (\PixflowDesign\WordPress\Modules\FeatureContributions::all() as $feature) {
            if (isset($feature['capabilityDispatch']) && ($response = ($feature['capabilityDispatch'])($handler, $arguments)) !== null) return $response;
        }
        return match ($handler) {
            'context' => $this->context->snapshot($arguments),
            'list_post_types' => $this->list_post_types(),
            'get_post' => $this->get_post((int) ($arguments['postId'] ?? 0)),
            'list_taxonomies' => $this->list_taxonomies(),
            'list_posts' => $this->wordpress->list_posts($arguments),
            'list_terms' => $this->wordpress->list_terms($arguments),
            'list_media' => $this->wordpress->list_media($arguments),
            'get_media' => $this->wordpress->get_media($arguments),
            'gutenberg_status' => $this->gutenberg->status($arguments),
            'gutenberg_list_block_types' => $this->gutenberg->list_block_types($arguments),
            'gutenberg_get_block_type' => $this->gutenberg->get_block_type($arguments),
            'gutenberg_read_document' => $this->gutenberg->read_document($arguments, $binding),
            'gutenberg_validate_document' => $this->gutenberg->validate_document($arguments),
            'gutenberg_apply_document' => $this->gutenberg->apply_document($arguments),
            'create_post' => $this->wordpress->create_post($arguments),
            'update_post' => $this->wordpress->update_post($arguments),
            'trash_post' => $this->wordpress->trash_post($arguments),
            'restore_post' => $this->wordpress->restore_post($arguments),
            'settings_read' => $this->settings->read(),
            'settings_update' => $this->settings->update($arguments),
            'create_term' => $this->wordpress->create_term($arguments),
            'update_term' => $this->wordpress->update_term($arguments),
            'integration_status' => $this->integrations->status($arguments),
            default => $this->error('capability_handler_unavailable', 'This capability has no registered Pixflow handler.', 501),
        };
    }

    /** @return array<string, mixed>|\WP_Error */
    private function dispatch_rollback(array $operation): array|\WP_Error
    {
        $result = is_array($operation['result'] ?? null) ? $operation['result'] : [];
        $handler = (string) ($operation['handler'] ?? '');
        if (\PixflowDesign\WordPress\Modules\AdvancedSiteAccess::owns_handler($handler) && !\PixflowDesign\WordPress\Modules\AdvancedSiteAccess::available()) return \PixflowDesign\WordPress\Modules\AdvancedSiteAccess::not_allowed();
        foreach (array_merge(\PixflowDesign\WordPress\Modules\BuilderIntegrations::all(), \PixflowDesign\WordPress\Modules\FeatureContributions::all()) as $feature) {
            if (isset($feature['capabilityRollback']) && ($response = ($feature['capabilityRollback'])($handler, $result)) !== null) return $response;
        }
        return match ($handler) {
            'create_post' => $this->wordpress->rollback_created_post($result),
            'update_post' => $this->wordpress->rollback_post($result),
            'trash_post' => $this->wordpress->rollback_trashed_post($result),
            'restore_post' => $this->wordpress->rollback_restored_post($result),
            'gutenberg_apply_document' => $this->gutenberg->rollback_document($result),
            'settings_update' => $this->settings->rollback($result),
            'create_term' => $this->wordpress->rollback_created_term($result),
            'update_term' => $this->wordpress->rollback_term($result),
            default => $this->error('rollback_unavailable', 'This capability has no rollback adapter.', 409),
        };
    }

    private function live_fingerprint(array $operation): string
    {
        $result = is_array($operation['result'] ?? null) ? $operation['result'] : [];
        if (($operation['handler'] ?? '') === 'update_post' && isset($result['post']['id'])) {
            return $this->wordpress->fingerprint((int) $result['post']['id']);
        }
        if (($operation['handler'] ?? '') === 'create_post') {
            return $this->wordpress->fingerprint((int) ($result['post']['id'] ?? 0));
        }
        if (($operation['handler'] ?? '') === 'trash_post') {
            $post_id = (int) ($result['postId'] ?? 0);
            return get_post_status($post_id) === 'trash' ? 'trash:' . $post_id : '';
        }
        if (($operation['handler'] ?? '') === 'gutenberg_apply_document') {
            return $this->gutenberg->fingerprint((int) ($result['post']['id'] ?? 0));
        }
        foreach (\PixflowDesign\WordPress\Modules\BuilderIntegrations::all() as $integration) {
            if (isset($integration['capabilityFingerprint']) && ($value = ($integration['capabilityFingerprint'])($operation, $result)) !== null) return $value;
        }

        if (in_array((string) ($operation['handler'] ?? ''), ['settings_update', 'settings_read'], true)) {
            return $this->settings->fingerprint();
        }
        if (in_array((string) ($operation['handler'] ?? ''), ['create_term', 'update_term'], true)) {
            $term = is_array($result['term'] ?? null) ? $result['term'] : [];
            return $this->wordpress->term_fingerprint((int) ($term['id'] ?? 0), (string) ($term['taxonomy'] ?? ''));
        }




        foreach (\PixflowDesign\WordPress\Modules\FeatureContributions::all() as $feature) {
            if (isset($feature['capabilityFingerprint']) && ($value = ($feature['capabilityFingerprint'])($operation, $result)) !== null) return $value;
        }
        return $this->target_fingerprint((array) ($operation['arguments'] ?? []));
    }

    /** @return list<array<string, mixed>> */
    private function list_post_types(): array
    {
        $items = [];
        foreach (get_post_types([], 'objects') as $post_type) {
            if (!is_object($post_type)) continue;
            $items[] = [
                'name' => sanitize_key((string) ($post_type->name ?? '')),
                'label' => sanitize_text_field((string) ($post_type->label ?? '')),
                'public' => !empty($post_type->public),
                'showUi' => !empty($post_type->show_ui),
                'supports' => array_values(array_map('sanitize_key', is_array($post_type->supports ?? null) ? $post_type->supports : [])),
            ];
        }
        return array_values(array_slice($items, 0, 100));
    }

    /** @return array<string, mixed>|\WP_Error */
    private function get_post(int $post_id): array|\WP_Error
    {
        return $this->wordpress->get_post_metadata($post_id);
    }

    /** @return list<array<string, mixed>> */
    private function list_taxonomies(): array
    {
        $items = [];
        foreach (get_taxonomies([], 'objects') as $taxonomy) {
            if (!is_object($taxonomy)) continue;
            $items[] = [
                'name' => sanitize_key((string) ($taxonomy->name ?? '')),
                'label' => sanitize_text_field((string) ($taxonomy->label ?? '')),
                'public' => !empty($taxonomy->public),
                'showUi' => !empty($taxonomy->show_ui),
                'objectTypes' => array_values(array_map('sanitize_key', is_array($taxonomy->object_type ?? null) ? $taxonomy->object_type : [])),
            ];
        }
        return array_values(array_slice($items, 0, 200));
    }

    /** @return array<string, mixed>|\WP_Error */
    private function consume_approval(string $token, array $validated): array|\WP_Error
    {
        if ($token === '') return $this->error('approval_required', 'This capability requires an explicit approval token.', 403);
        $hash = hash('sha256', $token);
        $records = $this->approvals();
        foreach ($records as $token_id => &$record) {
            if (!is_array($record) || !hash_equals((string) ($record['tokenHash'] ?? ''), $hash)) continue;
            $binding_ok = ($record['siteId'] ?? '') === $this->pairing->site_id()
                && (string) ($record['userId'] ?? '') === (string) get_current_user_id()
                && (string) ($record['sessionId'] ?? '') === $validated['sessionId']
                && (string) ($record['capabilityId'] ?? '') === $validated['capability']['id']
                && (string) ($record['argumentsHash'] ?? '') === $validated['argumentsHash']
                && (string) ($record['dependencyHash'] ?? '') === $validated['dependencyHash']
                && (string) ($record['contextBindingHash'] ?? '') === $validated['contextBindingHash']
                && (string) ($record['conversationId'] ?? '') === $validated['conversationId']
                && (string) ($record['sourceMessageId'] ?? '') === $validated['sourceMessageId']
                && (string) ($record['tabId'] ?? '') === $validated['tabId'];
            if (!$binding_ok) return $this->error('approval_binding_mismatch', 'Approval is not bound to this user, session, capability, or arguments.', 403);
            if ((int) ($record['expiresAt'] ?? 0) <= time()) return $this->error('approval_expired', 'Approval has expired.', 403);
            if (!empty($record['consumedAt'])) return $this->error('approval_replayed', 'Approval has already been consumed.', 409);
            $record['consumedAt'] = time();
            update_user_meta(get_current_user_id(), self::APPROVAL_META, $records);
            return $record;
        }
        unset($record);
        return $this->error('approval_invalid', 'Approval token is invalid.', 403);
    }

    /** @return array<string, mixed> */
    private function new_operation(array $validated, string $status): array
    {
        $capability = $validated['capability'];
        $definition = $this->registry->native_definition((string) $capability['id']) ?: [];
        $operation = [
            'operationId' => 'op_' . wp_generate_uuid4(),
            'siteId' => $this->pairing->site_id(),
            'userId' => (string) get_current_user_id(),
            'sessionId' => $validated['sessionId'],
            'capabilityId' => $capability['id'],
            'status' => $status,
            'risk' => $capability['annotations']['risk'],
            'normalisedArgumentsHash' => $validated['argumentsHash'],
            'dependsOnOperationIds' => $validated['dependsOnOperationIds'],
            'dependencyHash' => $validated['dependencyHash'],
            'contextBindingHash' => $validated['contextBindingHash'],
            'conversationId' => $validated['conversationId'],
            'sourceMessageId' => $validated['sourceMessageId'],
            'tabId' => $validated['tabId'],
            'targetFingerprint' => $this->target_fingerprint($validated['arguments']),
            'beforeFingerprint' => $this->target_fingerprint($validated['arguments']),
            'afterFingerprint' => null,
            'rollback' => $capability['rollback'] ?? ['supported' => false, 'policy' => 'none'],
            'idempotencyKey' => $validated['idempotencyKey'] ?? '',
            'arguments' => $validated['arguments'],
            'handler' => $definition['handler'] ?? null,
            'createdAt' => $this->now_ms(),
            'updatedAt' => $this->now_ms(),
        ];
        $this->save_operation($operation);
        return $operation;
    }

    /** @return array<string, mixed>|null */
    private function find_operation_for_request(array $validated): ?array
    {
        $requested = (string) ($validated['operationId'] ?? '');
        foreach ($this->operations() as $operation) {
            if (!is_array($operation)) continue;
            if ($requested !== '' && (string) ($operation['operationId'] ?? '') === $requested) return $operation;
            if ($requested === '' && ($validated['idempotencyKey'] ?? '') !== ''
                && (string) ($operation['idempotencyKey'] ?? '') === $validated['idempotencyKey']
                && (string) ($operation['userId'] ?? '') === (string) get_current_user_id()) return $operation;
        }
        return null;
    }

    /** @param array<string, mixed> $operation */
    private function save_operation(array $operation): void
    {
        $operations = $this->operations();
        $operations[(string) $operation['operationId']] = $operation;
        uasort($operations, static fn(array $left, array $right): int => ((int) ($right['updatedAt'] ?? 0)) <=> ((int) ($left['updatedAt'] ?? 0)));
        update_option(self::OPERATIONS_OPTION, array_slice($operations, 0, self::MAX_OPERATIONS, true), false);
    }

    /** @return array<string, array<string, mixed>> */
    private function operations(): array
    {
        $value = get_option(self::OPERATIONS_OPTION, []);
        return is_array($value) ? $value : [];
    }

    /** @return array<string, mixed>|null */
    private function operation_record(string $operation_id): ?array
    {
        $operation = $this->operations()[$operation_id] ?? null;
        return is_array($operation) ? $operation : null;
    }

    /** @param array<string, mixed> $record */
    private function save_approvals(array $record): void
    {
        update_user_meta(get_current_user_id(), self::APPROVAL_META, $record);
    }

    /** @return array<string, array<string, mixed>> */
    private function approvals(): array
    {
        $value = get_user_meta(get_current_user_id(), self::APPROVAL_META, true);
        return is_array($value) ? $value : [];
    }

    private function audit(string $event, string $capability_id, string $risk, ?string $operation_id, ?string $arguments_hash, string $detail): void
    {
        $events = $this->audits();
        $operation = $operation_id !== null ? $this->operation_record($operation_id) : null;
        $events[] = [
            'id' => 'audit_' . wp_generate_uuid4(),
            'operationId' => $operation_id,
            'siteId' => $this->pairing->site_id(),
            'userId' => (string) get_current_user_id(),
            'sessionId' => is_array($operation) ? (string) ($operation['sessionId'] ?? '') : '',
            'capabilityId' => $capability_id,
            'event' => $event,
            'risk' => $risk,
            'createdAt' => $this->now_ms(),
            'redactedArgumentsHash' => $arguments_hash,
            'detail' => sanitize_text_field($detail),
        ];
        update_option(self::AUDIT_OPTION, array_slice($events, -self::MAX_AUDIT), false);
    }

    /** @return list<array<string, mixed>> */
    private function audits(): array
    {
        $value = get_option(self::AUDIT_OPTION, []);
        return is_array($value) ? array_values(array_filter($value, 'is_array')) : [];
    }

    /** @return array<string, mixed> */
    private function execution_response(array $operation): array
    {
        $safe_operation = $this->safe_operation($operation);
        $safe_operation['result'] = $this->safe_result($operation['result'] ?? null);
        return [
            'schema' => 'pixflow.wp-admin.capability-api.v1',
            'version' => 1,
            'operation' => $safe_operation,
            'result' => $this->safe_result($operation['result'] ?? null),
        ];
    }

    /** @param array<string, mixed> $operation */
    private function safe_operation(array $operation): array
    {
        unset($operation['arguments'], $operation['handler'], $operation['error']);
        return $operation;
    }

    private function safe_result(mixed $result, int $depth = 0, ?string $field = null): mixed
    {
        if ($depth === 0
            && is_array($result)
            && in_array(($result['schema'] ?? ''), ['pixflow.wp-admin.gutenberg-document.v1', 'pixflow.wp-admin.gutenberg-read.v2', 'pixflow.wp-admin.gutenberg-read-chunk.v1'], true)
        ) {
            return $this->safe_exact_gutenberg_result($result);
        }
        if ($depth > 8) return ['redacted' => true];
        if (is_string($result)) {
            $bounded = substr($result, 0, 16000);
            // Source is inert response data and is escaped by the client. Text
            // sanitisation would strip PHP/HTML syntax and silently corrupt a
            // subsequent reviewed update, so preserve bounded valid UTF-8 for
            // the explicit source fields only.
            if (in_array($field, ['code', 'content', 'original_code'], true)) {
                return wp_check_invalid_utf8($bounded);
            }
            return sanitize_textarea_field($bounded);
        }
        if (!is_array($result)) return is_scalar($result) || $result === null ? $result : null;
        $json = wp_json_encode($result);
        if (!is_string($json) || strlen($json) > 64 * 1024) return ['truncated' => true];
        $safe = [];
        foreach ($result as $key => $value) {
            $key = (string) $key;
            if (in_array($key, ['beforeContent', 'beforeTree', 'beforeRecord', 'beforeRevisions', 'beforeDocument', 'internalPath', 'companionPath'], true)) {
                $safe[$key] = ['redacted' => true];
                continue;
            }
            if (preg_match('/(?:pass(word)?|secret|token|api[_-]?key|private[_-]?key|credential)/i', $key) === 1) {
                $safe[$key] = ['redacted' => true];
                continue;
            }
            $safe[$key] = $this->safe_result($value, $depth + 1, $key);
        }
        return $safe;
    }

    /** @return array<string, mixed>|\WP_Error */
    private function normalise_schema(mixed $value, array $schema, string $path = 'arguments'): array|\WP_Error|string|int|float|bool|null
    {
        if (($schema['format'] ?? '') === 'pixflow-gutenberg-block-tree') {
            return $this->gutenberg_normalizer->normalize($value);
        }
        $type = (string) ($schema['type'] ?? '');
        if ($type === 'object') {
            if (!is_array($value) || (array_is_list($value) && $value !== [])) return $this->error('schema_invalid_type', "$path must be an object.", 400);
            $properties = is_array($schema['properties'] ?? null) ? $schema['properties'] : [];
            foreach ((array) ($schema['required'] ?? []) as $required) {
                if (!array_key_exists((string) $required, $value)) return $this->error('schema_missing_required', "$path.$required is required.", 400);
            }
            if (($schema['additionalProperties'] ?? true) === false) {
                foreach ($value as $key => $_unused) if (!array_key_exists((string) $key, $properties)) return $this->error('schema_unknown_field', "$path.$key is not allowed.", 400);
            }
            if (count($value) > 64) return $this->error('schema_too_many_fields', "$path has too many fields.", 400);
            $out = [];
            foreach ($value as $key => $child) {
                $key = (string) $key;
                if (isset($properties[$key]) && is_array($properties[$key])) {
                    $normalised = $this->normalise_schema($child, $properties[$key], "$path.$key");
                    if ($normalised instanceof \WP_Error) return $normalised;
                    $out[$key] = $normalised;
                } elseif (($schema['additionalProperties'] ?? true) === true) {
                    $normalised = $this->normalise_untyped($child, "$path.$key");
                    if ($normalised instanceof \WP_Error) return $normalised;
                    $out[$key] = $normalised;
                }
            }
            ksort($out);
            return $out;
        }
        if ($type === 'array') {
            if (!is_array($value) || !array_is_list($value)) return $this->error('schema_invalid_type', "$path must be an array.", 400);
            if (isset($schema['maxItems']) && count($value) > (int) $schema['maxItems']) return $this->error('schema_too_many_items', "$path has too many items.", 400);
            $out = [];
            foreach ($value as $index => $child) {
                $normalised = $this->normalise_schema($child, (array) ($schema['items'] ?? ['type' => 'string']), "$path.$index");
                if ($normalised instanceof \WP_Error) return $normalised;
                $out[] = $normalised;
            }
            return $out;
        }
        if ($type === 'string') {
            if (!is_string($value)) return $this->error('schema_invalid_type', "$path must be a string.", 400);
            if (isset($schema['maxLength']) && strlen($value) > (int) $schema['maxLength']) return $this->error('schema_string_too_long', "$path is too long.", 400);
            // Source files are opaque input until the dedicated code-project
            // parser validates them. Sanitising as a text field would corrupt
            // newlines and PHP/CSS/JS before validation and fingerprinting.
            if (($schema['format'] ?? '') !== 'pixflow-code') $value = sanitize_text_field($value);
            if (isset($schema['enum']) && !in_array($value, (array) $schema['enum'], true)) return $this->error('schema_enum_invalid', "$path has an invalid value.", 400);
            return $value;
        }
        if ($type === 'integer') {
            if (is_string($value) && preg_match('/^-?\d+$/', $value) === 1) $value = (int) $value;
            if (!is_int($value)) return $this->error('schema_invalid_type', "$path must be an integer.", 400);
            if (isset($schema['minimum']) && $value < (int) $schema['minimum']) return $this->error('schema_below_minimum', "$path is below the minimum.", 400);
            return $value;
        }
        if ($type === 'boolean') {
            if (!is_bool($value)) return $this->error('schema_invalid_type', "$path must be boolean.", 400);
            return $value;
        }
        return $this->error('schema_unknown_type', "$path has an unsupported schema type.", 400);
    }

    private function safe_exact_gutenberg_result(array $result): array
    {
        $encoded = wp_json_encode($result, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if (!is_string($encoded) || strlen($encoded) > 2 * 1024 * 1024) {
            return ['schema' => (string) ($result['schema'] ?? 'pixflow.wp-admin.gutenberg-read.v2'), 'contentComplete' => false, 'contentTruncated' => true, 'omitted' => ['oversized_result']];
        }
        $clean = function (mixed $value, int $depth = 0) use (&$clean): mixed {
            if ($depth > 40) return ['redacted' => true];
            if (is_string($value)) return wp_check_invalid_utf8($value);
            if (is_int($value) || is_float($value) || is_bool($value) || $value === null) return $value;
            if (!is_array($value)) return null;
            $out = [];
            foreach ($value as $key => $child) {
                $key = (string) $key;
                if (preg_match('/(?:pass(word)?|secret|token|api[_-]?key|private[_-]?key|credential)/i', $key) === 1) {
                    $out[$key] = ['redacted' => true];
                    continue;
                }
                $out[$key] = $clean($child, $depth + 1);
            }
            return $out;
        };
        $safe = $clean($result);
        return is_array($safe) ? $safe : ['schema' => (string) ($result['schema'] ?? 'pixflow.wp-admin.gutenberg-read.v2'), 'contentComplete' => false, 'contentTruncated' => true, 'omitted' => ['invalid_result']];
    }

    private function normalise_untyped(mixed $value, string $path, int $depth = 0): mixed
    {
        if ($depth > 6) return $this->error('schema_too_deep', "$path is too deeply nested.", 400);
        if (is_string($value)) {
            if (strlen($value) > 100000) return $this->error('schema_string_too_long', "$path is too long.", 400);
            return sanitize_textarea_field($value);
        }
        if (is_int($value) || is_float($value) || is_bool($value) || $value === null) return $value;
        if (!is_array($value) || count($value) > 128) return $this->error('schema_value_too_large', "$path is too large.", 400);
        $out = [];
        foreach ($value as $key => $child) {
            $safe_key = sanitize_text_field((string) $key);
            if ($safe_key === '' || strlen($safe_key) > 80) return $this->error('schema_invalid_key', "$path contains an invalid key.", 400);
            $out[$safe_key] = $this->normalise_untyped($child, "$path.$safe_key", $depth + 1);
            if ($out[$safe_key] instanceof \WP_Error) return $out[$safe_key];
        }
        if (!array_is_list($value)) ksort($out);
        return $out;
    }

    private function arguments_hash(array $arguments): string
    {
        return hash('sha256', $this->canonical_json($arguments));
    }

    private function target_fingerprint(array $arguments): string
    {
        $snapshot = $this->context->snapshot($arguments);
        return hash('sha256', $this->canonical_json(['context' => $snapshot, 'arguments' => $arguments]));
    }

    private function canonical_json(mixed $value): string
    {
        if (is_array($value)) {
            if (!array_is_list($value)) ksort($value);
            $value = array_map(fn($item) => $this->canonicalise_value($item), $value);
        }
        $json = wp_json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        return is_string($json) ? $json : 'null';
    }

    private function canonicalise_value(mixed $value): mixed
    {
        if (!is_array($value)) return $value;
        if (!array_is_list($value)) ksort($value);
        foreach ($value as $key => $item) $value[$key] = $this->canonicalise_value($item);
        return $value;
    }

    private function now_ms(): int
    {
        return (int) round(microtime(true) * 1000);
    }

    private function reject(array $capability, string $code, string $message): \WP_Error
    {
        $this->audit('rejected', (string) ($capability['id'] ?? ''), (string) ($capability['annotations']['risk'] ?? 'unknown'), null, null, $code);
        return $this->error($code, $message, 403);
    }

    private function error(string $code, string $message, int $status): \WP_Error
    {
        return new \WP_Error($code, $message, ['status' => $status, 'retryable' => false]);
    }
}
