<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Icons;

if (!defined('ABSPATH')) exit;

/** Delete only owned, deselected SVG attachments with a complete negative usage scan. */
final class IconMediaCleanup
{
    public static function run(string $set_id, array $installed_sets): array
    {
        $keep = [];
        foreach ($installed_sets as $set) foreach ($set['icons'] ?? [] as $icon) $keep[] = (int) ($icon['attachment_id'] ?? 0);
        $report = ['deleted' => 0, 'retained' => 0, 'uncertain' => 0];
        $ids = get_posts(['post_type' => 'attachment', 'post_status' => 'any', 'numberposts' => -1, 'fields' => 'ids',
            'meta_key' => '_pixflow_ai_icon_set_id', 'meta_value' => $set_id]);
        $deadline = microtime(true) + 8;
        foreach ($ids as $id) {
            $id = (int) $id;
            if (in_array($id, $keep, true)) continue;
            if (microtime(true) > $deadline) { $report['uncertain']++; continue; }
            try {
                $state = self::usage($id, $set_id);
                if ($state === 'unused') {
                    if (wp_delete_attachment($id, true)) $report['deleted']++;
                    else $report['uncertain']++;
                } elseif ($state === 'used') $report['retained']++;
                else $report['uncertain']++;
            } catch (\Throwable $error) { $report['uncertain']++; }
        }
        return $report;
    }

    public static function message(array $report): string
    {
        return sprintf('%d unused icons deleted. %d retained because references were found. %d retained because usage could not be confirmed. If an editor is open, save and close it, then update this set from WordPress Settings to check again.',
            $report['deleted'], $report['retained'], $report['uncertain']);
    }

    public static function usage(int $id, string $set_id): string
    {
        global $wpdb;
        if (get_post_meta($id, '_pixflow_ai_icon_set_id', true) !== $set_id) return 'unknown';
        if ((int) get_post_field('post_parent', $id) > 0) return 'used';
        $file = get_attached_file($id);
        $uploads = wp_upload_dir(null, false);
        $root = realpath($uploads['basedir'] . '/pixflow-ai/icon-sets');
        $path = $file ? realpath($file) : false;
        if (!$root || !$path || !str_starts_with(wp_normalize_path($path), trailingslashit(wp_normalize_path($root)))
            || strtolower(pathinfo($path, PATHINFO_EXTENSION)) !== 'svg') return 'unknown';

        // An editor may hold an unsaved reference which is not yet in the database.
        $lock_cutoff = time() - (int) apply_filters('wp_check_post_lock_window', 150);
        // Both MySQL and WordPress's SQLite adapter cast the leading timestamp
        // in "timestamp:user" directly; SUBSTRING_INDEX is not portable.
        $locked = $wpdb->get_var($wpdb->prepare("SELECT meta_id FROM {$wpdb->postmeta} WHERE meta_key = '_edit_lock' AND CAST(meta_value AS UNSIGNED) > %d LIMIT 1", $lock_cutoff));
        if ($wpdb->last_error) return 'unknown';
        if ($locked) return 'unknown';
        $canvases = $wpdb->get_results("SELECT option_name, option_value FROM {$wpdb->options} WHERE option_name REGEXP '^pixflow_(etch_)?canvas_[a-f0-9]{32}$'", ARRAY_A);
        if ($wpdb->last_error || !is_array($canvases)) return 'unknown';
        foreach ($canvases as $canvas) {
            $record = maybe_unserialize($canvas['option_value']);
            if (is_array($record) && (int) ($record['seenAt'] ?? 0) >= time() - 30) return 'unknown';
        }

        return self::stored_usage($id, $path);
    }

    private static function stored_usage(int $id, string $path): string
    {
        global $wpdb;

        // Scan all site tables, including custom builder/plugin storage. Match the
        // filename as well as numeric attachment IDs (JSON, serialized and plain).
        // False-positive references retain media; query failures never authorize deletion.
        $tables = $wpdb->get_col($wpdb->prepare('SHOW TABLES LIKE %s', $wpdb->esc_like($wpdb->prefix) . '%'));
        if ($wpdb->last_error || !$tables) return 'unknown';
        $deadline = microtime(true) + 5;
        foreach ($tables as $table) {
            if (microtime(true) > $deadline || !preg_match('/^[a-zA-Z0-9_]+$/', $table)) return 'unknown';
            $columns = $wpdb->get_results("SHOW COLUMNS FROM `$table`", ARRAY_A);
            if ($wpdb->last_error || !$columns) return 'unknown';
            $conditions = []; $fields = [];
            foreach ($columns as $column) {
                $name = $column['Field'];
                if (!preg_match('/^[a-zA-Z0-9_]+$/', $name)) return 'unknown';
                if (preg_match('/char|text|json|blob/i', $column['Type'])) {
                    $fields[] = "`$name`";
                    $conditions[] = $wpdb->prepare("(`$name` LIKE %s OR `$name` REGEXP %s)", '%' . $wpdb->esc_like(basename($path)) . '%', '(^|[^0-9])' . $id . '([^0-9]|$)');
                } elseif (preg_match('/int|decimal/i', $column['Type']) && preg_match('/image|media|attachment|icon/i', $name)) {
                    $fields[] = "`$name`";
                    $conditions[] = $wpdb->prepare("`$name` = %d", $id);
                }
            }
            if (!$conditions) continue;
            $exclude = '';
            if ($table === $wpdb->posts) $exclude = $wpdb->prepare(' AND ID <> %d', $id);
            if ($table === $wpdb->postmeta) $exclude = $wpdb->prepare(' AND post_id <> %d', $id);
            if ($table === $wpdb->options) {
                // These are our catalog/registration records, not consumers of icons.
                $exclude = " AND option_name NOT IN ('pixflow_ai_icon_sets_installed','pixflow_ai_icon_set_subsets','pixflow_design_etch_icon_collections','pixflow_design_wordpress_icon_archive') AND LEFT(option_name, 11) <> '_transient_' AND LEFT(option_name, 16) <> '_site_transient_'";
            }
            $matches = $wpdb->get_results('SELECT ' . implode(', ', $fields) . " FROM `$table` WHERE (" . implode(' OR ', $conditions) . ")$exclude LIMIT 101", ARRAY_A);
            if ($wpdb->last_error || !is_array($matches)) return 'unknown';
            foreach ($matches as $row) foreach ($row as $value) {
                if (self::references($value, $id, basename($path))) return 'used';
            }
            if (count($matches) > 100) return 'unknown';
        }
        return microtime(true) > $deadline ? 'unknown' : 'unused';
    }

    private static function references($value, int $id, string $filename, int $depth = 0): bool
    {
        if ($depth > 50) throw new \RuntimeException('Reference nesting exceeds scan limit.');
        if (is_object($value)) throw new \RuntimeException('Object reference cannot be inspected safely.');
        if (is_array($value)) {
            $list = array_is_list($value);
            foreach ($value as $key => $item) {
                if (!$list && (string) $key === (string) $id) return true;
                if (self::references($item, $id, $filename, $depth + 1)) return true;
            }
            return false;
        }
        if (!is_scalar($value)) return false;
        $text = (string) $value;
        if (str_contains($text, $filename)) return true;
        if (is_serialized($text)) {
            $decoded = @unserialize($text, ['allowed_classes' => false]);
            if ($decoded === false && $text !== 'b:0;') throw new \RuntimeException('Invalid serialized reference data.');
            return self::references($decoded, $id, $filename, $depth + 1);
        }
        $decoded = json_decode($text, true);
        if (is_array($decoded)) return self::references($decoded, $id, $filename, $depth + 1);
        return (bool) preg_match('/(?<![0-9])' . $id . '(?![0-9])/', $text);
    }
}
