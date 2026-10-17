<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Admin\Gutenberg;

if (!defined('ABSPATH')) {
    exit;
}

final class GutenbergSerializationTicketStore
{
    private const TICKET_TTL = 600;
    private const RECEIPT_TTL = 600;
    public function __construct(
        private readonly GutenbergBlockTreeNormalizer $normalizer = new GutenbergBlockTreeNormalizer(),
        private readonly GutenbergDocumentRepository $documents = new GutenbergDocumentRepository(),
        private readonly GutenbergBlockTreeValidator $validator = new GutenbergBlockTreeValidator(),
        private readonly GutenbergMediaResolver $media = new GutenbergMediaResolver(),
        private readonly GutenbergDocumentIntegrity $integrity = new GutenbergDocumentIntegrity(),
    ) {
    }

    /** @return array<string, mixed>|\WP_Error */
    public function prepare(array $input): array|\WP_Error
    {
        $post_id = (int) ($input['postId'] ?? 0);
        $session_id = sanitize_text_field((string) ($input['sessionId'] ?? ''));
        $expected = sanitize_text_field((string) ($input['expectedFingerprint'] ?? ''));
        if ($session_id === '' || strlen($session_id) > 160) {
            return $this->error('gutenberg_session_required', 'A bounded Pixflow session is required.', 400);
        }
        $status = $this->documents->target_status($post_id);
        if ($status instanceof \WP_Error) return $status;
        if ($error = GutenbergExtensions::authoring_error((string) ($status['postType'] ?? ''))) return $error;
        if (empty($status['editable']) || !current_user_can('edit_post', $post_id)) {
            return $this->error('gutenberg_target_forbidden', 'The current user cannot edit the target post.', 403);
        }
        if (empty($status['usesBlockEditor'])) {
            return $this->error('gutenberg_editor_unavailable', 'The target does not use the WordPress Block Editor.', 422);
        }
        $current = $this->documents->fingerprint($post_id);
        if ($expected === '' || $current === '' || !hash_equals($current, $expected)) {
            return $this->error('gutenberg_stale_document', 'The post changed since it was read; refresh before preparing the document.', 409);
        }

        $blocks = $this->normalizer->normalize($input['blocks'] ?? null);
        if ($blocks instanceof \WP_Error) return $blocks;
        if ($error = GutenbergExecutableContent::tree_error($blocks, (string) (get_post($post_id)->post_content ?? ''))) return GutenbergExecutableContent::blocked_result($error);
        if ($blocks === []) {
            return $this->error('gutenberg_clear_not_supported', 'Clearing all Gutenberg content is not supported by this replacement action.', 422);
        }
        $validation = $this->validator->validate($post_id, $blocks);
        if ($validation instanceof \WP_Error) return $validation;
        if (($validation['valid'] ?? false) !== true) {
            $first = is_array($validation['errors'][0] ?? null) ? $validation['errors'][0] : [];
            $path = sanitize_text_field((string) ($first['path'] ?? ''));
            $detail = sanitize_text_field((string) ($first['message'] ?? ''));
            $suffix = $detail !== '' ? ' ' . ($path !== '' ? $path . ': ' : '') . $detail : '';
            return $this->error('gutenberg_document_invalid', 'The proposed block tree failed server preflight.' . $suffix, 422, ['validation' => $validation]);
        }
        $bound = $this->media->bind_tree($blocks);
        if ($bound instanceof \WP_Error) return $bound;
        $resolved_blocks = (array) ($bound['blocks'] ?? []);
        $tree_hash = $this->tree_hash($blocks);
        $resolved_tree_hash = $this->tree_hash($resolved_blocks);
        $ticket_id = 'gbt_' . str_replace('-', '', wp_generate_uuid4());
        $ticket = [
            'ticketId' => $ticket_id,
            'purpose' => 'serialization',
            'contentIntent' => GutenbergDocumentIntegrity::CONTENT_INTENT_REPLACE,
            'siteId' => $this->site_id(),
            'userId' => get_current_user_id(),
            'sessionId' => $session_id,
            'postId' => $post_id,
            'expectedFingerprint' => $expected,
            'latestRevisionId' => $this->latest_revision_id($post_id),
            'treeHash' => $tree_hash,
            'resolvedTreeHash' => $resolved_tree_hash,
            'blocks' => $blocks,
            'resolvedBlocks' => $resolved_blocks,
            'validation' => $validation,
            'media' => (array) ($bound['media'] ?? []),
            'createdAt' => time(),
            'expiresAt' => time() + self::TICKET_TTL,
            'consumedAt' => null,
        ];
        set_transient($this->ticket_key($ticket_id), $ticket, self::TICKET_TTL);

        return [
            'schema' => 'pixflow.wp-admin.gutenberg-serialization-ticket.v1',
            'ticketId' => $ticket_id,
            'postId' => $post_id,
            'treeHash' => $tree_hash,
            'resolvedTreeHash' => $resolved_tree_hash,
            'resolvedBlocks' => $resolved_blocks,
            'validation' => $validation,
            'media' => $ticket['media'],
            'editorUrl' => esc_url_raw(add_query_arg([
                'post' => $post_id,
                'action' => 'edit',
                'pixflow-gutenberg-serializer' => '1',
                'pixflow-gutenberg-ticket' => $ticket_id,
            ], admin_url('post.php'))),
            'expiresAt' => $ticket['expiresAt'],
        ];
    }

    /** @return array<string, mixed>|\WP_Error */
    public function prepare_discovery(array $input): array|\WP_Error
    {
        $post_id = (int) ($input['postId'] ?? 0);
        $session_id = sanitize_text_field((string) ($input['sessionId'] ?? ''));
        if ($session_id === '' || strlen($session_id) > 160) return $this->error('gutenberg_session_required', 'A bounded Pixflow session is required.', 400);
        $status = $this->documents->target_status($post_id);
        if ($status instanceof \WP_Error) return $status;
        if (empty($status['usesBlockEditor']) || !current_user_can('read_post', $post_id)) return $this->error('gutenberg_editor_unavailable', 'The target Block Editor is unavailable.', 422);
        $ticket_id = 'gbt_' . str_replace('-', '', wp_generate_uuid4());
        $empty_hash = $this->tree_hash([]);
        $ticket = [
            'ticketId' => $ticket_id,
            'purpose' => 'discovery',
            'siteId' => $this->site_id(),
            'userId' => get_current_user_id(),
            'sessionId' => $session_id,
            'postId' => $post_id,
            'expectedFingerprint' => $this->documents->fingerprint($post_id),
            'latestRevisionId' => $this->latest_revision_id($post_id),
            'treeHash' => $empty_hash,
            'resolvedTreeHash' => $empty_hash,
            'blocks' => [],
            'resolvedBlocks' => [],
            'validation' => [],
            'media' => [],
            'createdAt' => time(),
            'expiresAt' => time() + self::TICKET_TTL,
            'consumedAt' => null,
        ];
        set_transient($this->ticket_key($ticket_id), $ticket, self::TICKET_TTL);
        return [
            'schema' => 'pixflow.wp-admin.gutenberg-discovery-ticket.v1',
            'ticketId' => $ticket_id,
            'postId' => $post_id,
            'resolvedTreeHash' => $empty_hash,
            'editorUrl' => esc_url_raw(add_query_arg([
                'post' => $post_id,
                'action' => 'edit',
                'pixflow-gutenberg-serializer' => '1',
                'pixflow-gutenberg-ticket' => $ticket_id,
            ], admin_url('post.php'))),
            'expiresAt' => $ticket['expiresAt'],
        ];
    }

    /** @return array<string, mixed>|\WP_Error */
    public function accept_browser_result(array $input): array|\WP_Error
    {
        $ticket_id = sanitize_text_field((string) ($input['ticketId'] ?? ''));
        $ticket = $this->ticket($ticket_id);
        if ($ticket instanceof \WP_Error) return $ticket;
        if (!empty($ticket['consumedAt'])) return $this->error('gutenberg_ticket_replayed', 'The serialization ticket has already been used.', 409);
        if (!hash_equals((string) $ticket['resolvedTreeHash'], (string) ($input['resolvedTreeHash'] ?? ''))) {
            return $this->error('gutenberg_ticket_tree_mismatch', 'The browser result does not match the prepared block tree.', 409);
        }
        $current = $this->documents->fingerprint((int) $ticket['postId']);
        if ($current === '' || !hash_equals((string) $ticket['expectedFingerprint'], $current)) {
            return $this->error('gutenberg_stale_document', 'The post changed while the browser prepared the document.', 409);
        }
        $content = $input['content'] ?? null;
        $integrity = $this->integrity->validate_browser_result($ticket, [
            'content' => $content,
            'validation' => $input['validation'] ?? null,
        ]);
        if ($integrity instanceof \WP_Error) return $integrity;

        $receipt_id = 'gbr_' . str_replace('-', '', wp_generate_uuid4());
        $receipt = [
            'receiptId' => $receipt_id,
            'ticketId' => $ticket_id,
            'contentIntent' => GutenbergDocumentIntegrity::CONTENT_INTENT_REPLACE,
            'siteId' => $ticket['siteId'],
            'userId' => $ticket['userId'],
            'sessionId' => $ticket['sessionId'],
            'postId' => $ticket['postId'],
            'expectedFingerprint' => $ticket['expectedFingerprint'],
            'latestRevisionId' => $ticket['latestRevisionId'],
            'treeHash' => $ticket['treeHash'],
            'resolvedTreeHash' => $ticket['resolvedTreeHash'],
            'content' => $integrity['content'],
            'contentHash' => $integrity['contentHash'],
            'serializedBytes' => $integrity['serializedBytes'],
            'topLevelBlockCount' => $integrity['topLevelBlockCount'],
            'blockCount' => $integrity['totalBlockCount'],
            'proposedTopLevelBlockCount' => $integrity['proposedTopLevelBlockCount'],
            'proposedBlockCount' => $integrity['proposedTotalBlockCount'],
            'blockOutline' => $integrity['blockOutline'],
            'blocks' => $ticket['blocks'],
            'resolvedBlocks' => $ticket['resolvedBlocks'],
            'media' => $ticket['media'],
            'serverValidation' => $ticket['validation'],
            'browserValidation' => $integrity['browserValidation'],
            'createdAt' => time(),
            'expiresAt' => time() + self::RECEIPT_TTL,
            'consumedAt' => null,
        ];
        set_transient($this->receipt_key($receipt_id), $receipt, self::RECEIPT_TTL);
        $ticket['consumedAt'] = time();
        set_transient($this->ticket_key($ticket_id), $ticket, max(1, (int) $ticket['expiresAt'] - time()));

        return [
            'schema' => 'pixflow.wp-admin.gutenberg-prepared-receipt.v1',
            'preparedReceiptId' => $receipt_id,
            'postId' => (int) $receipt['postId'],
            'treeHash' => $receipt['treeHash'],
            'contentHash' => $receipt['contentHash'],
            'serializedBytes' => $receipt['serializedBytes'],
            'topLevelBlockCount' => $receipt['topLevelBlockCount'],
            'blockCount' => $receipt['blockCount'],
            'proposedBlockCount' => $receipt['proposedBlockCount'],
            'blockOutline' => $receipt['blockOutline'],
            'media' => $receipt['media'],
            'browserValidation' => $receipt['browserValidation'],
            'expiresAt' => $receipt['expiresAt'],
        ];
    }

    /** @return array<string, mixed>|\WP_Error */
    public function receipt(string $receipt_id, int $post_id, string $expected_fingerprint, string $session_id): array|\WP_Error
    {
        if ($error = GutenbergExtensions::authoring_error((string) (get_post($post_id)->post_type ?? ''))) return $error;
        $receipt = get_transient($this->receipt_key($receipt_id));
        if (!is_array($receipt)) return $this->error('gutenberg_receipt_missing', 'The prepared document receipt is missing or expired.', 410);
        if ((int) ($receipt['userId'] ?? 0) !== get_current_user_id() || ($receipt['siteId'] ?? '') !== $this->site_id()) {
            return $this->error('gutenberg_receipt_forbidden', 'The prepared document receipt belongs to another site or user.', 403);
        }
        if (!empty($receipt['consumedAt'])) return $this->error('gutenberg_receipt_replayed', 'The prepared document receipt has already been used.', 409);
        if ((int) ($receipt['expiresAt'] ?? 0) <= time()) return $this->error('gutenberg_receipt_expired', 'The prepared document receipt expired.', 410);
        if ((int) ($receipt['postId'] ?? 0) !== $post_id || !hash_equals((string) ($receipt['expectedFingerprint'] ?? ''), $expected_fingerprint)) {
            return $this->error('gutenberg_receipt_binding_mismatch', 'The prepared document receipt is not bound to this post and fingerprint.', 409);
        }
        if ($session_id === '' || !hash_equals((string) ($receipt['sessionId'] ?? ''), $session_id)) {
            return $this->error('gutenberg_receipt_session_mismatch', 'The prepared document receipt belongs to another Pixflow session.', 403);
        }
        $current = $this->documents->fingerprint($post_id);
        if ($current === '' || !hash_equals((string) ($receipt['expectedFingerprint'] ?? ''), $current)) {
            return $this->error('gutenberg_stale_document', 'The post changed after Gutenberg preparation.', 409);
        }
        $integrity = $this->integrity->validate_receipt($receipt);
        if ($integrity instanceof \WP_Error) return $integrity;
        $resolved_media = $this->media->resolve_tree(is_array($receipt['blocks'] ?? null) ? $receipt['blocks'] : []);
        if (!empty($resolved_media['errors'])) {
            return $this->error('gutenberg_receipt_media_invalid', 'One or more Media Library bindings became unavailable after preparation.', 422, ['errors' => $resolved_media['errors']]);
        }
        if ($this->media_ids((array) ($receipt['media'] ?? [])) !== $this->media_ids((array) ($resolved_media['items'] ?? []))) {
            return $this->error('gutenberg_receipt_media_mismatch', 'The prepared Media Library bindings no longer match the proposed document.', 409);
        }
        return $receipt;
    }

    public function consume_receipt(string $receipt_id): void
    {
        $key = $this->receipt_key($receipt_id);
        $receipt = get_transient($key);
        if (!is_array($receipt)) return;
        $receipt['consumedAt'] = time();
        set_transient($key, $receipt, max(1, (int) ($receipt['expiresAt'] ?? time()) - time()));
    }

    /** @return array<string, mixed>|\WP_Error */
    public function editor_ticket(string $ticket_id, int $post_id): array|\WP_Error
    {
        $ticket = $this->ticket($ticket_id);
        if ($ticket instanceof \WP_Error) return $ticket;
        if ((int) ($ticket['postId'] ?? 0) !== $post_id || !current_user_can('edit_post', $post_id)) {
            return $this->error('gutenberg_ticket_forbidden', 'The serializer ticket is not valid for this editor.', 403);
        }
        return [
            'ticketId' => $ticket_id,
            'postId' => $post_id,
            'resolvedTreeHash' => (string) $ticket['resolvedTreeHash'],
            'purpose' => (string) ($ticket['purpose'] ?? 'serialization'),
            'expiresAt' => (int) $ticket['expiresAt'],
        ];
    }

    /** @return array<string, mixed>|\WP_Error */
    private function ticket(string $ticket_id): array|\WP_Error
    {
        if (!preg_match('/^gbt_[a-f0-9]{32}$/', $ticket_id)) return $this->error('gutenberg_ticket_invalid', 'The serialization ticket is invalid.', 400);
        $ticket = get_transient($this->ticket_key($ticket_id));
        if (!is_array($ticket)) return $this->error('gutenberg_ticket_missing', 'The serialization ticket is missing or expired.', 410);
        if ((int) ($ticket['userId'] ?? 0) !== get_current_user_id() || ($ticket['siteId'] ?? '') !== $this->site_id()) {
            return $this->error('gutenberg_ticket_forbidden', 'The serialization ticket belongs to another site or user.', 403);
        }
        if ((int) ($ticket['expiresAt'] ?? 0) <= time()) return $this->error('gutenberg_ticket_expired', 'The serialization ticket expired.', 410);
        return $ticket;
    }

    /** @param list<array<string, mixed>> $blocks */
    private function tree_hash(array $blocks): string
    {
        return 'sha256:' . hash('sha256', (string) wp_json_encode($blocks, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    }

    /** @return list<int> */
    private function media_ids(array $items): array
    {
        $ids = [];
        foreach ($items as $item) {
            if (!is_array($item)) continue;
            $attachment = is_array($item['attachment'] ?? null) ? $item['attachment'] : [];
            $id = (int) ($attachment['attachmentId'] ?? 0);
            if ($id > 0) $ids[] = $id;
        }
        sort($ids);
        return $ids;
    }

    private function ticket_key(string $ticket_id): string
    {
        return 'pixflow_gbt_' . hash('sha256', $ticket_id);
    }

    private function receipt_key(string $receipt_id): string
    {
        return 'pixflow_gbr_' . hash('sha256', $receipt_id);
    }

    private function site_id(): string
    {
        return hash('sha256', untrailingslashit(home_url()));
    }

    private function latest_revision_id(int $post_id): ?int
    {
        if (!function_exists('wp_get_post_revisions')) return null;
        $revisions = wp_get_post_revisions($post_id, ['posts_per_page' => 1, 'check_enabled' => false]);
        $revision = is_array($revisions) ? reset($revisions) : null;
        return $revision instanceof \WP_Post ? (int) $revision->ID : null;
    }

    private function error(string $code, string $message, int $status, array $extra = []): \WP_Error
    {
        return new \WP_Error($code, $message, ['status' => $status, 'retryable' => false, ...$extra]);
    }
}
