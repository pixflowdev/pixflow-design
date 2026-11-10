<?php
declare(strict_types=1);
define('ABSPATH', __DIR__);
require __DIR__ . '/../src/Modules/FeatureContributions.php';
require __DIR__ . '/../src/Modules/BuilderIntegrations.php';
require __DIR__ . '/../src/Http/DirectSiteRestController.php';

use PixflowDesign\WordPress\Modules\FeatureContributions;
use PixflowDesign\WordPress\Http\DirectSiteRestController;
class WP_REST_Request { public function get_method(): string { return 'GET'; } }
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
