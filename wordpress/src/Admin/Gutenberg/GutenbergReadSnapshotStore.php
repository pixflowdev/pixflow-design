<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Admin\Gutenberg;

if (!defined('ABSPATH')) {
    exit;
}

/** Short-lived, authority-bound snapshots for oversized exact reads. */
final class GutenbergReadSnapshotStore
{
    private const TTL = 600;

    /** @param array<string,mixed> $document @param array{boundaryType:string,chunks:list<array<string,mixed>>} $chunk_set @param array<string,mixed> $binding */
    public function create(\WP_Post $post, array $document, array $chunk_set, array $binding): array|\WP_Error
    {
        $authority = $this->binding($binding);
        if ($authority instanceof \WP_Error) return $authority;
        $snapshot_id = 'gbrs_' . str_replace('-', '', wp_generate_uuid4());
        $expires = time() + self::TTL;
        $record = [
            'schema' => 'pixflow.wp-admin.gutenberg-read-snapshot.v1', 'snapshotId' => $snapshot_id,
            'siteHash' => hash('sha256', untrailingslashit(home_url())), 'userId' => (string) get_current_user_id(),
            'postId' => (int) $post->ID, 'postType' => sanitize_key($post->post_type),
            'fingerprint' => (string) ($document['fingerprint'] ?? ''), 'contentSha256' => (string) ($document['contentFingerprint'] ?? ''),
            'authority' => $authority, 'boundaryType' => $chunk_set['boundaryType'], 'chunks' => $chunk_set['chunks'],
            'createdAt' => time(), 'expiresAt' => $expires,
        ];
        set_transient($this->key($snapshot_id), $record, self::TTL);
        return ['snapshotId' => $snapshot_id, 'chunkCount' => count($chunk_set['chunks']), 'chunkBoundaryType' => $chunk_set['boundaryType'], 'expiresAt' => $expires];
    }

    /** @param array<string,mixed> $binding @return array<string,mixed>|\WP_Error */
    public function chunk(string $snapshot_id, int $cursor, int $post_id, array $binding, string $current_fingerprint): array|\WP_Error
    {
        $record = get_transient($this->key($snapshot_id));
        if (!is_array($record) || (int) ($record['expiresAt'] ?? 0) <= time()) return $this->error('gutenberg_read_snapshot_expired', 'The Gutenberg read snapshot expired; read the current post again.', 410);
        $authority = $this->binding($binding);
        if ($authority instanceof \WP_Error) return $authority;
        if (!hash_equals((string) ($record['siteHash'] ?? ''), hash('sha256', untrailingslashit(home_url())))
            || !hash_equals((string) ($record['userId'] ?? ''), (string) get_current_user_id())
            || (int) ($record['postId'] ?? 0) !== $post_id || !hash_equals((string) ($record['fingerprint'] ?? ''), $current_fingerprint)
            || !hash_equals($this->canonical((array) ($record['authority'] ?? [])), $this->canonical($authority))) {
            return $this->error('gutenberg_read_snapshot_mismatch', 'The read snapshot belongs to a different user, tab, conversation, source message, post, or revision.', 409);
        }
        $chunks = is_array($record['chunks'] ?? null) ? array_values($record['chunks']) : [];
        if (!isset($chunks[$cursor]) || !is_array($chunks[$cursor])) return $this->error('gutenberg_read_chunk_invalid', 'The requested Gutenberg read chunk does not exist.', 404);
        $chunk = $chunks[$cursor];
        return [
            'schema' => 'pixflow.wp-admin.gutenberg-read-chunk.v1', 'version' => 1,
            'snapshotId' => $snapshot_id, 'postId' => $post_id, 'postType' => (string) ($record['postType'] ?? ''),
            'fingerprint' => (string) ($record['fingerprint'] ?? ''), 'documentSha256' => (string) ($record['contentSha256'] ?? ''),
            'readAuthority' => (array) ($record['authority'] ?? []),
            'chunkBoundaryType' => (string) ($record['boundaryType'] ?? ''), 'chunkIndex' => $cursor, 'chunkCount' => count($chunks),
            'topLevelStart' => (int) ($chunk['topLevelStart'] ?? 0), 'topLevelEnd' => (int) ($chunk['topLevelEnd'] ?? 0),
            'contentFragment' => wp_check_invalid_utf8((string) ($chunk['contentFragment'] ?? '')),
            'blocks' => is_array($chunk['blocks'] ?? null) ? $chunk['blocks'] : [], 'chunkSha256' => (string) ($chunk['chunkSha256'] ?? ''),
            // A chunk never represents the complete document by itself, even
            // when it is the final chunk. The caller must reassemble and hash
            // every chunk before it may treat the snapshot as complete.
            'contentComplete' => false, 'contentTruncated' => false,
            'isFinalChunk' => $cursor === count($chunks) - 1,
            'hasMore' => $cursor + 1 < count($chunks),
            'nextCursor' => $cursor + 1 < count($chunks) ? $cursor + 1 : null, 'expiresAt' => (int) $record['expiresAt'],
        ];
    }

    /** @param array<string,mixed> $binding @return array<string,string>|\WP_Error */
    private function binding(array $binding): array|\WP_Error
    {
        $identity = is_array($binding['contextIdentity'] ?? null) ? $binding['contextIdentity'] : [];
        foreach (['sessionId', 'conversationId', 'sourceMessageId', 'tabId'] as $field) {
            if (!is_string($binding[$field] ?? null) || trim((string) $binding[$field]) === '') return $this->error('gutenberg_read_context_required', 'Exact Gutenberg reads require current session, conversation, source-message, and tab authority.', 409);
        }
        return [
            'sessionId' => sanitize_text_field((string) $binding['sessionId']), 'conversationId' => sanitize_text_field((string) $binding['conversationId']),
            'sourceMessageId' => sanitize_text_field((string) $binding['sourceMessageId']), 'tabId' => sanitize_text_field((string) $binding['tabId']),
            'contextRevision' => sanitize_text_field((string) ($identity['contextRevision'] ?? '')),
            'contentFingerprint' => sanitize_text_field((string) ($identity['contentFingerprint'] ?? '')),
        ];
    }

    private function key(string $id): string { return 'pixflow_gbrs_' . hash('sha256', $id); }
    private function canonical(array $value): string { ksort($value); return (string) wp_json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); }
    private function error(string $code, string $message, int $status): \WP_Error { return new \WP_Error($code, $message, ['status' => $status, 'retryable' => false]); }
}
