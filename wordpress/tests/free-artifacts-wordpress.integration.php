<?php
declare(strict_types=1);

// Explicit staged acceptance using the real WordPress HTTP transport and current Free client.
// No customer licence, plugin activation or public release pointer is changed.
if (count($argv) !== 3 || !preg_match('/\A[a-f0-9]{64}\z/D', $argv[2])) {
    fwrite(STDERR, "Usage: php free-artifacts-wordpress.integration.php <local WP root> <expected staging Free SHA256>\n");
    exit(2);
}
$qaWpRoot = realpath($argv[1]);
if (!$qaWpRoot || !is_file($qaWpRoot . '/wp-load.php')) throw new RuntimeException('Missing local WordPress');
$fixture = sys_get_temp_dir() . '/pixflow-free-download-' . bin2hex(random_bytes(6));
mkdir($fixture . '/plugins', 0700, true); mkdir($fixture . '/mu-plugins', 0700, true);
define('WP_PLUGIN_DIR', $fixture . '/plugins'); define('WPMU_PLUGIN_DIR', $fixture . '/mu-plugins');
define('DISABLE_WP_CRON', true); define('WP_ADMIN', true);
define('WP_DISABLE_FATAL_ERROR_HANDLER', true);
define('PIXFLOW_DESIGN_LICENSE_VALIDATION_URL', 'https://staging.pixflow.dev/api/licensing/v1/validate');
$_SERVER['HTTP_HOST'] = '127.0.0.1:8088';
$file = null;
$exit_code = 0;
try {
    require $qaWpRoot . '/wp-load.php';
    if (home_url() !== 'http://127.0.0.1:8088') throw new RuntimeException('Only local QA WordPress may run this acceptance check');
    // The staging site's separate HTTP gate is a harness credential, never a plugin licence.
    $basic = getenv('PIXFLOW_DESIGN_STAGING_BASIC_AUTH');
    if ($basic !== false && preg_match('/[\r\n]/', $basic)) throw new RuntimeException('Invalid staging gate credential');
    add_filter('http_request_args', static function ($args, $url) use ($basic) {
        if (str_starts_with($url, 'https://staging.pixflow.dev/api/plugins/v1/free/')) {
            if (isset($args['headers']['Authorization'])) throw new RuntimeException('Product client sent authorization');
            if ($basic) $args['headers']['Authorization'] = 'Basic ' . base64_encode($basic);
        }
        return $args;
    }, 10, 2);
    add_filter('pre_http_request', static function ($pre, $args, $url) {
        if (!str_starts_with($url, 'https://staging.pixflow.dev/api/plugins/v1/free/')) return new WP_Error('qa_network_boundary', 'Only staged Free delivery is permitted');
        if (!empty($args['body']) || !empty($args['redirection'])) throw new RuntimeException('Free download sent a body or allowed redirects');
        return $pre;
    }, 10, 3);
    require dirname(__DIR__) . '/src/License/CentralEntitlements.php';
    require dirname(__DIR__) . '/src/License/FreeArtifacts.php';
    $client = new \PixflowDesign\WordPress\License\FreeArtifacts();
    $artifact = $client->current();
    if (is_wp_error($artifact)) throw new RuntimeException($artifact->get_error_code());
    if ($artifact['version'] !== '2.0.4' || $artifact['sha256'] !== $argv[2]) throw new RuntimeException('Staging is not serving the agreed acceptance candidate');
    $file = $client->download($artifact['download_url']);
    if (is_wp_error($file)) throw new RuntimeException($file->get_error_code());
    if (hash_file('sha256', $file) !== $argv[2]) throw new RuntimeException('Downloaded bytes changed');
    echo json_encode(['passed' => true, 'version' => $artifact['version'], 'artifact_id' => $artifact['artifact_id'], 'bytes' => filesize($file), 'sha256' => $argv[2]], JSON_UNESCAPED_SLASHES) . "\n";
} catch (Throwable $error) {
    fwrite(STDERR, $error->getMessage() . "\n");
    $exit_code = 1;
} finally {
    if (is_string($file) && is_file($file)) unlink($file);
    rmdir($fixture . '/plugins'); rmdir($fixture . '/mu-plugins'); rmdir($fixture);
}
exit($exit_code);
