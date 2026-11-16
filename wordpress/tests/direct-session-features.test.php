<?php
declare(strict_types=1);
define('ABSPATH', __DIR__);
require __DIR__ . '/../src/Modules/FeatureContributions.php';
require __DIR__ . '/../src/Modules/BuilderIntegrations.php';
require __DIR__ . '/../src/Http/DirectSiteRestController.php';

use PixflowDesign\WordPress\Modules\FeatureContributions;
use PixflowDesign\WordPress\Http\DirectSiteRestController;
class WP_REST_Request {
    public function __construct(private string $route = '', private string $token = '', private string $purpose = '') {}
    public function get_method(): string { return 'GET'; }
    public function get_route(): string { return $this->route; }
    public function get_header(string $name): string { return $name === 'authorization' ? 'Bearer ' . $this->token : ''; }
    public function get_json_params(): array { return ['purpose' => $this->purpose]; }
}
function sanitize_text_field($value) { return $value; }
function get_bloginfo($key) { return 'Local test'; }
function get_current_blog_id() { return 1; }
function home_url($path) { return 'https://example.test/'; }

$count = 0;
$allowed = true;
FeatureContributions::authorize_using(static function () use (&$count, &$allowed) { ++$count; return $allowed; });
foreach (['assets', 'external-mcp', 'audio', 'composio'] as $id) {
    FeatureContributions::add($id, static fn() => '', $id === 'composio' ? ['status' => static fn() => ['configured' => true]] : []);
}
$controller = new DirectSiteRestController();
foreach ([true, false] as $allowed) {
    $count = 0;
    $features = $controller->session(new WP_REST_Request())['features'];
    if ($count !== 1 || $features !== array_fill_keys(['composio', 'image-generation', 'external-mcp', 'audio'], $allowed)) {
        throw new RuntimeException('Each ownership response must use one fresh entitlement decision.');
    }
}
echo "Session feature snapshot and revocation passed.\n";

// Update tickets use the current administrator, expire quickly and are consumed
// only by the dedicated installer authorization route.
function get_current_user_id() { return 7; }
function current_user_can($capability) { return $GLOBALS['admin_allowed'] && $capability === 'manage_options'; }
function wp_set_current_user($id) {}
function set_transient($key, $value, $ttl) { $GLOBALS['tickets'][$key] = $value; $GLOBALS['ticket_ttl'] = $ttl; }
function get_transient($key) { return $GLOBALS['tickets'][$key] ?? false; }
function delete_transient($key) {
    if (!isset($GLOBALS['tickets'][$key])) return false;
    unset($GLOBALS['tickets'][$key]);
    return true;
}
class WP_Error { public function __construct(public string $code, ...$details) {} }
$GLOBALS['admin_allowed'] = true;
$issue = $controller->sessions(new WP_REST_Request(purpose: 'bridge-update'));
$ticket = $issue['token'];
$update_path = '/pixflow-design/v1/wp-admin/direct/bridge-update';
$verify = new WP_REST_Request(route: $update_path, token: $ticket);
if ($GLOBALS['ticket_ttl'] !== 120
    || $controller->session_permission(new WP_REST_Request(route: '/pixflow-design/v1/wp-admin/direct/tools', token: $ticket))
    || $controller->session_permission(new WP_REST_Request(route: '/pixflow-design/v1/wp-admin/direct/session', token: $ticket))) {
    throw new RuntimeException('An update ticket must be short-lived and limited to installer authorization.');
}
$GLOBALS['admin_allowed'] = false;
if ($controller->session_permission($verify)) throw new RuntimeException('Revoked administrators cannot start an update.');
$GLOBALS['admin_allowed'] = true;
if (!$controller->session_permission($verify)
    || $controller->consume_bridge_update_ticket($verify) !== ['authorized' => true]
    || $controller->session_permission($verify)) {
    throw new RuntimeException('The update ticket must be accepted only once.');
}
echo "Scoped Bridge update ticket checks passed.\n";
