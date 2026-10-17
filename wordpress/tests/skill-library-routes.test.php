<?php
declare(strict_types=1);
define('ABSPATH', __DIR__);
require dirname(__DIR__).'/src/autoload.php';
class WP_REST_Request { public string $method = 'GET'; public array $params = []; public function get_param($name) { return $this->params[$name] ?? null; } public function get_header($name) { return 'nonce'; } public function get_method() { return $this->method; } }
class WP_REST_Response { public function __construct(public $data, public $status=200, public $headers=[]) {} }
$caps=['manage_options'=>true,'install_plugins'=>true];$nonce=true;$logged=true;
function current_user_can($cap) { return $GLOBALS['caps'][$cap]??false; }
function is_user_logged_in() { return $GLOBALS['logged']; }
function wp_verify_nonce($value,$action) { return $GLOBALS['nonce']; }
function check($value,$message) { if(!$value)throw new RuntimeException($message); }
$routes=new PixflowDesign\WordPress\Http\Routes\SkillLibraryRoutes();$request=new WP_REST_Request();
check($routes->allowed($request),'Administrator allowed');
$nonce=false;check(!$routes->allowed($request),'Missing nonce rejected');$nonce=true;
$logged=false;check(!$routes->allowed($request),'Logged out rejected');$logged=true;
$caps['install_plugins']=false;check(!$routes->allowed($request),'Restricted administrator rejected');
check($routes->handle($request)->status===403,'Callback cannot bypass permission');
$caps['install_plugins']=true;$caps['manage_options']=false;check(!$routes->allowed($request),'Editor rejected');
$caps['manage_options']=true;check($routes->handle($request)->status===200 && $routes->handle($request)->data['skills']===[],'Free reads an empty catalogue without a console error');
$request->method='POST';check($routes->handle($request)->status===403,'Absent Pro mutations fail closed');
$request->method='GET'; $request->params=['action'=>'preview']; check($routes->handle($request)->status===403,'Absent Pro previews fail closed');
echo "Skill library route permissions: 8 checks passed\n";
