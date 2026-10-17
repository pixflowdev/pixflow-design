<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Admin\Gutenberg;

if (!defined('ABSPATH')) {
    exit;
}

final class WpAdminGutenbergCapabilityService
{
    public function __construct(
        private readonly GutenbergDocumentRepository $documents = new GutenbergDocumentRepository(),
        private readonly GutenbergBlockRegistry $blocks = new GutenbergBlockRegistry(),
        private readonly GutenbergBlockTreeValidator $validator = new GutenbergBlockTreeValidator(),
        private readonly GutenbergSerializationTicketStore $tickets = new GutenbergSerializationTicketStore(),
        private readonly GutenbergIntegrationAdapterRegistry $adapters = new GutenbergIntegrationAdapterRegistry(),
        private readonly GutenbergDocumentIntegrity $integrity = new GutenbergDocumentIntegrity(),
    ) {
    }

    public function status(array $arguments): array|\WP_Error
    {
        return $this->blocks->status((int) ($arguments['postId'] ?? 0));
    }

    public function list_block_types(array $arguments): array|\WP_Error
    {
        return $this->blocks->list((int) ($arguments['postId'] ?? 0), $arguments);
    }

    public function get_block_type(array $arguments): array|\WP_Error
    {
        return $this->blocks->get((int) ($arguments['postId'] ?? 0), (string) ($arguments['name'] ?? ''));
    }

    /** @param array<string,mixed> $binding */
    public function read_document(array $arguments, array $binding = []): array|\WP_Error
    {
        return $this->documents->read((int) ($arguments['postId'] ?? 0), $arguments, $binding);
    }

    public function validate_document(array $arguments): array|\WP_Error
    {
        $post_id = (int) ($arguments['postId'] ?? 0);
        $expected = (string) ($arguments['expectedFingerprint'] ?? '');
        $current = $this->documents->fingerprint($post_id);
        if ($current === '' || $expected === '' || !hash_equals($current, $expected)) {
            return new \WP_Error('gutenberg_stale_document', 'The post changed since it was read; refresh before validating the proposed document.', ['status' => 409, 'retryable' => false]);
        }
        return $this->validator->validate($post_id, is_array($arguments['blocks'] ?? null) ? $arguments['blocks'] : []);
    }

    public function fingerprint(int $post_id): string
    {
        return $this->documents->fingerprint($post_id);
    }

    /** @return array<string, mixed>|\WP_Error */
    public function validate_approval_arguments(array $arguments, string $session_id): array|\WP_Error
    {
        if (($arguments['contentIntent'] ?? '') !== GutenbergDocumentIntegrity::CONTENT_INTENT_REPLACE) {
            return $this->error('gutenberg_content_intent_invalid', 'This capability requires an explicit non-empty Gutenberg replacement.', 422);
        }
        $prepared_session_id = (string) ($arguments['preparedSessionId'] ?? '');
        if ($session_id === '' || !hash_equals($session_id, $prepared_session_id)) {
            return $this->error('gutenberg_receipt_session_mismatch', 'The prepared document does not belong to this Pixflow session.', 403);
        }
        $receipt = $this->tickets->receipt(
            (string) ($arguments['preparedReceiptId'] ?? ''),
            (int) ($arguments['postId'] ?? 0),
            (string) ($arguments['expectedFingerprint'] ?? ''),
            $prepared_session_id,
        );
        return $receipt instanceof \WP_Error ? $receipt : ['valid' => true, 'contentIntent' => GutenbergDocumentIntegrity::CONTENT_INTENT_REPLACE];
    }

    /** @return array<string, mixed>|\WP_Error */
    public function apply_document(array $arguments): array|\WP_Error
    {
        $post_id = (int) ($arguments['postId'] ?? 0);
        $expected = (string) ($arguments['expectedFingerprint'] ?? '');
        $receipt_id = (string) ($arguments['preparedReceiptId'] ?? '');
        $prepared_session_id = (string) ($arguments['preparedSessionId'] ?? '');
        if (($arguments['contentIntent'] ?? '') !== GutenbergDocumentIntegrity::CONTENT_INTENT_REPLACE) {
            return $this->error('gutenberg_content_intent_invalid', 'This capability requires an explicit non-empty Gutenberg replacement.', 422);
        }
        $receipt = $this->tickets->receipt($receipt_id, $post_id, $expected, $prepared_session_id);
        if ($receipt instanceof \WP_Error) return $receipt;
        $post = get_post($post_id);
        if (!$post instanceof \WP_Post) return $this->error('gutenberg_post_not_found', 'The target post was not found.', 404);
        if (!current_user_can('edit_post', $post_id)) return $this->error('gutenberg_target_forbidden', 'The current user cannot edit the target post.', 403);
        if (!hash_equals($expected, $this->documents->fingerprint($post_id))) return $this->error('gutenberg_stale_document', 'The post changed after preparation.', 409);
        if (($receipt['latestRevisionId'] ?? null) !== $this->latest_revision_id($post_id)) {
            return $this->error('gutenberg_newer_revision', 'A newer post revision exists; refresh before applying.', 409);
        }
        $editor_conflict = $this->editor_conflict($post);
        if ($editor_conflict instanceof \WP_Error) return $editor_conflict;

        $post_fields = is_array($arguments['post'] ?? null) ? $arguments['post'] : [];
        $unknown = array_diff(array_keys($post_fields), ['title', 'excerpt', 'status']);
        if ($unknown !== []) return $this->error('gutenberg_post_field_not_allowed', 'Only title, excerpt, and status are supported in this document transaction.', 422);
        $status = array_key_exists('status', $post_fields) ? sanitize_key((string) $post_fields['status']) : $post->post_status;
        if (!in_array($status, ['draft', 'pending', 'private', 'publish'], true)) return $this->error('gutenberg_status_not_allowed', 'The requested post status is not supported.', 400);
        $type = get_post_type_object($post->post_type);
        if ($status === 'publish' && (!$type instanceof \WP_Post_Type || !current_user_can($type->cap->publish_posts ?: 'publish_posts'))) {
            return $this->error('gutenberg_publish_forbidden', 'Publishing requires the target post type publish capability.', 403);
        }
        $terms = array_key_exists('terms', $arguments) ? $this->validate_terms($post, $arguments['terms']) : null;
        if ($terms instanceof \WP_Error) return $terms;
        $featured_media_id = array_key_exists('featuredMediaId', $arguments) ? (int) $arguments['featuredMediaId'] : (int) get_post_thumbnail_id($post_id);
        $featured_error = $this->validate_featured_media($post, $featured_media_id);
        if ($featured_error instanceof \WP_Error) return $featured_error;

        $before = $this->capture_state($post);
        $content = (string) ($receipt['content'] ?? '');
        $receipt_integrity = $this->integrity->validate_receipt($receipt);
        if ($receipt_integrity instanceof \WP_Error) return $receipt_integrity;
        if ($error = GutenbergExecutableContent::content_error($content, (string) $post->post_content)) return GutenbergExecutableContent::blocked_result($error);
        $expected_state = $before;
        $expected_state['content'] = $content;
        $expected_state['status'] = $status;
        if (array_key_exists('title', $post_fields)) $expected_state['title'] = sanitize_text_field((string) $post_fields['title']);
        if (array_key_exists('excerpt', $post_fields)) $expected_state['excerpt'] = sanitize_textarea_field((string) $post_fields['excerpt']);
        if ($terms !== null) {
            foreach ($terms as $taxonomy => $ids) $expected_state['terms'][$taxonomy] = array_values(array_map('intval', $ids));
            ksort($expected_state['terms']);
        }
        $expected_state['featuredMediaId'] = $featured_media_id;
        $expected_state = $this->with_wordpress_publish_derivatives($expected_state, $post);
        // Mark the single-use receipt before the first write so concurrent or
        // retried commits cannot race the same canonical document.
        $this->tickets->consume_receipt($receipt_id);
        $postarr = [
            'ID' => $post_id,
            'post_content' => wp_slash($content),
            'post_status' => $status,
            // WordPress otherwise assigns a new date to unpublished posts whose
            // GMT date is floating. The date is outside the approved mutation,
            // so preserve it explicitly as part of the atomic transaction.
            'post_date' => (string) $before['date'],
            'post_date_gmt' => (string) $before['dateGmt'],
            'edit_date' => true,
        ];
        if (array_key_exists('title', $post_fields)) $postarr['post_title'] = wp_slash(sanitize_text_field((string) $post_fields['title']));
        if (array_key_exists('excerpt', $post_fields)) $postarr['post_excerpt'] = wp_slash(sanitize_textarea_field((string) $post_fields['excerpt']));
        $updated = wp_update_post($postarr, true);
        if (is_wp_error($updated)) return $this->fail_after_restore($before, 'gutenberg_write_failed', 'The Gutenberg transaction failed and the previous post state was restored.', $updated);

        // wp_update_post() assigns the default category when a post currently
        // has no categories. Reapply the complete expected taxonomy state,
        // including empty lists, so an unrelated content replacement cannot
        // silently create terms or fail exact readback.
        foreach ((array) ($expected_state['terms'] ?? []) as $taxonomy => $ids) {
            $assigned = wp_set_post_terms($post_id, is_array($ids) ? array_map('intval', $ids) : [], (string) $taxonomy, false);
            if (is_wp_error($assigned)) {
                return $this->fail_after_restore($before, 'gutenberg_terms_failed', 'Taxonomy assignment failed and the complete previous post state was restored.', $assigned);
            }
        }
        $thumbnail_ok = $featured_media_id > 0
            ? set_post_thumbnail($post_id, $featured_media_id)
            : delete_post_thumbnail($post_id);
        if ($thumbnail_ok === false && (int) get_post_thumbnail_id($post_id) !== $featured_media_id) {
            return $this->fail_after_restore($before, 'gutenberg_featured_media_failed', 'The featured image could not be updated; the complete previous post state was restored.');
        }

        $verified = $this->verify_committed_state($post_id, $expected_state, $receipt);
        if ($verified instanceof \WP_Error) return $this->fail_after_restore($before, 'gutenberg_readback_failed', 'The approved Gutenberg transaction did not read back exactly; the complete previous post state was restored.', $verified);
        $adapter_evidence = $this->adapters->post_commit($post_id, (array) ($receipt['serverValidation']['support'] ?? []));
        $verified = $this->verify_committed_state($post_id, $expected_state, $receipt);
        if ($verified instanceof \WP_Error) return $this->fail_after_restore($before, 'gutenberg_adapter_readback_failed', 'Integration post-save handling changed the approved transaction; the complete previous post state was restored.', $verified);
        $after = get_post($post_id);
        if (!$after instanceof \WP_Post) return $this->fail_after_restore($before, 'gutenberg_readback_failed', 'The updated post disappeared during readback; the complete previous post state was restored.');
        $after_fingerprint = $this->documents->fingerprint($post_id);

        return [
            'schema' => 'pixflow.wp-admin.gutenberg-commit.v1',
            'post' => [
                'id' => $post_id,
                'title' => sanitize_text_field($after->post_title),
                'status' => sanitize_key($after->post_status),
                'modifiedGmt' => sanitize_text_field($after->post_modified_gmt),
                'featuredMediaId' => (int) get_post_thumbnail_id($post_id),
            ],
            'treeHash' => (string) ($receipt['treeHash'] ?? ''),
            'contentHash' => (string) ($receipt['contentHash'] ?? ''),
            'serializedBytes' => (int) ($receipt['serializedBytes'] ?? 0),
            'topLevelBlockCount' => (int) ($receipt['topLevelBlockCount'] ?? 0),
            'blockCount' => (int) ($receipt['blockCount'] ?? 0),
            'beforeFingerprint' => $expected,
            'afterFingerprint' => $after_fingerprint,
            'beforeDocument' => $before,
            'revisionId' => $this->latest_revision_id($post_id),
            'adapterEvidence' => $adapter_evidence,
            'rollback' => ['supported' => true, 'policy' => 'recorded_exact_document'],
            'reloadEditor' => true,
        ];
    }

    /** @return array<string, mixed>|\WP_Error */
    public function rollback_document(array $result): array|\WP_Error
    {
        $before = is_array($result['beforeDocument'] ?? null) ? $result['beforeDocument'] : [];
        $post_id = (int) ($before['postId'] ?? $result['post']['id'] ?? 0);
        if ($before === [] || $post_id < 1 || !current_user_can('edit_post', $post_id)) {
            return $this->error('gutenberg_rollback_unavailable', 'The exact Gutenberg rollback state is unavailable.', 409);
        }
        $restored = $this->restore_state($before);
        if ($restored instanceof \WP_Error) return $restored;
        return ['postId' => $post_id, 'result' => 'restored', 'fingerprint' => $this->documents->fingerprint($post_id), 'reloadEditor' => true];
    }

    /** @return array<string, mixed> */
    private function capture_state(\WP_Post $post): array
    {
        $terms = [];
        foreach (get_object_taxonomies($post->post_type, 'objects') as $taxonomy => $object) {
            if (!$object instanceof \WP_Taxonomy || empty($object->show_ui)) continue;
            $ids = wp_get_post_terms($post->ID, (string) $taxonomy, ['fields' => 'ids']);
            if (is_array($ids)) {
                $ids = array_values(array_map('intval', $ids));
                sort($ids);
                $terms[sanitize_key((string) $taxonomy)] = $ids;
            }
        }
        ksort($terms);
        return [
            'postId' => (int) $post->ID,
            'title' => (string) $post->post_title,
            'excerpt' => (string) $post->post_excerpt,
            'status' => (string) $post->post_status,
            'content' => (string) $post->post_content,
            'slug' => (string) $post->post_name,
            'authorId' => (int) $post->post_author,
            'date' => (string) $post->post_date,
            'dateGmt' => (string) $post->post_date_gmt,
            'modified' => (string) $post->post_modified,
            'modifiedGmt' => (string) $post->post_modified_gmt,
            'parentId' => (int) $post->post_parent,
            'menuOrder' => (int) $post->menu_order,
            'commentStatus' => (string) $post->comment_status,
            'pingStatus' => (string) $post->ping_status,
            'terms' => $terms,
            'featuredMediaId' => (int) get_post_thumbnail_id($post->ID),
        ];
    }

    private function restore_state(array $before): array|\WP_Error
    {
        $post_id = (int) ($before['postId'] ?? 0);
        $updated = wp_update_post([
            'ID' => $post_id,
            'post_title' => wp_slash((string) ($before['title'] ?? '')),
            'post_excerpt' => wp_slash((string) ($before['excerpt'] ?? '')),
            'post_status' => sanitize_key((string) ($before['status'] ?? 'draft')),
            'post_content' => wp_slash((string) ($before['content'] ?? '')),
            'post_name' => wp_slash((string) ($before['slug'] ?? '')),
            'post_author' => (int) ($before['authorId'] ?? 0),
            'post_date' => (string) ($before['date'] ?? ''),
            'post_date_gmt' => (string) ($before['dateGmt'] ?? ''),
            'edit_date' => true,
            'post_parent' => (int) ($before['parentId'] ?? 0),
            'menu_order' => (int) ($before['menuOrder'] ?? 0),
            'comment_status' => sanitize_key((string) ($before['commentStatus'] ?? 'closed')),
            'ping_status' => sanitize_key((string) ($before['pingStatus'] ?? 'closed')),
        ], true);
        if (is_wp_error($updated)) return $updated;
        foreach ((array) ($before['terms'] ?? []) as $taxonomy => $ids) {
            $assigned = wp_set_post_terms($post_id, is_array($ids) ? array_map('intval', $ids) : [], sanitize_key((string) $taxonomy), false);
            if (is_wp_error($assigned)) return $assigned;
        }
        $featured = (int) ($before['featuredMediaId'] ?? 0);
        if ($featured > 0) set_post_thumbnail($post_id, $featured); else delete_post_thumbnail($post_id);
        $timestamps = $this->restore_modified_times($before);
        if ($timestamps instanceof \WP_Error) return $timestamps;
        return ['postId' => $post_id, 'restored' => true];
    }

    /** @return array<string, mixed>|\WP_Error */
    private function verify_committed_state(int $post_id, array $expected, array $receipt): array|\WP_Error
    {
        $post = get_post($post_id);
        if (!$post instanceof \WP_Post) return $this->error('gutenberg_readback_missing', 'The updated post could not be read back.', 500);
        $content = $this->integrity->validate_persisted_content((string) $post->post_content, $receipt);
        if ($content instanceof \WP_Error) return $content;
        $actual = $this->capture_state($post);
        if (!$this->state_matches($expected, $actual)) {
            return $this->error('gutenberg_transaction_readback_mismatch', 'One or more approved post fields did not persist exactly.', 500, [
                'mismatchedFields' => $this->state_mismatch_fields($expected, $actual),
            ]);
        }
        return ['postId' => $post_id, ...$content];
    }

    private function state_matches(array $expected, array $actual, bool $include_modified_times = false): bool
    {
        $fields = ['postId', 'title', 'excerpt', 'status', 'content', 'slug', 'authorId', 'date', 'dateGmt', 'parentId', 'menuOrder', 'commentStatus', 'pingStatus', 'featuredMediaId'];
        if ($include_modified_times) array_push($fields, 'modified', 'modifiedGmt');
        foreach ($fields as $field) {
            if (($expected[$field] ?? null) !== ($actual[$field] ?? null)) return false;
        }
        return (array) ($expected['terms'] ?? []) === (array) ($actual['terms'] ?? []);
    }

    /**
     * Publishing a never-published draft causes WordPress core to derive its
     * public slug and GMT date even when Pixflow preserves the stored local
     * date. Treat those exact core-derived values as part of the transaction
     * contract so strict readback remains fail-closed without rejecting a
     * valid draft-to-publish transition.
     *
     * @param array<string, mixed> $expected
     * @return array<string, mixed>
     */
    private function with_wordpress_publish_derivatives(array $expected, \WP_Post $post): array
    {
        if (($expected['status'] ?? '') !== 'publish') return $expected;
        if (($expected['slug'] ?? '') === '') {
            $expected['slug'] = wp_unique_post_slug(
                sanitize_title((string) ($expected['title'] ?? '')),
                (int) $post->ID,
                'publish',
                (string) $post->post_type,
                (int) ($expected['parentId'] ?? $post->post_parent),
            );
        }
        if (($expected['dateGmt'] ?? '') === '0000-00-00 00:00:00') {
            $expected['dateGmt'] = get_gmt_from_date((string) ($expected['date'] ?? $post->post_date));
        }
        return $expected;
    }

    /** @return list<string> */
    private function state_mismatch_fields(array $expected, array $actual): array
    {
        $mismatched = [];
        foreach (['postId', 'title', 'excerpt', 'status', 'content', 'slug', 'authorId', 'date', 'dateGmt', 'parentId', 'menuOrder', 'commentStatus', 'pingStatus', 'featuredMediaId'] as $field) {
            if (($expected[$field] ?? null) !== ($actual[$field] ?? null)) $mismatched[] = $field;
        }
        if ((array) ($expected['terms'] ?? []) !== (array) ($actual['terms'] ?? [])) $mismatched[] = 'terms';
        return $mismatched;
    }

    /** @return array<string, mixed>|\WP_Error */
    private function restore_modified_times(array $before): array|\WP_Error
    {
        global $wpdb;
        $post_id = (int) ($before['postId'] ?? 0);
        $modified = (string) ($before['modified'] ?? '');
        $modified_gmt = (string) ($before['modifiedGmt'] ?? '');
        if ($post_id < 1 || $modified === '' || $modified_gmt === '' || !isset($wpdb->posts)) {
            return $this->error('gutenberg_rollback_timestamp_unavailable', 'The exact pre-transaction modification timestamps are unavailable.', 500);
        }
        $updated = $wpdb->update(
            $wpdb->posts,
            ['post_modified' => $modified, 'post_modified_gmt' => $modified_gmt],
            ['ID' => $post_id],
            ['%s', '%s'],
            ['%d'],
        );
        if ($updated === false) return $this->error('gutenberg_rollback_timestamp_failed', 'The original modification timestamps could not be restored.', 500);
        clean_post_cache($post_id);
        return ['postId' => $post_id, 'restored' => true];
    }

    private function fail_after_restore(array $before, string $code, string $message, ?\WP_Error $cause = null): \WP_Error
    {
        $restored = $this->restore_state($before);
        $post = get_post((int) ($before['postId'] ?? 0));
        $rollback_succeeded = !($restored instanceof \WP_Error)
            && $post instanceof \WP_Post
            && $this->state_matches($before, $this->capture_state($post), true);
        return $this->error($code, $message, 500, [
            'cause' => $cause?->get_error_code(),
            'compensatingRollback' => [
                'attempted' => true,
                'succeeded' => $rollback_succeeded,
                'error' => $restored instanceof \WP_Error ? $restored->get_error_code() : null,
            ],
        ]);
    }

    /** @return array<string, list<int>>|\WP_Error */
    private function validate_terms(\WP_Post $post, mixed $raw): array|\WP_Error
    {
        if (!is_array($raw) || array_is_list($raw) || count($raw) > 16) return $this->error('gutenberg_terms_invalid', 'Terms must be an object keyed by taxonomy.', 400);
        $out = [];
        foreach ($raw as $taxonomy => $ids) {
            $taxonomy = sanitize_key((string) $taxonomy);
            $object = get_taxonomy($taxonomy);
            if (!$object instanceof \WP_Taxonomy || !is_object_in_taxonomy($post->post_type, $taxonomy)) return $this->error('gutenberg_taxonomy_invalid', 'A taxonomy is not registered for the target post type.', 422);
            if (!current_user_can((string) ($object->cap->assign_terms ?? 'edit_posts'))) return $this->error('gutenberg_terms_forbidden', 'The current user cannot assign the requested taxonomy.', 403);
            if (!is_array($ids) || count($ids) > 100) return $this->error('gutenberg_terms_invalid', 'Each taxonomy requires a bounded list of existing term IDs.', 400);
            $normalized = [];
            foreach ($ids as $id) {
                $id = (int) $id;
                if ($id < 1 || !term_exists($id, $taxonomy)) return $this->error('gutenberg_term_missing', 'A requested taxonomy term does not exist.', 404);
                $normalized[] = $id;
            }
            $out[$taxonomy] = array_values(array_unique($normalized));
        }
        return $out;
    }

    private function validate_featured_media(\WP_Post $post, int $attachment_id): ?\WP_Error
    {
        if ($attachment_id === 0) return null;
        $attachment = get_post($attachment_id);
        if (!$attachment instanceof \WP_Post || $attachment->post_type !== 'attachment' || !str_starts_with((string) get_post_mime_type($attachment_id), 'image/')) {
            return $this->error('gutenberg_featured_media_invalid', 'Featured media must be an existing image attachment.', 422);
        }
        if (!post_type_supports($post->post_type, 'thumbnail')) return $this->error('gutenberg_featured_media_unsupported', 'The target post type does not support featured images.', 422);
        if (!current_user_can('read_post', $attachment_id)) return $this->error('gutenberg_featured_media_forbidden', 'The current user cannot use the selected featured image.', 403);
        return null;
    }

    private function editor_conflict(\WP_Post $post): ?\WP_Error
    {
        if (function_exists('wp_check_post_lock')) {
            $lock = wp_check_post_lock($post->ID);
            if ($lock && (int) $lock !== get_current_user_id()) return $this->error('gutenberg_post_locked', 'The post is currently locked by another user.', 409);
        }
        if (function_exists('wp_get_post_autosave')) {
            $autosave = wp_get_post_autosave($post->ID);
            if ($autosave instanceof \WP_Post && strtotime($autosave->post_modified_gmt) > strtotime($post->post_modified_gmt)) return $this->error('gutenberg_newer_autosave', 'A newer autosave exists; refresh before applying.', 409);
        }
        return null;
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
