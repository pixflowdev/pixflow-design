<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\License {
    class CentralEntitlements { public static function delivery_origin(): string { return 'https://staging.pixflow.dev'; } }
}
namespace {
    define('ABSPATH', __DIR__);
    class WP_Error { public function __construct(public string $code, public string $message) {} }
    function is_wp_error($v): bool { return $v instanceof WP_Error; }
    function wp_remote_retrieve_response_code($r) { return $r['status']; }
    function wp_remote_retrieve_body($r) { return json_encode($r['body']); }
    function wp_remote_retrieve_header($r, $h) { return $r['headers'][$h] ?? ''; }
    function wp_tempnam($name) { return tempnam(sys_get_temp_dir(), 'pf-free-'); }
    function wp_safe_remote_get($url, $args) {
        $GLOBALS['requests'][] = [$url, $args];
        if (isset($args['filename'])) {
            check(($args['httpversion'] ?? '') === '1.1' && ($args['headers']['Connection'] ?? '') === 'keep-alive',
                'Free ZIP downloads must avoid the delivery-edge close-connection truncation');
            check(($args['headers']['Accept'] ?? '') === 'application/zip' && ($args['limit_response_size'] ?? null) === strlen('test-package') + 1,
                'Free download must retain its ZIP request and bounded response size');
            file_put_contents($args['filename'], $GLOBALS['bytes']); $GLOBALS['temp'] = $args['filename'];
        }
        return array_shift($GLOBALS['responses']);
    }
    function check(bool $ok, string $why): void { if (!$ok) throw new \RuntimeException($why); }
    require dirname(__DIR__) . '/src/License/FreeArtifacts.php';
    $client = new \PixflowDesign\WordPress\License\FreeArtifacts();
    $GLOBALS['bytes'] = 'test-package'; $GLOBALS['requests'] = [];
    $artifact = ['artifact_id' => 'core-free-204', 'type' => 'plugin', 'slug' => 'pixflow-design', 'edition' => 'free', 'channel' => 'stable', 'version' => '2.0.4', 'sha256' => hash('sha256', $GLOBALS['bytes']), 'bytes' => strlen($GLOBALS['bytes']), 'download_url' => 'https://staging.pixflow.dev/api/plugins/v1/free/download/core-free-204'];
    $metadata = ['status' => 200, 'body' => ['ok' => true, 'schema_version' => 1, 'artifact' => $artifact]];
    $GLOBALS['responses'] = [$metadata]; check($client->current() === $artifact, 'Public Free metadata accepted');
    foreach (['edition' => 'bundled', 'slug' => 'pixflow-design-pro', 'channel' => 'beta', 'download_url' => 'https://evil.test/package.zip', 'bytes' => 999999999, 'artifact_id' => [], 'version' => [], 'sha256' => []] as $key => $value) {
        $bad = $metadata; $bad['body']['artifact'][$key] = $value; $GLOBALS['responses'] = [$bad];
        check(is_wp_error($client->current()), 'Invalid or non-Free package accepted: ' . $key);
    }
    $download = ['status' => 200, 'headers' => ['content-type' => 'application/zip', 'x-pixflow-artifact-sha256' => $artifact['sha256']]];
    $GLOBALS['responses'] = [$metadata, $download]; $file = $client->download($artifact['download_url']);
    check(is_string($file) && file_get_contents($file) === $GLOBALS['bytes'], 'Verified bytes downloaded without licensing'); unlink($file);
    $GLOBALS['bytes'] = 'tampered'; $GLOBALS['responses'] = [$metadata, $download];
    check(is_wp_error($client->download($artifact['download_url'])) && !file_exists($GLOBALS['temp']), 'Corrupt download rejected and temporary file removed');
    $GLOBALS['bytes'] = 'test-package';
    foreach (['content-type' => 'text/html', 'x-pixflow-artifact-sha256' => str_repeat('0', 64)] as $header => $value) {
        $invalid = $download; $invalid['headers'][$header] = $value; $GLOBALS['responses'] = [$metadata, $invalid];
        check(is_wp_error($client->download($artifact['download_url'])) && !file_exists($GLOBALS['temp']), 'Invalid ZIP metadata rejected and temporary file removed: ' . $header);
    }
    $GLOBALS['responses'] = [$metadata]; check(is_wp_error($client->download($artifact['download_url'] . '-old')), 'Stale/non-current package rejected');
    foreach ($GLOBALS['requests'] as [$url, $args]) {
        check($args['redirection'] === 0 && !isset($args['body']) && !isset($args['headers']['Authorization']), 'No redirects, site data or credentials');
    }
    echo "Licence-free artifact metadata and verified download checks passed\n";
}
