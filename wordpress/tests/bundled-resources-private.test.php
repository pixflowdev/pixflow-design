<?php
declare(strict_types=1);
$fixture = sys_get_temp_dir() . '/pixflow-bundled-' . bin2hex(random_bytes(8));
mkdir($fixture . '/public/plugin/resources', 0700, true);
mkdir($fixture . '/public/uploads', 0700, true);
define('ABSPATH', $fixture . '/public/');
define('PIXFLOW_DESIGN_PLUGIN_DIR', ABSPATH . 'plugin/');
$_SERVER['DOCUMENT_ROOT'] = ABSPATH;
$options = [];
function wp_normalize_path($v) { return str_replace('\\', '/', $v); }
function wp_upload_dir(...$args) { return ['basedir' => ABSPATH . 'uploads']; }
function wp_mkdir_p($v) { return is_dir($v) || mkdir($v, 0700, true); }
function get_option($k, $d = false) { return $GLOBALS['options'][$k] ?? $d; }
function update_option($k, $v, ...$args) { $GLOBALS['options'][$k] = $v; }
class WP_Error { public function __construct(public string $code, public string $message) {} }
function is_wp_error($v) { return $v instanceof WP_Error; }
require __DIR__ . '/../src/autoload.php';
use PixflowDesign\WordPress\Resources\BundledResources;
$checks = 0;
function check($ok, $message) { $GLOBALS['checks']++; if (!$ok) throw new RuntimeException($message); }
try {
    mkdir(PIXFLOW_DESIGN_PLUGIN_DIR . 'skills/custom', 0700, true);
    file_put_contents(PIXFLOW_DESIGN_PLUGIN_DIR . 'skills/custom/recipe.py', 'print("preserved")');
    $zip = new ZipArchive();
    $zip->open(PIXFLOW_DESIGN_PLUGIN_DIR . 'resources/bundled-library.zip', ZipArchive::CREATE);
    $zip->addFromString('plugins/example/index.html', '<h1>Bundled example</h1>');
    $zip->addFromString('skills/current/SKILL.md', '# Current skill');
    $zip->close();
    $root = BundledResources::root('plugins');
    check(!str_starts_with($root, ABSPATH), 'Bundle expands outside web root');
    check(file_get_contents($root . '/example/index.html') === '<h1>Bundled example</h1>', 'HTML preserved');
    check(!is_dir(PIXFLOW_DESIGN_PLUGIN_DIR . 'skills'), 'No leftover public recipe directory');
    check(file_get_contents(BundledResources::legacy_root('skills') . '/custom/recipe.py') === 'print("preserved")', 'Old custom recipes preserved privately');
    check(is_file(BundledResources::root('skills') . '/current/SKILL.md'), 'Current skills available');
    check(BundledResources::root('plugins') === $root, 'Preparation is idempotent');
    $pro = ABSPATH . 'pro/';
    mkdir($pro . 'resources', 0700, true);
    $zip = new ZipArchive();
    $zip->open($pro . 'resources/bundled-library.zip', ZipArchive::CREATE);
    $zip->addFromString('skills/premium/SKILL.md', '# Premium');
    $zip->close();
    $pro_root = BundledResources::root('skills', $pro);
    check(is_file($pro_root . '/premium/SKILL.md'), 'Pro library extracts privately');
    check(!str_starts_with(wp_normalize_path($pro_root), wp_normalize_path(ABSPATH)), 'Pro recipes are outside public document root');
    check(!is_file(BundledResources::root('skills') . '/premium/SKILL.md'), 'Free and Pro roots do not mix');
    $directory = ABSPATH . 'directory/';
    mkdir($directory . 'resources/bundled-library/skills/example', 0700, true);
    file_put_contents($directory . 'resources/bundled-library/skills/example/SKILL.md', '# Local guidance');
    $plain = BundledResources::root('skills', $directory);
    check($plain === $directory . 'resources/bundled-library/skills', 'Directory guidance reads directly without archive extraction');
    check(file_get_contents($plain . '/example/SKILL.md') === '# Local guidance', 'Unpacked guidance remains complete');
    check(BundledResources::root('skills') === dirname($root) . '/skills', 'Directory reads do not change existing archive roots');
    try { BundledResources::root('../escape'); throw new RuntimeException('Accepted invalid collection'); }
    catch (InvalidArgumentException) { $checks++; }
    $history = BundledResources::historical_roots('plugins');
    check(in_array($root, $history, true), 'Old private bundle remains addressable');
    check(BundledResources::historical_roots('../escape') === [], 'Historical lookup rejects traversal');
    $base = dirname(dirname($root));
    mkdir($base . '/not-a-content-hash/plugins', 0700, true);
    check(!in_array($base . '/not-a-content-hash/plugins', BundledResources::historical_roots('plugins'), true), 'Unverified staging directories are excluded');
    echo "Private bundled resources: $checks checks passed\n";
} finally {
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($fixture, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST) as $entry) {
        if ($entry->isDir() && !$entry->isLink()) rmdir($entry->getPathname()); else unlink($entry->getPathname());
    }
    rmdir($fixture);
}
