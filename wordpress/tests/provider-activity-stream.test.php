<?php

declare(strict_types=1);

define('ABSPATH', __DIR__ . '/');

class WP_REST_Response
{
    public array $headers = [];

    public function __construct(public mixed $data = null, public int $status = 200)
    {
    }

    public function header(string $name, string $value): void
    {
        $this->headers[$name] = $value;
    }
}

function wp_json_encode(mixed $value): string
{
    return (string) json_encode($value, JSON_UNESCAPED_SLASHES);
}

require_once dirname(__DIR__) . '/src/Http/Routes/ProviderSettingsRoutes.php';

use PixflowDesign\WordPress\Http\Routes\ProviderSettingsRoutes;

$service = (new ReflectionClass(ProviderSettingsRoutes::class))->newInstanceWithoutConstructor();
$extract = new ReflectionMethod($service, 'extract_public_reasoning_summary');
$extract->setAccessible(true);

$summary = $extract->invoke($service, 'openai', [
    'choices' => [[
        'message' => [
            'reasoning_content' => 'private chain of thought',
            'reasoning_summary' => 'Checking the WordPress request safely.',
        ],
    ]],
]);
if ($summary !== 'Checking the WordPress request safely.') {
    fwrite(STDERR, "The WordPress BYOK proxy should extract explicit public summaries.\n");
    exit(1);
}

$hidden = $extract->invoke($service, 'openai', [
    'choices' => [['message' => ['reasoning_content' => 'private chain of thought']]],
]);
if ($hidden !== '') {
    fwrite(STDERR, "The WordPress BYOK proxy must not expose raw reasoning content.\n");
    exit(1);
}

$response_method = new ReflectionMethod($service, 'sse_response');
$response_method->setAccessible(true);
$response = $response_method->invoke(
    $service,
    'Visible answer.',
    '',
    'unknown',
    'Checking the WordPress request safely.',
    'provider-model'
);
$body = (string) $response->data;
if (!str_contains($body, "event: start\n") || !str_contains($body, "event: thinking\n") || !str_contains($body, "event: delta\n") || !str_contains($body, "event: end\n")) {
    fwrite(STDERR, "The WordPress BYOK proxy should emit the shared start/thinking/delta/end lifecycle.\n");
    exit(1);
}
if (str_contains($body, 'private chain of thought')) {
    fwrite(STDERR, "Hidden reasoning leaked into the WordPress BYOK SSE response.\n");
    exit(1);
}

echo "Pixflow Design provider activity stream tests passed.\n";
