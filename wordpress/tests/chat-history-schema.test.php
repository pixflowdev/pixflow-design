<?php
declare(strict_types=1);
define('ABSPATH', __DIR__ . '/');
$options = ['pixflow_design_schema_version' => 'previous-good-schema'];
function get_option(string $key, mixed $fallback = false): mixed { return $GLOBALS['options'][$key] ?? $fallback; }
function update_option(string $key, mixed $value, mixed $autoload = null): void { $GLOBALS['options'][$key] = $value; }
function dbDelta(string $sql): void { $GLOBALS['attempts']++; }
final class SchemaCheckWpdb
{
    public string $prefix = 'qa_';
    public bool $denied = true;
    public bool $partial = false;
    public function get_charset_collate(): string { return ''; }
    public function get_col(string $sql, int $offset): array {
        if ($this->denied) return [];
        if (str_contains($sql, 'chat_conversations')) return ['conversation_key','project_uuid','conversation_id','title','created_at','updated_at','migrated','deleted'];
        if (str_contains($sql, 'chat_messages')) return ['sequence_id','conversation_key','message_key','message_id','payload','revision','deleted'];
        return $this->partial ? ['binding_key','owner_user_id','project_uuid','conversation_id'] : ['binding_key','owner_user_id','project_uuid','conversation_id','session_key'];
    }
}
$wpdb = new SchemaCheckWpdb(); $attempts = 0;
require __DIR__ . '/../src/Database/Table.php';
require __DIR__ . '/../src/Database/Schema.php';
require __DIR__ . '/../src/Database/Migrations.php';
use PixflowDesign\WordPress\Database\Migrations;
use PixflowDesign\WordPress\Database\Schema;
function schema_check(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
Migrations::maybe_install();
schema_check($options === ['pixflow_design_schema_version'=>'previous-good-schema'], 'Denied table creation must not mark success or alter existing options.');
$first = $attempts;
Migrations::maybe_install();
schema_check($attempts > $first, 'Failed installation must retry.');
$wpdb->denied = false; $wpdb->partial = true;
Migrations::maybe_install();
schema_check($options['pixflow_design_schema_version'] === 'previous-good-schema', 'Missing session column must not mark success.');
$wpdb->partial = false;
Migrations::maybe_install();
schema_check($options['pixflow_design_schema_version'] === Schema::VERSION, 'Complete schema marks success.');
$completed = $attempts;
Migrations::maybe_install();
schema_check($attempts === $completed, 'Successful schema is not rebuilt on every request.');
echo "chat-history-schema: 5 checks passed\n";
