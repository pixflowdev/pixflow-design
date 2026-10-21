<?php
declare(strict_types=1);
define('ABSPATH', __DIR__.'/');
define('PIXFLOW_DESIGN_VERSION','test');
define('PIXFLOW_DESIGN_TEMPLATES_API_URL','https://preview.pixflow.dev/api/templates/v1/templates');
define('PIXFLOW_DESIGN_LICENSE_VALIDATION_URL',getenv('QA_LICENSE_URL') ?: 'https://preview.pixflow.dev/wp-json/pixflow-ai/v1/license/validate');
$GLOBALS['site']='http://127.0.0.1:8088';$GLOBALS['environment']='local';$GLOBALS['options']=[];$GLOBALS['transients']=[];$GLOBALS['requests']=[];$GLOBALS['responses']=[];
function site_url($p=''){return $GLOBALS['site'].$p;}function home_url($p=''){return site_url($p);}function wp_get_environment_type(){return $GLOBALS['environment'];}
function wp_parse_url($s,$part=-1){return parse_url($s,$part);}function wp_salt($s){return ($GLOBALS['salt_version']??'original').'test-salt-'.$s;}
function get_option($k,$d=false){
 if($k==='pixflow_design_installation_proof_v2' && !empty($GLOBALS['deny_during_proof'])){
  unset($GLOBALS['deny_during_proof']);(new \PixflowDesign\WordPress\License\CentralEntitlements())->deny('license_revoked');
 }
 return $GLOBALS['options'][$k]??$d;
}function update_option($k,$v,$a=false){$GLOBALS['options'][$k]=$v;return true;}function delete_option($k){unset($GLOBALS['options'][$k]);return true;}
function get_transient($k){return $GLOBALS['transients'][$k]??false;}function set_transient($k,$v,$ttl){$GLOBALS['transients'][$k]=$v;return true;}function delete_transient($k){unset($GLOBALS['transients'][$k]);return true;}
function esc_url_raw($s){return $s;}function untrailingslashit($s){return rtrim($s,'/');}function apply_filters($n,$v){return $v;}function wp_json_encode($v){return json_encode($v);}
function add_query_arg($a,$url){return $url.(str_contains($url,'?')?'&':'?').http_build_query($a);}
class WP_Error{function __construct(public string $code='', public string $message='fixture network failure', public array $data=[]){} function get_error_message(){return $this->message;}}
function is_wp_error($x){return $x instanceof WP_Error;}
function wp_remote_get($url,$args){$GLOBALS['requests'][]=[$url,$args];return array_shift($GLOBALS['responses']);}
function wp_remote_post($url,$args){return wp_remote_get($url,$args);}
function wp_remote_retrieve_response_code($r){return $r['status'];}function wp_remote_retrieve_body($r){return $r['body'];}function wp_remote_retrieve_header($r,$h){return $r['headers'][$h]??'';}
spl_autoload_register(function($name){$prefix='PixflowDesign\\WordPress\\';if(str_starts_with($name,$prefix)){$path=dirname(__DIR__).'/src/'.str_replace('\\','/',substr($name,strlen($prefix))).'.php';if(is_file($path))require_once $path;}});
function check($x,$message){if(!$x)throw new RuntimeException($message);}
function response($status,$body=[],$etag='"one"',$revision='r1'){return ['status'=>$status,'body'=>$status===304?'':json_encode($body),'headers'=>['etag'=>$etag,'x-pixflow-catalog-revision'=>$revision]];}
define('PIXFLOW_DESIGN_CENTRAL_ENTITLEMENTS_V2',true);
function add_option($key,$value,$unused='',$autoload=false){if(array_key_exists($key,$GLOBALS['options']))return false;$GLOBALS['options'][$key]=$value;return true;}
function wp_generate_uuid4(){return bin2hex(random_bytes(16));}
function wp_next_scheduled($hook){return $GLOBALS['scheduled'][$hook]??false;}
function wp_schedule_single_event($at,$hook){$GLOBALS['scheduled'][$hook]=$at;}
use PixflowDesign\WordPress\License\CentralEntitlements;
use PixflowDesign\WordPress\License\LicenseCache;
use PixflowDesign\WordPress\License\SiteIdentity;

function seed_license(){
 $GLOBALS['options']=[];$GLOBALS['transients']=[];$GLOBALS['requests']=[];$GLOBALS['responses']=[];$GLOBALS['salt_version']='original';
 $c=new LicenseCache();$i=new SiteIdentity();
 $c->persist($i->fingerprint($i->current_payload()),'synthetic-key',['license_id'=>'synthetic-id','template_access_token'=>'old-token','template_access_token_expires_at'=>gmdate('c',time()-3600)],PIXFLOW_DESIGN_LICENSE_VALIDATION_URL);
 $GLOBALS['options']['customer_content']=['chat'=>'preserved','settings'=>['dark'=>true]];
 return $c;
}
foreach([408,429,500,502,503,504] as $status){
 $c=seed_license();$before=$GLOBALS['options'];$GLOBALS['responses']=[response($status,['code'=>'service_unavailable'])];
 check((new \PixflowDesign\WordPress\License\LicenseService())->private_license_payload()===[],'Unavailable authority returned a resource credential');
 check($GLOBALS['options']===$before,'Temporary HTTP '.$status.' deleted or changed saved licence/data');
}
$c=seed_license();$before=$GLOBALS['options'];$GLOBALS['responses']=[response(200,['unexpected'=>'response'])];
(new \PixflowDesign\WordPress\License\LicenseService())->private_license_payload();
check($GLOBALS['options']===$before,'Malformed successful response destroyed saved key');
$c=seed_license();$GLOBALS['salt_version']='rotated';$s=$c->summary();
check($s['present'] && !$s['valid'] && $s['status']==='unreadable','Unreadable retained key falsely active/missing');
check(isset($GLOBALS['options']['pixflow_design_site_license_cache']['encrypted_license_key']),'Unreadable key destroyed');
$c=seed_license();$GLOBALS['responses']=[response(403,['valid'=>false,'access_granted'=>false,'status'=>'revoked'])];
$r=(new \PixflowDesign\WordPress\License\LicenseService())->validate('synthetic-key');
check(!$r['valid'] && !$c->summary()['valid'],'Explicit refusal granted access');

// Challenge transport failures must retry without turning into permanent licence refusals.
foreach(['enroll','refresh'] as $stage){
 $c=seed_license();$state=['installation'=>['id'=>'fixture'],'epoch'=>3,'tokens'=>[],'denied'=>false];
 $GLOBALS['options']['pixflow_design_central_entitlements_v2']=$state;
 $method=new ReflectionMethod(CentralEntitlements::class,'rejected_response');
 $method->invoke(new CentralEntitlements(),response(401,['code'=>'invalid_challenge']),$state,$stage);
 $after=$GLOBALS['options']['pixflow_design_central_entitlements_v2'];
 check(empty($after['denied']) && !empty($after['network_unavailable']),'Recoverable challenge became terminal denial');
 check(!empty($c->private_payload()),'Challenge retry lost stored key');
}
// Actual licence refusal stays terminal. Unknown endpoints do not gain retries.
$c=seed_license();$method->invoke(new CentralEntitlements(),response(403,['code'=>'license_revoked']),[],'refresh');
check((new CentralEntitlements())->status()['code']==='license_revoked','Revocation bypassed');


$c=seed_license();$before=$GLOBALS['options'];$GLOBALS['responses']=[new WP_Error()];
(new \PixflowDesign\WordPress\License\LicenseService())->private_license_payload();
check($GLOBALS['options']===$before,'Network exception changed saved data');

$c=seed_license();$method->invoke(new CentralEntitlements(),response(401,['code'=>'invalid_challenge']),[],'keys');
check((new CentralEntitlements())->status()['code']==='invalid_challenge','Unrelated endpoint gained challenge retry');
echo "Licence retention, unreadable-key and bounded challenge recovery checks passed.\n";
