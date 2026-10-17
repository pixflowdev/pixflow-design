<?php
declare(strict_types=1);
define('ABSPATH', __DIR__);
class WP_Error { public function __construct(public string $code, public string $message = '', public mixed $data = null) {} }
function is_wp_error(mixed $value): bool { return $value instanceof WP_Error; }
function wp_parse_url(string $url, int $component = -1): mixed { return parse_url($url, $component); }
function wp_http_validate_url(string $url): bool { return (bool) filter_var($url, FILTER_VALIDATE_URL) && !str_contains($url, '127.0.0.1') && !str_contains($url, '@'); }
function wp_remote_retrieve_response_code(array $response): int { return $response['status']; }
function wp_remote_retrieve_body(array $response): string { return $response['body'] ?? ''; }
function wp_remote_retrieve_header(array $response, string $header): string { return $response['headers'][$header] ?? ''; }
function wp_safe_remote_get(string $url, array $args): array {
    $GLOBALS['requests'][] = ['url' => $url, 'args' => $args];
    return array_shift($GLOBALS['responses']) ?? ['status' => 200, 'body' => 'video'];
}
class WP_Http { public static function make_absolute_url(string $url, string $base): string { return str_starts_with($url, '/') ? 'https://' . parse_url($base, PHP_URL_HOST) . $url : $url; } }
require __DIR__ . '/../src/Media/MediaGenerationService.php';
$type = new ReflectionClass(PixflowDesign\WordPress\Media\MediaGenerationService::class);
$service = $type->newInstanceWithoutConstructor(); $failures = []; $checks = 0;
function check(bool $ok, string $message): void { $GLOBALS['checks']++; if (!$ok) $GLOBALS['failures'][] = $message; }
function download(string $url, string $base, array $replies = []): mixed {
    $GLOBALS['requests'] = []; $GLOBALS['responses'] = $replies;
    return $GLOBALS['type']->getMethod('download_google_asset')->invoke($GLOBALS['service'], $url, $base, 'private-key', 'mp4');
}
$base = 'https://generativelanguage.googleapis.com/v1beta';
download($base . '/files/video', $base);
check(($requests[0]['args']['headers']['x-goog-api-key'] ?? '') === 'private-key', 'Original Google API receives its key');
check(($requests[0]['args']['redirection'] ?? -1) === 0, 'Authenticated downloads must not use automatic redirects');
download('https://cdn.example.com/video?signature=ok', $base);
check(empty($requests[0]['args']['headers']['x-goog-api-key']), 'External signed asset receives no Google key');
download('https://cdn.example.com/video', 'https://provider.example.com/v1');
check(empty($requests[0]['args']['headers']['authorization']), 'External asset receives no proxy bearer key');
download($base . '/files/video', $base, [['status' => 302, 'headers' => ['location' => 'https://cdn.example.com/video']], ['status' => 200, 'body' => 'video']]);
check(count($requests) === 2 && empty($requests[1]['args']['headers']['x-goog-api-key']), 'Cross-origin redirect drops key');
download($base . '/files/video', $base, [['status' => 307, 'headers' => ['location' => '/v1beta/files/final']], ['status' => 200, 'body' => 'video']]);
check(count($requests) === 2 && ($requests[1]['args']['headers']['x-goog-api-key'] ?? '') === 'private-key', 'Relative same-origin redirect retains key');
download('https://generativelanguage.googleapis.com:444/video', $base);
check(empty($requests[0]['args']['headers']['x-goog-api-key']), 'A different port is a different credential origin');
$result = download($base . '/files/video', $base, [['status' => 302, 'headers' => ['location' => 'http://generativelanguage.googleapis.com/video']]]);
check(is_wp_error($result) && count($requests) === 1, 'Reject HTTPS downgrade before requesting');
$result = download($base . '/files/video', $base, [['status' => 302, 'headers' => ['location' => 'http://127.0.0.1/private']]]);
check(is_wp_error($result) && count($requests) === 1, 'Reject unsafe redirect before requesting');
$result = download($base . '/files/video', $base, array_fill(0, 6, ['status' => 302, 'headers' => ['location' => '/loop']]));
check(is_wp_error($result) && count($requests) === 4, 'Bound redirects to three hops');
$result = download($base . '/files/video', $base, [['status' => 200, 'body' => 'exact-video-bytes']]);
check($result === ['bytes' => 'exact-video-bytes', 'extension' => 'mp4'], 'Preserve successful media output');
if ($failures) { fwrite(STDERR, implode("\n", $failures) . "\n"); exit(1); }
echo "media-download-credentials: $checks checks passed\n";
