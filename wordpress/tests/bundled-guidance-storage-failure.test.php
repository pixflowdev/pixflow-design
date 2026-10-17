<?php
declare(strict_types=1);

// Upgrade fixture: saved legacy resources cannot yet be moved by the host.
// Bundled Free guidance must still work, with no download or data mutation.
$fixture = sys_get_temp_dir() . '/pixflow-guidance-' . bin2hex(random_bytes(8));
mkdir($fixture . '/public/plugin/resources/bundled-skills/agent-browser', 0700, true);
mkdir($fixture . '/public/uploads/pixflow-design/resource-packs/custom', 0700, true);
define('ABSPATH', $fixture . '/public/');
define('HOUR_IN_SECONDS', 3600);
define('PIXFLOW_DESIGN_PLUGIN_DIR', ABSPATH . 'plugin/');
define('PIXFLOW_DESIGN_PRIVATE_RESOURCE_DIR', ABSPATH . 'unsafe-private');
$_SERVER['DOCUMENT_ROOT'] = ABSPATH;
$options = ['personal_preferences'=>['keep'=>'unchanged'], 'pixflow_design_resource_packs'=>[
    'custom'=>['status'=>'installed','version'=>'1','path'=>ABSPATH.'uploads/pixflow-design/resource-packs/custom','contentRoots'=>['skills'=>'skills']],
]];
$filters = [];
$actions = [];
function wp_normalize_path($v) { return str_replace('\\', '/', $v); }
function wp_upload_dir(...$args) { $GLOBALS['upload_probes'] = ($GLOBALS['upload_probes'] ?? 0) + 1; return ['basedir'=>ABSPATH.'uploads']; }
function wp_mkdir_p($v) { return is_dir($v) || @mkdir($v, 0700, true); }
function get_option($k, $d = false) { return $GLOBALS['options'][$k] ?? $d; }
function update_option($k, $v, ...$args) { $GLOBALS['options'][$k] = $v; }
function add_filter($name, $callback, ...$args) { $GLOBALS['filters'][$name] = $callback; }
function add_action($name, $callback, ...$args) { $GLOBALS['actions'][$name] = $callback; }
function delete_option($k) { unset($GLOBALS['options'][$k]); }
function wp_json_encode($v) { return json_encode($v); }
function sanitize_key($v) { return preg_replace('/[^a-z0-9_-]/', '', strtolower($v)); }
function sanitize_text_field($v) { return trim($v); }
function esc_url_raw($v) { return $v; }
function current_time($type) { return '2026-10-16 12:00:00'; }
function get_transient($k) { return $GLOBALS['transients'][$k] ?? false; }
function set_transient($k, $v, ...$args) { $GLOBALS['transients'][$k] = $v; }
function delete_transient($k) { unset($GLOBALS['transients'][$k]); }
function trailingslashit($v) { return rtrim($v, '/') . '/'; }
class WP_Error { public function __construct(public string $code, public string $message, public array $data = []) {} }
require __DIR__ . '/../src/autoload.php';
use PixflowDesign\WordPress\Resources\BundledResources;
use PixflowDesign\WordPress\Resources\ResourcePackPathService;
function check($ok, $message) { if (!$ok) throw new RuntimeException($message); }
try {
    $body = file_get_contents(dirname(__DIR__, 2) . '/skills/agent-browser/SKILL.md');
    file_put_contents(PIXFLOW_DESIGN_PLUGIN_DIR.'resources/bundled-skills/agent-browser/SKILL.md', $body);
    $router = PIXFLOW_DESIGN_PLUGIN_DIR.'resources/bundled-plugins/_official/scenarios/od-default';
    mkdir($router, 0700, true);
    foreach (['SKILL.md', 'open-design.json'] as $file) copy(dirname(__DIR__, 2).'/guidance/scenarios/od-default/'.$file, $router.'/'.$file);
    $legacy = ABSPATH.'uploads/pixflow-design/resource-packs/custom/private.html';
    file_put_contents($legacy, '<h1>Preserved user reference</h1>');
    $before = serialize($options);
    check(BundledResources::root('skills') === PIXFLOW_DESIGN_PLUGIN_DIR.'resources/bundled-skills', 'Free guidance must not require private extraction');
    ResourcePackPathService::register();
    $request = static fn($route) => new class($route) { public function __construct(private string $route) {} public function get_route() { return $this->route; } };
    check($filters['rest_pre_dispatch'](null, null, $request('/pixflow-design/v1/od/skills')) === null, 'Skill listing is not blocked by legacy storage');
    check($filters['rest_pre_dispatch'](null, null, $request('/pixflow-design/v1/od/plugins/od-default')) === null, 'Required router is not blocked by legacy storage');
    check($filters['rest_pre_dispatch'](null, null, $request('/pixflow-design/v1/od/plugins/example')) instanceof WP_Error, 'Legacy resource access remains fail closed');
    unset($options['pixflow_design_private_resource_error']);
    $registry = new PixflowDesign\WordPress\Od\RegistryService();
    check(in_array('agent-browser', array_column($registry->skills(), 'id'), true), 'Bundled skill still listed');
    check($registry->skill('agent-browser')['body'] === $body, 'Bundled skill remains readable');
    check($registry->plugin('od-default')['manifest']['title'] === 'Pixflow task router', 'Required Home router remains available');
    $catalog = new PixflowDesign\WordPress\Admin\DirectSkillCatalog();
    check($catalog->call('skills.read', ['path'=>'bundled/agent-browser/SKILL.md'])['content'] === $body, 'Agent reads the same packaged guidance');
    PixflowDesign\WordPress\Modules\FeatureContributions::add('creative-skills', static fn(): string => '', [
        'registryRoots'=>static function (): array { throw new RuntimeException('Host storage unavailable'); },
        'bundledSkillRoot'=>static function (): string { throw new RuntimeException('Host storage unavailable'); },
    ]);
    check($registry->skill('agent-browser')['body'] === $body, 'Unavailable Pro resources cannot hide Free guidance');
    check($catalog->call('skills.read', ['path'=>'bundled/agent-browser/SKILL.md'])['content'] === $body, 'Pro extraction failure cannot block native agent tools');
    check(serialize($options) === $before, 'Saved resource records and preferences unchanged');
    check(file_get_contents($legacy) === '<h1>Preserved user reference</h1>', 'Existing files preserved');
    check(BundledResources::needs_private_preparation(), 'Legacy public resources still require secure migration');
    $actions['init']();
    check(get_option('pixflow_design_private_resource_error') === true, 'Failed automatic protection retains the warning');
    check(is_array(get_transient('pixflow_design_private_resource_retry')), 'Failed migration must back off background attempts');
    $probes = $GLOBALS['upload_probes'];
    $actions['init']();
    check($GLOBALS['upload_probes'] === $probes + 1, 'Backoff should only check whether preparation is still needed');
    $probes = $GLOBALS['upload_probes'];
    check($filters['rest_pre_dispatch'](null, null, $request('/pixflow-design/v1/od/plugins/example')) instanceof WP_Error, 'Cached failure must not allow public resource access');
    check($GLOBALS['upload_probes'] > $probes, 'Explicit resource requests must still validate storage');
    $transients['pixflow_design_private_resource_retry']['after'] = time() - 1;
    $probes = $GLOBALS['upload_probes'];
    $actions['init']();
    check($GLOBALS['upload_probes'] > $probes + 1, 'Expired backoff must retry preparation');
    $options['pixflow_design_private_resource_root_origin'] = 'changed-host-config';
    $probes = $GLOBALS['upload_probes'];
    $actions['init']();
    check($GLOBALS['upload_probes'] > $probes + 1, 'Changed storage configuration retries immediately');
    unset($options['pixflow_design_private_resource_root_origin']);
    // Simulate the same host after its existing tree has been safely moved.
    rename(ABSPATH.'uploads/pixflow-design/resource-packs', $fixture.'/preserved-private');
    check(!BundledResources::needs_private_preparation(), 'Fresh/migrated Free does not need resource extraction');
    $options['pixflow_design_private_resource_error'] = true;
    $actions['init']();
    check(!get_option('pixflow_design_private_resource_error'), 'No misleading missing-resource warning on self-contained Free');
    check(!get_transient('pixflow_design_private_resource_retry'), 'Successful migration clears retry state');
    check(file_get_contents($fixture.'/preserved-private/custom/private.html') === '<h1>Preserved user reference</h1>', 'Already secured resources remain intact');
    echo "Bundled guidance during blocked resource migration: passed\n";
} finally {
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($fixture, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST) as $entry) {
        if ($entry->isDir() && !$entry->isLink()) rmdir($entry->getPathname()); else unlink($entry->getPathname());
    }
    rmdir($fixture);
}
