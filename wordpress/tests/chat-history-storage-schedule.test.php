<?php
declare(strict_types=1);
require __DIR__ . '/chat-history-sqlite.test.php';
require __DIR__ . '/../src/Database/Schema.php';
use PixflowDesign\WordPress\Chat\HistoryStorage;
use PixflowDesign\WordPress\Database\Schema;
$options = ['pixflow_design_schema_version' => Schema::VERSION]; $scheduled = []; $actions = [];
function get_option(string $key, mixed $default = false): mixed { return $GLOBALS['options'][$key] ?? $default; }
function update_option(string $key, mixed $value, mixed $autoload = null): bool {
    if ($autoload !== false) throw new RuntimeException('Storage state must not autoload');
    $GLOBALS['options'][$key] = $value; return true;
}
function add_action(string $hook, mixed $callback, int $priority = 10): void { $GLOBALS['actions'][$hook] = $callback; }
function wp_next_scheduled(string $hook): int|false { return $GLOBALS['scheduled'][$hook] ?? false; }
function wp_schedule_single_event(int $time, string $hook): void { $GLOBALS['scheduled'][$hook] = $time; }
HistoryStorage::register();
history_sqlite_check(isset($actions[HistoryStorage::HOOK], $actions['init']), 'Background worker registered without Pro or Bridge');
HistoryStorage::schedule(); HistoryStorage::schedule();
history_sqlite_check(count($scheduled) === 1, 'Only one scheduled job');
$options['pixflow_design_schema_version'] = 'old'; $scheduled = [];
HistoryStorage::schedule();
history_sqlite_check($scheduled === [], 'No job before table migration ready');
$options['pixflow_design_schema_version'] = Schema::VERSION;
$row = ['id' => 'cron-history', 'content' => str_repeat('Complete transcript ', 2000)];
$history->migrate(['uuid' => 'project-1', 'title' => 'Cron'], 'cron');
$history->write('project-1', 'cron', $row);
$id = (int) $pdo->query("SELECT sequence_id FROM qa_pixflow_design_chat_messages WHERE message_id = 'cron-history'")->fetchColumn();
$pdo->prepare('UPDATE qa_pixflow_design_chat_messages SET payload = ? WHERE sequence_id = ?')->execute([json_encode($row), $id]);
$options[HistoryStorage::STATE] = ['after' => $id - 1];
$GLOBALS['wpdb']->failUpdate = true;
HistoryStorage::run();
history_sqlite_check($options[HistoryStorage::STATE]['after'] === $id - 1 && $options[HistoryStorage::STATE]['lastError'] === 'storage_retry', 'Failure keeps cursor for retry');
history_sqlite_check($scheduled[HistoryStorage::HOOK] >= time() + 3590, 'Failed worker backs off');
$GLOBALS['wpdb']->failUpdate = false; $scheduled = [];
HistoryStorage::run();
history_sqlite_check($options[HistoryStorage::STATE]['rowsCompressed'] === 1 && !isset($options[HistoryStorage::STATE]['lastError']), 'Successful retry records savings and clears failure');
$scheduled = []; HistoryStorage::run();
history_sqlite_check($options[HistoryStorage::STATE]['complete'] && $scheduled === [], 'Completed migration stops scheduling');
$state = $options[HistoryStorage::STATE]; HistoryStorage::run();
history_sqlite_check($options[HistoryStorage::STATE] === $state, 'Completed job is a no-op');
history_sqlite_check($history->page('project-1', 'cron', 50, '')['messages'][0]['content'] === $row['content'], 'Background retry preserved complete content');
echo "chat-history-storage-schedule: {$checks} cumulative checks passed\n";
