<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Http\Routes;

use PixflowDesign\WordPress\Providers\ProviderSettingsRepository;

if (!defined('ABSPATH')) {
    exit;
}

final class ProviderSettingsRoutes
{
    private const NAMESPACE = 'pixflow-design/v1';
    private const AIHUBMIX_APP_CODE = 'DMCY9912';
    private const PROVIDER_TIMEOUT = 30;
    private const PROVIDER_MAX_TOKENS = 8;

    public function __construct(
        private readonly ProviderSettingsRepository $settings = new ProviderSettingsRepository(),
    ) {
    }

    public function register(): void
    {
        add_action('rest_api_init', [$this, 'register_routes']);

    }

    public function register_routes(): void
    {
        register_rest_route(self::NAMESPACE, '/provider-settings', [
            [
                'methods' => 'GET',
                'callback' => [$this, 'get'],
                'permission_callback' => [$this, 'can_use_provider_settings'],
            ],
            [
                'methods' => ['POST', 'PUT', 'PATCH'],
                'callback' => [$this, 'save'],
                'permission_callback' => [$this, 'can_use_provider_settings'],
            ],
        ]);

        register_rest_route(self::NAMESPACE, '/provider/models', [
            [
                'methods' => 'POST',
                'callback' => [$this, 'models'],
                'permission_callback' => [$this, 'can_use_provider_settings'],
            ],
        ]);

        register_rest_route(self::NAMESPACE, '/provider/test', [
            [
                'methods' => 'POST',
                'callback' => [$this, 'test_provider'],
                'permission_callback' => [$this, 'can_use_provider_settings'],
            ],
        ]);

        register_rest_route(self::NAMESPACE, '/provider/proxy/(?P<protocol>[a-z0-9_-]+)/stream', [
            [
                'methods' => 'POST',
                'callback' => [$this, 'proxy_stream'],
                'permission_callback' => [$this, 'can_use_provider_settings'],
            ],
        ]);
    }

    public function can_use_provider_settings(): bool
    {
        return current_user_can('edit_posts');
    }

    public function get(): \WP_REST_Response
    {
        return $this->response([
            'ok' => true,
            'runtime' => 'wordpress',
            'settings' => $this->settings->get(),
        ]);
    }

    public function save(\WP_REST_Request $request): \WP_REST_Response
    {
        $body = $request->get_json_params();
        $settings = is_array($body) && is_array($body['settings'] ?? null)
            ? $body['settings']
            : (is_array($body) ? $body : []);

        return $this->response([
            'ok' => true,
            'runtime' => 'wordpress',
            'settings' => $this->settings->save($settings),
        ]);
    }

    public function models(\WP_REST_Request $request): \WP_REST_Response
    {
        $start = microtime(true);
        $body = $request->get_json_params();
        $input = is_array($body) ? $body : [];
        $protocol = sanitize_key((string) ($input['protocol'] ?? ''));
        $base_url = $this->normalize_base_url((string) ($input['baseUrl'] ?? ''));
        $api_key = (string) ($input['apiKey'] ?? '');

        if ($protocol === 'azure') {
            return $this->provider_response([
                'ok' => false,
                'kind' => 'unsupported_protocol',
                'latencyMs' => $this->latency_ms($start),
                'detail' => 'Azure OpenAI deployment discovery is not supported from the inference endpoint.',
            ]);
        }

        $validation = $this->validate_provider_base_url($base_url);
        if ($validation !== null) {
            return $this->provider_response([
                'ok' => false,
                'kind' => $validation['kind'],
                'latencyMs' => $this->latency_ms($start),
                'detail' => $validation['detail'],
            ]);
        }

        $url = $this->provider_models_url($protocol, $base_url, $api_key);
        if ($url === '') {
            return $this->provider_response([
                'ok' => false,
                'kind' => 'unsupported_protocol',
                'latencyMs' => $this->latency_ms($start),
                'detail' => 'Unsupported provider protocol.',
            ]);
        }

        $remote = $this->remote_request($url, [
            'method' => 'GET',
            'headers' => $this->provider_models_headers($protocol, $api_key),
        ]);

        if (is_wp_error($remote)) {
            return $this->provider_response([
                'ok' => false,
                'kind' => 'unknown',
                'latencyMs' => $this->latency_ms($start),
                'detail' => $this->redact($remote->get_error_message(), [$api_key]),
            ]);
        }

        $status = (int) wp_remote_retrieve_response_code($remote);
        $raw = (string) wp_remote_retrieve_body($remote);
        $data = $this->decode_json($raw);
        if ($status < 200 || $status >= 300) {
            return $this->provider_response([
                'ok' => false,
                'kind' => $this->status_to_kind($status),
                'latencyMs' => $this->latency_ms($start),
                'status' => $status,
                'detail' => $this->redact($this->provider_error_detail($data, $raw), [$api_key]),
            ]);
        }

        if ($data === null && trim($raw) !== '') {
            return $this->provider_response([
                'ok' => false,
                'kind' => 'unknown',
                'latencyMs' => $this->latency_ms($start),
                'status' => $status,
                'detail' => 'Provider returned invalid JSON.',
            ]);
        }

        $models = $this->extract_provider_models($protocol, is_array($data) ? $data : []);
        if ($models === []) {
            return $this->provider_response([
                'ok' => false,
                'kind' => 'no_models',
                'latencyMs' => $this->latency_ms($start),
                'status' => $status,
                'detail' => 'Provider returned no usable text-generation models.',
            ]);
        }

        return $this->provider_response([
            'ok' => true,
            'kind' => 'success',
            'latencyMs' => $this->latency_ms($start),
            'status' => $status,
            'models' => $models,
        ]);
    }

    public function test_provider(\WP_REST_Request $request): \WP_REST_Response
    {
        $start = microtime(true);
        $body = $request->get_json_params();
        $input = is_array($body) ? $body : [];
        $protocol = sanitize_key((string) ($input['protocol'] ?? ''));
        $base_url = $this->normalize_base_url((string) ($input['baseUrl'] ?? ''));
        $api_key = (string) ($input['apiKey'] ?? '');
        $model = sanitize_text_field((string) ($input['model'] ?? ''));
        $api_version = sanitize_text_field((string) ($input['apiVersion'] ?? ''));

        $validation = $this->validate_provider_base_url($base_url);
        if ($validation !== null) {
            return $this->provider_response([
                'ok' => false,
                'kind' => $validation['kind'],
                'latencyMs' => $this->latency_ms($start),
                'model' => $model,
                'detail' => $validation['detail'],
            ]);
        }

        $call = $this->provider_test_call($protocol, $base_url, $api_key, $model, $api_version);
        if ($call === null) {
            return $this->provider_response([
                'ok' => false,
                'kind' => 'unknown',
                'latencyMs' => $this->latency_ms($start),
                'model' => $model,
                'detail' => 'Unsupported provider protocol.',
            ]);
        }

        $remote = $this->remote_request($call['url'], [
            'method' => 'POST',
            'headers' => $call['headers'],
            'body' => wp_json_encode($call['body']),
        ]);

        if (is_wp_error($remote)) {
            return $this->provider_response([
                'ok' => false,
                'kind' => 'unknown',
                'latencyMs' => $this->latency_ms($start),
                'model' => $model,
                'detail' => $this->redact($remote->get_error_message(), [$api_key]),
            ]);
        }

        $status = (int) wp_remote_retrieve_response_code($remote);
        $raw = (string) wp_remote_retrieve_body($remote);
        $data = $this->decode_json($raw);
        if ($status < 200 || $status >= 300) {
            $detail = $this->redact($this->provider_error_detail($data, $raw), [$api_key]);
            return $this->provider_response([
                'ok' => false,
                'kind' => $this->status_to_kind($status, $detail),
                'latencyMs' => $this->latency_ms($start),
                'model' => $model,
                'status' => $status,
                'detail' => $detail !== '' ? $detail : ($status === 404 ? 'HTTP 404 from provider; check the Base URL path.' : ''),
            ]);
        }

        $inspection = $this->inspect_provider_completion($protocol, is_array($data) ? $data : [], $model);
        if (!$inspection['valid']) {
            return $this->provider_response([
                'ok' => false,
                'kind' => $inspection['kind'] ?? 'unknown',
                'latencyMs' => $this->latency_ms($start),
                'model' => $model,
                'status' => $status,
                'detail' => $inspection['detail'] ?? 'Provider returned a 2xx response without assistant text',
            ]);
        }

        return $this->provider_response([
            'ok' => true,
            'kind' => 'success',
            'latencyMs' => $this->latency_ms($start),
            'model' => $model,
            'status' => $status,
            'sample' => $inspection['sample'] ?? 'valid completion',
        ]);
    }

    public function proxy_stream(\WP_REST_Request $request): \WP_REST_Response
    {
        $body = $request->get_json_params();
        $input = is_array($body) ? $body : [];
        $protocol = sanitize_key((string) $request->get_param('protocol'));
        $base_url = $this->normalize_base_url((string) ($input['baseUrl'] ?? ''));
        $api_key = (string) ($input['apiKey'] ?? '');
        $model = sanitize_text_field((string) ($input['model'] ?? ''));
        $system = (string) ($input['systemPrompt'] ?? '');
        $messages = is_array($input['messages'] ?? null) ? $input['messages'] : [];
        $max_tokens = isset($input['maxTokens']) && is_numeric($input['maxTokens'])
            ? max(1, (int) $input['maxTokens'])
            : 1024;
        $api_version = sanitize_text_field((string) ($input['apiVersion'] ?? ''));

        $validation = $this->validate_provider_base_url($base_url);
        if ($validation !== null) {
            return $this->sse_response('', $validation['detail'], 'invalid_base_url');
        }

        $call = $this->provider_completion_call($protocol, $base_url, $api_key, $model, $api_version, $system, $messages, $max_tokens);
        if ($call === null) {
            return $this->sse_response('', 'Unsupported provider protocol.', 'unknown');
        }

        $remote = $this->remote_request($call['url'], [
            'method' => 'POST',
            'headers' => $call['headers'],
            'body' => wp_json_encode($call['body']),
        ]);
        if (is_wp_error($remote)) {
            return $this->sse_response('', $this->redact($remote->get_error_message(), [$api_key]), 'unknown');
        }

        $status = (int) wp_remote_retrieve_response_code($remote);
        $raw = (string) wp_remote_retrieve_body($remote);
        $data = $this->decode_json($raw);
        if ($status < 200 || $status >= 300) {
            return $this->sse_response('', $this->redact($this->provider_error_detail($data, $raw), [$api_key]), $this->status_to_kind($status));
        }

        $text = $this->extract_completion_text($protocol, is_array($data) ? $data : []);
        if ($text === '') {
            return $this->sse_response('', 'Provider returned a 2xx response without assistant text.', 'unknown');
        }

        $summary = $this->extract_public_reasoning_summary($protocol, is_array($data) ? $data : []);

        return $this->sse_response($text, '', 'unknown', $summary, $model);
    }

    /** Called through an authenticated administrator-owned direct site session. */
    public function provider_call(string $protocol, string $base, string $model, array $input): array
    {
        $call=$this->provider_completion_call($protocol,$base,'',$model,'',(string)($input['system'] ?? ''),$input['messages'] ?? [],max(256,min(32768,(int)($input['maxTokens'] ?? 8192))));
        if (!$call) throw new \InvalidArgumentException('Unsupported provider protocol.');
        $call=\PixflowDesign\WordPress\Providers\ProviderAgentTurn::prepare($call,$protocol,$input['turns'] ?? [],$input['results'] ?? [],$input['images'] ?? []);
        if (($input['siteTools'] ?? true) === false) unset($call['body']['tools']);
        return $call;
    }

    /** Called through an authenticated administrator-owned direct site session. */
    public function agent_turn(array $input): array
    {
        $protocol = sanitize_key((string) ($input['apiProtocol'] ?? 'anthropic'));
        $base = $this->normalize_base_url((string) ($input['baseUrl'] ?? ''));
        if ($error = $this->validate_provider_base_url($base)) throw new \RuntimeException($error['detail']);
        $key = (string) ($input['apiKey'] ?? '');
        $call = $this->provider_completion_call($protocol,$base,$key,(string)($input['model'] ?? ''),(string)($input['apiVersion'] ?? ''),(string)($input['system'] ?? ''),$input['messages'] ?? [],max(1,(int)($input['maxTokens'] ?? 8192)));
        if (!$call) throw new \RuntimeException('Unsupported provider protocol.');
        // Official OpenAI uses Responses for native reasoning and tool continuity.
        // OpenAI-compatible custom providers retain their advertised chat protocol.
        if ($protocol === 'openai' && strtolower((string) wp_parse_url($base, PHP_URL_HOST)) === 'api.openai.com') $protocol = 'openai-responses';
        $call = \PixflowDesign\WordPress\Providers\ProviderAgentTurn::prepare($call,$protocol,$input['turns'] ?? [],$input['results'] ?? [],$input['images'] ?? []);
        if (($input['siteTools'] ?? true) === false) unset($call['body']['tools']);
        if (($input['contextSummary'] ?? false) === true) $call = \PixflowDesign\WordPress\Providers\ProviderAgentTurn::summary_call($call);
        // Agent turns may include reasoning and several tool calls. Connection
        // tests keep their shorter timeout; a valid agent response gets time to finish.
        $remote = $this->remote_request($call['url'],['method'=>'POST','headers'=>$call['headers'],'body'=>wp_json_encode($call['body']),'timeout'=>120]);
        if (is_wp_error($remote)) throw new \RuntimeException($this->redact($remote->get_error_message(),[$key]));
        $status = (int) wp_remote_retrieve_response_code($remote);
        $raw = (string) wp_remote_retrieve_body($remote); $data = $this->decode_json($raw);
        if ($status < 200 || $status >= 300) throw new \RuntimeException($this->redact($this->provider_error_detail($data,$raw),[$key]));
        return \PixflowDesign\WordPress\Providers\ProviderAgentTurn::read($call,$protocol,is_array($data)?$data:[]);
    }

    /** Same account/protocol as the run, but no site tools or active-turn continuation. */
    public function summarize(array $provider, string $system, string $text): string
    {
        $input = array_intersect_key($provider, array_flip(['apiProtocol', 'baseUrl', 'apiKey', 'model', 'apiVersion']));
        $result = $this->agent_turn($input + ['system' => $system, 'messages' => [['role' => 'user', 'content' => $text]],
            'maxTokens' => 4096, 'siteTools' => false, 'contextSummary' => true]);
        if ($result['calls']) throw new \RuntimeException('A continuation note cannot run tools.');
        return $result['text'];
    }

    private function response(array $payload, int $status = 200): \WP_REST_Response
    {
        return new \WP_REST_Response($payload, $status);
    }

    private function text_response(string $body, string $content_type = 'text/plain; charset=utf-8', int $status = 200): \WP_REST_Response
    {
        $response = new \WP_REST_Response($body, $status);
        $response->header('X-Pixflow-Raw-Text', '1');
        $response->header('Content-Type', $content_type);

        return $response;
    }

    private function sse_response(
        string $delta,
        string $error = '',
        string $kind = 'unknown',
        string $thinking_summary = '',
        string $model = ''
    ): \WP_REST_Response
    {
        $frames = "event: start\n";
        $frames .= 'data: ' . wp_json_encode(['model' => $model]) . "\n\n";
        if ($error !== '') {
            $frames .= "event: error\n";
            $frames .= 'data: ' . wp_json_encode(['message' => $error, 'kind' => $kind]) . "\n\n";
        } else {
            if ($thinking_summary !== '') {
                $frames .= "event: thinking\n";
                $frames .= 'data: ' . wp_json_encode(['delta' => $thinking_summary]) . "\n\n";
            }
            $frames .= "event: delta\n";
            $frames .= 'data: ' . wp_json_encode(['delta' => $delta]) . "\n\n";
            $frames .= "event: end\n";
            $frames .= "data: {}\n\n";
        }

        return $this->text_response($frames, 'text/event-stream; charset=utf-8');
    }

    /**
     * Return only provider-declared public summaries. Raw reasoning/thinking
     * fields are deliberately excluded from the browser-visible stream.
     */
    private function extract_public_reasoning_summary(string $protocol, array $data): string
    {
        if (in_array($protocol, ['openai', 'azure', 'senseaudio', 'aihubmix'], true)) {
            $choices = is_array($data['choices'] ?? null) ? $data['choices'] : [];
            $first = is_array($choices[0] ?? null) ? $choices[0] : [];
            $message = is_array($first['message'] ?? null) ? $first['message'] : [];
            foreach (['reasoning_summary', 'thinking_summary'] as $key) {
                if (is_string($message[$key] ?? null) && trim($message[$key]) !== '') {
                    return substr(trim($message[$key]), 0, 16000);
                }
            }
            return '';
        }
        if ($protocol === 'anthropic') {
            $blocks = is_array($data['content'] ?? null) ? $data['content'] : [];
            foreach ($blocks as $block) {
                if (!is_array($block) || !in_array((string) ($block['type'] ?? ''), ['thinking_summary', 'reasoning_summary'], true)) {
                    continue;
                }
                $value = is_string($block['text'] ?? null) ? $block['text'] : (is_string($block['summary'] ?? null) ? $block['summary'] : '');
                if (trim($value) !== '') {
                    return substr(trim($value), 0, 16000);
                }
            }
            return '';
        }
        if ($protocol === 'google') {
            $candidates = is_array($data['candidates'] ?? null) ? $data['candidates'] : [];
            $content = is_array($candidates[0]['content'] ?? null) ? $candidates[0]['content'] : [];
            $parts = is_array($content['parts'] ?? null) ? $content['parts'] : [];
            foreach ($parts as $part) {
                if (!is_array($part) || (($part['thoughtSummary'] ?? false) !== true && ($part['type'] ?? '') !== 'reasoning_summary')) {
                    continue;
                }
                if (is_string($part['text'] ?? null) && trim($part['text']) !== '') {
                    return substr(trim($part['text']), 0, 16000);
                }
            }
        }

        return '';
    }

    private function provider_response(array $payload): \WP_REST_Response
    {
        return $this->response($payload);
    }

    private function latency_ms(float $start): int
    {
        return max(0, (int) round((microtime(true) - $start) * 1000));
    }

    private function normalize_base_url(string $base_url): string
    {
        return rtrim(trim($base_url), '/');
    }

    private function validate_provider_base_url(string $base_url): ?array
    {
        if ($base_url === '' || !wp_http_validate_url($base_url)) {
            return ['kind' => 'invalid_base_url', 'detail' => 'Invalid baseUrl'];
        }
        $scheme = strtolower((string) wp_parse_url($base_url, PHP_URL_SCHEME));
        if (!in_array($scheme, ['http', 'https'], true)) {
            return ['kind' => 'invalid_base_url', 'detail' => 'Only http/https allowed'];
        }

        return null;
    }

    private function append_versioned_api_path(string $base_url, string $suffix): string
    {
        $parts = wp_parse_url($base_url);
        $path = rtrim((string) ($parts['path'] ?? ''), '/');
        $path = preg_match('#/v\d+($|/)#', $path) ? $path . $suffix : $path . '/v1' . $suffix;

        return $this->build_url($parts, $path);
    }

    private function build_url(array $parts, string $path): string
    {
        $scheme = (string) ($parts['scheme'] ?? 'https');
        $host = (string) ($parts['host'] ?? '');
        $port = isset($parts['port']) ? ':' . (string) $parts['port'] : '';
        $query = isset($parts['query']) && $parts['query'] !== '' ? '?' . (string) $parts['query'] : '';

        return $scheme . '://' . $host . $port . $path . $query;
    }

    private function google_models_url(string $base_url, string $api_key): string
    {
        $base = rtrim($base_url !== '' ? $base_url : 'https://generativelanguage.googleapis.com', '/');
        $url = $base . '/v1beta/models';

        return add_query_arg('key', rawurlencode($api_key), $url);
    }

    private function google_generate_content_url(string $base_url, string $model): string
    {
        $base = rtrim($base_url !== '' ? $base_url : 'https://generativelanguage.googleapis.com', '/');
        if (!preg_match('#/v1(?:beta|alpha)?$#', $base)) $base .= '/v1beta';
        $clean_model = preg_replace('#^models/#', '', $model);

        return $base . '/models/' . rawurlencode((string) $clean_model) . ':generateContent';
    }

    private function aihubmix_catalog_url(string $base_url, string $type): string
    {
        $parts = wp_parse_url($base_url !== '' ? $base_url : 'https://aihubmix.com/v1');
        $origin = ((string) ($parts['scheme'] ?? 'https')) . '://' . ((string) ($parts['host'] ?? 'aihubmix.com'));

        return $origin . '/api/v1/models?type=' . rawurlencode($type);
    }

    private function provider_models_url(string $protocol, string $base_url, string $api_key): string
    {
        if ($protocol === 'aihubmix') {
            return $this->aihubmix_catalog_url($base_url, 'llm');
        }
        if ($protocol === 'openai' || $protocol === 'senseaudio') {
            return $this->append_versioned_api_path($base_url, '/models');
        }
        if ($protocol === 'anthropic') {
            return add_query_arg('limit', '1000', $this->append_versioned_api_path($base_url, '/models'));
        }
        if ($protocol === 'google') {
            return $this->google_models_url($base_url, $api_key);
        }

        return '';
    }

    private function provider_models_headers(string $protocol, string $api_key): array
    {
        if ($protocol === 'openai' || $protocol === 'senseaudio') {
            return ['authorization' => 'Bearer ' . $api_key];
        }
        if ($protocol === 'aihubmix') {
            return trim($api_key) !== '' ? $this->aihubmix_headers($api_key) : [];
        }
        if ($protocol === 'anthropic') {
            return [
                'x-api-key' => $api_key,
                'anthropic-version' => '2023-06-01',
            ];
        }

        return [];
    }

    private function provider_test_call(string $protocol, string $base_url, string $api_key, string $model, string $api_version): ?array
    {
        $prompt = 'Reply with only: ok';
        if ($protocol === 'anthropic') {
            return [
                'url' => $this->append_versioned_api_path($base_url, '/messages'),
                'headers' => [
                    'content-type' => 'application/json',
                    'x-api-key' => $api_key,
                    'anthropic-version' => '2023-06-01',
                ],
                'body' => [
                    'model' => $model,
                    'max_tokens' => self::PROVIDER_MAX_TOKENS,
                    'messages' => [['role' => 'user', 'content' => $prompt]],
                    'stream' => false,
                ],
            ];
        }
        if (in_array($protocol, ['openai', 'senseaudio', 'aihubmix'], true)) {
            return [
                'url' => $this->append_versioned_api_path($base_url, '/chat/completions'),
                'headers' => array_merge([
                    'content-type' => 'application/json',
                ], $protocol === 'aihubmix' ? $this->aihubmix_headers($api_key) : ['authorization' => 'Bearer ' . $api_key]),
                'body' => [
                    'model' => $model,
                    ($protocol === 'openai' ? 'max_completion_tokens' : 'max_tokens') => self::PROVIDER_MAX_TOKENS,
                    'messages' => [['role' => 'user', 'content' => $prompt]],
                    'stream' => false,
                ],
            ];
        }
        if ($protocol === 'azure') {
            $parts = wp_parse_url($base_url);
            $path = rtrim((string) ($parts['path'] ?? ''), '/');
            $uses_versioned = preg_match('#/openai/v\d+($|/)#', $path) === 1;
            $parts['path'] = $uses_versioned
                ? $path . '/chat/completions'
                : $path . '/openai/deployments/' . rawurlencode($model) . '/chat/completions';
            $url = $this->build_url($parts, (string) $parts['path']);
            if ($api_version !== '' || !$uses_versioned) {
                $url = add_query_arg('api-version', $api_version !== '' ? $api_version : '2024-10-21', $url);
            }

            return [
                'url' => $url,
                'headers' => [
                    'content-type' => 'application/json',
                    'api-key' => $api_key,
                ],
                'body' => [
                    'model' => $uses_versioned ? $model : null,
                    'max_completion_tokens' => self::PROVIDER_MAX_TOKENS,
                    'messages' => [['role' => 'user', 'content' => $prompt]],
                    'stream' => false,
                ],
            ];
        }
        if ($protocol === 'google') {
            return [
                'url' => $this->google_generate_content_url($base_url, $model),
                'headers' => [
                    'content-type' => 'application/json',
                    'x-goog-api-key' => $api_key,
                ],
                'body' => [
                    'contents' => [['role' => 'user', 'parts' => [['text' => $prompt]]]],
                    'generationConfig' => ['maxOutputTokens' => self::PROVIDER_MAX_TOKENS],
                ],
            ];
        }
        if ($protocol === 'ollama') {
            $base = preg_replace('#/api/?$#', '', $base_url);
            return [
                'url' => rtrim((string) $base, '/') . '/api/chat',
                'headers' => [
                    'content-type' => 'application/json',
                    'authorization' => 'Bearer ' . $api_key,
                ],
                'body' => [
                    'model' => $model,
                    'messages' => [['role' => 'user', 'content' => $prompt]],
                    'stream' => false,
                ],
            ];
        }

        return null;
    }

    private function provider_completion_call(string $protocol, string $base_url, string $api_key, string $model, string $api_version, string $system, array $messages, int $max_tokens): ?array
    {
        if ($protocol === 'anthropic') {
            return [
                'url' => $this->append_versioned_api_path($base_url, '/messages'),
                'headers' => [
                    'content-type' => 'application/json',
                    'x-api-key' => $api_key,
                    'anthropic-version' => '2023-06-01',
                ],
                'body' => [
                    'model' => $model,
                    'max_tokens' => $max_tokens,
                    'system' => $system,
                    'messages' => $this->normalize_provider_messages($messages, false),
                    'stream' => false,
                ],
            ];
        }
        if (in_array($protocol, ['openai', 'senseaudio', 'aihubmix'], true)) {
            return [
                'url' => $this->append_versioned_api_path($base_url, '/chat/completions'),
                'headers' => array_merge([
                    'content-type' => 'application/json',
                ], $protocol === 'aihubmix' ? $this->aihubmix_headers($api_key) : ['authorization' => 'Bearer ' . $api_key]),
                'body' => [
                    'model' => $model,
                    ($protocol === 'openai' ? 'max_completion_tokens' : 'max_tokens') => $max_tokens,
                    'messages' => $this->normalize_provider_messages($messages, true, $system),
                    'stream' => false,
                ],
            ];
        }
        if ($protocol === 'azure') {
            $test = $this->provider_test_call($protocol, $base_url, $api_key, $model, $api_version);
            if ($test === null) {
                return null;
            }
            $test['body'] = [
                'messages' => $this->normalize_provider_messages($messages, true, $system),
                'stream' => false,
                'max_completion_tokens' => $max_tokens,
            ] + (isset($test['body']['model']) && $test['body']['model'] !== null ? ['model' => $model] : []);
            return $test;
        }
        if ($protocol === 'google') {
            return [
                'url' => $this->google_generate_content_url($base_url, $model),
                'headers' => [
                    'content-type' => 'application/json',
                    'x-goog-api-key' => $api_key,
                ],
                'body' => [
                    'systemInstruction' => ['parts' => [['text' => $system]]],
                    'contents' => $this->normalize_google_messages($messages),
                    'generationConfig' => ['maxOutputTokens' => $max_tokens],
                ],
            ];
        }
        if ($protocol === 'ollama') {
            $base = preg_replace('#/api/?$#', '', $base_url);
            return [
                'url' => rtrim((string) $base, '/') . '/api/chat',
                'headers' => [
                    'content-type' => 'application/json',
                    'authorization' => 'Bearer ' . $api_key,
                ],
                'body' => [
                    'model' => $model,
                    'messages' => $this->normalize_provider_messages($messages, true, $system),
                    'stream' => false,
                ],
            ];
        }

        return null;
    }

    private function normalize_provider_messages(array $messages, bool $allow_system, string $system = ''): array
    {
        $out = [];
        if ($allow_system && trim($system) !== '') {
            $out[] = ['role' => 'system', 'content' => $system];
        }
        foreach ($messages as $message) {
            if (!is_array($message)) {
                continue;
            }
            $role = (string) ($message['role'] ?? 'user');
            $role = in_array($role, ['user', 'assistant', 'system'], true) ? $role : 'user';
            if (!$allow_system && $role === 'system') {
                continue;
            }
            $content = $message['content'] ?? '';
            if (is_array($content)) {
                $content = wp_json_encode($content);
            }
            $out[] = ['role' => $role, 'content' => (string) $content];
        }

        return $out !== [] ? $out : [['role' => 'user', 'content' => 'Hello']];
    }

    private function normalize_google_messages(array $messages): array
    {
        $out = [];
        foreach ($messages as $message) {
            if (!is_array($message)) {
                continue;
            }
            $role = (string) ($message['role'] ?? 'user');
            $content = $message['content'] ?? '';
            if (is_array($content)) {
                $content = wp_json_encode($content);
            }
            $out[] = [
                'role' => $role === 'assistant' ? 'model' : 'user',
                'parts' => [['text' => (string) $content]],
            ];
        }

        return $out !== [] ? $out : [['role' => 'user', 'parts' => [['text' => 'Hello']]]];
    }

    private function extract_completion_text(string $protocol, array $data): string
    {
        if (in_array($protocol, ['openai', 'azure', 'senseaudio', 'aihubmix'], true)) {
            $choices = is_array($data['choices'] ?? null) ? $data['choices'] : [];
            $first = is_array($choices[0] ?? null) ? $choices[0] : [];
            $message = is_array($first['message'] ?? null) ? $first['message'] : [];
            return is_string($message['content'] ?? null) ? $message['content'] : (is_string($first['text'] ?? null) ? $first['text'] : '');
        }
        if ($protocol === 'anthropic') {
            $blocks = is_array($data['content'] ?? null) ? $data['content'] : [];
            $text = '';
            foreach ($blocks as $block) {
                if (is_array($block) && ($block['type'] ?? '') === 'text' && is_string($block['text'] ?? null)) {
                    $text .= $block['text'];
                }
            }
            return $text;
        }
        if ($protocol === 'google') {
            $candidates = is_array($data['candidates'] ?? null) ? $data['candidates'] : [];
            $content = is_array($candidates[0]['content'] ?? null) ? $candidates[0]['content'] : [];
            $parts = is_array($content['parts'] ?? null) ? $content['parts'] : [];
            $text = '';
            foreach ($parts as $part) {
                if (
                    is_array($part) &&
                    ($part['thoughtSummary'] ?? false) !== true &&
                    ($part['type'] ?? '') !== 'reasoning_summary' &&
                    is_string($part['text'] ?? null)
                ) {
                    $text .= $part['text'];
                }
            }
            return $text;
        }
        if ($protocol === 'ollama') {
            $message = is_array($data['message'] ?? null) ? $data['message'] : [];
            return is_string($message['content'] ?? null) ? $message['content'] : '';
        }

        return '';
    }

    private function remote_request(string $url, array $args): array|\WP_Error
    {
        return wp_remote_request($url, array_merge([
            'timeout' => self::PROVIDER_TIMEOUT,
            'redirection' => 0,
        ], $args));
    }

    private function decode_json(string $raw): mixed
    {
        if (trim($raw) === '') {
            return [];
        }
        $decoded = json_decode($raw, true);

        return json_last_error() === JSON_ERROR_NONE ? $decoded : null;
    }

    private function status_to_kind(int $status, string $detail = ''): string
    {
        if ($status === 401) {
            return 'auth_failed';
        }
        if ($status === 403) {
            return 'forbidden';
        }
        if ($status === 404) {
            return preg_match('/model/i', $detail) ? 'not_found_model' : 'invalid_base_url';
        }
        if ($status === 429) {
            return 'rate_limited';
        }
        if ($status >= 500) {
            return 'upstream_unavailable';
        }

        return 'unknown';
    }

    private function provider_error_detail(mixed $data, string $raw): string
    {
        if (is_array($data)) {
            if (isset($data['error']) && is_string($data['error'])) {
                return $data['error'];
            }
            if (isset($data['error']) && is_array($data['error']) && is_string($data['error']['message'] ?? null)) {
                return $data['error']['message'];
            }
            if (is_string($data['message'] ?? null)) {
                return $data['message'];
            }
        }

        return substr(trim($raw), 0, 240);
    }

    private function extract_provider_models(string $protocol, array $data): array
    {
        if ($protocol === 'aihubmix') {
            return $this->extract_aihubmix_models($data, true);
        }
        if ($protocol === 'openai' || $protocol === 'senseaudio') {
            return $this->extract_openai_models($data);
        }
        if ($protocol === 'anthropic') {
            return $this->extract_anthropic_models($data);
        }
        if ($protocol === 'google') {
            return $this->extract_google_models($data);
        }

        return [];
    }

    private function extract_openai_models(array $data): array
    {
        $rows = is_array($data['data'] ?? null) ? $data['data'] : [];
        return $this->unique_models(array_map(static function ($row): ?array {
            $id = is_array($row) && is_string($row['id'] ?? null) ? $row['id'] : '';
            return $id !== '' ? ['id' => $id, 'label' => $id] : null;
        }, $rows));
    }

    private function extract_anthropic_models(array $data): array
    {
        $rows = is_array($data['data'] ?? null) ? $data['data'] : [];
        return $this->unique_models(array_map(static function ($row): ?array {
            if (!is_array($row) || !is_string($row['id'] ?? null) || $row['id'] === '') {
                return null;
            }
            $label = is_string($row['display_name'] ?? null)
                ? $row['display_name']
                : (is_string($row['displayName'] ?? null) ? $row['displayName'] : $row['id']);
            return ['id' => $row['id'], 'label' => $label];
        }, $rows));
    }

    private function extract_google_models(array $data): array
    {
        $rows = is_array($data['models'] ?? null) ? $data['models'] : [];
        return $this->unique_models(array_map(static function ($row): ?array {
            if (!is_array($row)) {
                return null;
            }
            $methods = is_array($row['supportedGenerationMethods'] ?? null) ? $row['supportedGenerationMethods'] : [];
            if (!in_array('generateContent', $methods, true)) {
                return null;
            }
            $id = is_string($row['baseModelId'] ?? null) && $row['baseModelId'] !== ''
                ? $row['baseModelId']
                : (is_string($row['name'] ?? null) ? preg_replace('#^models/#', '', $row['name']) : '');
            if (!is_string($id) || $id === '') {
                return null;
            }
            $label = is_string($row['displayName'] ?? null) && $row['displayName'] !== '' ? $row['displayName'] : $id;
            return ['id' => $id, 'label' => $label];
        }, $rows));
    }

    private function extract_aihubmix_models(array $data, bool $chat_only): array
    {
        $rows = is_array($data['data'] ?? null) ? $data['data'] : [];
        $media_types = ['image_generation', 'video', 'tts'];
        return $this->unique_models(array_map(static function ($row) use ($chat_only, $media_types): ?array {
            if (!is_array($row) || !is_string($row['model_id'] ?? null) || $row['model_id'] === '') {
                return null;
            }
            if ($chat_only && is_string($row['types'] ?? null)) {
                $types = array_filter(array_map('trim', explode(',', strtolower($row['types']))));
                if (array_intersect($types, $media_types) !== []) {
                    return null;
                }
            }
            $label = is_string($row['model_name'] ?? null) && $row['model_name'] !== '' ? $row['model_name'] : $row['model_id'];
            return ['id' => $row['model_id'], 'label' => $label];
        }, $rows));
    }

    private function unique_models(array $models): array
    {
        $seen = [];
        $out = [];
        foreach ($models as $model) {
            if (!is_array($model) || !is_string($model['id'] ?? null)) {
                continue;
            }
            $id = trim($model['id']);
            if ($id === '' || isset($seen[$id])) {
                continue;
            }
            $seen[$id] = true;
            $label = is_string($model['label'] ?? null) && trim($model['label']) !== '' ? trim($model['label']) : $id;
            $out[] = ['id' => $id, 'label' => $label];
        }
        usort($out, static fn(array $a, array $b): int => strcmp($a['id'], $b['id']));

        return $out;
    }

    private function inspect_provider_completion(string $protocol, array $data, string $requested_model): array
    {
        if (in_array($protocol, ['openai', 'azure', 'senseaudio', 'aihubmix'], true)) {
            $choices = is_array($data['choices'] ?? null) ? $data['choices'] : [];
            if ($choices === []) {
                return ['valid' => false];
            }
            $first = is_array($choices[0] ?? null) ? $choices[0] : [];
            $finish = is_string($first['finish_reason'] ?? null) ? $first['finish_reason'] : '';
            return ['valid' => true, 'sample' => $finish !== '' ? 'valid completion (' . $finish . ')' : 'valid completion'];
        }
        if ($protocol === 'anthropic') {
            return ['valid' => is_array($data['content'] ?? null) || is_string($data['stop_reason'] ?? null), 'sample' => 'valid completion'];
        }
        if ($protocol === 'google') {
            return ['valid' => is_array($data['candidates'] ?? null), 'sample' => 'valid completion'];
        }
        if ($protocol === 'ollama') {
            $message = is_array($data['message'] ?? null) ? $data['message'] : [];
            return ['valid' => is_string($message['content'] ?? null) || is_array($data['messages'] ?? null), 'sample' => 'valid completion'];
        }

        return ['valid' => false];
    }

    private function aihubmix_headers(string $api_key): array
    {
        $headers = ['authorization' => 'Bearer ' . $api_key];
        if (self::AIHUBMIX_APP_CODE !== '') {
            $headers['APP-Code'] = self::AIHUBMIX_APP_CODE;
        }

        return $headers;
    }

    private function redact(string $text, array $secrets): string
    {
        foreach ($secrets as $secret) {
            if (is_string($secret) && $secret !== '') {
                $text = str_replace($secret, '[redacted]', $text);
            }
        }

        return $text;
    }
}
