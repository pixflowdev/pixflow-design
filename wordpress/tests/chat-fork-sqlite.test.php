<?php
declare(strict_types=1);
define('ABSPATH', __DIR__ . '/');
define('DB_ENGINE', 'sqlite');
define('ARRAY_A', 'ARRAY_A');
function wp_json_encode(mixed $value): string { return json_encode($value, JSON_THROW_ON_ERROR); }
function is_wp_error(mixed $value): bool { return $value instanceof WP_Error; }
function wp_salt(string $scheme): string { return 'isolated-sqlite-export-key'; }
function get_current_user_id(): int { return $GLOBALS['forkUser'] ?? 7; }
function current_user_can(string $cap): bool { return get_current_user_id() > 0 && $cap === 'edit_posts'; }
function sanitize_text_field(string $s): string { return strip_tags($s); }
function sanitize_key(string $s): string { return strtolower($s); }
function sanitize_title(string $s): string { return strtolower(str_replace(' ', '-', $s)); }
function home_url(): string { return 'https://isolated.test'; }
function untrailingslashit(string $s): string { return rtrim($s, '/'); }
function wp_generate_uuid4(): string { return bin2hex(random_bytes(16)); }
function get_current_blog_id(): int { return 1; }
if (!function_exists('mb_substr')) { function mb_substr(string $value, int $start, int $length): string { return substr($value, $start, $length); } }
final class WP_Error { public function __construct(public string $code, public string $message, public array $data = []) {} }

/** Real SQLite persistence, with the wpdb query surface bound to its native PDO handle. */
final class HistorySqliteWpdb
{
    public string $prefix = 'qa_';
    public int $insert_id = 0;
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
$pdo->exec('CREATE TABLE qa_pixflow_design_projects (id INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT UNIQUE, owner_user_id INTEGER, kind TEXT, title TEXT, slug TEXT, site_url_hash TEXT, source_bridge_id TEXT, parent_project_id INTEGER, status TEXT, visibility TEXT, updated_at TEXT, created_at TEXT, metadata TEXT)');
$pdo->exec('CREATE TABLE qa_pixflow_design_project_access (id INTEGER PRIMARY KEY, project_id INTEGER, user_id INTEGER, role TEXT)');
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

require __DIR__ . '/../src/Projects/ProjectRepository.php';
require __DIR__ . '/../src/Projects/ProjectAccessRepository.php';
require __DIR__ . '/../src/Projects/ProjectPermission.php';
require __DIR__ . '/../src/Od/ProjectAdapter.php';
require __DIR__ . '/../src/Chat/HistoryService.php';
require __DIR__ . '/../src/Chat/ConversationFork.php';
$repo = new PixflowDesign\WordPress\Projects\ProjectRepository();
$messages = [];
foreach (range(0, 129) as $i) $messages[] = ['id' => 'm-' . $i, 'role' => $i % 2 ? 'assistant' : 'user', 'content' => 'Unicode — 日本語 🎨 ' . $i, 'agentId' => ['api','codex','composio'][$i % 3], 'events' => [['type' => 'tool_result', 'text' => 'exact result ' . $i]], 'producedFiles' => ['image.png'], 'attachments' => [['url' => '/uploads/existing.png']], 'runId' => 'old-run', 'runStatus' => 'succeeded'];
$source = $repo->create(['title' => 'Original', 'owner_user_id' => 7, 'visibility' => 'private', 'metadata' => ['kind' => 'website', 'pendingPrompt' => 'Never replay', 'agentSessionId' => 'Do not resume', 'odState' => ['conversations' => [['id' => 'source']], 'messages' => ['source' => $messages]]]]);
$pid = $source['uuid'];
$sourceBefore = $repo->find_by_uuid($pid);
$forker = new PixflowDesign\WordPress\Chat\ConversationFork();
$input = ['requestId' => 'fork-request-persistent-1', 'forkAfterMessageId' => 'm-119', 'title' => 'Independent fork', 'seedMessages' => array_slice($messages, 118, 2)];
$fork = $forker->create($pid, 'source', $input);
history_sqlite_check(!is_wp_error($fork), 'Independent fork succeeds');
$target = $fork['project']['id']; $cid = $fork['conversation']['id'];
history_sqlite_check($target !== $pid && $cid !== 'source', 'Separate chat and conversation identities');
history_sqlite_check($fork['conversation']['messageCount'] === 120, 'Includes all saved history across pagination, excludes later messages');
$copied = $history->page($target, $cid, null, '')['messages'];
history_sqlite_check(array_column($copied, 'content') === array_column(array_slice($messages, 0, 120), 'content'), 'Exact chronological Unicode history');
foreach ($copied as $i => $message) {
    history_sqlite_check($message['id'] !== $messages[$i]['id'] && !isset($message['runId']) && $message['events'] === $messages[$i]['events'] && $message['producedFiles'] === $messages[$i]['producedFiles'] && $message['attachments'] === $messages[$i]['attachments'], 'Fresh identity with complete provider/tool/media history ' . $i);
}
history_sqlite_check($copied[119]['historyOrigin'] === ['projectId' => $pid, 'conversationId' => 'source', 'messageId' => 'm-119'], 'Historical media retains original authorized project reference');
history_sqlite_check($repo->find_by_uuid($pid) === $sourceBefore, 'Original chat and legacy metadata unchanged');
history_sqlite_check($fork['project']['metadata']['forkedFrom']['projectId'] === $pid && !isset($fork['project']['metadata']['pendingPrompt']) && !isset($fork['project']['metadata']['agentSessionId']), 'Persistent source link without live session or pending action');
$reloaded = (new PixflowDesign\WordPress\Chat\ConversationFork())->create($pid, 'source', $input);
history_sqlite_check($reloaded === $fork, 'Retry after reload returns same fork without duplicates');
$conflict = $forker->create($pid, 'source', array_replace($input, ['forkAfterMessageId' => 'm-117']));
history_sqlite_check(is_wp_error($conflict) && $conflict->data['status'] === 409, 'Request ID cannot select a different fork point');
$count = $pdo->query('SELECT COUNT(*) FROM qa_pixflow_design_projects')->fetchColumn();
foreach (['missing', 'm-118'] as $point) history_sqlite_check(is_wp_error($forker->create($pid, 'source', array_replace($input, ['requestId' => 'different-request-1234', 'forkAfterMessageId' => $point]))), 'Missing or non-assistant selection rejected');
history_sqlite_check(is_wp_error($forker->create($pid, 'unknown', $input)), 'Foreign/unknown conversation rejected');
$GLOBALS['forkUser'] = 8;
history_sqlite_check(is_wp_error($forker->create($pid, 'source', $input)), 'Other user cannot copy private history');
$GLOBALS['forkUser'] = 7;
history_sqlite_check($count === $pdo->query('SELECT COUNT(*) FROM qa_pixflow_design_projects')->fetchColumn(), 'Rejected attempts create no empty chats');
$pdo->exec("CREATE TRIGGER reject_fork_message BEFORE INSERT ON qa_pixflow_design_chat_messages WHEN NEW.conversation_key <> '" . $history::key($pid, 'source') . "' BEGIN SELECT RAISE(ABORT, 'simulated disk failure'); END");
$failed = $forker->create($pid, 'source', array_replace($input, ['requestId' => 'disk-failure-request-1234']));
history_sqlite_check(is_wp_error($failed) && $failed->data['status'] === 500, 'Storage failure reported safely');
history_sqlite_check($count === $pdo->query('SELECT COUNT(*) FROM qa_pixflow_design_projects')->fetchColumn(), 'Atomic failure rolls back new project and partial history');
$pdo->exec('DROP TRIGGER reject_fork_message');
$recovered = $forker->create($pid, 'source', array_replace($input, ['requestId' => 'disk-failure-request-1234']));
history_sqlite_check(!is_wp_error($recovered) && $recovered['conversation']['messageCount'] === 120, 'Failed storage operation safely retries');
$history->remove($target, $cid);
history_sqlite_check(is_wp_error($forker->create($pid, 'source', $input)), 'Deleted fork is not resurrected by retry');
history_sqlite_check($repo->find_by_uuid($pid) === $sourceBefore, 'All scenarios preserve original project/settings');
echo "PASS: {$checks} fork persistence and preservation checks\n";
