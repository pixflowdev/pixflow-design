<?php
declare(strict_types=1);
define('ABSPATH', __DIR__ . '/');
$GLOBALS['test_site'] = 'http://pixflow-design-test.local';
$GLOBALS['test_options'] = [];
function site_url($path = '') { return $GLOBALS['test_site'] . $path; }
function get_option($key, $default = false) { return $GLOBALS['test_options'][$key] ?? $default; }
function update_option($key, $value, $autoload = false) { $GLOBALS['test_options'][$key] = $value; return true; }
function wp_salt($scheme) { return 'local-key-test-' . $scheme; }
function wp_generate_uuid4() { return bin2hex(random_bytes(16)); }
function wp_parse_url($url, $component = -1) { return parse_url($url, $component); }
function untrailingslashit($url) { return rtrim($url, '/'); }
spl_autoload_register(function ($name) {
    $prefix = 'PixflowDesign\\WordPress\\';
    if (str_starts_with($name, $prefix)) require_once dirname(__DIR__) . '/src/' . str_replace('\\', '/', substr($name, strlen($prefix))) . '.php';
});
$proof = new PixflowDesign\WordPress\License\InstallationProof();
$installation = $proof->create('https://pixflow.dev', 'fixture-key');
$private = PixflowDesign\WordPress\Security\SecretBox::decrypt($installation['private_key']);
if (!PixflowDesign\WordPress\Security\SecretBox::is_encrypted($installation['private_key'])) throw new RuntimeException('Private key must remain encrypted');
$details = openssl_pkey_get_details(openssl_pkey_get_private($private));
if ($details['bits'] !== 2048 || $details['type'] !== OPENSSL_KEYTYPE_RSA) throw new RuntimeException('Wrong key strength or algorithm');
$challenge = ['challenge_id'=>'fixture', 'nonce'=>'fixture-nonce', 'expires_at'=>time()+60];
$envelope = $proof->envelope($installation, 'enroll', $challenge, ['installation_id'=>$installation['id']]);
$message = implode("\n", ['pixflow-installation-v2','POST','/api/licensing/v2/enroll','fixture','fixture-nonce',$envelope['payload']]);
$signature = base64_decode(strtr($envelope['signature'], '-_', '+/'));
if (openssl_verify($message, $signature, $installation['public_key_pem'], OPENSSL_ALGO_SHA256) !== 1) throw new RuntimeException('Proof cannot be verified');
echo "Installation RSA generation, encrypted storage and signed proof passed.\n";
foreach (['skill-catalogue','skill-download'] as $purpose) {
    $payload=['installation_id'=>$installation['id']];
    if ($purpose==='skill-download') $payload['artifact_id']='website-audit-1.0.0-'.str_repeat('a',64);
    $signed=$proof->envelope($installation,$purpose,$challenge,$payload);
    $message=implode("\n",['pixflow-installation-v2','POST','/api/licensing/v2/'.$purpose,'fixture','fixture-nonce',$signed['payload']]);
    $signature=base64_decode(strtr($signed['signature'],'-_','+/'));
    if (openssl_verify($message,$signature,$installation['public_key_pem'],OPENSSL_ALGO_SHA256)!==1) throw new RuntimeException('Skill proof failed');
    if (openssl_verify(str_replace('/'.$purpose,'/download',$message),$signature,$installation['public_key_pem'],OPENSSL_ALGO_SHA256)===1) throw new RuntimeException('Proof crosses purpose boundary');
}
echo "Skill catalogue/download proofs verify and cannot cross operation boundaries.\n";

$proof->store($installation);
$GLOBALS['test_site'] = 'https://pixflow-design-test.local';
$upgraded = $proof->load_or_create('https://pixflow.dev', 'fixture-key');
if ($upgraded['id'] !== $installation['id'] || $upgraded['private_key'] !== $installation['private_key']) throw new RuntimeException('HTTPS upgrade replaced installation identity');
if ($upgraded['site_url'] !== $GLOBALS['test_site']) throw new RuntimeException('HTTPS upgrade kept old URL');
$other = $proof->load_or_create('https://pixflow.dev', 'different-key');
if ($other['id'] === $installation['id']) throw new RuntimeException('HTTPS upgrade crossed licenses');
$GLOBALS['test_site'] = 'https://another-site.local';
$other = $proof->load_or_create('https://pixflow.dev', 'fixture-key');
if ($other['id'] === $installation['id']) throw new RuntimeException('HTTPS upgrade crossed sites');
echo "HTTPS identity preservation and site/license isolation passed.\n";

$GLOBALS['test_site'] = 'http://pixflow-design-test.local';
$recovered = $proof->create('https://pixflow.dev', 'fixture-key');
$GLOBALS['test_options']['pixflow_design_central_entitlements_v2'] = ['installation' => $recovered];
$GLOBALS['test_site'] = 'https://pixflow-design-test.local';
$upgraded = $proof->load_or_create('https://pixflow.dev', 'fixture-key');
if ($upgraded['id'] !== $recovered['id']) throw new RuntimeException('HTTPS upgrade revived an identity superseded by recovery');
echo "HTTPS upgrade preserves the canonical recovered identity.\n";
