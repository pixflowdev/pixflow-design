<?php
declare(strict_types=1);
ini_set('display_errors', '0');
header('Content-Type: application/json'); header('Cache-Control: no-store'); header('X-Robots-Tag: noindex, nofollow');
// Exact disposable prefix; no source files, activation, writes or arbitrary methods are exposed.
$path = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);
$route = $_GET['rest_route'] ?? '';
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET' || $path !== '/trial-site-qa/' || !is_string($route)
    || !preg_match('#^/pixflow-design/v1/license/site-proof/([a-f0-9-]{36})$#D', $route, $match)) {
    http_response_code(404); echo '{"code":"not_found"}'; return;
}
try {
    require __DIR__ . '/trial-site-proof-bootstrap.php';
    $response = (new \PixflowDesign\WordPress\License\TrialSiteVerification())->proof(new WP_REST_Request(['proof_id' => $match[1]]));
    if (is_wp_error($response)) { http_response_code(404); echo '{"code":"not_found"}'; return; }
    http_response_code($response->status);
    foreach ($response->headers as $name => $value) header($name . ': ' . $value);
    echo json_encode($response->data, JSON_THROW_ON_ERROR);
} catch (Throwable) { http_response_code(500); echo '{"code":"qa_unavailable"}'; }
