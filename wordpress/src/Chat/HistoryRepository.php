<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Chat;

use PixflowDesign\WordPress\Database\Table;

if (!defined('ABSPATH')) exit;

/** Durable transcripts are never pruned by execution-log or browser-cache retention. */
final class HistoryRepository
{
    public static function key(string $project, string $conversation): string { return hash('sha256', $project . "\0" . $conversation); }

    /** Serialize resolve/migration/deletion without trusting client timestamps. */
    public function locked(string $identity, callable $callback): mixed
    {
        global $wpdb;
        $pdo = $GLOBALS['@pdo'] ?? null;
        if (defined('DB_ENGINE') && strtolower((string) DB_ENGINE) === 'sqlite' && $pdo instanceof \PDO) {
            $pdo->exec('BEGIN IMMEDIATE');
            try { $result = $callback(); $pdo->exec('COMMIT'); return $result; }
            catch (\Throwable $error) { $pdo->exec('ROLLBACK'); throw $error; }
        }
        $lock = 'pf_history_' . substr(hash('sha256', $wpdb->prefix . $identity), 0, 48);
        if ((int) $wpdb->get_var($wpdb->prepare('SELECT GET_LOCK(%s, 5)', $lock)) !== 1) {
            return new \WP_Error('pixflow_history_busy', 'Chat history is busy. Please retry.', ['status' => 503]);
        }
        try {
            $this->check($wpdb->query('START TRANSACTION'));
            try {
                $result = $callback();
                $this->check($wpdb->query(is_wp_error($result) ? 'ROLLBACK' : 'COMMIT'));
                return $result;
            } catch (\Throwable $error) { $wpdb->query('ROLLBACK'); throw $error; }
        }
        finally { $wpdb->get_var($wpdb->prepare('SELECT RELEASE_LOCK(%s)', $lock)); }
    }

    private function check(mixed $result): void
    {
        if ($result === false) throw new \RuntimeException('Chat history could not be saved. Please retry.');
    }

    /** The official SQLite integration needs bound native inserts for mixed JSON/string rows. */
    private function insert_row(string $table, array $row): void
    {
        global $wpdb;
        $pdo = $GLOBALS['@pdo'] ?? null;
        if (defined('DB_ENGINE') && strtolower((string) DB_ENGINE) === 'sqlite' && $pdo instanceof \PDO) {
            $columns = implode(', ', array_map(static fn(string $column): string => '"' . $column . '"', array_keys($row)));
            $statement = $pdo->prepare('INSERT INTO "' . $table . '" (' . $columns . ') VALUES (' . implode(', ', array_fill(0, count($row), '?')) . ')');
            $this->check($statement !== false && $statement->execute(array_values($row)));
            return;
        }
        $this->check($wpdb->insert($table, $row));
    }

    public function conversation(string $project, string $conversation): ?array
    {
        global $wpdb;
        $row = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . Table::name(Table::CHAT_CONVERSATIONS) . ' WHERE conversation_key = %s', self::key($project, $conversation)), ARRAY_A);
        return is_array($row) ? $row : null;
    }

    /** Lazy import is additive; old project metadata remains a recovery copy. */
    public function migrate(array $project, string $conversation): array|\WP_Error
    {
        global $wpdb;
        $projectId = (string) $project['uuid'];
        $key = self::key($projectId, $conversation);
        return $this->locked($key, function () use ($wpdb, $project, $projectId, $conversation, $key) {
            $row = $this->conversation($projectId, $conversation);
            if ($row && (int) $row['deleted']) return new \WP_Error('pixflow_history_deleted', 'This conversation was deleted.', ['status' => 410]);
            if ($row && (int) $row['migrated']) return $row;
            $state = $project['metadata']['odState'] ?? [];
            $legacy = is_array($state['messages'][$conversation] ?? null) ? $state['messages'][$conversation] : [];
            $now = (int) round(microtime(true) * 1000);
            $created = !empty($project['createdAt']) ? (int) strtotime((string) $project['createdAt']) * 1000 : $now;
            $updated = !empty($project['updatedAt']) ? (int) strtotime((string) $project['updatedAt']) * 1000 : $created;
            $title = (string) ($project['title'] ?? 'New chat');
            foreach ($state['conversations'] ?? [] as $item) {
                if (is_array($item) && ($item['id'] ?? '') === $conversation) {
                    $title = (string) ($item['title'] ?? $title);
                    if (is_numeric($item['createdAt'] ?? null)) $created = (int) $item['createdAt'];
                    if (is_numeric($item['updatedAt'] ?? null)) $updated = (int) $item['updatedAt'];
                    break;
                }
            }
            if (!$row) $this->insert_row(Table::name(Table::CHAT_CONVERSATIONS), [
                'conversation_key' => $key, 'project_uuid' => $projectId, 'conversation_id' => $conversation,
                'title' => mb_substr($title, 0, 191), 'created_at' => max(0, $created), 'updated_at' => max(0, $updated),
            ]);
            foreach ($legacy as $message) {
                if (!is_array($message) || !is_string($message['id'] ?? null) || $message['id'] === '') continue;
                if (!$this->row($key, $message['id'])) $this->insert($key, $message);
            }
            // A failure above leaves migrated=0; retry imports only the missing records.
            $this->check($wpdb->update(Table::name(Table::CHAT_CONVERSATIONS), ['migrated' => 1], ['conversation_key' => $key]));
            return $this->conversation($projectId, $conversation);
        });
    }

    private function row(string $key, string $messageId): ?array
    {
        global $wpdb;
        $row = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . Table::name(Table::CHAT_MESSAGES) . ' WHERE conversation_key = %s AND message_key = %s', $key, hash('sha256', $messageId)), ARRAY_A);
        return is_array($row) ? $row : null;
    }

    private function clean(array $message): array
    {
        unset($message['historyRevision'], $message['historySequence']);
        return $message;
    }

    private function payload(array $row): array
    {
        $message = HistoryPayload::message((string) $row['payload']);
        return array_merge($message, ['historyRevision' => (int) $row['revision'], 'historySequence' => (int) $row['sequence_id']]);
    }

    private function insert(string $key, array $message): void
    {
        global $wpdb;
        $payload = wp_json_encode($this->clean($message));
        if ($payload === false) throw new \InvalidArgumentException('Chat message is not valid JSON.');
        $this->insert_row(Table::name(Table::CHAT_MESSAGES), ['conversation_key' => $key,
            'message_key' => hash('sha256', $message['id']), 'message_id' => $message['id'], 'payload' => HistoryPayload::encode($payload)]);
    }

    public function page(string $project, string $conversation, ?int $limit, string $before): array|\WP_Error
    {
        global $wpdb;
        $key = self::key($project, $conversation);
        $where = 'conversation_key = %s AND deleted = 0'; $values = [$key];
        if ($before !== '') {
            $cursor = json_decode((string) base64_decode(strtr($before, '-_', '+/'), true), true);
            if (!is_array($cursor) || ($cursor['conversation'] ?? '') !== $key || !is_int($cursor['before'] ?? null) || $cursor['before'] < 1) {
                return new \WP_Error('pixflow_history_cursor', 'Invalid chat history cursor.', ['status' => 400]);
            }
            $where .= ' AND sequence_id < %d'; $values[] = $cursor['before'];
        }
        $sql = 'SELECT * FROM ' . Table::name(Table::CHAT_MESSAGES) . ' WHERE ' . $where . ' ORDER BY sequence_id DESC';
        if ($limit !== null) { $limit = max(1, min(100, $limit)); $sql .= ' LIMIT %d'; $values[] = $limit + 1; }
        $rows = $wpdb->get_results($wpdb->prepare($sql, ...$values), ARRAY_A);
        if (!is_array($rows)) throw new \RuntimeException('Chat history could not be loaded.');
        $hasMore = $limit !== null && count($rows) > $limit;
        if ($hasMore) array_pop($rows);
        $cursor = $hasMore ? rtrim(strtr(base64_encode(wp_json_encode(['conversation' => $key, 'before' => (int) end($rows)['sequence_id']])), '+/', '-_'), '=') : null;
        return ['messages' => array_map([$this, 'payload'], array_reverse($rows)), 'nextCursor' => $cursor, 'hasMore' => $hasMore];
    }

    public function write(string $project, string $conversation, array $message, bool $importOnly = false): array|\WP_Error
    {
        global $wpdb;
        $key = self::key($project, $conversation);
        return $this->locked($key, function () use ($wpdb, $key, $project, $conversation, $message, $importOnly) {
            $conversationRow = $this->conversation($project, $conversation);
            if (!$conversationRow || (int) $conversationRow['deleted']) return new \WP_Error('pixflow_history_deleted', 'This conversation was deleted.', ['status' => 410]);
            $row = $this->row($key, $message['id']);
            if ($row && (int) $row['deleted']) return new \WP_Error('pixflow_history_deleted', 'This message was deleted.', ['status' => 410]);
            $changed = !$row;
            if (!$row) $this->insert($key, $message);
            elseif (!$importOnly && $this->clean($this->payload($row)) != $this->clean($message)) {
                if (!isset($message['historyRevision']) || (int) $message['historyRevision'] !== (int) $row['revision']) {
                    return new \WP_Error('pixflow_history_conflict', 'This message has a newer saved version.', ['status' => 409, 'message' => $this->payload($row)]);
                }
                $json = wp_json_encode($this->clean($message));
                if ($json === false) throw new \InvalidArgumentException('Chat message is not valid JSON.');
                $this->check($wpdb->update(Table::name(Table::CHAT_MESSAGES), ['payload' => HistoryPayload::encode($json), 'revision' => (int) $row['revision'] + 1], ['sequence_id' => (int) $row['sequence_id'], 'revision' => (int) $row['revision']]));
                $changed = true;
            }
            if ($changed) {
                $this->check($wpdb->update(Table::name(Table::CHAT_CONVERSATIONS), ['updated_at' => (int) round(microtime(true) * 1000)], ['conversation_key' => $key]));
                $this->check($wpdb->update(Table::name(Table::PROJECTS), ['updated_at' => gmdate('Y-m-d H:i:s')], ['uuid' => $project]));
                if (!$row && ($message['role'] ?? '') === 'user' && $conversationRow['title'] === 'New chat' && is_string($message['content'] ?? null)) {
                    $title = mb_substr(wp_trim_words(sanitize_text_field($message['content']), 8, '…'), 0, 191);
                    if ($title !== '') {
                        $this->check($wpdb->update(Table::name(Table::CHAT_CONVERSATIONS), ['title' => $title], ['conversation_key' => $key]));
                        $this->check($wpdb->update(Table::name(Table::PROJECTS), ['title' => $title], ['uuid' => $project, 'title' => 'New chat']));
                    }
                }
            }
            $saved = $this->payload($this->row($key, $message['id']));
            return ['ok' => true, 'message' => $saved, 'revision' => $saved['historyRevision']];
        });
    }

    public function remove(string $project, string $conversation, ?string $messageId = null): array|\WP_Error
    {
        global $wpdb;
        $key = self::key($project, $conversation);
        return $this->locked($key, function () use ($wpdb, $key, $messageId) {
            if ($messageId === null) {
                $this->check($wpdb->update(Table::name(Table::CHAT_CONVERSATIONS), ['deleted' => 1], ['conversation_key' => $key]));
                $this->check($wpdb->update(Table::name(Table::CHAT_MESSAGES), ['deleted' => 1, 'payload' => '{}'], ['conversation_key' => $key]));
            } else {
                $row = $this->row($key, $messageId);
                if (!$row) $this->insert($key, ['id' => $messageId]);
                $this->check($wpdb->update(Table::name(Table::CHAT_MESSAGES), ['deleted' => 1, 'payload' => '{}'], ['conversation_key' => $key, 'message_key' => hash('sha256', $messageId)]));
            }
            return ['ok' => true];
        });
    }

    public function conversations(string $project): array
    {
        global $wpdb;
        $rows = $wpdb->get_results($wpdb->prepare('SELECT c.*, (SELECT COUNT(*) FROM ' . Table::name(Table::CHAT_MESSAGES) . ' m WHERE m.conversation_key = c.conversation_key AND m.deleted = 0) AS message_count FROM ' . Table::name(Table::CHAT_CONVERSATIONS) . ' c WHERE project_uuid = %s', $project), ARRAY_A);
        return is_array($rows) ? $rows : [];
    }

    public function rename(string $project, string $conversation, string $title): array|\WP_Error
    {
        global $wpdb;
        $key = self::key($project, $conversation);
        return $this->locked($key, function () use ($wpdb, $key, $project, $conversation, $title) {
            $row = $this->conversation($project, $conversation);
            if (!$row || (int) $row['deleted']) return new \WP_Error('pixflow_history_deleted', 'This conversation was deleted.', ['status' => 410]);
            $this->check($wpdb->update(Table::name(Table::CHAT_CONVERSATIONS), ['title' => mb_substr($title, 0, 191)], ['conversation_key' => $key]));
            return ['ok' => true];
        });
    }

    public function owned_conversations(int $owner, int $limit = 50, string $before = ''): array|\WP_Error
    {
        global $wpdb;
        $limit = min(100, max(1, $limit));
        $where = "p.owner_user_id = %d AND p.status <> 'deleted' AND c.deleted = 0";
        $values = [$owner];
        if ($before !== '') {
            $cursor = json_decode((string) base64_decode(strtr($before, '-_', '+/'), true), true);
            if (!is_array($cursor) || ($cursor['owner'] ?? null) !== $owner || !is_int($cursor['created'] ?? null) || !preg_match('/^[a-f0-9]{64}$/D', (string) ($cursor['key'] ?? ''))) {
                return new \WP_Error('pixflow_history_cursor', 'Invalid chat history cursor.', ['status' => 400]);
            }
            $where .= ' AND (c.created_at < %d OR (c.created_at = %d AND c.conversation_key < %s))';
            array_push($values, $cursor['created'], $cursor['created'], $cursor['key']);
        }
        $values[] = $limit + 1;
        $rows = $wpdb->get_results($wpdb->prepare('SELECT c.*, (SELECT b.session_key FROM ' . Table::name(Table::CHAT_BINDINGS)
            . ' b WHERE b.project_uuid = c.project_uuid AND b.conversation_id = c.conversation_id AND b.owner_user_id = p.owner_user_id LIMIT 1) AS session_key, (SELECT COUNT(*) FROM ' . Table::name(Table::CHAT_MESSAGES)
            . ' m WHERE m.conversation_key = c.conversation_key AND m.deleted = 0) AS message_count FROM ' . Table::name(Table::CHAT_CONVERSATIONS)
            . ' c INNER JOIN ' . Table::name(Table::PROJECTS) . ' p ON p.uuid = c.project_uuid WHERE ' . $where
            . ' ORDER BY c.created_at DESC, c.conversation_key DESC LIMIT %d', ...$values), ARRAY_A);
        if (!is_array($rows)) throw new \RuntimeException('Chat history could not be loaded.');
        $hasMore = count($rows) > $limit;
        if ($hasMore) array_pop($rows);
        $last = $rows !== [] ? end($rows) : null;
        $cursor = $hasMore ? rtrim(strtr(base64_encode(wp_json_encode(['owner' => $owner, 'created' => (int) $last['created_at'], 'key' => $last['conversation_key']])), '+/', '-_'), '=') : null;
        return ['conversations' => array_map(static fn(array $row): array => [
            'projectId' => $row['project_uuid'], 'conversationId' => $row['conversation_id'], 'title' => $row['title'],
            'sessionKey' => $row['session_key'] ?? null,
            'createdAt' => (int) $row['created_at'], 'updatedAt' => (int) $row['updated_at'], 'messageCount' => (int) $row['message_count'],
        ], $rows), 'nextCursor' => $cursor, 'hasMore' => $hasMore];
    }

    /** Caller owns the transaction; partial forks must never become visible. */
    public function seed_fork(string $project, string $conversation, string $title, int $now, array $messages, string $sourceProject, string $sourceConversation): array
    {
        global $wpdb;
        $key = self::key($project, $conversation);
        $this->insert_row(Table::name(Table::CHAT_CONVERSATIONS), ['conversation_key' => $key, 'project_uuid' => $project, 'conversation_id' => $conversation, 'title' => $title, 'created_at' => $now, 'updated_at' => $now, 'migrated' => 1]);
        foreach ($messages as $message) {
            $origin = $message['historyOrigin'] ?? ['projectId' => $sourceProject, 'conversationId' => $sourceConversation, 'messageId' => $message['id']];
            unset($message['runId'], $message['lastRunEventId'], $message['historyRevision'], $message['historySequence']);
            $message['id'] = wp_generate_uuid4();
            $message['historyOrigin'] = $origin;
            $message['status'] = 'done';
            if (in_array($message['runStatus'] ?? '', ['running', 'queued'], true)) $message['runStatus'] = 'canceled';
            if (($message['role'] ?? '') === 'assistant' && empty($message['endedAt'])) $message['endedAt'] = $now;
            $this->insert($key, $message);
        }
        $record = $this->conversation($project, $conversation);
        if (!$record) throw new \RuntimeException('Fork history could not be saved.');
        return $record;
    }

    public function count_messages(string $project, string $conversation): int
    {
        global $wpdb;
        return (int) $wpdb->get_var($wpdb->prepare('SELECT COUNT(*) FROM ' . Table::name(Table::CHAT_MESSAGES) . ' WHERE conversation_key = %s AND deleted = 0', self::key($project, $conversation)));
    }

    public function binding(string $key): ?array
    {
        global $wpdb;
        $row = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . Table::name(Table::CHAT_BINDINGS) . ' WHERE binding_key = %s', $key), ARRAY_A);
        return is_array($row) ? $row : null;
    }

    public function bind(string $key, int $owner, string $project, string $conversation, string $sessionKey): void
    {
        global $wpdb;
        $this->insert_row(Table::name(Table::CHAT_BINDINGS), ['binding_key' => $key, 'owner_user_id' => $owner, 'project_uuid' => $project, 'conversation_id' => $conversation, 'session_key' => $sessionKey]);
    }
}
