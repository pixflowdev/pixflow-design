<?php
declare(strict_types=1);
define('ABSPATH', __DIR__ . '/');
function wp_remote_get($url, $args) {
    if ($url !== 'https://api.unsplash.com/photos?page=1&per_page=1' || $args['headers']['Authorization'] !== 'Client-ID valid-key' || $args['redirection'] !== 0) throw new RuntimeException('Unexpected request');
    return $GLOBALS['remote'];
}
function is_wp_error($value) { return $value === false; }
function wp_remote_retrieve_response_code($value) { return $value['status']; }
function wp_remote_retrieve_header($value, $name) { return $value[$name] ?? ''; }
require_once __DIR__ . '/../src/Media/UnsplashConnectionService.php';
$service = new PixflowDesign\WordPress\Media\UnsplashConnectionService();
if ($service->test([])['kind'] !== 'missing_key') throw new RuntimeException('Missing key');
foreach ([200 => 'success', 401 => 'auth_failed', 403 => 'auth_failed', 429 => 'rate_limited', 503 => 'upstream_error'] as $status => $kind) {
    $GLOBALS['remote'] = ['status' => $status, 'x-ratelimit-limit' => '50', 'x-ratelimit-remaining' => '49'];
    $result = $service->test(['apiKey' => ' valid-key ']);
    if ($result['kind'] !== $kind || $result['remaining'] !== 49) throw new RuntimeException('Wrong classification');
}
$GLOBALS['remote'] = false;
if ($service->test(['apiKey' => 'valid-key'])['status'] !== 0) throw new RuntimeException('Transport failure');
echo "Unsplash connection tests passed\n";
