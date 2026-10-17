<?php
declare(strict_types=1);
class WP_REST_Response { public function __construct(private array $data, private int $status=200, array $headers=[]) {} public function get_data(){return $this->data;} }
require __DIR__.'/central-entitlements-lifecycle.test.php';
$GLOBALS['environment']='local';
$GLOBALS['recovery_admin']=true;
$GLOBALS['recovery_logged_in']=true;
function is_user_logged_in(){return $GLOBALS['recovery_logged_in'];}
function current_user_can($cap){return $GLOBALS['recovery_admin'];}
function wp_verify_nonce($value,$action){return $value==='fixture-nonce';}

$recovery=new \PixflowDesign\WordPress\License\InstallationRecovery();
check($recovery->can_authorize(new WP_REST_Request([],['x_wp_nonce'=>'fixture-nonce'])),'Administrator nonce denied');
check(!$recovery->can_authorize(new WP_REST_Request()),'Missing-nonce recovery permitted');
check(!$recovery->can_authorize(new WP_REST_Request([],['x_wp_nonce'=>'invalid'])),'Invalid-nonce recovery permitted');
$GLOBALS['recovery_logged_in']=false;
check(!$recovery->can_authorize(new WP_REST_Request([],['x_wp_nonce'=>'fixture-nonce'])),'Anonymous recovery permitted');
$GLOBALS['recovery_logged_in']=true;
$GLOBALS['recovery_admin']=false;
check(!$recovery->can_authorize(new WP_REST_Request([],['x_wp_nonce'=>'fixture-nonce','origin'=>'https://example.test'])),'Nonadministrator recovery permitted');
$GLOBALS['recovery_admin']=true;
$before=get_option('pixflow_design_central_entitlements_v2');
$indexBefore=get_option('pixflow_design_installation_proof_v2');
$public=$recovery->prepare()->get_data();$pending=get_option('pixflow_design_installation_recovery_v1');
check($public['request']['schema']==='pixflow.installation-recovery.v1','Wrong public schema');
check(array_keys($public['request'])===['schema','installation_id','public_key_pem','site_url'],'Recovery leaked fields');
check(!str_contains(json_encode($public),'fixture-key')&&!str_contains(json_encode($public),'private_key'),'Recovery leaked credentials');
check($pending['id']!==$installation['id'],'Recovery reused lost identity');
check(get_option('pixflow_design_installation_proof_v2')===$indexBefore,'Prepare replaced usable key');
check($recovery->prepare()->get_data()['request']===$public['request'],'Prepare rotated pending identity');
check(is_wp_error($recovery->complete(new WP_REST_Request(['installation_id'=>'stale']))),'Stale UI request accepted');
$request=new WP_REST_Request(['installation_id'=>$pending['id']]);
$GLOBALS['responses']=[response(200,$challenge),response(409,['code'=>'installation_conflict'])];
check(is_wp_error($recovery->complete($request)),'Unapproved recovery succeeded');
check(get_option('pixflow_design_central_entitlements_v2')===$before,'Failed recovery mutated central state');
check(get_option('pixflow_design_installation_proof_v2')===$indexBefore,'Failed recovery overwrote key');
$GLOBALS['responses']=[response(200,$challenge),response(200,$grants),response(200,$jwks)];
check(is_wp_error($recovery->complete($request)),'Old identity grant accepted as replacement');
check(get_option('pixflow_design_central_entitlements_v2')===$before,'Invalid replacement grant mutated old state');
$installation=$pending;
$replacement=['entitlements'=>['wordpress'=>['token'=>central_token('pixflow-design-wordpress-local')],'bridge'=>['token'=>central_token('pixflow-design-bridge')]]];
$GLOBALS['responses']=[response(200,$challenge),response(200,$replacement),response(200,$jwks)];
check($recovery->complete($request)->get_data()['ok'],'Approved replacement failed');
check((new \PixflowDesign\WordPress\License\CentralEntitlements())->allows('wordpress:mutate'),'Replacement grant unusable');
check((new \PixflowDesign\WordPress\License\InstallationProof())->load_or_create(\PixflowDesign\WordPress\License\CentralEntitlements::authority(),'fixture-key')['id']===$pending['id'],'Replacement not canonical');
check(get_option('pixflow_design_installation_recovery_v1')===false,'Completed pending key not removed');
update_option('pixflow_design_installation_proof_v2',$indexBefore);
check((new \PixflowDesign\WordPress\License\InstallationProof())->load_or_create(\PixflowDesign\WordPress\License\CentralEntitlements::authority(),'fixture-key')['id']===$pending['id'],'Interrupted index write restored obsolete identity');
echo "Recovery candidate isolation, public export, failed approval preservation, grant binding and canonical commit passed.\n";

// A disabled site's rejected validation leaves no saved credential.
(new \PixflowDesign\WordPress\License\LicenseCache())->clear();
$emptyBefore=get_option('pixflow_design_central_entitlements_v2');
$missing=$recovery->prepare();
check(is_wp_error($missing) && str_contains($missing->get_error_message(), 'Enter your Pixflow license key'), 'Missing key must explain what to enter, not ask for nonexistent approval');
$prepared=$recovery->prepare(new WP_REST_Request(['license_key'=>'fixture-key']));
check(!is_wp_error($prepared),'Entered key must prepare recovery without a saved license');
check((new \PixflowDesign\WordPress\License\LicenseCache())->private_payload()===[],'Preparation must not activate a license');
check(get_option('pixflow_design_central_entitlements_v2')===$emptyBefore,'Preparation changed entitlement');
$pending=get_option('pixflow_design_installation_recovery_v1');
check(\PixflowDesign\WordPress\Security\SecretBox::is_encrypted($pending['recovery_license_key']),'Pending recovery key must be encrypted');
check(!str_contains(json_encode($prepared->get_data()),'fixture-key'),'Public recovery leaked entered key');
$installation=$pending;
$replacement=['entitlements'=>['wordpress'=>['token'=>central_token('pixflow-design-wordpress-local')],'bridge'=>['token'=>central_token('pixflow-design-bridge')]]];
$request=new WP_REST_Request(['installation_id'=>$pending['id']]);
$GLOBALS['responses']=[response(200,$challenge),response(409,['code'=>'installation_conflict'])];
check(is_wp_error($recovery->complete($request)),'Missing-cache recovery bypassed approval');
check((new \PixflowDesign\WordPress\License\LicenseCache())->private_payload()===[],'Failed approval saved active license');
$validated=['license_id'=>'native-qa','valid'=>true,'access_granted'=>true,'status'=>'active'];
$GLOBALS['responses']=[response(200,$challenge),response(200,$replacement),response(200,$jwks),response(200,array_merge($validated,['license_id'=>'wrong-license']))];
check(is_wp_error($recovery->complete($request)),'Mismatched validation and grant accepted');
check((new \PixflowDesign\WordPress\License\LicenseCache())->private_payload()===[],'Invalid grant saved credential');
check(get_option('pixflow_design_central_entitlements_v2')===$emptyBefore,'Invalid grant replaced existing state');
$GLOBALS['responses']=[response(200,$challenge),response(200,$replacement),response(200,$jwks),response(200,$validated)];
check(!is_wp_error($recovery->complete($request)),'Approved missing-cache recovery failed');
check((new \PixflowDesign\WordPress\License\LicenseCache())->private_payload()['license_key']==='fixture-key','Approved recovery did not restore credential');
check((new \PixflowDesign\WordPress\License\CentralEntitlements())->allows('wordpress:mutate'),'Recovered license unusable');
check(!isset(get_option('pixflow_design_central_entitlements_v2')['installation']['recovery_license_key']),'Pending credential retained in installation');
check(get_option('pixflow_design_installation_recovery_v1')===false,'Pending recovery retained after completion');
echo "Missing-cache preparation, encrypted credential, approval denial, license mismatch and approved completion passed.\n";
