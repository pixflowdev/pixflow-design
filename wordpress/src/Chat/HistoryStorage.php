<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Chat;

use PixflowDesign\WordPress\Database\Table;
use PixflowDesign\WordPress\Database\Schema;

if (!defined('ABSPATH')) exit;

/** Incremental encoding migration; never expires, trims, moves or deletes history. */
final class HistoryStorage
{
    public const HOOK = 'pixflow_design_history_storage';
    public const STATE = 'pixflow_design_history_storage_v1';

    public static function register(): void
    {
        add_action(self::HOOK, [self::class, 'run']);
        add_action('init', [self::class, 'schedule'], 25);
    }

    public static function schedule(): void
    {
        if (!HistoryPayload::available() || get_option('pixflow_design_schema_version') !== Schema::VERSION) return;
        $state = get_option(self::STATE, []);
        if (is_array($state) && !empty($state['complete'])) return;
        if (!wp_next_scheduled(self::HOOK)) wp_schedule_single_event(time() + 60, self::HOOK);
    }

    public static function run(): void
    {
        if (!HistoryPayload::available()) return;
        $previous = get_option(self::STATE, []);
        $previous = is_array($previous) ? $previous : [];
        if (!empty($previous['complete'])) return;
        try {
            $batch = self::batch(max(0, (int) ($previous['after'] ?? 0)));
            $state = $batch;
            foreach (['rowsCompressed', 'bytesSaved'] as $field) $state[$field] += (int) ($previous[$field] ?? 0);
            // Progress is only a hint. Concurrent/repeated workers can revisit rows;
            // exact-payload CAS makes every conversion idempotent and non-destructive.
            update_option(self::STATE, $state, false);
        } catch (\Throwable $error) {
            // No chat content or credentials in the operational failure marker.
            update_option(self::STATE, [...$previous, 'lastError' => 'storage_retry', 'lastAttempt' => time()], false);
            if (!wp_next_scheduled(self::HOOK)) wp_schedule_single_event(time() + 3600, self::HOOK);
            return;
        }
        self::schedule();
    }

    /** Bounded keyset walk. Concurrent edits/deletions win; revisions and timestamps never change. */
    public static function batch(int $after = 0, int $limit = 20): array
    {
        global $wpdb;
        $limit = min(50, max(1, $limit));
        $result = ['after' => max(0, $after), 'complete' => false, 'rowsCompressed' => 0, 'bytesSaved' => 0];
        if (!HistoryPayload::available()) return $result;
        $table = Table::name(Table::CHAT_MESSAGES);
        $rows = $wpdb->get_results($wpdb->prepare("SELECT sequence_id, LENGTH(payload) AS payload_bytes FROM {$table} WHERE sequence_id > %d AND deleted = 0 ORDER BY sequence_id ASC LIMIT %d", $result['after'], $limit), ARRAY_A);
        if (!is_array($rows)) throw new \RuntimeException('Chat storage could not be read.');
        $result['complete'] = $rows === [];
        $bytes = 0; $started = microtime(true);
        foreach ($rows as $item) {
            if ($bytes >= 8388608 || microtime(true) - $started > 2) break;
            $id = (int) $item['sequence_id'];
            // Oversized legacy rows stay readable as plain JSON, without materializing them here.
            if ((int) $item['payload_bytes'] >= HistoryPayload::MIN_BYTES && (int) $item['payload_bytes'] <= HistoryPayload::MAX_BYTES) {
                $row = $wpdb->get_row($wpdb->prepare("SELECT payload, revision FROM {$table} WHERE sequence_id = %d AND deleted = 0", $id), ARRAY_A);
                if (!is_array($row)) {
                    if (!empty($wpdb->last_error)) throw new \RuntimeException('Chat storage could not be read.');
                } else {
                    $old = (string) $row['payload'];
                    $bytes += strlen($old);
                    $json = HistoryPayload::json($old);
                    $encoded = HistoryPayload::encode($json);
                    if ($encoded !== $old && strlen($encoded) < strlen($old)) {
                        $changed = $wpdb->update($table, ['payload' => $encoded], ['sequence_id' => $id, 'revision' => (int) $row['revision'], 'deleted' => 0, 'payload' => $old]);
                        if ($changed === false) throw new \RuntimeException('Chat storage could not be optimized.');
                        if ($changed === 1) { $result['rowsCompressed']++; $result['bytesSaved'] += strlen($old) - strlen($encoded); }
                    }
                }
            }
            $result['after'] = $id;
        }
        return $result;
    }
}
