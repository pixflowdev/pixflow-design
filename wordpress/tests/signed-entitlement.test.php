<?php
declare(strict_types=1);
define('ABSPATH', __DIR__ . '/');
require dirname(__DIR__) . '/src/License/SignedEntitlement.php';
use PixflowDesign\WordPress\License\SignedEntitlement;
$private=openssl_pkey_new(['private_key_bits'=>2048,'private_key_type'=>OPENSSL_KEYTYPE_RSA]);
$details=openssl_pkey_get_details($private);
$keys=SignedEntitlement::public_keys(['keys'=>[['kid'=>'qa','kty'=>'RSA','n'=>SignedEntitlement::encode($details['rsa']['n']),'e'=>SignedEntitlement::encode($details['rsa']['e'])]]]);
$now=1800000000;
$claims=['ver'=>2,'iss'=>'https://preview.pixflow.dev','aud'=>'pixflow-design-wordpress-local','sub'=>'license','license_id'=>'license','installation_id'=>'installation','site_fingerprint'=>'site','cnf'=>['jkt'=>'key'],'scopes'=>['wordpress:mutate'],'jti'=>'grant','iat'=>$now,'nbf'=>$now,'exp'=>$now+900,'refresh_after'=>$now+300,'offline_until'=>$now+86400,'access_until'=>$now+86400,'revocation_version'=>3];
$identity=array_intersect_key($claims,array_flip(['iss','aud','license_id','installation_id','site_fingerprint']));$identity['key_thumbprint']='key';
function signed_token(array $changes=[],array $headers=[]): string {
    global $private,$claims;
    $h=SignedEntitlement::encode(json_encode(array_merge(['alg'=>'RS256','typ'=>'pixflow-entitlement+jwt','kid'=>'qa'],$headers)));
    $p=SignedEntitlement::encode(json_encode(array_replace($claims,$changes)));
    openssl_sign($h.'.'.$p,$signature,$private,OPENSSL_ALGO_SHA256);
    return $h.'.'.$p.'.'.SignedEntitlement::encode($signature);
}
function check(bool $ok,string $message): void {if(!$ok)throw new RuntimeException($message);}
$v=new SignedEntitlement();$token=signed_token();
check($v->verify($token,$keys,$identity,'wordpress:mutate',$now)===$claims,'Valid signature rejected');
foreach ([['iss'=>'other'],['aud'=>'pixflow-design-bridge'],['installation_id'=>'other'],['site_fingerprint'=>'other'],['license_id'=>'other'],['sub'=>'other'],['cnf'=>['jkt'=>'other']],['scopes'=>['bridge:mutate']],['exp'=>$now+901],['iat'=>$now+61],['nbf'=>$now+61],['offline_until'=>$now+86401],['access_until'=>$now+500]] as $change) check($v->verify(signed_token($change),$keys,$identity,'wordpress:mutate',$now)===null,'Invalid claim accepted');
foreach ([['alg'=>'HS256'],['kid'=>'unknown'],['typ'=>'JWT'],['crit'=>['unknown']]] as $header)check($v->verify(signed_token([],$header),$keys,$identity,'wordpress:mutate',$now)===null,'Invalid header accepted');
check($v->verify($token,$keys,$identity,'wordpress:mutate',$now+900)===null,'Expired grant accepted without network failure');
check($v->verify($token,$keys,$identity,'wordpress:mutate',$now+900,true)!==null,'Bounded offline grant rejected');
check($v->verify($token,$keys,$identity,'wordpress:mutate',$now+86400,true)===null,'Offline grant extended itself');
check($v->verify($token,$keys,$identity,'wordpress:mutate',$now,true,true)===null,'Explicit denial bypassed');
check($v->verify($token,$keys,$identity,'wordpress:mutate',$now,false,false,4)===null,'Revocation version ignored');
check($v->verify($token.'.extra',$keys,$identity,'wordpress:mutate',$now)===null,'Trailing segment accepted');
echo "Signed entitlement PHP verification passed.\n";
