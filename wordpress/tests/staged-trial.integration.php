<?php
declare(strict_types=1);

// Explicit real-staging integration: production licensing classes, isolated WordPress
// option/cron shims and real HTTPS. Never loads or changes the user's WordPress database.
// Credentials and encrypted installation state stay in the caller's private .tmp folder.
if (count($argv) !== 3 || !in_array($argv[2], ['active', 'expired', 'paid'], true)) {
    fwrite(STDERR, "Usage: php staged-trial.integration.php <private QA credentials JSON> active|expired|paid\n"); exit(2);
}
$fixture = json_decode(file_get_contents($argv[1]), true, 32, JSON_THROW_ON_ERROR);
if (($fixture['origin'] ?? '') !== 'https://staging.pixflow.dev'
    || ($fixture['validationEndpoint'] ?? '') !== 'https://staging.pixflow.dev/api/licensing/v1/validate'
    || ($fixture['issuer'] ?? '') !== 'https://preview.pixflow.dev') throw new RuntimeException('Only isolated staging credentials accepted');
$state_path = $argv[1] . '.wordpress-state.json';
$state = is_file($state_path) ? json_decode(file_get_contents($state_path), true, 64, JSON_THROW_ON_ERROR) : ['salt' => bin2hex(random_bytes(32)), 'options' => []];
$GLOBALS['options'] = $state['options']; $GLOBALS['transients'] = []; $GLOBALS['requests'] = [];
$GLOBALS['site'] = 'http://pixflow-trial-' . substr(hash('sha256', $fixture['licenseId']), 0, 12) . '.test';
define('ABSPATH', __DIR__ . '/'); define('PIXFLOW_DESIGN_VERSION', '2.0.4');
define('PIXFLOW_DESIGN_CENTRAL_ENTITLEMENTS_V2', true);
define('PIXFLOW_DESIGN_LICENSE_VALIDATION_URL', $fixture['validationEndpoint']);
function site_url($p='') { return $GLOBALS['site'] . $p; } function home_url($p='') { return site_url($p); }
function wp_get_environment_type() { return 'local'; }
function wp_parse_url($s,$part=-1) { return parse_url($s,$part); } function wp_salt($s) { return $GLOBALS['state']['salt'] . $s; }
function get_option($k,$d=false) { return $GLOBALS['options'][$k] ?? $d; }
function update_option($k,$v,$autoload=false) { $GLOBALS['options'][$k]=$v; return true; }
function delete_option($k) { unset($GLOBALS['options'][$k]); return true; }
function add_option($k,$v,$unused='',$autoload=false) { if (array_key_exists($k,$GLOBALS['options'])) return false; $GLOBALS['options'][$k]=$v; return true; }
function get_transient($k) { return $GLOBALS['transients'][$k] ?? false; }
function set_transient($k,$v,$ttl) { $GLOBALS['transients'][$k]=$v; return true; }
function delete_transient($k) { unset($GLOBALS['transients'][$k]); return true; }
function esc_url_raw($s) { return $s; } function untrailingslashit($s) { return rtrim($s,'/'); }
function apply_filters($n,$v) { return $v; } function wp_json_encode($v) { return json_encode($v); }
function add_query_arg($a,$url) { return $url . (str_contains($url,'?') ? '&' : '?') . http_build_query($a); }
function wp_generate_uuid4() { $b=random_bytes(16); $b[6]=chr((ord($b[6])&15)|64); $b[8]=chr((ord($b[8])&63)|128); $h=bin2hex($b); return substr($h,0,8).'-'.substr($h,8,4).'-'.substr($h,12,4).'-'.substr($h,16,4).'-'.substr($h,20); }
function wp_next_scheduled($hook) { return $GLOBALS['scheduled'][$hook] ?? false; }
function wp_schedule_single_event($at,$hook) { $GLOBALS['scheduled'][$hook]=$at; }
class WP_Error { public function __construct(public string $code='',public string $message='',public array $data=[]) {} public function get_error_message() { return $this->message; } }
function is_wp_error($v) { return $v instanceof WP_Error; }
function wp_tempnam($name) { return tempnam(sys_get_temp_dir(),'pf-trial-'); }
function wp_remote_retrieve_response_code($r) { return $r['status']; }
function wp_remote_retrieve_body($r) { return $r['body']; }
function wp_remote_retrieve_header($r,$h) { return $r['headers'][strtolower($h)] ?? ''; }
function wp_remote_get($url,$args) { return qa_request($url,$args,'GET'); }
function wp_remote_post($url,$args) { return qa_request($url,$args,'POST'); }
function wp_safe_remote_get($url,$args) { return qa_request($url,$args,'GET'); }
function qa_request($url,$args,$method) {
    if (!str_starts_with($url,'https://staging.pixflow.dev/api/')) throw new RuntimeException('Request escaped staging boundary');
    if (($args['redirection'] ?? 0) !== 0) throw new RuntimeException('Redirects forbidden');
    $gate=$GLOBALS['fixture']['stagingBasicAuth']; $headers=[]; $response_headers=[];
    foreach ($args['headers'] ?? [] as $key=>$value) $headers[]=$key.': '.$value;
    $headers[]='Authorization: Basic '.base64_encode($gate['username'].':'.$gate['password']);
    $curl=curl_init($url);
    curl_setopt_array($curl,[CURLOPT_CUSTOMREQUEST=>$method,CURLOPT_HTTPHEADER=>$headers,CURLOPT_RETURNTRANSFER=>true,
        CURLOPT_FOLLOWLOCATION=>false,CURLOPT_TIMEOUT=>$args['timeout'] ?? 25,CURLOPT_HEADERFUNCTION=>static function($curl,$line)use(&$response_headers){
            if(str_contains($line,':')) { [$key,$value]=explode(':',$line,2); $response_headers[strtolower(trim($key))]=trim($value); } return strlen($line);
        }]);
    if(isset($args['body'])) curl_setopt($curl,CURLOPT_POSTFIELDS,$args['body']);
    if(getenv('QA_CA_BUNDLE')) curl_setopt($curl,CURLOPT_CAINFO,getenv('QA_CA_BUNDLE'));
    $body=curl_exec($curl); $status=curl_getinfo($curl,CURLINFO_RESPONSE_CODE); $transport_error=curl_error($curl); curl_close($curl);
    $GLOBALS['requests'][]=['path'=>parse_url($url,PHP_URL_PATH),'status'=>$status];
    if($body===false) throw new RuntimeException('Staging HTTPS: '.$transport_error);
    if(isset($args['filename'])) file_put_contents($args['filename'],$body);
    return ['status'=>$status,'body'=>$body,'headers'=>$response_headers];
}
spl_autoload_register(static function($name) {
    $prefix='PixflowDesign\\WordPress\\';
    if(str_starts_with($name,$prefix)) { $path=dirname(__DIR__).'/src/'.str_replace('\\','/',substr($name,strlen($prefix))).'.php'; if(is_file($path)) require_once $path; }
});
function check($ok,$message) { if(!$ok) throw new RuntimeException($message); }

use PixflowDesign\WordPress\License\CentralEntitlements;
use PixflowDesign\WordPress\License\LicenseService;
use PixflowDesign\WordPress\License\CentralArtifacts;
use PixflowDesign\WordPress\License\FreeArtifacts;
use PixflowDesign\WordPress\Security\SecretBox;
use PixflowDesign\WordPress\License\SignedEntitlement;
$phase=$argv[2]; $file=null;
try {
    $before=get_option('pixflow_design_central_entitlements_v2',[]);
    $client=new CentralEntitlements();
    if($phase==='expired') {
        check(!empty($before['installation']['id']),'Active phase must run first');
        $client->refresh(); $status=(new LicenseService())->status();
        check(!$client->allows('wordpress:mutate') && !$status['pro']['eligible'],'Expired trial retains Pro access');
        check($status['runtime_ready'] && !$status['requires_license'],'Expiry blocks Free');
        check(is_wp_error((new CentralArtifacts())->catalog()),'Expired trial retains protected download access');
        check(!is_wp_error((new FreeArtifacts())->current()),'Expired trial cannot discover Free updates');
    } else {
        $status=(new LicenseService())->validate($fixture['licenseKey']);
        check($client->allows('wordpress:mutate') && $status['pro']['eligible'],'Staged trial/payment grant not accepted');
        $current=get_option('pixflow_design_central_entitlements_v2',[]);
        check($current['license_id']===$fixture['licenseId'],'Licence identity changed');
        if(!empty($before['installation']['id'])) check($current['installation']['id']===$before['installation']['id'],'Installation changed across refresh/conversion');
        foreach(['wordpress','bridge'] as $audience) {
            $token=SecretBox::decrypt($current['tokens'][$audience]);
            $claims=json_decode(SignedEntitlement::decode(explode('.',$token)[1]),true,32,JSON_THROW_ON_ERROR);
            if($phase==='active') check($claims['offline_until'] <= strtotime($fixture['expiresAt']) && $claims['access_until'] <= strtotime($fixture['expiresAt']),'Grant outlives trial');
        }
        $artifacts=new CentralArtifacts(); $pro=$artifacts->current('plugin','pixflow-design-pro');
        check(!is_wp_error($pro),'Pro package unavailable to eligible account');
        $file=$artifacts->download($pro['artifact_id'],'plugin'); check(is_string($file),'Real protected Pro bytes could not be verified');
    }
    if(!empty($before['installation']['id'])) check(get_option('pixflow_design_central_entitlements_v2')['installation']['id']===$before['installation']['id'],'Expiry lost saved installation');
    $state['options']=$GLOBALS['options']; file_put_contents($state_path,json_encode($state,JSON_THROW_ON_ERROR));
    echo json_encode(['passed'=>true,'phase'=>$phase,'real_staging_https'=>true,'isolated_option_storage'=>true,'requests'=>$GLOBALS['requests']],JSON_UNESCAPED_SLASHES)."\n";
} catch(Throwable $error) {
    fwrite(STDERR,$error->getMessage()."\n");
    fwrite(STDERR,json_encode($GLOBALS['requests'],JSON_UNESCAPED_SLASHES)."\n");
    $state['options']=$GLOBALS['options']; file_put_contents($state_path,json_encode($state,JSON_THROW_ON_ERROR));
    $failed=true;
} finally {
    if(is_string($file)&&is_file($file)) unlink($file);
}
exit(empty($failed)?0:1);
