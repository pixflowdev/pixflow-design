<?php
declare(strict_types=1);

// Exercise native WordPress discovery without contacting or publishing a release.
$root = getenv('PIXFLOW_QA_WP_ROOT');
$prefix = getenv('PIXFLOW_QA_EXPECTED_PREFIX');
if (!$root || !$prefix || !str_starts_with($prefix, 'qa_')) throw new RuntimeException('Explicit isolated qa_ fixture required.');
$config = file_get_contents(rtrim($root, '/\\') . '/wp-config.php');
if (!is_string($config) || !preg_match('/\$table_prefix\s*=\s*([\'"])([^\'"]+)\1\s*;/', $config, $match) || $match[2] !== $prefix) throw new RuntimeException('Refusing a non-QA WordPress configuration.');
unset($config, $match);
require rtrim($root, '/\\') . '/wp-load.php';
global $wpdb;
if ($wpdb->prefix !== $prefix || PIXFLOW_DESIGN_DISTRIBUTION !== 'directory') throw new RuntimeException('Directory fixture required.');
require_once ABSPATH . 'wp-admin/includes/plugin.php';
require_once ABSPATH . 'wp-includes/update.php';
$basename = 'pixflow-ai/pixflow-ai.php';
$plugins = get_plugins();
if (!isset($plugins[$basename]) || !empty($plugins[$basename]['UpdateURI'])) throw new RuntimeException('Directory plugin retained a private update authority.');
if (is_plugin_active('pixflow-design-pro/pixflow-design-pro.php')) throw new RuntimeException('Run discovery with directory Free alone.');
$original = get_site_transient('update_plugins');
$published = false;
$requests = 0;
$transport = static function($pre, $args, $url) use (&$published, &$requests, $basename, $plugins) {
    if (!str_contains($url, 'api.wordpress.org/plugins/update-check/1.1/')) return $pre;
    $requests++;
    $payload = json_decode((string) ($args['body']['plugins'] ?? ''), true);
    if (!isset($payload['plugins'][$basename])) throw new RuntimeException('Native request lost the existing installed identity.');
    $entry = ['slug'=>'pixflow-ai', 'plugin'=>$basename, 'new_version'=>$published ? '2.0.5' : $plugins[$basename]['Version'], 'package'=>$published ? 'https://downloads.wordpress.org/plugin/pixflow-ai.2.0.5.zip' : ''];
    $body = ['plugins'=>$published ? [$basename=>$entry] : [], 'no_update'=>[], 'translations'=>[]];
    return ['headers'=>['content-type'=>'application/json'], 'body'=>wp_json_encode($body), 'response'=>['code'=>200,'message'=>'OK'], 'cookies'=>[]];
};
add_filter('pre_http_request', $transport, 999, 3);
try {
    delete_site_transient('update_plugins');
    wp_update_plugins();
    $initial = get_site_transient('update_plugins');
    if (!is_object($initial) || !empty($initial->response[$basename]) || $requests !== 1) throw new RuntimeException('An initial unpublished plugin should have no update, not an error.');
    $published = true;
    delete_site_transient('update_plugins');
    wp_update_plugins();
    $updated = get_site_transient('update_plugins');
    $offer = $updated->response[$basename] ?? null;
    if (!is_object($offer) || $offer->new_version !== '2.0.5' || $offer->slug !== 'pixflow-ai' || !str_starts_with($offer->package, 'https://downloads.wordpress.org/')) throw new RuntimeException('Native discovery failed for a simulated published directory update.');
    if ($requests !== 2) throw new RuntimeException('Unexpected discovery request count.');
    echo wp_json_encode(['passed'=>true,'wordpress'=>get_bloginfo('version'),'php'=>PHP_VERSION,'initialNoUpdate'=>true,'laterNativeOffer'=>true,'requests'=>$requests,'downloaded'=>false,'published'=>false], JSON_PRETTY_PRINT);
} finally {
    remove_filter('pre_http_request', $transport, 999);
    if ($original === false) delete_site_transient('update_plugins'); else set_site_transient('update_plugins', $original);
}
