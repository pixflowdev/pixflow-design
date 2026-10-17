<?php
declare(strict_types=1);
define('ABSPATH', __DIR__);
require __DIR__ . '/../src/Modules/FeatureContributions.php';
require __DIR__ . '/../src/Modules/WorkspaceAccess.php';
use PixflowDesign\WordPress\Modules\FeatureContributions;
use PixflowDesign\WordPress\Modules\WorkspaceAccess;
$checks = 0;
function check(bool $value, string $message): void { global $checks; $checks++; if (!$value) throw new RuntimeException($message); }
check(!WorkspaceAccess::available(), 'Free does not advertise the Workspace');
foreach (['POST', 'PUT', 'PATCH'] as $method) {
    foreach (['projects', 'projects/saved/files', 'projects/saved/conversations', '/projects/saved/versions/'] as $path) {
        check(!WorkspaceAccess::permits($path, $method), 'Free cannot author workspace content');
    }
}
foreach (['GET', 'HEAD', 'DELETE'] as $method) check(WorkspaceAccess::permits('projects/saved/files', $method), 'Read/export/cleanup preserved');
foreach (['app-config', 'skills', 'memory/index', 'onboarding', 'wp-admin/chat'] as $path) check(WorkspaceAccess::permits($path, 'POST'), 'Free non-workspace capability preserved');
FeatureContributions::add('workspace', static fn(): string => 'pixflow-workspace');
check(WorkspaceAccess::available(), 'Pro contribution enables Workspace');
check(WorkspaceAccess::permits('projects/saved/files', 'PUT'), 'Pro authoring available');
FeatureContributions::authorize_using(static fn(): bool => false);
check(!WorkspaceAccess::available(), 'Expired Pro cannot open Workspace');
check(!WorkspaceAccess::permits('projects', 'POST'), 'Expired Pro cannot create projects');
check(WorkspaceAccess::permits('projects/saved/files', 'GET'), 'Expiry retains export');
FeatureContributions::authorize_using(static fn(): bool => true);
check(WorkspaceAccess::permits('projects', 'POST'), 'Renewed Pro restores authoring');
echo "workspace-pro-access: $checks checks passed\n";

// Exercise the real admin-bar registration against the same entitlement gate.
define('PIXFLOW_DESIGN_ASSETS_URL', 'https://example.test/assets/');
function is_user_logged_in(): bool { return true; }
function is_network_admin(): bool { return false; }
function current_user_can(string $capability): bool { return $GLOBALS['can_edit'] ?? true; }
function apply_filters(string $hook, mixed $value): mixed { return $value; }
function sanitize_key(string $value): string { return $value; }
function is_admin(): bool { return true; }
function is_admin_bar_showing(): bool { return true; }
function esc_url(string $value): string { return $value; }
function esc_html__(string $value, string $domain): string { return $value; }
function esc_attr__(string $value, string $domain): string { return $value; }
class WP_Admin_Bar {
    public array $nodes = [];
    public function add_node(array $node): void { $this->nodes[$node['id']] = $node; }
}
require __DIR__ . '/../src/Admin/WpAdminSurfacePolicy.php';
require __DIR__ . '/../src/Admin/WpAdminFloatingPanel.php';
$host = (new ReflectionClass(\PixflowDesign\WordPress\Admin\WpAdminFloatingPanel::class))->newInstanceWithoutConstructor();
foreach ([true, false] as $entitled) {
    FeatureContributions::authorize_using(static fn(): bool => $entitled);
    $bar = new WP_Admin_Bar();
    $host->add_admin_bar_nodes($bar);
    check(isset($bar->nodes['pixflow-design']), 'Chat launcher remains available without Pro');
    check(isset($bar->nodes['pixflow-design-menu']), 'Settings quick menu remains available in Free; Workspace actions remain gated');
    if ($entitled) check(str_contains($bar->nodes['pixflow-design-menu']['title'], 'pixflow-menu-light.svg'), 'Quick menu uses the cog variant');
}
$GLOBALS['can_edit'] = false;
$bar = new WP_Admin_Bar();
$host->add_admin_bar_nodes($bar);
check($bar->nodes === [], 'Restricted users receive no launchers');
echo "workspace-admin-access: $checks checks passed\n";
