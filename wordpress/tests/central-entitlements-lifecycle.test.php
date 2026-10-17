<?php
declare(strict_types=1);
define('ABSPATH', __DIR__.'/');
define('PIXFLOW_DESIGN_VERSION','test');
define('PIXFLOW_DESIGN_TEMPLATES_API_URL','https://preview.pixflow.dev/api/templates/v1/templates');
define('PIXFLOW_DESIGN_LICENSE_VALIDATION_URL',getenv('QA_LICENSE_URL') ?: 'https://preview.pixflow.dev/wp-json/pixflow-ai/v1/license/validate');
$GLOBALS['site']='http://127.0.0.1:8088';$GLOBALS['environment']='local';$GLOBALS['options']=[];$GLOBALS['transients']=[];$GLOBALS['requests']=[];$GLOBALS['responses']=[];
function site_url($p=''){return $GLOBALS['site'].$p;}function home_url($p=''){return site_url($p);}function wp_get_environment_type(){return $GLOBALS['environment'];}
function wp_parse_url($s,$part=-1){return parse_url($s,$part);}function wp_salt($s){return 'test-salt-'.$s;}
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
use PixflowDesign\WordPress\License\InstallationProof;
use PixflowDesign\WordPress\License\SignedEntitlement;
use PixflowDesign\WordPress\License\LicenseCache;
use PixflowDesign\WordPress\License\SiteIdentity;
use PixflowDesign\WordPress\Security\SecretBox;
$license=new LicenseCache();$siteIdentity=new SiteIdentity();$now=time();
$license->persist($siteIdentity->fingerprint($siteIdentity->current_payload()),'fixture-key',['license_id'=>'native-qa','valid'=>true,'status'=>'active'],PIXFLOW_DESIGN_LICENSE_VALIDATION_URL);
$proof=new InstallationProof();$installation=$proof->load_or_create(CentralEntitlements::authority(),'fixture-key');
check(SecretBox::is_encrypted($installation['private_key']),'Installation private key not encrypted');
$different = $proof->load_or_create(CentralEntitlements::authority(), 'another-fixture-key');
check($different['id'] !== $installation['id'], 'Distinct licenses shared an installation');
check($proof->load_or_create(CentralEntitlements::authority(), 'fixture-key')['id'] === $installation['id'], 'Switching licenses lost the enrolled installation key');
$signer=openssl_pkey_new(['private_key_bits'=>2048,'private_key_type'=>OPENSSL_KEYTYPE_RSA,'config'=>dirname(__DIR__).'/src/License/installation-openssl.cnf']);$pub=openssl_pkey_get_details($signer);
$jwks=['keys'=>[['kid'=>'central','kty'=>'RSA','alg'=>'RS256','use'=>'sig','n'=>SignedEntitlement::encode($pub['rsa']['n']),'e'=>SignedEntitlement::encode($pub['rsa']['e'])]]];
function central_token($audience,$offset=0){global $installation,$signer,$now;
 $header=SignedEntitlement::encode(json_encode(['alg'=>'RS256','typ'=>'pixflow-entitlement+jwt','kid'=>'central']));
 $payload=SignedEntitlement::encode(json_encode(['ver'=>2,'iss'=>CentralEntitlements::authority(),'aud'=>$audience,'sub'=>'native-qa','license_id'=>'native-qa','installation_id'=>$installation['id'],'site_fingerprint'=>'127.0.0.1:8088','cnf'=>['jkt'=>$installation['thumbprint']],'scopes'=>['wordpress:mutate','bridge:mutate','ai:generate','cli:execute','mcp:execute','resources:install'],'iat'=>$now+$offset,'nbf'=>$now+$offset,'exp'=>$now+$offset+900,'refresh_after'=>$now+$offset+300,'offline_until'=>$now+$offset+86400,'access_until'=>$now+$offset+86400,'revocation_version'=>1,'jti'=>'qa-grant']));
 openssl_sign($header.'.'.$payload,$signature,$signer,OPENSSL_ALGO_SHA256);return $header.'.'.$payload.'.'.SignedEntitlement::encode($signature);
}
$challenge=['challenge_id'=>'qa-challenge','nonce'=>'qa-nonce','expires_at'=>$now+120];
$grants=['ok'=>true,'entitlements'=>['wordpress'=>['token'=>central_token('pixflow-design-wordpress-local')],'bridge'=>['token'=>central_token('pixflow-design-bridge')]]];
$GLOBALS['responses']=[response(200,$challenge),response(200,$grants),response(200,$jwks)];
$client=new CentralEntitlements();
// Updating a customer with a saved current-authority key must establish the
// missing signed installation without asking them to paste that key again.
$migrated=(new \PixflowDesign\WordPress\License\LicenseService())->status();
check($migrated['license']['valid']===true && $migrated['central_entitlement']['valid']===true, 'Saved current-authority licence did not recover its missing entitlement');
if (getenv('QA_LICENSE_URL') === 'https://staging.pixflow.dev/api/licensing/v1/validate') {
    foreach ($GLOBALS['requests'] as [$url]) check(str_starts_with($url, 'https://staging.pixflow.dev/'), 'Staged enrollment or signing-key request escaped staging transport');
}
check($client->allows('ai:generate')&&$client->allows('mcp:execute'),'Authorized local scopes denied');
$count=count($GLOBALS['requests']);for($i=0;$i<50;$i++)check($client->allows('wordpress:mutate'),'Warm validation failed');check(count($GLOBALS['requests'])===$count,'Local operations made remote requests');
$status=$client->status();check(!str_contains(json_encode($status),'token')&&!str_contains(json_encode($status),'private'),'UI status contains credentials');
// The Free/Pro transition reads the original signed grant. It must neither
// enroll a new installation nor consume another activation or start a trial.
$preserved_options=$GLOBALS['options'];$preserved_requests=count($GLOBALS['requests']);
$migration_status=(new \PixflowDesign\WordPress\License\LicenseService())->status();
check($migration_status['pro']['eligible']===true,'Existing customer not recognised for Pro');
check($migration_status['pro']['installation']==='missing','Missing Pro should show download guidance');
check($GLOBALS['options']===$preserved_options,'Migration changed existing licence, installation or site allowance');
check(count($GLOBALS['requests'])===$preserved_requests,'Migration re-enrolled an existing customer');
check(!$client->allows('templates:download'),'Local grant authorized hosted template scope');
$stored=get_option('pixflow_design_central_entitlements_v2');$stored['tokens']['wordpress']=SecretBox::encrypt(central_token('pixflow-design-wordpress-local',-901));update_option('pixflow_design_central_entitlements_v2',$stored);
check(!$client->allows('wordpress:mutate'),'Expiry accepted without a real network failure');
$GLOBALS['responses']=[response(503,['code'=>'service_unavailable'])];$client->refresh();check($client->allows('wordpress:mutate'),'Temporary authority outage discarded bounded offline grant');
$GLOBALS['responses']=[response(429,['code'=>'rate_limited'])];$client->refresh();check($client->allows('wordpress:mutate'),'Rate limiting discarded bounded offline grant');
$GLOBALS['responses']=[new WP_Error()];$client->refresh();check($client->allows('wordpress:mutate'),'Bounded offline local operation failed');
$GLOBALS['responses']=[response(403,['code'=>'license_revoked'])];$client->refresh();check(!$client->allows('wordpress:mutate'),'Explicit revocation bypassed');
$GLOBALS['responses']=[new WP_Error()];$client->refresh();check(!$client->allows('wordpress:mutate'),'Network failure erased denial');
$restored=new CentralEntitlements();check(!$restored->allows('wordpress:mutate'),'Recreated service lost denial');
check((new \PixflowDesign\WordPress\License\LicenseService())->status()['pro']['eligible']===false,'Migration restored a revoked entitlement');
$GLOBALS['environment']='production';check(CentralEntitlements::enabled(),'Production must use central entitlements');check(CentralEntitlements::authority()==='https://pixflow.dev','Production must ignore QA issuer override');
echo "Central enrollment/cache/refresh/denial lifecycle passed.\n";



// Authentication must remain available even when the site's product license is denied.
class WP_REST_Request {
    public function __construct(private string|array $method = [], private string|array $route = []) {}
    public function get_method(): string { return is_string($this->method) ? $this->method : 'POST'; }
    public function get_route(): string { return is_string($this->route) ? $this->route : ''; }
    public function get_param($key) { return is_array($this->method) ? ($this->method[$key] ?? null) : null; }
    public function get_header($key) { return is_array($this->route) ? ($this->route[$key] ?? '') : ''; }
}
$authentication_routes = [
    ['GET', 'two-factor/challenge'], ['POST', 'two-factor/challenge'],
    ['DELETE', 'two-factor/challenge'], ['POST', 'two-factor/challenge/email'],
    ['GET', 'two-factor'], ['POST', 'two-factor/totp/begin'],
    ['POST', 'two-factor/totp/verify'], ['POST', 'two-factor/email/begin'],
    ['POST', 'two-factor/email/verify'], ['POST', 'two-factor/passkeys/options'],
    ['POST', 'two-factor/passkeys'], ['DELETE', 'two-factor/passkeys/test-key'],
    ['DELETE', 'two-factor/methods/totp'], ['POST', 'two-factor/recovery-codes'],
    ['POST', 'two-factor/reset'],
];
$authentication_saved_options = $GLOBALS['options'];
foreach (['revoked', 'missing'] as $license_state) {
    if ($license_state === 'missing') $GLOBALS['options'] = [];
    $request_count = count($GLOBALS['requests']);
    foreach ($authentication_routes as [$method, $path]) {
        check($client->authorize_rest(null, [], new WP_REST_Request($method, '/pixflow-design/v1/'.$path)) === null,
            'License '.$license_state.' blocked authentication route '.$path);
    }
    check(count($GLOBALS['requests']) === $request_count, 'Authentication requested a license refresh');
    foreach (['templates', 'fonts/google/install', 'bricks/save'] as $path) {
        check($client->authorize_rest(null, [], new WP_REST_Request('POST', '/pixflow-design/v1/'.$path)) instanceof WP_Error,
            'Authentication exemption opened unrelated route '.$path);
    }
    $prior_error = new WP_Error('existing_denial');
    check($client->authorize_rest($prior_error, [], new WP_REST_Request('POST', '/pixflow-design/v1/two-factor/challenge')) === $prior_error,
        'Authentication exemption erased an existing denial');
}
$GLOBALS['options'] = $authentication_saved_options;
echo "License-independent two-factor route boundary passed.\n";

// Free readiness must never counterfeit a paid entitlement or mutate settings.
foreach (['revoked', 'missing'] as $condition) {
    $GLOBALS['options'] = $condition === 'missing' ? [] : $authentication_saved_options;
    $before = $GLOBALS['options']; $network = count($GLOBALS['requests']);
    $free = (new \PixflowDesign\WordPress\License\LicenseService())->status();
    check($free['requires_license'] === false && $free['runtime_ready'] === true, 'Free runtime blocked: '.$condition);
    check($free['license']['valid'] === false && $free['pro']['eligible'] === false, 'Free promoted an invalid Pro licence');
    foreach (['onboarding/profile','wp-admin/context','wp-admin/direct/sessions','wp-admin/direct/tools','od/projects','od/agents','od/app-config'] as $path)
        check($client->authorize_rest(null, [], new WP_REST_Request('POST', '/pixflow-design/v1/'.$path)) === null, 'Free route licence-gated: '.$path);
    check($before === $GLOBALS['options'] && count($GLOBALS['requests']) === $network, 'Free changed settings or required the licensing network');
}
$GLOBALS['options'] = $authentication_saved_options;
echo "Licence-free status and core routes preserve settings without authority requests.\n";

use PixflowDesign\WordPress\Modules\FeatureContributions;
use PixflowDesign\WordPress\Modules\BuilderIntegrations;
$access = static fn(): bool => (new CentralEntitlements())->allows('wordpress:mutate');
FeatureContributions::authorize_using($access); BuilderIntegrations::authorize_using($access);
FeatureContributions::add('audio', static fn(): string => 'audio');
FeatureContributions::add('planning', static fn(): string => 'planning', ['tools'=>['sitemap.read'=>[]], 'call'=>static fn() => 'called']);
foreach (['bricks','etch','elementor','generateblocks'] as $builder) BuilderIntegrations::add($builder, ['active'=>static fn(): bool => true]);
check(FeatureContributions::all() === [] && BuilderIntegrations::all() === [], 'Expired licence exposes Pro contributions');
try { FeatureContributions::call('sitemap.read', []); throw new RuntimeException('Expired Pro tool executed'); } catch (RuntimeException $error) { check(str_contains($error->getMessage(), 'requires'), 'Wrong denial'); }
$GLOBALS['environment']='local';
$renewed = $authentication_saved_options['pixflow_design_central_entitlements_v2'];
$renewed['denied']=false; $renewed['network_unavailable']=false;
$renewed['tokens']['wordpress']=SecretBox::encrypt(central_token('pixflow-design-wordpress-local'));
$GLOBALS['environment']='local'; update_option('pixflow_design_central_entitlements_v2',$renewed);
check(FeatureContributions::available('audio') && count(BuilderIntegrations::all())===4, 'Renewal failed to restore existing contributions');
check(FeatureContributions::call('sitemap.read', []) === 'called', 'Renewed Pro tool not restored');
echo "Pro contributions deny expiry and restore on renewal without reinstalling.\n";

// Domain eligibility is enforced by the authority. A refusal must preserve the
// site's data and Free access, survive transport errors, and allow later recovery.
$domain_baseline = $GLOBALS['options'];
$domain_codes = ['trial_domain_verification_required', 'trial_domain_used', 'trial_domain_review_required', 'trial_domain_invalid', 'trial_domain_unsupported'];
foreach ($domain_codes as $domain_code) {
    $GLOBALS['options'] = $domain_baseline;
    $GLOBALS['transients'] = [];
    $GLOBALS['options']['pixflow_saved_content_fixture'] = ['title' => 'Existing customer content', 'styles' => ['--brand' => '#123456']];
    $preserved_content = $GLOBALS['options']['pixflow_saved_content_fixture'];
    $preserved_installation = $GLOBALS['options']['pixflow_design_central_entitlements_v2']['installation'];
    $GLOBALS['responses'] = [response(200, $challenge), response(409, ['code' => $domain_code])];
    $domain_client = new CentralEntitlements();
    $domain_client->refresh();
    check(!$domain_client->allows('wordpress:mutate'), 'Domain denial retained Pro access: '.$domain_code);
    check($domain_client->status()['code'] === $domain_code, 'Domain denial code was lost: '.$domain_code);
    $GLOBALS['responses'] = [new WP_Error()];
    $domain_client->refresh();
    check(!(new CentralEntitlements())->allows('wordpress:mutate'), 'Reconnect bypassed domain denial: '.$domain_code);
    $free = (new \PixflowDesign\WordPress\License\LicenseService())->status();
    check($free['runtime_ready'] && !$free['requires_license'] && !$free['pro']['eligible'], 'Domain denial blocked Free or exposed Pro: '.$domain_code);
    check($GLOBALS['options']['pixflow_saved_content_fixture'] === $preserved_content, 'Domain denial altered saved data');
    check($GLOBALS['options']['pixflow_design_central_entitlements_v2']['installation'] === $preserved_installation, 'Domain denial replaced installation keys');
    $GLOBALS['responses'] = [response(200, $challenge), response(200, $grants), response(200, $jwks)];
    $domain_client->refresh();
    check($domain_client->allows('wordpress:mutate'), 'Verified/paid recovery failed: '.$domain_code);
    check($GLOBALS['options']['pixflow_design_central_entitlements_v2']['installation'] === $preserved_installation, 'Recovery replaced installation identity');
    check($GLOBALS['options']['pixflow_saved_content_fixture'] === $preserved_content, 'Recovery altered saved data');

    $GLOBALS['responses'] = [response(409, ['valid' => false, 'access_granted' => false, 'status' => $domain_code,
        'last_error' => $domain_code, 'message' => 'Check trial domain verification in your Pixflow account.'])];
    $denied = (new \PixflowDesign\WordPress\License\LicenseService())->validate('fixture-key');
    check(!$denied['valid'] && !$denied['access_granted'] && $denied['runtime_ready'], 'Native validation ignored domain refusal');
    check($denied['last_error'] === $domain_code && $denied['message'] === 'Check trial domain verification in your Pixflow account.', 'Native validation lost actionable domain feedback');
    check($GLOBALS['options']['pixflow_saved_content_fixture'] === $preserved_content, 'Native validation altered saved data');
}
$GLOBALS['options'] = $domain_baseline;
echo "Trial-domain refusals preserve Free, content and installation identity; signed recovery restores Pro.\n";

// Saved-key upgrade recovery must be bounded and must preserve user data.
$GLOBALS['options'] = $domain_baseline;
unset($GLOBALS['options']['pixflow_design_central_entitlements_v2']);
$GLOBALS['options']['customer_content'] = ['pages'=>['Do not change'], 'preferences'=>['dark'=>true]];
$saved_key_cache = $GLOBALS['options']['pixflow_design_site_license_cache'];
$saved_content = $GLOBALS['options']['customer_content'];
$GLOBALS['transients'] = [];
$GLOBALS['responses'] = [new WP_Error()];
$outage = (new \PixflowDesign\WordPress\License\LicenseService())->status();
check(!$outage['license']['valid'] && $outage['runtime_ready'], 'Failed enrollment promoted Pro or blocked Free');
$pending_installation = $GLOBALS['options']['pixflow_design_central_entitlements_v2']['installation'];
$attempts = count($GLOBALS['requests']);
(new \PixflowDesign\WordPress\License\LicenseService())->status();
check(count($GLOBALS['requests']) === $attempts, 'Status polling retried enrollment during cooldown');
check($GLOBALS['options']['pixflow_design_site_license_cache'] === $saved_key_cache && $GLOBALS['options']['customer_content'] === $saved_content, 'Upgrade outage lost saved licence/content');
$GLOBALS['responses'] = [response(200,$challenge),response(200,$grants),response(200,$jwks)];
check((new CentralEntitlements())->refresh()['ok'], 'Scheduled recovery failed to resume interrupted enrollment');
check(str_ends_with($GLOBALS['requests'][$attempts + 1][0], '/enroll'), 'Interrupted enrollment incorrectly used refresh');
check($GLOBALS['options']['pixflow_design_central_entitlements_v2']['installation'] === $pending_installation, 'Enrollment retry replaced installation identity');
check((new \PixflowDesign\WordPress\License\LicenseService())->status()['license']['valid'], 'Recovered installation did not unlock Pro');
check($GLOBALS['options']['pixflow_design_site_license_cache'] === $saved_key_cache && $GLOBALS['options']['customer_content'] === $saved_content, 'Upgrade recovery changed saved licence/content');

foreach (['license_reset', 'license_revoked', 'trial_access_expired'] as $denial) {
    (new CentralEntitlements())->deny($denial);
    $baseline = $GLOBALS['options']; $attempts = count($GLOBALS['requests']);
    (new \PixflowDesign\WordPress\License\LicenseService())->status();
    check($baseline === $GLOBALS['options'] && count($GLOBALS['requests']) === $attempts, 'Automatic recovery bypassed '.$denial);
}
foreach (['copied_site', 'other_authority', 'expired', 'locked'] as $condition) {
    $GLOBALS['options'] = $domain_baseline; $GLOBALS['transients'] = [];
    unset($GLOBALS['options']['pixflow_design_central_entitlements_v2']);
    if ($condition === 'copied_site') $GLOBALS['options']['pixflow_design_site_license_cache']['site_fingerprint'] = 'another-site';
    if ($condition === 'other_authority') $GLOBALS['options']['pixflow_design_site_license_cache']['validation_url'] = 'https://elsewhere.example/validate';
    if ($condition === 'expired') {
        $GLOBALS['options']['pixflow_design_site_license_cache']['license_expires_at_source'] = 'license_expires_at';
        $GLOBALS['options']['pixflow_design_site_license_cache']['license_expires_at'] = gmdate('c', time()-1);
    }
    if ($condition === 'locked') $GLOBALS['options']['pixflow_design_saved_license_recovery_lock'] = time();
    $baseline = $GLOBALS['options']; $attempts = count($GLOBALS['requests']);
    (new CentralEntitlements())->recover_saved_license();
    check($baseline === $GLOBALS['options'] && count($GLOBALS['requests']) === $attempts, 'Unsafe/duplicate upgrade recovery: '.$condition);
}
echo "Saved licence upgrade/outage/retry/denial/isolation checks passed.\n";
$GLOBALS['options']=$domain_baseline;$GLOBALS['transients']=[];
unset($GLOBALS['options']['pixflow_design_central_entitlements_v2']);
$GLOBALS['deny_during_proof']=true;
$attempts=count($GLOBALS['requests']);
(new CentralEntitlements())->recover_saved_license();
check((new CentralEntitlements())->status()['code']==='license_revoked' && !(new CentralEntitlements())->allows('wordpress:mutate'), 'Concurrent denial overwritten during installation preparation');
check(count($GLOBALS['requests'])===$attempts, 'Changed installation contacted licensing authority');
echo "Concurrent denial during saved licence recovery preserved.\n";
