<?php
declare(strict_types=1);
define('ABSPATH', __DIR__ . '/');
define('WP_PLUGIN_DIR', '/site/wp-content/plugins');
define('PIXFLOW_DESIGN_ASSETS_DIR', dirname(__DIR__) . '/assets/');
define('PIXFLOW_DESIGN_ASSETS_URL', 'https://site.test/wp-content/plugins/pixflow-design/assets/');
$scripts = (object) ['registered' => []]; $styles = (object) ['registered' => []];
function wp_scripts(): object { return $GLOBALS['scripts']; }
function wp_styles(): object { return $GLOBALS['styles']; }
function wp_register_script($handle, $src, $deps = [], $ver = false, $footer = false): void { $GLOBALS['scripts']->registered[$handle] = (object) compact('src', 'deps', 'ver'); }
$dequeued = [];
function wp_dequeue_script(string $handle): void { $GLOBALS['dequeued'][] = 'script:' . $handle; }
function wp_dequeue_style(string $handle): void { $GLOBALS['dequeued'][] = 'style:' . $handle; }
function plugins_url(string $path, string $file): string { return 'https://site.test/wp-content/plugins/pixflow-design-pro/' . $path; }
function add_query_arg(string $key, string $value, string $url): string { return $url . '?' . $key . '=' . rawurlencode($value); }
require dirname(__DIR__) . '/src/Modules/FeatureContributions.php';
require dirname(__DIR__) . '/src/Modules/BuilderIntegrations.php';
require dirname(__DIR__) . '/src/Assets/FeatureRuntime.php';
require dirname(__DIR__) . '/src/Assets/AssetRevision.php';
use PixflowDesign\WordPress\Modules\FeatureContributions;
use PixflowDesign\WordPress\Modules\BuilderIntegrations;
use PixflowDesign\WordPress\Assets\FeatureRuntime;
$checks = 0;
function check(bool $condition, string $label): void { global $checks; ++$checks; if (!$condition) throw new RuntimeException($label); }
$allowed = false;
FeatureContributions::authorize_using(static function () use (&$allowed): bool { return $allowed; });
BuilderIntegrations::authorize_using(static function () use (&$allowed): bool { return $allowed; });
$enqueues = 0;
FeatureContributions::add('assets', static function () use (&$enqueues): string {
    ++$enqueues;
    $GLOBALS['scripts']->registered['pixflow-assets'] = (object) ['src' => 'https://site.test/wp-content/plugins/pixflow-design-pro/assets/app/pixflow-assets.js', 'ver' => '4', 'extra' => ['data' => 'must-not-publish-credentials']];
    $GLOBALS['styles']->registered['pixflow-assets'] = (object) ['src' => 'https://site.test/wp-content/plugins/pixflow-design-pro/assets/app/pixflow-assets.css', 'ver' => '4'];
    return 'pixflow-assets';
});
FeatureContributions::add('untrusted', static function (): string {
    $GLOBALS['scripts']->registered['pixflow-untrusted'] = (object) ['src' => 'https://other.test/pixflow-design-pro/assets/app/pixflow-other.js', 'ver' => '1'];
    return 'pixflow-untrusted';
});
BuilderIntegrations::add('bricks', ['active' => static fn(): bool => true, 'registerSettingsClient' => static function (): string {
    $GLOBALS['scripts']->registered['pixflow-bricks-settings'] = (object) ['src' => 'https://site.test/wp-content/plugins/pixflow-design-pro/assets/app/pixflow-bricks-settings.js', 'ver' => '4'];
    $GLOBALS['styles']->registered['pixflow-bricks-settings'] = (object) ['src' => 'https://site.test/wp-content/plugins/pixflow-design-pro/assets/app/pixflow-bricks-settings.css', 'ver' => '4'];
    return 'pixflow-bricks-settings';
}]);
$free = FeatureRuntime::state();
check($free['assets'] === [] && $free['features'] === [] && !$free['builders']['bricks'], 'Free or expired Pro must not expose premium modules.');
check($enqueues === 0, 'No premium asset callbacks run for Free.');
$allowed = true;
$pro = FeatureRuntime::state();
check($pro['schema'] === 'pixflow.feature-runtime.v1', 'Versioned contract.');
check($pro['builders']['bricks'] && !$pro['builders']['etch'], 'Builder availability comes from installed authorized modules.');
check(in_array('assets', $pro['features'], true), 'Feature visible after activation.');
check(count($pro['assets']) === 4, 'Only package-owned script and stylesheet URLs returned.');
check(count(array_filter($pro['assets'], static fn(array $asset): bool => $asset['handle'] === 'pixflow-bricks-settings')) === 2, 'Authorized Bricks settings have standalone script and CSS URLs.');
check($pro['assets'][0]['url'] === 'https://site.test/wp-content/plugins/pixflow-design-pro/assets/app/pixflow-assets.js?ver=4', 'Versioned URLs preserve cache invalidation.');
check(!str_contains(json_encode($pro), 'must-not-publish'), 'Inline data and secrets excluded.');
$allowed = false;
check(FeatureRuntime::state()['assets'] === [], 'Revocation excludes loaded implementations.');
require dirname(__DIR__) . '/src/Assets/AssetRegistrar.php';
$registrar = (new ReflectionClass(\PixflowDesign\WordPress\Assets\AssetRegistrar::class))->newInstanceWithoutConstructor();
$dependencies = new ReflectionMethod($registrar, 'extension_dependencies');
$allowed = true;
$workspace_enqueues = 0;
FeatureContributions::add('workspace', static function () use (&$workspace_enqueues): string {
    ++$workspace_enqueues;
    $GLOBALS['scripts']->registered['pixflow-workspace'] = (object) ['src' => 'https://site.test/wp-content/plugins/pixflow-design-pro/assets/app/pixflow-workspace.js', 'ver' => '4'];
    $GLOBALS['styles']->registered['pixflow-workspace'] = (object) ['src' => 'https://site.test/wp-content/plugins/pixflow-design-pro/assets/app/pixflow-workspace.css', 'ver' => '4'];
    return 'pixflow-workspace';
});
$prior_enqueues = $enqueues;
$admin_handles = $dependencies->invoke($registrar, true);
check(!in_array('pixflow-assets', $admin_handles, true), 'Admin does not depend on optional asset settings.');
check($enqueues === $prior_enqueues + 1, 'Manifest uses registered handles without calling enqueue callbacks twice.');
check(in_array('script:pixflow-bricks-agent', $dequeued, true), 'Admin removes full Bricks runtime from the eager queue.');
check(in_array('style:pixflow-assets', $dequeued, true), 'Optional CSS follows the on-demand script.');
check(isset(wp_scripts()->registered['pixflow-assets']), 'Deferred assets remain registered for the authorized manifest.');
$native_handles = $dependencies->invoke($registrar, false);
check(!in_array('pixflow-workspace', $native_handles, true), 'Native builder does not eagerly load the Workspace shell.');
check(!in_array('pixflow-workspace', $admin_handles, true), 'Admin does not eagerly load the Workspace shell.');
check(count(array_filter(FeatureRuntime::state()['assets'], static fn(array $asset): bool => $asset['handle'] === 'pixflow-workspace')) === 2, 'Workspace script and CSS remain discoverable for lazy loading.');
check(!in_array('pixflow-bricks-settings', $native_handles, true), 'Native Bricks keeps its existing settings implementation without downloading a duplicate.');
check(in_array('pixflow-assets', $native_handles, true), 'Native builder bootstrap preserves its existing contributions.');
$allowed = false;
check($dependencies->invoke($registrar, true) === ['pixflow-shared-runtime', 'pixflow-shared-english'], 'Free receives shared runtime/English and no Pro dependencies.');
check(wp_scripts()->registered['pixflow-shared-runtime']->src === PIXFLOW_DESIGN_ASSETS_URL . 'app/pixflow-shared-runtime.js', 'Runtime is registered from the Free package.');
check(wp_scripts()->registered['pixflow-shared-runtime']->deps === [], 'Vendor runtime must not depend on a Pro or core application entry.');
define('PIXFLOW_DESIGN_DISTRIBUTION', 'directory');
\PixflowDesign\WordPress\Assets\AssetRegistrar::shared_data_dependencies();
check(wp_scripts()->registered['pixflow-shared-runtime']->deps === ['react', 'react-dom', 'wp-element'], 'Directory runtime loads WordPress React before every Pixflow root.');
check(wp_scripts()->registered['pixflow-shared-english']->src === PIXFLOW_DESIGN_ASSETS_URL . 'app/pixflow-english.js', 'English is registered from the Free package.');
echo "$checks feature-runtime checks passed.\n";
