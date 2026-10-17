<?php
declare(strict_types=1);

// Isolated HTTP/option fixtures exercise the production proof publisher and activation client.
define('ABSPATH', __DIR__ . '/');
define('PIXFLOW_DESIGN_VERSION', 'test');
define('PIXFLOW_DESIGN_LICENSE_VALIDATION_URL', 'https://staging.pixflow.dev/api/licensing/v1/validate');
$GLOBALS['site'] = 'https://customer.example.org';
$GLOBALS['options'] = ['existing_content' => ['blocks' => 'keep'], 'existing_settings' => ['theme' => 'dark']];
$GLOBALS['transients'] = []; $GLOBALS['requests'] = []; $GLOBALS['routes'] = [];
function site_url($p = '') { return $GLOBALS['site'] . $p; }
function home_url($p = '') { return site_url($p); }
function rest_url($p = '') { return site_url('/?rest_route=/' . $p); }
function wp_get_environment_type() { return 'staging'; }
function wp_parse_url($s, $part = -1) { return parse_url($s, $part); }
function wp_salt($s) { return 'test-trial-site-' . $s; }
function get_option($k, $d = false) { return $GLOBALS['options'][$k] ?? $d; }
function update_option($k, $v, $a = false) { $GLOBALS['options'][$k] = $v; return true; }
function add_option($k, $v, $unused = '', $a = false) { if (isset($GLOBALS['options'][$k])) return false; return update_option($k, $v); }
function delete_option($k) { unset($GLOBALS['options'][$k]); return true; }
function get_transient($k) { return $GLOBALS['transients'][$k] ?? false; }
function set_transient($k, $v, $ttl) { $GLOBALS['transients'][$k] = $v; return true; }
function delete_transient($k) { unset($GLOBALS['transients'][$k]); return true; }
function wp_generate_uuid4() { return '11111111-1111-4111-8111-' . bin2hex(random_bytes(6)); }
function esc_url_raw($s) { return $s; }
function untrailingslashit($s) { return rtrim($s, '/'); }
function apply_filters($n, $v) { return $v; }
function wp_json_encode($v) { return json_encode($v); }
function __($s, $domain = '') { return $s; }
function add_query_arg($a, $url) { return $url . '?' . http_build_query($a); }
function wp_next_scheduled($h) { return false; }
function wp_schedule_single_event($at, $h) {}
function add_action($n, $cb, ...$args) { if ($n === 'rest_api_init') $cb(); }
function register_rest_route($ns, $route, $config) { $GLOBALS['routes'][$route] = $config; }
class WP_Error { public function __construct(public string $code = '', public string $message = '', public array $data = []) {} public function get_error_message() { return $this->message; } }
class WP_REST_Request { public function __construct(private array $params = []) {} public function get_param($k) { return $this->params[$k] ?? null; } }
class WP_REST_Response { public function __construct(public $data = null, public $status = 200, public $headers = []) {} }
function is_wp_error($r) { return $r instanceof WP_Error; }
function wp_remote_retrieve_response_code($r) { return $r['status']; }
function wp_remote_retrieve_body($r) { return $r['body']; }
function wp_remote_get($url, $args) { return fixture_request($url, $args); }
function wp_remote_post($url, $args) { return fixture_request($url, $args); }
spl_autoload_register(static function ($name) {
    $prefix = 'PixflowDesign\\WordPress\\';
    if (str_starts_with($name, $prefix)) { $p = dirname(__DIR__) . '/src/' . str_replace('\\', '/', substr($name, strlen($prefix))) . '.php'; if (is_file($p)) require_once $p; }
});
function check($ok, $message) { if (!$ok) throw new RuntimeException($message); }
function reply($code, $body) { return ['status' => $code, 'body' => json_encode($body)]; }

use PixflowDesign\WordPress\License\TrialSiteVerification;
use PixflowDesign\WordPress\License\InstallationProof;
use PixflowDesign\WordPress\License\CentralEntitlements;
use PixflowDesign\WordPress\License\SignedEntitlement;

$service = new TrialSiteVerification();
$service->register();
check(count($GLOBALS['routes']) === 1 && array_values($GLOBALS['routes'])[0]['methods'] === 'GET', 'Proof route must be read-only');
check(is_wp_error($service->proof(new WP_REST_Request(['proof_id' => '../../options']))), 'Invalid proof ID accepted');
check(is_wp_error($service->proof(new WP_REST_Request(['proof_id' => '22222222-2222-4222-8222-222222222222']))), 'Missing proof reflected caller input');

$GLOBALS['signer'] = openssl_pkey_new(['private_key_bits' => 2048, 'config' => dirname(__DIR__) . '/src/License/installation-openssl.cnf']);
$pub = openssl_pkey_get_details($GLOBALS['signer']);
$GLOBALS['jwks'] = ['keys' => [['kid' => 'test', 'kty' => 'RSA', 'alg' => 'RS256', 'n' => SignedEntitlement::encode($pub['rsa']['n']), 'e' => SignedEntitlement::encode($pub['rsa']['e'])]]];
$GLOBALS['mode'] = 'ok'; $GLOBALS['calls'] = 0;
function fixture_token($audience, $installation) {
    $now = time();
    $header = SignedEntitlement::encode(json_encode(['alg' => 'RS256', 'typ' => 'pixflow-entitlement+jwt', 'kid' => 'test']));
    $claims = ['ver' => 2, 'iss' => CentralEntitlements::authority(), 'aud' => $audience, 'sub' => 'trial-qa', 'license_id' => 'trial-qa', 'installation_id' => $installation['id'], 'site_fingerprint' => InstallationProof::site_fingerprint($installation['site_url']), 'cnf' => ['jkt' => $installation['thumbprint']], 'scopes' => ['wordpress:mutate', 'bridge:mutate'], 'iat' => $now, 'nbf' => $now, 'exp' => $now + 900, 'refresh_after' => $now + 300, 'offline_until' => $now + 900, 'access_until' => $now + 3600, 'revocation_version' => 1, 'jti' => 'test'];
    if ($GLOBALS['mode'] === 'wrong-grant') $claims['installation_id'] = 'other';
    $body = SignedEntitlement::encode(json_encode($claims));
    openssl_sign($header . '.' . $body, $sig, $GLOBALS['signer'], OPENSSL_ALGO_SHA256);
    return $header . '.' . $body . '.' . SignedEntitlement::encode($sig);
}
function fixture_request($url, $args) {
    check(str_starts_with($url, 'https://staging.pixflow.dev/api/licensing/'), 'Request escaped staging');
    check(($args['redirection'] ?? null) === 0, 'Redirects enabled');
    $GLOBALS['requests'][] = $url;
    $body = json_decode($args['body'] ?? '{}', true);
    if (str_ends_with($url, '/v1/validate')) {
        $GLOBALS['calls']++;
        if ($GLOBALS['calls'] === 1 || $GLOBALS['mode'] === 'repeat-refusal') {
            $refusal = ['valid' => false, 'status' => 'trial_domain_verification_required', 'last_error' => 'trial_domain_verification_required', 'verification_method' => 'plugin', 'license_id' => 'trial-qa'];
            if ($GLOBALS['mode'] === 'no-marker') unset($refusal['verification_method']);
            if ($GLOBALS['mode'] === 'no-license-id') unset($refusal['license_id']);
            return reply(403, $refusal);
        }
        return reply(200, ['valid' => true, 'access_granted' => true, 'status' => 'active', 'license_id' => 'trial-qa']);
    }
    if (str_ends_with($url, '/challenge')) return reply(200, ['challenge_id' => wp_generate_uuid4(), 'nonce' => 'test-nonce', 'expires_at' => time() + 120]);
    if (str_ends_with($url, '/keys')) return reply(200, $GLOBALS['jwks']);
    $payload = json_decode(SignedEntitlement::decode($body['payload']), true);
    $installation = $GLOBALS['fixtureInstallation'] ?? (new InstallationProof())->load_or_create(CentralEntitlements::authority(), 'private-test-key');
    $purpose = str_ends_with($url, '/enroll') ? 'enroll' : 'verify-site';
    $message = implode("\n", ['pixflow-installation-v2', 'POST', '/api/licensing/v2/' . $purpose, $body['challenge_id'], $body['nonce'], $body['payload']]);
    check(openssl_verify($message, SignedEntitlement::decode($body['signature']), $installation['public_key_pem'], OPENSSL_ALGO_SHA256) === 1, 'Unsigned installation request');
    if (($payload['action'] ?? '') === 'prepare') {
        check($payload['proof_url'] === rest_url('pixflow-design/v1/license/site-proof'), 'Wrong callback URL');
        $proof = ['schema' => 'pixflow.trial-site-proof.v1', 'proof_id' => '22222222-2222-4222-8222-222222222222', 'token' => str_repeat('a', 43), 'installation_id' => $installation['id'], 'site_url' => $GLOBALS['site'], 'key_thumbprint' => $installation['thumbprint'], 'expires_at' => time() + 300];
        if ($GLOBALS['mode'] === 'wrong-site') $proof['site_url'] = 'https://other.example.org';
        if ($GLOBALS['mode'] === 'expired') $proof['expires_at'] = time() - 1;
        if ($GLOBALS['mode'] === 'overlong') $proof['expires_at'] = time() + 86400;
        if ($GLOBALS['mode'] === 'extra-field') $proof['license_key'] = 'should-not-publish';
        return reply(200, ['ok' => true, 'proof_id' => $proof['proof_id'], 'expires_at' => $proof['expires_at'], 'proof' => $proof]);
    }
    if (($payload['action'] ?? '') === 'complete') {
        $response = (new TrialSiteVerification())->proof(new WP_REST_Request(['proof_id' => $payload['proof_id']]));
        check($response instanceof WP_REST_Response && $response->status === 200, 'Stored proof inaccessible across requests');
        check(str_contains($response->headers['Cache-Control'], 'no-store'), 'Proof is cacheable');
        check(count($response->data) === 7 && !str_contains(json_encode($response->data), 'private-test-key'), 'Proof leaks private fields');
        $site = $GLOBALS['site']; $GLOBALS['site'] = 'https://copied.example.org';
        check(is_wp_error((new TrialSiteVerification())->proof(new WP_REST_Request(['proof_id' => $payload['proof_id']]))), 'Cloned site served original proof');
        $GLOBALS['site'] = $site;
        if ($GLOBALS['mode'] === 'network') return new WP_Error('http_request_failed', 'network');
        if ($GLOBALS['mode'] === 'used') return reply(403, ['code' => 'trial_domain_used', 'error' => 'This domain already used a trial.']);
        return reply(200, ['ok' => true, 'verified' => true]);
    }
    check($purpose === 'enroll', 'Unexpected call');
    if (!empty($GLOBALS['denyEnrollOnce'])) {
        $GLOBALS['denyEnrollOnce'] = false;
        return reply(403, ['ok' => false, 'code' => 'trial_domain_verification_required', 'verification_method' => 'plugin', 'license_id' => 'trial-qa']);
    }
    return reply(200, ['ok' => true, 'entitlements' => ['wordpress' => ['token' => fixture_token('pixflow-design-wordpress-local', $installation)], 'bridge' => ['token' => fixture_token('pixflow-design-bridge', $installation)]]]);
}
foreach (['ok', 'wrong-site', 'expired', 'overlong', 'extra-field', 'network', 'used', 'wrong-grant'] as $mode) {
    $GLOBALS['mode'] = $mode;
    $result = $service->verify_and_enroll('private-test-key', 'trial-qa');
    check(($result['ok'] ?? false) === ($mode === 'ok'), 'Unexpected result: ' . $mode);
    check($GLOBALS['transients'] === [], 'Proof leaked after ' . $mode);
    check(!isset($GLOBALS['options']['pixflow_design_central_entitlements_v2']), 'Bootstrap committed unvalidated licence access');
    check($GLOBALS['options']['existing_content'] === ['blocks' => 'keep'] && $GLOBALS['options']['existing_settings'] === ['theme' => 'dark'], 'Saved content changed');
}
echo "Automatic site proof publication, signed requests, strict binding, failure cleanup and preservation passed.\n";
$GLOBALS['mode'] = 'ok';
$result = (new \PixflowDesign\WordPress\License\LicenseService())->validate('private-test-key');
check($result['runtime_ready'] && $result['valid'] && $result['access_granted'], 'Automatic licence retry did not activate');
check($GLOBALS['calls'] === 2, 'Native activation not retried exactly once');
check((new CentralEntitlements())->allows('wordpress:mutate'), 'Final signed permission missing');
check(!array_filter(array_keys($GLOBALS['transients']), fn($k) => str_starts_with($k, 'pixflow_trial_site_proof_')), 'Automatic activation left a public proof');
echo "Native denial, automatic proof, signed enrollment, native retry and cached activation passed.\n";
$old = get_option('pixflow_design_central_entitlements_v2');
$candidate = (new InstallationProof())->create(CentralEntitlements::authority(), 'private-test-key');
$candidate['recovery_license_key'] = \PixflowDesign\WordPress\Security\SecretBox::encrypt('private-test-key');
update_option('pixflow_design_installation_recovery_v1', $candidate);
$GLOBALS['fixtureInstallation'] = $candidate; $GLOBALS['denyEnrollOnce'] = true;
$recovered = (new \PixflowDesign\WordPress\License\InstallationRecovery())->complete(new WP_REST_Request(['installation_id' => $candidate['id']]));
check($recovered instanceof WP_REST_Response && $recovered->data['ok'], 'Recovery automatic proof failed');
check(get_option('pixflow_design_central_entitlements_v2')['installation']['id'] === $candidate['id'], 'Recovery did not use approved candidate');
check($old['installation']['id'] !== $candidate['id'], 'Recovery fixture did not rotate identity');
check((new CentralEntitlements())->allows('wordpress:mutate'), 'Recovered access missing');
check(!array_filter(array_keys($GLOBALS['transients']), fn($k) => str_starts_with($k, 'pixflow_trial_site_proof_')), 'Recovery left a proof');
echo "Approved trial recovery verifies the replacement key before accepting grants.\n";
$previous = get_option('pixflow_design_central_entitlements_v2');
$candidate = (new InstallationProof())->create(CentralEntitlements::authority(), 'private-test-key');
$candidate['recovery_license_key'] = \PixflowDesign\WordPress\Security\SecretBox::encrypt('private-test-key');
update_option('pixflow_design_installation_recovery_v1', $candidate);
$GLOBALS['fixtureInstallation'] = $candidate; $GLOBALS['denyEnrollOnce'] = true; $GLOBALS['mode'] = 'wrong-grant';
$failed = (new \PixflowDesign\WordPress\License\InstallationRecovery())->complete(new WP_REST_Request(['installation_id' => $candidate['id']]));
check(is_wp_error($failed), 'Recovery accepted wrong-key signed grants');
check(get_option('pixflow_design_central_entitlements_v2') === $previous, 'Failed recovery replaced working installation or grants');
check(get_option('pixflow_design_installation_recovery_v1') === $candidate, 'Failed recovery lost retry candidate');
check(!array_filter(array_keys($GLOBALS['transients']), fn($k) => str_starts_with($k, 'pixflow_trial_site_proof_')), 'Failed recovery left public proof');
unset($GLOBALS['fixtureInstallation']);
foreach (['no-marker', 'no-license-id', 'repeat-refusal'] as $mode) {
    $GLOBALS['mode'] = $mode; $GLOBALS['calls'] = 0; $GLOBALS['requests'] = [];
    $result = (new \PixflowDesign\WordPress\License\LicenseService())->validate('private-test-key');
    check(!$result['valid'], 'Invalid native response activated: ' . $mode);
    check($GLOBALS['calls'] === ($mode === 'repeat-refusal' ? 2 : 1), 'Unexpected retry count: ' . $mode);
    if ($mode !== 'repeat-refusal') check(!array_filter($GLOBALS['requests'], fn($url) => str_ends_with($url, '/verify-site')), 'Unrequested automatic verification: ' . $mode);
}
check($GLOBALS['options']['existing_content'] === ['blocks' => 'keep'] && $GLOBALS['options']['existing_settings'] === ['theme' => 'dark'], 'Failure damaged saved data');
echo "Failed recovery preserves the working key; activation requires explicit proof marker and never loops.\n";
