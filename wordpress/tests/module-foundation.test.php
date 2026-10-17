<?php

declare(strict_types=1);

// Standalone WordPress lifecycle fixture; no site/database/provider access.
define('ABSPATH', __DIR__);
define('WP_PLUGIN_DIR', __DIR__ . '/nonexistent-plugin-fixture');
function add_filter(...$args): void {}
function plugins_url($path, $file): string { return 'http://test/plugins/' . $path; }
function plugin_basename($file): string { return 'pixflow-design-pro/' . basename($file); }
function get_option($key, $default = false): mixed { return $default; }
$scenario = $argv[1] ?? 'core-first';
$hooks = [];
$actions = [];
$administrator = true;
$checks = 0;
function add_action($hook, $callback, $priority = 10, $accepted = 1): void { global $hooks; $hooks[$hook][$priority][] = [$callback, $accepted]; }
function did_action($hook): int { global $actions; return $actions[$hook] ?? 0; }
function do_action($hook, ...$args): void {
    global $hooks, $actions;
    $actions[$hook] = ($actions[$hook] ?? 0) + 1;
    $callbacks = $hooks[$hook] ?? []; ksort($callbacks);
    foreach ($callbacks as $entries) foreach ($entries as [$callback, $accepted]) $callback(...array_slice($args, 0, $accepted));
}
function current_user_can($capability): bool { global $administrator; return $administrator && $capability === 'activate_plugins'; }
function __($message, $domain): string { return $message; }
function esc_html($message): string { return htmlspecialchars($message, ENT_QUOTES, 'UTF-8'); }
function esc_html__($message, $domain): string { return esc_html($message); }
function check(bool $condition, string $message): void {
    global $checks;
    if (!$condition) throw new RuntimeException($message);
    $checks++;
}
function rejects(callable $operation, string $message): void {
    try { $operation(); } catch (LogicException $error) { check(true, $message); return; }
    throw new RuntimeException($message);
}
function notices(): string { ob_start(); do_action('admin_notices'); return (string) ob_get_clean(); }

require_once dirname(__DIR__) . '/src/Modules/ModuleRegistry.php';
require_once dirname(__DIR__) . '/src/Modules/ModuleHost.php';
$host = new \PixflowDesign\WordPress\Modules\ModuleHost();
$host->register(); $host->register();
$calls = [];
add_action('pixflow_design_register_modules', function ($registry) use (&$calls): void {
    $registry->add('fixture/extension', function () use (&$calls): void { $calls[] = 'extension'; });
});
check($calls === [], 'Contributions wait until plugins_loaded');
do_action('plugins_loaded'); $host->boot();
check($calls === ['extension'], 'The core boots external contributions exactly once');
check(notices() === '', 'A Free core with no installed add-on emits no error');
$registry = new \PixflowDesign\WordPress\Modules\ModuleRegistry();
$registry->add('fixture/first', function () use (&$calls): void { $calls[] = 'first'; });
rejects(fn() => $registry->add('fixture/first', fn() => null), 'Duplicate IDs rejected');
rejects(fn() => $registry->add('../invalid', fn() => null), 'Invalid IDs rejected');
$registry->add('fixture/failing', function (): void { throw new RuntimeException('private failure details'); });
$registry->add('fixture/last', function () use (&$calls): void { $calls[] = 'last'; });
$registry->boot(); $registry->boot();
check($calls === ['extension', 'first', 'last'], 'Failures do not prevent other callbacks or duplicate execution');
check(array_keys($registry->failures()) === ['fixture/failing'], 'Failures preserve module identity');
echo "Free module host fixture passed ($checks checks)\n";
