<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\License {
    class CentralEntitlements { public static function delivery_origin(): string { return self::authority(); } public static function enabled(): bool { return true; } public static function authority(): string { return 'https://pixflow.dev'; } }
    class SiteIdentity { public const PRODUCT_SLUG = 'pixflow-design'; public function current_payload(): array { return []; } }
    class LicenseCache { public function private_payload(): array { return []; } }
    class FreeArtifacts { public function current(): array|\WP_Error { return $GLOBALS['free_artifact'] ?? new \WP_Error('unavailable', 'Unavailable'); } public function download(string $url): string { return '/verified/free.zip'; } }
    class CentralArtifacts {
        public function catalog(): array { return $GLOBALS['catalog']; }
        public static function select_current(array $catalog, string $type, string $slug): array|\WP_Error {
            foreach ($catalog as $a) if ($a['slug'] === $slug) return $a;
            return new \WP_Error('missing', 'Missing');
        }
        public function current(string $type, string $slug): array|\WP_Error { return self::select_current($this->catalog(), $type, $slug); }
        public function download(string $id, string $type): string { return '/verified/' . $id . '.zip'; }
    }
}
namespace {
    define('ABSPATH', __DIR__ . '/'); define('WP_PLUGIN_DIR', sys_get_temp_dir() . '/pixflow-split-' . bin2hex(random_bytes(6)));
    class WP_Error { public function __construct(public string $code, public string $message) {} }
    function is_wp_error($v): bool { return $v instanceof WP_Error; }
    function plugin_basename($file): string { return ltrim(str_replace(WP_PLUGIN_DIR . '/', '', $file), '/'); }
    function plugins_url($path, $file): string { return 'https://customer.example/wp-content/plugins/'.basename(dirname($file)).'/'.$path; }
    function add_filter($hook, $callback, ...$args): void { $GLOBALS['filters'][$hook][] = $callback; }
    function add_action(...$args): void {}
    function get_option($key, $default = '') { return 'fixture'; }
    function get_bloginfo($key): string { return '7.1.3'; }
    function wp_parse_url($url, $part = -1) { return parse_url($url, $part); }
    function delete_site_transient($key): void {}
    function delete_transient($key): void { $GLOBALS['deleted'][] = $key; }
    function get_site_option($key, $default = false) { return $GLOBALS['options'][$key] ?? $default; }
    function update_site_option($key, $value): void { $GLOBALS['options'][$key] = $value; }
    function set_site_transient(...$args): void {}
    function wp_strip_all_tags($s): string { return strip_tags($s); }
    function sanitize_key($s): string { return $s; }
    function sanitize_text_field($s): string { return $s; }
    function check(bool $ok, string $message): void { if (!$ok) throw new \RuntimeException($message); }
    require dirname(__DIR__) . '/src/Admin/PluginUpdater.php';
    $coreKey = 'pixflow-ai/pixflow-ai.php'; $proKey = 'pixflow-design-pro/pixflow-design-pro.php';
    $GLOBALS['catalog'] = [
        ['artifact_id' => 'core-204', 'slug' => 'pixflow-design', 'version' => '2.0.4'],
        ['artifact_id' => 'pro-204', 'slug' => 'pixflow-design-pro', 'version' => '2.0.4'],
    ];
    $core = new \PixflowDesign\WordPress\Admin\PluginUpdater('/' . $coreKey, '2.0.3');
    $pro = new \PixflowDesign\WordPress\Admin\PluginUpdater('/' . $proKey, '0.1.0-dev', 'pixflow-design-pro');
    mkdir(WP_PLUGIN_DIR . '/pixflow-design-pro', 0700, true);
    file_put_contents(WP_PLUGIN_DIR . '/' . $proKey, '<?php /* inactive Pro fixture */');
    $core->register(); $core->register();
    unlink(WP_PLUGIN_DIR . '/' . $proKey); rmdir(WP_PLUGIN_DIR . '/pixflow-design-pro'); rmdir(WP_PLUGIN_DIR);
    check(count($GLOBALS['filters']['pre_set_site_transient_update_plugins'] ?? []) === 2, 'Core discovers inactive Pro and repeated registration does not duplicate hooks');
    check(count(array_unique(array_map(static fn($callback) => spl_object_id($callback[0]), $GLOBALS['filters']['pre_set_site_transient_update_plugins']))) === 2, 'The two hooks belong to separate Free and Pro updaters');
    $state = (object) ['checked' => [$coreKey => '2.0.3', $proKey => '0.1.0-dev']];
    $state = $pro->check_update($core->check_update($state));
    check(str_ends_with($state->response[$proKey]->package, 'artifact=pro-204'), 'Pro must select its own artifact');
    check($state->response[$proKey]->slug === 'pixflow-design-pro', 'Pro has its own WordPress slug');
    check($state->response[$proKey]->icons['svg']==='https://customer.example/wp-content/plugins/pixflow-design-pro/assets/brand/pixflow-plugin-icon.svg','Inactive Pro updates use their own packaged icon');
    check(str_ends_with($state->response[$coreKey]->package, 'artifact=core-204'), 'Pro leaves core update untouched');
    foreach ([[$coreKey, $core, $pro, 'core-204'], [$proKey, $pro, $core, 'pro-204']] as [$key, $owner, $other, $id]) {
        $url = 'https://pixflow.dev/api/licensing/v2/download?artifact=' . $id;
        foreach ([['plugin' => $key], ['plugins' => [$coreKey, $proKey]]] as $extra) {
            check($other->central_pre_download(false, $url, null, $extra) === false, 'Sibling updater must not block bulk/single download');
            check($owner->central_pre_download(false, $url, null, $extra) === '/verified/' . $id . '.zip', 'Owner verifies the intended ZIP');
        }
    }
    $GLOBALS['deleted'] = []; $pro->flush_cached_update_state();
    check(!in_array('pixflow_design_update_check', $GLOBALS['deleted'], true), 'Pro invalidation does not use core cache keys');
    $GLOBALS['options'] = []; $core->seed_default_auto_update_setting(); $pro->seed_default_auto_update_setting();
    check($GLOBALS['options']['auto_update_plugins'] === [$coreKey], 'Pro preserves native opt-in rather than silently enabling auto-updates');
    $GLOBALS['catalog'] = [$GLOBALS['catalog'][0]];
    $state = $pro->check_update($state);
    check(!isset($state->response[$proKey]) && isset($state->response[$coreKey]), 'Pro expiry removes only its own stale update');
    $GLOBALS['free_artifact'] = ['artifact_id' => 'free-204', 'edition' => 'free', 'version' => '2.0.4', 'download_url' => 'https://pixflow.dev/api/plugins/v1/free/download/free-204'];
    $GLOBALS['catalog'] = [];
    $state = $pro->check_update($core->check_update($state));
    check($state->response[$coreKey]->package === $GLOBALS['free_artifact']['download_url'], 'Free updates remain available without licensed artifacts');
    $url = $GLOBALS['free_artifact']['download_url'];
    $extra = ['plugins' => [$coreKey, $proKey]];
    check($pro->central_pre_download(false, $url, null, $extra) === false, 'Pro lets the public Free bulk update reach its owner');
    check($core->central_pre_download(false, $url, null, $extra) === '/verified/free.zip', 'Free download uses public verification');
    unset($GLOBALS['free_artifact']);
    $GLOBALS['catalog'] = [['artifact_id' => 'protected-free-204', 'slug' => 'pixflow-design', 'edition' => 'free', 'version' => '2.0.4']];
    $state = $core->check_update($state);
    check(str_ends_with($state->response[$coreKey]->package ?? '', 'artifact=protected-free-204'), 'Licensed fallback handles Free metadata without a public download URL');
    check($core->central_pre_download(false, '/tmp/unrelated-plugin.zip', null, []) === false, 'Unavailable public discovery must not break unrelated native plugin uploads');
    check($core->central_pre_download(false, 'https://pixflow.dev/api/licensing/v2/download?artifact=protected-free-204', null, ['plugin' => $coreKey]) === '/verified/protected-free-204.zip', 'Authenticated Free fallback keeps protected download verification');
    echo "Split native updater checks passed\n";
}
