<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\License {
    class FreeBridgeIdentity { public static function configuration(string $token): array { return ['wordpressPairingToken'=>$token,'freeAccess'=>true]; } }
    class CentralEntitlements { public static function delivery_origin(): string { return self::authority(); }
        public function refresh(): array { $GLOBALS['pairing_refreshed']=true; return ['ok'=>true]; }
        public function allows(string $scope): bool { return $GLOBALS['licensed']; }
        public function bridge_configuration(string $token): array { return ['wordpressPairingToken'=>$token]; }
        public function deliver_to_bridge(): \WP_REST_Response { return new \WP_REST_Response(['token'=>'signed-fixture'],200); }
    }
}
namespace PixflowDesign\WordPress\Admin {
    class WpAdminSurfacePolicy { public static function can_use(): bool { return $GLOBALS['admin']; } }
}
namespace {
define('ABSPATH',__DIR__.'/');
class WP_Error { public function __construct(public string $code,public string $message,public array $data=[]) {} }
class WP_REST_Response {
    public function __construct(public array $data,public int $status=200,public array $headers=[]) {}
    public function get_data(): array { return $this->data; }
    public function get_status(): int { return $this->status; }
}
class WP_REST_Request {
    public function __construct(public array $params=[],public array $headers=[]) {}
    public function get_param(string $key): mixed { return $this->params[$key]??null; }
    public function get_header(string $key): string { return $this->headers[$key]??''; }
}
$GLOBALS['licensed']=true; $GLOBALS['admin']=true; $GLOBALS['site']='https://qa.test';
$GLOBALS['transients']=[]; $GLOBALS['options']=[]; $GLOBALS['meta']=[];
function is_user_logged_in() { return $GLOBALS['logged_in'] ?? true; }
function current_user_can($cap) { return $GLOBALS['admin']; }
function user_can($id,$cap) { return $GLOBALS['admin']; }
function wp_verify_nonce($nonce,$action) { return $nonce==='valid'; }
function get_current_user_id() { return 1; }
function wp_set_current_user($id) {}
function site_url($path='') { return $GLOBALS['site'].$path; }
function home_url($path='') { return site_url($path); }
function untrailingslashit($url) { return rtrim($url,'/'); }
function wp_generate_uuid4() { return bin2hex(random_bytes(16)); }
function get_user_meta($id,$key,$single) { return $GLOBALS['meta'][$id][$key]??[]; }
function update_user_meta($id,$key,$value) { $GLOBALS['meta'][$id][$key]=$value; }
function get_transient($key) { return $GLOBALS['transients'][$key]??false; }
function set_transient($key,$value,$ttl) { $GLOBALS['transients'][$key]=$value; }
function delete_transient($key) { unset($GLOBALS['transients'][$key]); }
function add_option($key,$value,$deprecated,$autoload) { if(isset($GLOBALS['options'][$key]))return false; $GLOBALS['options'][$key]=$value; return true; }
function delete_option($key) { unset($GLOBALS['options'][$key]); }
require_once dirname(__DIR__).'/src/License/SiteIdentity.php';
require_once dirname(__DIR__).'/src/License/SignedEntitlement.php';
require_once dirname(__DIR__).'/src/Admin/WpAdminPairingService.php';
require_once dirname(__DIR__).'/src/License/BridgePairing.php';
use PixflowDesign\WordPress\License\BridgePairing;
use PixflowDesign\WordPress\Admin\WpAdminPairingService;
function check($value,$message) { if(!$value)throw new \RuntimeException($message); }
$pairing=new BridgePairing();
check($pairing->can_authorize(new WP_REST_Request())->code === 'pairing_nonce_invalid','Nonce error identified');
check($pairing->can_authorize(new WP_REST_Request([],['x_wp_nonce'=>'valid'])) === true,'Admin nonce accepted');
$GLOBALS['logged_in']=false; check($pairing->can_authorize(new WP_REST_Request())->code === 'pairing_login_required','Expired login identified'); $GLOBALS['logged_in']=true;
$GLOBALS['admin']=false; check($pairing->can_authorize(new WP_REST_Request([],['x_wp_nonce'=>'valid']))->code === 'pairing_admin_required','Non-admin denied precisely'); $GLOBALS['admin']=true;
check(!$pairing->server_exchange(new WP_REST_Request([],['origin'=>'https://qa.test'])),'Browser cannot exchange');
check(!$pairing->server_exchange(new WP_REST_Request([],['sec_fetch_site'=>'same-origin'])),'Browser fetch metadata denied');
check($pairing->server_exchange(new WP_REST_Request()),'Server transport permitted');
$verifier=str_repeat('a',64); $challenge=rtrim(strtr(base64_encode(hash('sha256',$verifier,true)),'+/','-_'),'=');
$authorize=fn()=> $pairing->authorize(new WP_REST_Request(['challenge'=>$challenge,'siteUrl'=>'https://qa.test']));
$authorized=$authorize(); check($authorized instanceof WP_REST_Response,'Code issued');
check(array_keys($authorized->data)===['code','expiresAt'],'Browser only receives one-time code and expiry');
$request=new WP_REST_Request(['code'=>$authorized->data['code'],'verifier'=>$verifier]);
check($pairing->exchange(new WP_REST_Request(['code'=>$authorized->data['code'],'verifier'=>str_repeat('b',64)])) instanceof WP_Error,'Wrong verifier denied');
$result=$pairing->exchange($request); check($result instanceof WP_REST_Response,'Valid exchange');
check(!empty($GLOBALS['pairing_refreshed']),'Pairing obtains a fresh grant after any prior bridge denial');
check($pairing->exchange($request) instanceof WP_Error,'Replay denied');
$service=new WpAdminPairingService(); $token=$result->data['configuration']['wordpressPairingToken'];
$auth=$service->authenticate_token($token); check($auth!==null,'Private credential authenticates');
check($service->revoke($auth['tokenId']),'Credential revocable'); check($service->authenticate_token($token)===null,'Revoked credential denied');
$expired=$authorize(); $key='pixflow_pair_'.hash('sha256',$expired->data['code']); $GLOBALS['transients'][$key]['expires']=time();
check($pairing->exchange(new WP_REST_Request(['code'=>$expired->data['code'],'verifier'=>$verifier]))->code === 'pairing_expired','Exact expiry identified');
$switched=$authorize(); $GLOBALS['site']='https://another.test';
check($pairing->exchange(new WP_REST_Request(['code'=>$switched->data['code'],'verifier'=>$verifier]))->code === 'pairing_site_changed','Site switch identified');
$GLOBALS['site']='https://qa.test'; $GLOBALS['licensed']=false;
$GLOBALS['transients']['pixflow_pairing_rate_1']=0;
$freeCode=$authorize(); check($freeCode instanceof WP_REST_Response,'Free admin can authorize without a licence');
$GLOBALS['pairing_refreshed']=false;
$freePair=$pairing->exchange(new WP_REST_Request(['code'=>$freeCode->data['code'],'verifier'=>$verifier]));
check($freePair instanceof WP_REST_Response && $freePair->data['token']==='' && $freePair->data['configuration']['freeAccess']===true,'Free exchange grants no Pro token');
check(!$GLOBALS['pairing_refreshed'],'Free pairing must not require the licensing network');
check($pairing->authorize(new WP_REST_Request(['challenge'=>$challenge,'siteUrl'=>'https://wrong.test']))->code === 'pairing_site_mismatch','Address mismatch not misreported as a license error');
echo "Bridge pairing consent, PKCE, replay, expiry, site switch and credential revocation passed\n";
}
