<?php
declare(strict_types=1);

// Explicit disposable staging PHP harness, NOT a substitute for real WordPress acceptance.
// Mount only the router publicly. Private fixtures/state must remain outside the document root.
$fixturePath = getenv('PIXFLOW_TRIAL_QA_FIXTURE') ?: '';
$stateDirectory = getenv('PIXFLOW_TRIAL_QA_STATE_DIR') ?: '';
if (!is_file($fixturePath) || !is_dir($stateDirectory)) throw new RuntimeException('Private QA fixture/state required');
$GLOBALS['qaFixture'] = json_decode(file_get_contents($fixturePath), true, 32, JSON_THROW_ON_ERROR);
$qa = $GLOBALS['qaFixture'];
if (($qa['origin'] ?? '') !== 'https://staging.pixflow.dev'
    || ($qa['siteUrl'] ?? '') !== 'https://staging.pixflow.dev/trial-site-qa'
    || ($qa['validationEndpoint'] ?? '') !== 'https://staging.pixflow.dev/api/licensing/v1/validate'
    || ($qa['issuer'] ?? '') !== 'https://preview.pixflow.dev') throw new RuntimeException('Staging harness boundary mismatch');
$GLOBALS['qaDirectory'] = realpath($stateDirectory);
$GLOBALS['requests'] = [];
define('ABSPATH', __DIR__ . '/'); define('PIXFLOW_DESIGN_VERSION', '2.0.4');
define('PIXFLOW_DESIGN_LICENSE_VALIDATION_URL', $qa['validationEndpoint']);
function site_url($p = '') { return $GLOBALS['qaFixture']['siteUrl'] . $p; }
function home_url($p = '') { return site_url($p); }
function rest_url($p = '') { return site_url('/?rest_route=/' . $p); }
function wp_get_environment_type() { return 'staging'; }
function wp_parse_url($s, $part = -1) { return parse_url($s, $part); }
function qa_path($key) { return $GLOBALS['qaDirectory'] . '/' . hash('sha256', $key) . '.json'; }
function qa_read($key, $default = false) { $p = qa_path($key); return is_file($p) ? json_decode(file_get_contents($p), true, 64, JSON_THROW_ON_ERROR) : $default; }
function qa_write($key, $value) {
    $path = qa_path($key); $tmp = tempnam($GLOBALS['qaDirectory'], 'write-');
    try { file_put_contents($tmp, json_encode($value, JSON_THROW_ON_ERROR)); chmod($tmp, 0600); return rename($tmp, $path); }
    finally { if (is_file($tmp)) unlink($tmp); }
}
function get_option($k, $d = false) { return qa_read('option:' . $k, $d); }
function update_option($k, $v, $a = false) { return qa_write('option:' . $k, $v); }
function delete_option($k) { $p = qa_path('option:' . $k); return !is_file($p) || unlink($p); }
function add_option($k, $v, $unused = '', $a = false) {
    $f = @fopen(qa_path('option:' . $k), 'x'); if (!$f) return false;
    fwrite($f, json_encode($v, JSON_THROW_ON_ERROR)); fclose($f); return true;
}
function get_transient($k) { $r = qa_read('transient:' . $k); return is_array($r) && $r['expires'] > time() ? $r['value'] : false; }
function set_transient($k, $v, $ttl) { return qa_write('transient:' . $k, ['expires' => time() + $ttl, 'value' => $v]); }
function delete_transient($k) { $p = qa_path('transient:' . $k); return !is_file($p) || unlink($p); }
function wp_salt($s) {
    if (get_option('qa_salt') === false) add_option('qa_salt', bin2hex(random_bytes(32)));
    return get_option('qa_salt') . $s;
}
function wp_generate_uuid4() { $b = random_bytes(16); $b[6] = chr((ord($b[6]) & 15) | 64); $b[8] = chr((ord($b[8]) & 63) | 128); $h = bin2hex($b); return substr($h, 0, 8) . '-' . substr($h, 8, 4) . '-' . substr($h, 12, 4) . '-' . substr($h, 16, 4) . '-' . substr($h, 20); }
function esc_url_raw($s) { return $s; }
function untrailingslashit($s) { return rtrim($s, '/'); }
function apply_filters($n, $v) { return $v; }
function wp_json_encode($v) { return json_encode($v); }
function __($s, $domain = '') { return $s; }
function add_query_arg($a, $url) { return $url . '?' . http_build_query($a); }
function wp_next_scheduled($h) { return false; }
function wp_schedule_single_event($at, $h) {}
class WP_Error { public function __construct(public string $code = '', public string $message = '', public array $data = []) {} public function get_error_message() { return $this->message; } }
class WP_REST_Request { public function __construct(private array $params = []) {} public function get_param($k) { return $this->params[$k] ?? null; } }
class WP_REST_Response { public function __construct(public $data = null, public $status = 200, public $headers = []) {} }
function is_wp_error($r) { return $r instanceof WP_Error; }
function wp_remote_retrieve_response_code($r) { return $r['status']; }
function wp_remote_retrieve_body($r) { return $r['body']; }
function wp_remote_get($url, $args) { return qa_http($url, $args, 'GET'); }
function wp_remote_post($url, $args) { return qa_http($url, $args, 'POST'); }
function qa_http($url, $args, $method) {
    if (!str_starts_with($url, 'https://staging.pixflow.dev/api/licensing/') || ($args['redirection'] ?? null) !== 0) throw new RuntimeException('HTTP escaped staging licensing boundary');
    $auth = $GLOBALS['qaFixture']['stagingBasicAuth']; $headers = [];
    foreach ($args['headers'] ?? [] as $k => $v) $headers[] = $k . ': ' . $v;
    $headers[] = 'Authorization: Basic ' . base64_encode($auth['username'] . ':' . $auth['password']);
    $curl = curl_init($url);
    curl_setopt_array($curl, [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_HTTPHEADER => $headers, CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false, CURLOPT_TIMEOUT => $args['timeout'] ?? 20]);
    if (isset($args['body'])) curl_setopt($curl, CURLOPT_POSTFIELDS, $args['body']);
    $body = curl_exec($curl); $status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE); curl_close($curl);
    $GLOBALS['requests'][] = ['path' => parse_url($url, PHP_URL_PATH), 'status' => $status];
    if ($body === false) return new WP_Error('http_request_failed', 'Staging HTTPS failed');
    return ['status' => $status, 'body' => $body];
}
spl_autoload_register(static function ($name) {
    $prefix = 'PixflowDesign\\WordPress\\';
    if (str_starts_with($name, $prefix)) { $p = dirname(__DIR__, 2) . '/src/' . str_replace('\\', '/', substr($name, strlen($prefix))) . '.php'; if (is_file($p)) require_once $p; }
});
