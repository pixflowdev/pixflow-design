<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Admin {
    final class WpAdminSurfacePolicy {
        public static function can_render_admin_surface(): bool { return $GLOBALS['allowed']; }
        public static function can_use(): bool { return $GLOBALS['allowed']; }
    }
}
namespace PixflowDesign\WordPress\Bridge {
    final class BridgeConfig { public function base_url(): string { return 'http://127.0.0.1:17481'; } }
}
namespace {
    define('ABSPATH', __DIR__); define('PIXFLOW_DESIGN_ASSETS_DIR', dirname(__DIR__).'/assets/');
    define('PIXFLOW_DESIGN_ASSETS_URL', 'https://fixture.test/assets/'); define('PIXFLOW_DESIGN_VERSION', 'test');
    function get_option($key, $default=[]) { return ['mode'=>$GLOBALS['mode']]; }
    function wp_enqueue_style(...$args) {}
    function wp_enqueue_script(...$args) { $GLOBALS['scripts'][]=$args; }
    function wp_localize_script($handle,$name,$value) { $GLOBALS['localized']=$value; }
    function esc_url_raw($value) { return $value; }
    function sanitize_text_field($value) { return $value; }
    function home_url() { return 'https://fixture.test'; }
    function untrailingslashit($value) { return rtrim($value,'/'); }
    function wp_parse_url($value,$component) { return parse_url($value,$component); }
    function get_bloginfo($value) { return 'Fixture'; }
    function rest_url($path) { return 'https://fixture.test/wp-json/'.$path; }
    function wp_create_nonce($value) { return 'fixture-nonce'; }
    require dirname(__DIR__).'/src/Bridge/AdminBridgeStatus.php';
    $controller=new \PixflowDesign\WordPress\Bridge\AdminBridgeStatus(new \PixflowDesign\WordPress\Bridge\BridgeConfig());
    $GLOBALS['allowed']=true;
    foreach(['api','daemon'] as $mode) {
        $GLOBALS['mode']=$mode; $GLOBALS['scripts']=[]; $GLOBALS['localized']=[];
        $controller->enqueue_assets();
        if(count($GLOBALS['scripts'])!==1) throw new \RuntimeException('The controller must be available when switching modes without reload');
        if(($GLOBALS['localized']['executionMode']??null)!==$mode) throw new \RuntimeException('Initial mode must be explicit so API pages stay idle');
    }
    $GLOBALS['allowed']=false; $GLOBALS['scripts']=[]; $controller->enqueue_assets();
    if($GLOBALS['scripts']) throw new \RuntimeException('Unauthorized surfaces must not enqueue the controller');
    echo "Bridge mode asset checks passed\n";
}
