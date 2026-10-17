<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Admin {
    class WpAdminCapabilityRegistry { public function find(string $id): ?array { return $GLOBALS['capability']; } }
    class WpAdminPairingService { public function site_id(): string { return 'site'; } }
}
namespace {
define('ABSPATH', __DIR__ . '/');
class WP_Error { public function __construct(public string $code, public string $message, public array $data) {} }
function get_current_user_id() { return 7; }
function current_user_can($cap, $id = 0) { return $GLOBALS['permissions'][$cap] ?? false; }
function get_option($name, $default = false) { return ['op_1' => $GLOBALS['operation']]; }
function sanitize_key($s) { return $s; }
function get_post($id) { return (object) ['post_type' => 'attachment']; }
function verify($ok, $message) { if (!$ok) throw new \RuntimeException($message); }
require __DIR__ . '/../src/Admin/WpAdminCapabilitySafetyPlane.php';
require_once __DIR__ . '/../src/autoload.php';
\PixflowDesign\WordPress\Modules\FeatureContributions::add('advanced-site-tools', static fn(): string => 'qa-advanced-tools');
\PixflowDesign\WordPress\Modules\FeatureContributions::authorize_using(static fn(): bool => true);
$type = new \ReflectionClass(\PixflowDesign\WordPress\Admin\WpAdminCapabilitySafetyPlane::class);
$plane = $type->newInstanceWithoutConstructor();
$type->getProperty('registry')->setValue($plane, new \PixflowDesign\WordPress\Admin\WpAdminCapabilityRegistry());
$type->getProperty('pairing')->setValue($plane, new \PixflowDesign\WordPress\Admin\WpAdminPairingService());
$operation = ['operationId' => 'op_1', 'siteId' => 'site', 'userId' => '7', 'status' => 'committed', 'capabilityId' => 'code-write', 'arguments' => [], 'rollback' => ['supported' => false]];
$capability = ['permission' => ['required' => ['manage_options', 'edit_theme_options'], 'targetType' => 'site']];
$permissions = ['manage_options' => true, 'edit_theme_options' => false];
$before = $operation;
verify($plane->rollback(['operationId' => 'op_1']) instanceof WP_Error && $operation === $before, 'A demoted owner passed the rollback permission boundary');
$permissions['edit_theme_options'] = true;
verify($plane->rollback(['operationId' => 'op_1'])['status'] === 'unavailable', 'Authorized rollback did not reach normal handler selection');
$capability = null;
verify($plane->rollback(['operationId' => 'op_1']) instanceof WP_Error, 'Removed integration remained callable');
$capability = ['permission' => ['required' => ['read_post', 'edit_post'], 'targetType' => 'media']];
$operation['arguments'] = ['attachmentId' => 13];
$permissions = ['read_post' => true];
verify($plane->rollback(['operationId' => 'op_1']) instanceof WP_Error, 'Read-only media permission allowed rollback');
$permissions['edit_post'] = true;
verify($plane->rollback(['operationId' => 'op_1'])['status'] === 'unavailable', 'Authorized media target was rejected');
echo "Rollback boundary: 5 checks passed\n";
}
