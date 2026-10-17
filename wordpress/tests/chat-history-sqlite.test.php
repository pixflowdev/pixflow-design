<?php
declare(strict_types=1);
define('ABSPATH', __DIR__ . '/');
define('DB_ENGINE', 'sqlite');
define('ARRAY_A', 'ARRAY_A');
function wp_json_encode(mixed $value): string { return json_encode($value, JSON_THROW_ON_ERROR); }
function is_wp_error(mixed $value): bool { return $value instanceof WP_Error; }
function wp_salt(string $scheme): string { return 'isolated-sqlite-export-key'; }
function get_current_user_id(): int { return 7; }
function get_current_blog_id(): int { return 1; }
if (!function_exists('mb_substr')) { function mb_substr(string $value, int $start, int $length): string { return substr($value, $start, $length); } }
final class WP_Error { public function __construct(public string $code, public string $message, public array $data = []) {} }

/** Real SQLite persistence, with the wpdb query surface bound to its native PDO handle. */
final class HistorySqliteWpdb
{
    public string $prefix = 'qa_';
    public string $usermeta = 'qa_usermeta';
    public mixed $beforeUpdate = null;
    public bool $failUpdate = false;
    public function __construct(private PDO $pdo) {}
    public function prepare(string $sql, mixed ...$values): string {
        $index = 0;
        return preg_replace_callback('/%[sd]/', function (array $match) use (&$index, $values): string {
            $value = $values[$index++]; return $match[0] === '%d' ? (string) (int) $value : $this->pdo->quote((string) $value);
        }, $sql);
    }
    public function insert(string $table, array $row): never { throw new RuntimeException('SQLite must use the bound native insert path.'); }
    public function update(string $table, array $row, array $where): int|false {
        if ($this->beforeUpdate) { $callback = $this->beforeUpdate; $this->beforeUpdate = null; $callback(); }
        if ($this->failUpdate) return false;
        $assign = implode(', ', array_map(static fn(string $key): string => '"' . $key . '" = ?', array_keys($row)));
        $filter = implode(' AND ', array_map(static fn(string $key): string => '"' . $key . '" = ?', array_keys($where)));
        $statement = $this->pdo->prepare('UPDATE "' . $table . '" SET ' . $assign . ' WHERE ' . $filter);
        return $statement->execute([...array_values($row), ...array_values($where)]) ? $statement->rowCount() : false;
    }
    public function get_row(string $sql, string $format): ?array { $row = $this->pdo->query($sql)->fetch(PDO::FETCH_ASSOC); return $row ?: null; }
    public function get_results(string $sql, string $format): array { return $this->pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC); }
    public function get_var(string $sql): mixed { return $this->pdo->query($sql)->fetchColumn(); }
    public function esc_like(string $value): string { return addcslashes($value, '_%\\'); }
}
$pdo = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$GLOBALS['@pdo'] = $pdo;
$GLOBALS['wpdb'] = new HistorySqliteWpdb($pdo);
$pdo->exec('CREATE TABLE qa_pixflow_design_projects (uuid TEXT PRIMARY KEY, owner_user_id INTEGER, status TEXT, updated_at TEXT, metadata TEXT)');
$pdo->exec("INSERT INTO qa_pixflow_design_projects VALUES ('project-1', 7, 'draft', '2026-10-16', '{}')");
$pdo->exec('CREATE TABLE qa_usermeta (user_id INTEGER, meta_key TEXT, meta_value TEXT)');
$pdo->exec('CREATE TABLE qa_pixflow_design_chat_conversations (conversation_key TEXT PRIMARY KEY, project_uuid TEXT, conversation_id TEXT, title TEXT, created_at INTEGER, updated_at INTEGER, migrated INTEGER DEFAULT 0, deleted INTEGER DEFAULT 0)');
$pdo->exec('CREATE TABLE qa_pixflow_design_chat_messages (sequence_id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_key TEXT, message_key TEXT, message_id TEXT, payload TEXT, revision INTEGER DEFAULT 1, deleted INTEGER DEFAULT 0, UNIQUE(conversation_key,message_key))');
$pdo->exec('CREATE TABLE qa_pixflow_design_chat_bindings (binding_key TEXT PRIMARY KEY, owner_user_id INTEGER, project_uuid TEXT, conversation_id TEXT, session_key TEXT)');
require __DIR__ . '/../src/Database/Table.php';
require __DIR__ . '/../src/Chat/HistoryPayload.php';
require __DIR__ . '/../src/Chat/HistoryStorage.php';
require __DIR__ . '/../src/Chat/HistoryRepository.php';
require __DIR__ . '/../src/Chat/HistoryArchive.php';
$history = new PixflowDesign\WordPress\Chat\HistoryRepository();
$checks = 0;
function history_sqlite_check(bool $ok, string $message): void { $GLOBALS['checks']++; if (!$ok) throw new RuntimeException($message); }
$messages = [];
for ($index = 0; $index < 130; $index++) $messages[] = ['id' => 'm-' . $index, 'role' => 'assistant', 'content' => 'Unicode — 日本語 🎨 ' . $index, 'metadata' => ['retain' => true]];
$project = ['uuid' => 'project-1', 'title' => 'Original', 'metadata' => ['odState' => ['messages' => ['chat-1' => $messages]]]];
history_sqlite_check(!is_wp_error($history->migrate($project, 'chat-1')), 'Initial migration');
$page = $history->page('project-1', 'chat-1', 50, '');
history_sqlite_check(count($page['messages']) === 50 && $page['hasMore'], 'Latest page');
$second = $history->page('project-1', 'chat-1', 50, $page['nextCursor']);
$third = $history->page('project-1', 'chat-1', 50, $second['nextCursor']);
history_sqlite_check(count($third['messages']) === 30 && !$third['hasMore'], 'All older messages remain');
$all = array_merge($third['messages'], $second['messages'], $page['messages']);
history_sqlite_check(array_map(static function (array $message): array { unset($message['historyRevision'], $message['historySequence']); return $message; }, $all) === $messages, 'Exact Unicode/metadata preservation');
$archive = new PixflowDesign\WordPress\Chat\HistoryArchive($history);
$exportFirst = $archive->export_page('project-1', 'chat-1');
$exportLast = $archive->export_page('project-1', 'chat-1', $exportFirst['nextCursor']);
history_sqlite_check([...$exportFirst['messages'], ...$exportLast['messages']] === $all, 'SQLite full export preserves exact paginated history');
$usage = $archive->storage_usage(7);
history_sqlite_check($usage['messageCount'] === 130 && $usage['storedMessageBytes'] === array_sum(array_map('strlen', $pdo->query('SELECT payload FROM qa_pixflow_design_chat_messages')->fetchAll(PDO::FETCH_COLUMN))), 'SQLite reports byte lengths rather than Unicode character counts');
history_sqlite_check($archive->storage_usage(8)['messageCount'] === 0, 'SQLite usage remains owner scoped');
$last = $page['messages'][49];
$saved = $history->write('project-1', 'chat-1', [...$last, 'content' => 'Completed answer']);
history_sqlite_check($saved['revision'] === 2, 'Acknowledged update');
history_sqlite_check(is_wp_error($archive->export_page('project-1', 'chat-1', $exportFirst['nextCursor'])), 'SQLite export rejects a changed snapshot');
history_sqlite_check(is_wp_error($history->write('project-1', 'chat-1', [...$last, 'content' => 'Stale'])), 'Stale writer denied');
history_sqlite_check($history->write('project-1', 'chat-1', [...$last, 'content' => 'Completed answer'])['revision'] === 2, 'Retry idempotence');
$history->remove('project-1', 'chat-1', 'm-0');
$history->migrate($project, 'chat-1');
history_sqlite_check(count($history->page('project-1', 'chat-1', null, '')['messages']) === 129, 'Migration cannot resurrect deleted message');
$history->bind('session-hash', 7, 'project-1', 'chat-1', 'original-session-key');
history_sqlite_check($history->owned_conversations(7)['conversations'][0]['sessionKey'] === 'original-session-key', 'Session discoverable after browser reset');
history_sqlite_check($history->owned_conversations(8)['conversations'] === [], 'Owner isolation');
$history->remove('project-1', 'chat-1');
history_sqlite_check(is_wp_error($history->migrate($project, 'chat-1')), 'Conversation deletion stays deleted');
history_sqlite_check($history->owned_conversations(7)['conversations'] === [], 'Deleted conversation not discoverable');
$broken = ['uuid' => 'project-1', 'title' => 'Retry', 'metadata' => ['odState' => ['messages' => ['chat-retry' => [['id' => 'first', 'content' => 'Keep me'], ['id' => 'invalid', 'content' => NAN]]]]]];
try { $history->migrate($broken, 'chat-retry'); throw new LogicException('Expected JSON failure.'); }
catch (JsonException $error) {}
history_sqlite_check($history->conversation('project-1', 'chat-retry') === null, 'Failed migration rolls back its marker and partial rows');
$broken['metadata']['odState']['messages']['chat-retry'][1]['content'] = 'Valid repaired source';
$history->migrate($broken, 'chat-retry');
history_sqlite_check(count($history->page('project-1', 'chat-retry', null, '')['messages']) === 2, 'Retry imports complete history once');
// Storage-only migration exercises all providers through the identical repository.
$baselineSequence = (int) $pdo->query('SELECT MAX(sequence_id) FROM qa_pixflow_design_chat_messages')->fetchColumn();
$history->migrate(['uuid' => 'project-1', 'title' => 'Storage'], 'storage');
foreach (['api', 'codex', 'composio'] as $provider) {
    $message = ['id' => 'storage-' . $provider, 'agentId' => $provider, 'content' => str_repeat('Unicode α 🎨 original answer ', 500), 'events' => [['kind' => 'tool_result', 'text' => str_repeat('Preserve exact output ', 500)]]];
    $saved = $history->write('project-1', 'storage', $message);
    history_sqlite_check($saved['message']['content'] === $message['content'], "$provider new write round trip");
    $row = $pdo->query("SELECT * FROM qa_pixflow_design_chat_messages WHERE message_id = 'storage-{$provider}'")->fetch(PDO::FETCH_ASSOC);
    history_sqlite_check(strlen($row['payload']) < strlen(json_encode($message)) / 4, "$provider stored compressed");
    // Recreate an older plain JSON record without changing its identity/revision.
    $pdo->prepare('UPDATE qa_pixflow_design_chat_messages SET payload = ? WHERE sequence_id = ?')->execute([json_encode($message), $row['sequence_id']]);
}
$before = $history->page('project-1', 'storage', null, '');
$batch = PixflowDesign\WordPress\Chat\HistoryStorage::batch($baselineSequence, 2);
history_sqlite_check($batch['rowsCompressed'] === 2 && !$batch['complete'], 'Bounded first migration batch');
$next = PixflowDesign\WordPress\Chat\HistoryStorage::batch($batch['after'], 2);
history_sqlite_check($next['rowsCompressed'] === 1, 'Resumable next migration batch');
history_sqlite_check(PixflowDesign\WordPress\Chat\HistoryStorage::batch($next['after'])['complete'], 'Keyset completion');
history_sqlite_check($history->page('project-1', 'storage', null, '') === $before, 'Migration preserves exact exported messages, order and revisions');
history_sqlite_check(PixflowDesign\WordPress\Chat\HistoryStorage::batch($baselineSequence)['rowsCompressed'] === 0, 'Repeated migration idempotent');
$fresh = $history->page('project-1', 'storage', 1, '')['messages'][0];
$updated = $history->write('project-1', 'storage', [...$fresh, 'content' => 'Changed after compression']);
history_sqlite_check($updated['revision'] === 2, 'Compressed message edits keep revision rules');
history_sqlite_check(is_wp_error($history->write('project-1', 'storage', [...$fresh, 'content' => 'Stale edit'])), 'Compressed stale writer rejected');
// Race: a user edit arrives between the worker read and its CAS update.
$id = (int) $before['messages'][0]['historySequence'];
$original = $before['messages'][0]; unset($original['historyRevision'], $original['historySequence']);
$pdo->prepare('UPDATE qa_pixflow_design_chat_messages SET payload = ? WHERE sequence_id = ?')->execute([json_encode($original), $id]);
$GLOBALS['wpdb']->beforeUpdate = static function () use ($pdo, $id): void {
    $pdo->prepare('UPDATE qa_pixflow_design_chat_messages SET payload = ?, revision = revision + 1 WHERE sequence_id = ?')->execute([json_encode(['id' => 'storage-api', 'content' => 'Concurrent edit wins']), $id]);
};
history_sqlite_check(PixflowDesign\WordPress\Chat\HistoryStorage::batch($id - 1, 1)['rowsCompressed'] === 0, 'Concurrent mutation defeats storage CAS');
history_sqlite_check($history->page('project-1', 'storage', null, '')['messages'][0]['content'] === 'Concurrent edit wins', 'Concurrent edit remains');
$pdo->prepare('UPDATE qa_pixflow_design_chat_messages SET payload = ? WHERE sequence_id = ?')->execute([json_encode($original), $id]);
$GLOBALS['wpdb']->failUpdate = true;
try { PixflowDesign\WordPress\Chat\HistoryStorage::batch($id - 1, 1); throw new LogicException('Expected storage failure'); }
catch (RuntimeException $error) { history_sqlite_check(!($error instanceof LogicException), 'Failed migration reports failure'); }
$GLOBALS['wpdb']->failUpdate = false;
history_sqlite_check($pdo->query("SELECT payload FROM qa_pixflow_design_chat_messages WHERE sequence_id = {$id}")->fetchColumn() === json_encode($original), 'Failed migration retains source');
history_sqlite_check(PixflowDesign\WordPress\Chat\HistoryStorage::batch($id - 1, 1)['rowsCompressed'] === 1, 'Failed migration retries safely');
$history->remove('project-1', 'storage', 'storage-api');
history_sqlite_check(PixflowDesign\WordPress\Chat\HistoryStorage::batch($id - 1, 1)['rowsCompressed'] === 0, 'Deleted rows never resurrected');
echo "chat-history-sqlite: {$checks} checks passed\n";
