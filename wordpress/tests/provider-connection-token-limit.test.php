<?php
declare(strict_types=1);
define('ABSPATH', __DIR__);
function wp_parse_url($url, $component = -1) { return parse_url($url, $component); }
function add_query_arg($key, $value, $url) { return $url . (str_contains($url, '?') ? '&' : '?') . urlencode($key) . '=' . urlencode($value); }
require __DIR__ . '/../src/Http/Routes/ProviderSettingsRoutes.php';
$class = new ReflectionClass(\PixflowDesign\WordPress\Http\Routes\ProviderSettingsRoutes::class);
$routes = $class->newInstanceWithoutConstructor();
$method = $class->getMethod('provider_test_call');
foreach (['openai', 'azure', 'anthropic', 'senseaudio', 'aihubmix'] as $protocol) {
    $call = $method->invoke($routes, $protocol, 'https://example.test/v1', 'fixture-key', 'gpt-6-luna', '');
    $expected = in_array($protocol, ['openai', 'azure'], true) ? 'max_completion_tokens' : 'max_tokens';
    $wrong = $expected === 'max_tokens' ? 'max_completion_tokens' : 'max_tokens';
    if (($call['body'][$expected] ?? 0) !== 8 || isset($call['body'][$wrong])) throw new RuntimeException("$protocol uses the wrong connection-test token parameter");
}
echo "Provider connection-test token contracts passed.\n";

$completion = $class->getMethod('provider_completion_call');
foreach (['openai', 'azure', 'anthropic', 'senseaudio', 'aihubmix'] as $protocol) {
    $call = $completion->invoke($routes, $protocol, 'https://example.test/v1', 'fixture-key', 'gpt-6-luna', '', 'Keep this instruction', [['role'=>'user','content'=>'Hello']], 2048);
    $expected = in_array($protocol, ['openai', 'azure'], true) ? 'max_completion_tokens' : 'max_tokens';
    $wrong = $expected === 'max_tokens' ? 'max_completion_tokens' : 'max_tokens';
    if (($call['body'][$expected] ?? 0) !== 2048 || isset($call['body'][$wrong])) throw new RuntimeException("$protocol uses the wrong Workspace completion token parameter");
    if (($call['body']['messages'][array_key_last($call['body']['messages'])]['content'] ?? '') !== 'Hello') throw new RuntimeException('Message lost');
}
echo "Workspace completion token contracts passed.\n";
$google = $class->getMethod('google_generate_content_url');
foreach ([
    'https://generativelanguage.googleapis.com' => 'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent',
    'https://generativelanguage.googleapis.com/v1beta/' => 'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent',
    'https://provider.example/proxy/v1' => 'https://provider.example/proxy/v1/models/gemini-test:generateContent',
] as $base => $expected) {
    if ($google->invoke($routes, $base, 'models/gemini-test') !== $expected) throw new RuntimeException('Google generation must preserve versioned base paths without duplication');
}
echo "Google generation base paths remain version-idempotent.\n";
