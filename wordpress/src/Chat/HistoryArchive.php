<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Chat;

use PixflowDesign\WordPress\Database\Table;

if (!defined('ABSPATH')) exit;

/** Read-only archive operations. Export pages never replace or prune the transcript. */
final class HistoryArchive
{
    public function __construct(private readonly HistoryRepository $history = new HistoryRepository()) {}

    private static function byte_length(string $column): string
    {
        $type = defined('DB_ENGINE') && strtolower((string) DB_ENGINE) === 'sqlite' ? 'BLOB' : 'BINARY';
        return "LENGTH(CAST({$column} AS {$type}))";
    }

    private function cursor(array $state): string
    {
        $body = rtrim(strtr(base64_encode(wp_json_encode($state)), '+/', '-_'), '=');
        return $body . '.' . hash_hmac('sha256', $body, wp_salt('auth'));
    }

    private function state(string $cursor, string $key): array|\WP_Error
    {
        $parts = explode('.', $cursor);
        if (strlen($cursor) > 4096 || count($parts) !== 2 || !hash_equals(hash_hmac('sha256', $parts[0], wp_salt('auth')), $parts[1])) {
            return new \WP_Error('pixflow_history_export_cursor', 'Invalid export cursor. Start the export again.', ['status' => 400]);
        }
        $state = json_decode((string) base64_decode(strtr($parts[0], '-_', '+/'), true), true);
        if (!is_array($state) || ($state['owner'] ?? null) !== get_current_user_id() || ($state['blog'] ?? null) !== get_current_blog_id()
            || ($state['key'] ?? '') !== $key || !is_int($state['after'] ?? null) || $state['after'] < 0
            || !is_int($state['expires'] ?? null) || $state['expires'] < time()) {
            return new \WP_Error('pixflow_history_export_cursor', 'This export expired or belongs to another chat. Start it again.', ['status' => 400]);
        }
        return $state;
    }

    /** Any acknowledged content mutation changes this signature; storage-only compression does not. */
    private function version(string $key, array $conversation): string
    {
        global $wpdb;
        $row = $wpdb->get_row($wpdb->prepare('SELECT COUNT(*) AS rows_count, COALESCE(SUM(revision), 0) AS revisions, COALESCE(SUM(deleted), 0) AS deletions, COALESCE(MAX(sequence_id), 0) AS last_sequence FROM '
            . Table::name(Table::CHAT_MESSAGES) . ' WHERE conversation_key = %s', $key), ARRAY_A);
        if (!is_array($row)) throw new \RuntimeException('Export version could not be read.');
        return hash('sha256', wp_json_encode([$row, $conversation['title'], $conversation['created_at'], $conversation['updated_at']]));
    }

    public function export_page(string $project, string $conversation, string $cursor = '', int $limit = 100): array|\WP_Error
    {
        global $wpdb;
        $key = HistoryRepository::key($project, $conversation);
        $state = $cursor !== '' ? $this->state($cursor, $key) : null;
        if (is_wp_error($state)) return $state;
        return $this->history->locked($key, function () use ($wpdb, $project, $conversation, $key, $state, $limit) {
            $record = $this->history->conversation($project, $conversation);
            if (!$record || (int) $record['deleted']) return new \WP_Error('pixflow_history_deleted', 'This conversation was deleted.', ['status' => 410]);
            $version = $this->version($key, $record);
            if ($state !== null && !hash_equals((string) $state['version'], $version)) {
                return new \WP_Error('pixflow_history_export_changed', 'This chat changed during export. Wait for the current reply to finish and export again.', ['status' => 409]);
            }
            $table = Table::name(Table::CHAT_MESSAGES);
            $state ??= ['owner' => get_current_user_id(), 'blog' => get_current_blog_id(), 'key' => $key, 'version' => $version,
                'after' => 0, 'expires' => time() + 3600, 'exportedAt' => gmdate('c'), 'conversation' => [
                    'projectId' => $project, 'conversationId' => $conversation, 'title' => $record['title'],
                    'createdAt' => (int) $record['created_at'], 'updatedAt' => (int) $record['updated_at'],
                    'messageCount' => (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$table} WHERE conversation_key = %s AND deleted = 0", $key)),
                ]];
            // Read small headers first: a page normally stays below 4 MiB decoded.
            // A single larger message is returned whole, never silently truncated.
            $byteLength = self::byte_length('payload');
            $headers = $wpdb->get_results($wpdb->prepare("SELECT sequence_id, {$byteLength} AS stored_bytes, SUBSTR(payload, 1, 100) AS header FROM {$table} WHERE conversation_key = %s AND deleted = 0 AND sequence_id > %d ORDER BY sequence_id ASC LIMIT %d", $key, $state['after'], min(500, max(1, $limit)) + 1), ARRAY_A);
            if (!is_array($headers)) throw new \RuntimeException('Export could not be read.');
            $selected = []; $bytes = 0; $pageLimit = min(500, max(1, $limit));
            foreach ($headers as $header) {
                $size = self::logical_bytes($header['header'], (int) $header['stored_bytes']);
                if (count($selected) >= $pageLimit || ($selected !== [] && $bytes + $size > 4194304)) break;
                $selected[] = (int) $header['sequence_id']; $bytes += $size;
            }
            $messages = [];
            if ($selected !== []) {
                $last = end($selected);
                $rows = $wpdb->get_results($wpdb->prepare("SELECT payload, revision, sequence_id FROM {$table} WHERE conversation_key = %s AND deleted = 0 AND sequence_id > %d AND sequence_id <= %d ORDER BY sequence_id ASC", $key, $state['after'], $last), ARRAY_A);
                if (!is_array($rows) || count($rows) !== count($selected)) throw new \RuntimeException('Export changed while reading.');
                foreach ($rows as $row) $messages[] = array_merge(HistoryPayload::message($row['payload']), ['historyRevision' => (int) $row['revision'], 'historySequence' => (int) $row['sequence_id']]);
                $state['after'] = $last;
            }
            $more = count($headers) > count($selected);
            return ['schemaVersion' => 1, 'exportedAt' => $state['exportedAt'], 'conversation' => $state['conversation'],
                'messages' => $messages, 'hasMore' => $more, 'nextCursor' => $more ? $this->cursor($state) : null];
        });
    }

    private static function logical_bytes(string $header, int $stored): int
    {
        if (preg_match('/\APFCHAT1:([1-9][0-9]{0,8}):[a-f0-9]{64}:/D', $header, $match) && (int) $match[1] <= HistoryPayload::MAX_BYTES) return (int) $match[1];
        if (str_starts_with($header, 'PFCHAT')) throw new \RuntimeException('Unsupported or damaged chat storage.');
        return $stored;
    }

    public function storage_usage(int $owner): array
    {
        global $wpdb;
        $projects = Table::name(Table::PROJECTS); $conversations = Table::name(Table::CHAT_CONVERSATIONS); $messages = Table::name(Table::CHAT_MESSAGES);
        $joins = " FROM {$messages} m INNER JOIN {$conversations} c ON c.conversation_key = m.conversation_key INNER JOIN {$projects} p ON p.uuid = c.project_uuid";
        $where = "p.owner_user_id = %d AND p.status <> 'deleted' AND c.deleted = 0 AND m.deleted = 0";
        $stored = 0; $logical = 0; $count = 0; $compressed = 0; $after = 0;
        $through = $wpdb->get_var($wpdb->prepare("SELECT COALESCE(MAX(m.sequence_id), 0) {$joins} WHERE {$where}", $owner));
        if ($through === null || $through === false) throw new \RuntimeException('Chat usage could not be read.');
        // Do not load/decode tool results just to show usage. Only fixed-size
        // encoding headers and database byte lengths cross the query boundary.
        $messageBytes = self::byte_length('m.payload');
        do {
            $rows = $wpdb->get_results($wpdb->prepare("SELECT m.sequence_id, {$messageBytes} AS stored_bytes, SUBSTR(m.payload, 1, 100) AS header {$joins} WHERE {$where} AND m.sequence_id > %d AND m.sequence_id <= %d ORDER BY m.sequence_id ASC LIMIT 500", $owner, $after, (int) $through), ARRAY_A);
            if (!is_array($rows)) throw new \RuntimeException('Chat usage could not be read.');
            foreach ($rows as $row) {
                $bytes = (int) $row['stored_bytes']; $stored += $bytes; $logical += self::logical_bytes($row['header'], $bytes);
                $compressed += str_starts_with($row['header'], 'PFCHAT1:') ? 1 : 0; $count++; $after = (int) $row['sequence_id'];
            }
        } while (count($rows) === 500);
        $metadataBytes = self::byte_length('metadata'); $contextBytes = self::byte_length('meta_value');
        $metadata = (int) $wpdb->get_var($wpdb->prepare("SELECT COALESCE(SUM({$metadataBytes}), 0) FROM {$projects} WHERE owner_user_id = %d AND status <> 'deleted'", $owner));
        $contextPrefix = $wpdb->esc_like('pixflow_design_working_context_' . get_current_blog_id() . '_') . '%';
        $context = (int) $wpdb->get_var($wpdb->prepare("SELECT COALESCE(SUM({$contextBytes}), 0) FROM {$wpdb->usermeta} WHERE user_id = %d AND meta_key LIKE %s", $owner, $contextPrefix));
        $conversationCount = (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$conversations} c INNER JOIN {$projects} p ON p.uuid = c.project_uuid WHERE p.owner_user_id = %d AND p.status <> 'deleted' AND c.deleted = 0", $owner));
        return ['scope' => 'current-user', 'measuredAt' => gmdate('c'), 'conversationCount' => $conversationCount, 'messageCount' => $count,
            'compressedMessageCount' => $compressed, 'storedMessageBytes' => $stored, 'logicalMessageBytes' => $logical, 'savedMessageBytes' => max(0, $logical - $stored),
            'projectMetadataBytes' => $metadata, 'workingContextBytes' => $context,
            'exclusions' => ['media-files', 'browser-cache', 'bridge-files', 'database-overhead', 'temporary-context-candidates', 'saved-memory']];
    }
}
