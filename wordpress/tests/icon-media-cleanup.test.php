<?php
declare(strict_types=1);
define('ABSPATH', __DIR__);
define('ARRAY_A', 'ARRAY_A');
require_once dirname(__DIR__) . '/src/Icons/IconMediaCleanup.php';
use PixflowDesign\WordPress\Icons\IconMediaCleanup;

$fixture = sys_get_temp_dir() . '/pixflow-cleanup-' . bin2hex(random_bytes(6));
mkdir($fixture . '/pixflow-ai/icon-sets/test', 0777, true);
$file = $fixture . '/pixflow-ai/icon-sets/test/icon.svg';
file_put_contents($file, '<svg/>');
$owner = 'test'; $deleted = [];
function get_post_meta($id, $key, $single) { return $GLOBALS['owner']; }
function get_post_field($field, $id) { return 0; }
function get_attached_file($id) { return $GLOBALS['file']; }
function wp_upload_dir(...$args) { return ['basedir' => $GLOBALS['fixture']]; }
function wp_normalize_path($path) { return str_replace('\\', '/', $path); }
function trailingslashit($path) { return rtrim($path, '/') . '/'; }
function apply_filters($name, $value) { return $value; }
function maybe_unserialize($value) { return unserialize($value); }
function is_serialized($value) { return preg_match('/^[abisOdN]:/', $value) === 1; }
function get_posts($args) { return [99]; }
function wp_delete_attachment($id, $force) { $GLOBALS['deleted'][] = $id; return (object) ['ID' => $id]; }
$wpdb = new class {
    public string $prefix = 'wp_', $posts = 'wp_posts', $postmeta = 'wp_postmeta', $options = 'wp_options', $last_error = '';
    public bool $lock = false, $canvas = false, $used = false, $fail = false;
    public array $queries = [];
    public function prepare($query, ...$args) { foreach ($args as $arg) $query = preg_replace('/%[ds]/', "'" . addslashes((string) $arg) . "'", $query, 1); return $query; }
    public function esc_like($value) { return addcslashes($value, '_%\\'); }
    public function get_col($query) { return ['wp_posts', 'wp_postmeta', 'wp_options', 'wp_custom_builder']; }
    public function get_results($query, $format) {
        if (str_starts_with($query, 'SHOW COLUMNS')) return [['Field' => 'content', 'Type' => 'longtext']];
        if (str_contains($query, 'LIMIT 101')) { $this->queries[] = $query; return $this->used && str_contains($query, 'wp_custom_builder') ? [['content' => '{"attachment":99}']] : []; }
        return $this->canvas ? [['option_value' => serialize(['seenAt' => time()])]] : [];
    }
    public function get_var($query) {
        $this->queries[] = $query;
        if ($this->fail) { $this->last_error = 'database unavailable'; return null; }
        if (str_contains($query, "meta_key = '_edit_lock'")) return $this->lock ? 1 : null;
        return $this->used && str_contains($query, 'wp_custom_builder') ? 1 : null;
    }
};
function check($condition, $label) { if (!$condition) throw new RuntimeException($label); echo "PASS $label\n"; }
try {
    $references = new ReflectionMethod(IconMediaCleanup::class, 'references'); $references->setAccessible(true);
    check(!$references->invoke(null, serialize(array_fill(0, 100, 'class')), 99, 'icon.svg'), 'serialized list offsets are not media references');
    check($references->invoke(null, serialize(['image' => ['id' => 99]]), 99, 'icon.svg'), 'serialized builder values retain icons');
    check($references->invoke(null, '[gallery ids="98,99,100"]', 99, 'icon.svg'), 'shortcode attachment lists retain icons');
    check($references->invoke(null, '<!-- wp:icon {"icon":"pixflow-lucide/arrow-99"} /-->', 99, 'icon.svg'), 'native WordPress Icon blocks retain referenced SVG media');
    check(IconMediaCleanup::usage(99, 'test') === 'unused', 'negative complete scan permits cleanup');
    check(str_contains(implode('\n', $wpdb->queries), 'icon.svg') && str_contains(implode('\n', $wpdb->queries), '99'), 'scan checks filenames and numeric references');
    check(str_contains(implode('\n', $wpdb->queries), 'pixflow_design_wordpress_icon_archive'), 'native registration archive is excluded from media consumers');
    $wpdb->used = true;
    check(IconMediaCleanup::run('test', [])['retained'] === 1 && !$deleted, 'custom builder references preserve media');
    $wpdb->used = false; $wpdb->lock = true;
    check(IconMediaCleanup::usage(99, 'test') === 'unknown', 'unsaved WordPress editors prevent deletion');
    $wpdb->lock = false; $wpdb->canvas = true;
    check(IconMediaCleanup::usage(99, 'test') === 'unknown', 'live native builder prevents deletion');
    $wpdb->canvas = false; $wpdb->fail = true;
    check(IconMediaCleanup::run('test', [])['uncertain'] === 1 && !$deleted, 'database failures preserve media');
    $wpdb->fail = false; $wpdb->last_error = ''; $owner = 'different';
    check(IconMediaCleanup::usage(99, 'test') === 'unknown', 'foreign media is never deleted');
    $owner = 'test';
    check(IconMediaCleanup::run('test', [['icons' => [['attachment_id' => 99]]]])['deleted'] === 0, 'selected media is excluded');
    check(IconMediaCleanup::run('test', [])['deleted'] === 1 && $deleted === [99], 'confirmed unused owned media is deleted through WordPress');
} finally {
    unlink($file); rmdir(dirname($file)); rmdir(dirname(dirname($file))); rmdir($fixture . '/pixflow-ai'); rmdir($fixture);
}
