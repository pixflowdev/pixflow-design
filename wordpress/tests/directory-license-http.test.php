<?php
declare(strict_types=1);

define('ABSPATH', __DIR__ . '/');
class WP_Error { public function __construct(public string $code, public string $message) {} }
function is_wp_error($value): bool { return $value instanceof WP_Error; }
function wp_json_encode($value): string { return json_encode($value, JSON_THROW_ON_ERROR); }
function wp_remote_post($url, $options) { $GLOBALS['requests'][] = [$url, $options]; return $GLOBALS['response']; }
function wp_remote_retrieve_response_code($response) { return $response['response']['code']; }
function wp_remote_retrieve_body($response) { return $response['body']; }
require __DIR__ . '/../directory/LicenseHttpClient.php';

$client = new \PixflowDesign\WordPress\License\LicenseHttpClient();
$payload = ['license_key' => 'fixture-only', 'site_url' => 'https://customer.example/'];
$GLOBALS['requests'] = [];
$GLOBALS['response'] = ['response' => ['code' => 200], 'body' => '{"active":true}'];
$actual = $client->post_json('https://pixflow.dev/validate', $payload);
if ($actual !== ['status' => 200, 'body' => '{"active":true}']) throw new RuntimeException('Successful body/status changed');
[$url, $options] = $GLOBALS['requests'][0];
if ($url !== 'https://pixflow.dev/validate' || $options['timeout'] !== 20 || $options['redirection'] !== 0
    || $options['headers'] !== ['Accept' => 'application/json', 'Content-Type' => 'application/json']
    || json_decode($options['body'], true) !== $payload) throw new RuntimeException('WordPress transport contract changed');
$GLOBALS['response'] = ['response' => ['code' => 403], 'body' => '{"code":"expired"}'];
if ($client->post_json($url, $payload) !== ['status' => 403, 'body' => '{"code":"expired"}']) throw new RuntimeException('HTTP denial changed');
foreach (['TLS certificate verification failed', 'There are no working transports'] as $message) {
    $error = new WP_Error('http_request_failed', $message);
    $GLOBALS['response'] = $error;
    $before = count($GLOBALS['requests']);
    if ($client->post_json($url, $payload) !== $error || count($GLOBALS['requests']) !== $before + 1) throw new RuntimeException('Transport failure was replaced or retried');
}
echo "PASS: directory licensing uses WordPress HTTP, preserves replies/errors, and never retries through a subprocess.\n";
