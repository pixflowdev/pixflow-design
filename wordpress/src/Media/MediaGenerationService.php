<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Media;

use PixflowDesign\WordPress\Projects\ProjectFileService;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Server-side BYOK media transport for the WordPress-only runtime.
 *
 * The browser supplies the active key per request; WordPress never writes it
 * to options or user meta. This keeps generation independent from the local
 * daemon while preserving the existing project-file and media-library paths.
 * Providers that need a genuinely different task protocol should return an
 * explicit unsupported response rather than silently falling back to Bridge.
 */
final class MediaGenerationService
{
    // Keep the upstream request below the REST route execution limit. A slow
    // provider must become a structured error, never a PHP fatal page.
    private const TIMEOUT = 180;
    private const TASK_TTL = 1800;

    public function __construct(
        private readonly ProjectFileService $files = new ProjectFileService(),
        private readonly MediaLibraryService $media = new MediaLibraryService(),
    ) {
    }

    public function generate(array $input): array|\WP_Error
    {
        if (sanitize_key((string) ($input['surface'] ?? '')) === 'image' && !\PixflowDesign\WordPress\Modules\ImageGenerationAccess::available()) return $this->error('pixflow_pro_image_generation_required', 'Image generation requires Pixflow Design Pro.', 403);
        if (!(new \PixflowDesign\WordPress\License\CentralEntitlements())->allows('ai:generate')) {
            return $this->error('pixflow_entitlement_required', 'A current Pixflow AI entitlement is required.', 403);
        }
        $project_id = sanitize_text_field((string) ($input['projectId'] ?? $input['project_id'] ?? ''));
        $surface = sanitize_key((string) ($input['surface'] ?? ''));
        $protocol = sanitize_key((string) ($input['protocol'] ?? 'openai'));
        $model = sanitize_text_field((string) ($input['model'] ?? ''));
        $prompt = trim((string) ($input['prompt'] ?? ''));
        $api_key = trim((string) ($input['apiKey'] ?? ''));
        if ($project_id === '' || $model === '' || $prompt === '' || $api_key === '') {
            return $this->error('invalid_media_request', 'projectId, model, prompt, and apiKey are required.', 400);
        }
        if (!in_array($surface, ['image', 'video', 'audio'], true)) {
            return $this->error('invalid_media_surface', 'surface must be image, video, or audio.', 400);
        }
        if (strlen($prompt) > 20000) $prompt = substr($prompt, 0, 20000);

        $requested_base_url = rtrim(trim((string) ($input['baseUrl'] ?? '')), '/');
        if ($protocol === 'custom-image' && $requested_base_url === '') {
            return $this->error('invalid_provider_url', 'A custom image provider requires an explicit base URL.', 400);
        }
        $base_url = $requested_base_url;
        if ($base_url === '') {
            $base_url = match ($protocol) {
                'senseaudio' => 'https://api.senseaudio.cn',
                'aihubmix' => 'https://aihubmix.com/v1',
                'google', 'nanobanana' => 'https://generativelanguage.googleapis.com',
                'grok' => 'https://api.x.ai/v1',
                'openrouter' => 'https://openrouter.ai/api/v1',
                'imagerouter' => 'https://api.imagerouter.io/v1/openai',
                'elevenlabs' => 'https://api.elevenlabs.io',
                'fishaudio' => 'https://api.fish.audio',
                'minimax' => 'https://api.minimaxi.chat/v1',
                default => 'https://api.openai.com/v1',
            };
        }
        $validation = $this->validate_url($base_url);
        if ($validation !== null) return $validation;

        $generated = match ($surface) {
            'image' => $this->generate_image($protocol, $base_url, $api_key, $model, $prompt, $input),
            'audio' => $this->generate_audio($protocol, $base_url, $api_key, $model, $prompt, $input),
            'video' => $this->generate_video($protocol, $base_url, $api_key, $model, $prompt, $input),
        };
        if (is_wp_error($generated)) return $this->normalize_transport_error($generated);

        if (is_array($generated['task'] ?? null)) {
            $task = $generated['task'];
            $task_id = wp_generate_uuid4();
            $task['id'] = $task_id;
            $task['userId'] = get_current_user_id();
            $task['projectId'] = $project_id;
            $task['provider'] = $protocol;
            $task['model'] = $model;
            $task['baseUrl'] = $base_url;
            $task['surface'] = $surface;
            $task['prompt'] = $prompt;
            $task['createdAt'] = time();
            set_transient($this->task_key($task_id), $task, self::TASK_TTL);

            return [
                'ok' => true,
                'pending' => true,
                'provider' => $protocol,
                'task' => [
                    'id' => $task_id,
                    'status' => 'queued',
                ],
            ];
        }

        return $this->persist_generated_file($project_id, $protocol, $generated, [
            'model' => $model,
            'prompt' => $prompt,
            'surface' => $surface,
        ]);
    }

    /**
     * Continue a queued provider job without requiring the local daemon.
     *
     * The task record contains no credential. The browser sends the active
     * BYOK key again for each poll, so WordPress remains a request-scoped
     * transport rather than becoming a second credential cache.
     */
    public function poll(array $input): array|\WP_Error
    {
        $task_id = sanitize_text_field((string) ($input['taskId'] ?? $input['task_id'] ?? ''));
        $project_id = sanitize_text_field((string) ($input['projectId'] ?? $input['project_id'] ?? ''));
        $api_key = trim((string) ($input['apiKey'] ?? ''));
        if ($task_id === '' || $project_id === '' || $api_key === '') {
            return $this->error('invalid_media_task_request', 'taskId, projectId, and apiKey are required.', 400);
        }
        $task = get_transient($this->task_key($task_id));
        if (!is_array($task)) {
            return $this->error('media_task_not_found', 'The media task has expired or was not found.', 404);
        }
        if ((int) ($task['userId'] ?? 0) !== get_current_user_id()
            || (string) ($task['projectId'] ?? '') !== $project_id
        ) {
            return $this->error('media_task_forbidden', 'The media task does not belong to this project or user.', 403);
        }

        $polled = $this->poll_video_task($task, $api_key);
        if (is_wp_error($polled)) {
            if (in_array($polled->get_error_code(), ['media_task_failed', 'media_task_expired'], true)) {
                delete_transient($this->task_key($task_id));
            }
            return $this->normalize_transport_error($polled);
        }
        if (($polled['status'] ?? '') !== 'complete') {
            // Keep the transient alive while the upstream provider is still
            // working. A poll itself refreshes the TTL, so a busy queue does
            // not disappear while the browser is visibly waiting.
            set_transient($this->task_key($task_id), $task, self::TASK_TTL);
            return [
                'ok' => true,
                'pending' => true,
                'provider' => (string) ($task['provider'] ?? ''),
                'task' => [
                    'id' => $task_id,
                    'status' => (string) ($polled['providerStatus'] ?? 'pending'),
                    ...(isset($polled['detail']) ? ['detail' => (string) $polled['detail']] : []),
                ],
            ];
        }

        $result = $this->persist_generated_file($project_id, (string) ($task['provider'] ?? ''), $polled, [
            'model' => (string) ($task['model'] ?? ''),
            'prompt' => (string) ($task['prompt'] ?? ''),
            'surface' => (string) ($task['surface'] ?? 'video'),
        ]);
        if (!is_wp_error($result)) delete_transient($this->task_key($task_id));
        return is_wp_error($result) ? $this->normalize_transport_error($result) : $result;
    }

    private function persist_generated_file(string $project_id, string $protocol, array $generated, array $context = []): array|\WP_Error
    {
        $bytes = (string) ($generated['bytes'] ?? '');
        if ($bytes === '') return $this->error('empty_media_response', 'The provider returned no media bytes.', 502);
        $extension = (string) ($generated['extension'] ?? 'bin');
        $surface = sanitize_key((string) ($context['surface'] ?? 'image')) ?: 'image';
        $mime = $this->mime_for_extension($extension, $surface);
        $prompt = trim((string) ($context['prompt'] ?? ''));
        $title = $this->generated_media_title($prompt, $surface);
        $filename = $this->generated_filename($title, $extension, $surface);
        $written = $this->files->write($project_id, [
            'name' => $filename,
            'content' => base64_encode($bytes),
            'encoding' => 'base64',
        ]);
        if (is_wp_error($written)) return $written;

        // Keep the project file and the WordPress Media Library in sync. The
        // browser can still perform its normal best-effort upload finalizer,
        // but saving here makes direct WordPress generation immediately
        // visible in Media and gives the attachment its proper metadata even
        // before the project file list refreshes.
        $media_item = $this->media->save_generated([
            'filename' => $filename,
            'mimeType' => $mime,
            'contentBase64' => base64_encode($bytes),
            'source' => 'generated',
            'projectUuid' => $project_id,
            'prompt' => $prompt,
            'provider' => $protocol,
            'surface' => $surface,
            'model' => sanitize_text_field((string) ($context['model'] ?? '')),
            'title' => $title,
            'altText' => $title,
            'caption' => 'Generated ' . $surface . ': ' . $title,
            'description' => $prompt !== ''
                ? 'Generated by Pixflow Design from this brief: ' . $prompt
                : 'Generated by Pixflow Design.',
        ]);
        if (is_wp_error($media_item)) {
            // The project file is still the authoritative deliverable. Return
            // the attachment warning to the UI rather than turning a
            // successful provider response into a failed generation.
            return [
                'ok' => true,
                'provider' => $protocol,
                'file' => $written['file'] ?? null,
                'mediaError' => $media_item->get_error_message(),
            ];
        }

        return [
            'ok' => true,
            'provider' => $protocol,
            'file' => $written['file'] ?? null,
            'media' => $media_item,
        ];
    }

    private function generated_media_title(string $prompt, string $surface): string
    {
        return GeneratedMediaNaming::title($prompt, $surface);
    }

    private function generated_filename(string $title, string $extension, string $surface): string
    {
        $slug = GeneratedMediaNaming::filename_stem($title, $title, $surface);
        $safe_extension = $this->generated_extension($extension, $this->mime_for_extension($extension, $surface), $surface);
        $suffix = strtolower(wp_generate_password(8, false, false));
        return sanitize_file_name($slug . '-' . $suffix . '.' . $safe_extension);
    }

    private function generated_extension(string $extension, string $mime, string $surface): string
    {
        $extension = strtolower(ltrim(sanitize_file_name($extension), '.'));
        $allowed = [
            'avif', 'bmp', 'gif', 'jpeg', 'jpg', 'png', 'webp', 'svg',
            'mp4', 'webm', 'mov', 'm4v', 'mp3', 'wav', 'ogg', 'm4a', 'aac',
        ];
        if (in_array($extension, $allowed, true)) return $extension === 'jpeg' ? 'jpg' : $extension;

        $mime_extension = match (strtolower($mime)) {
            'image/jpeg' => 'jpg',
            'image/webp' => 'webp',
            'image/gif' => 'gif',
            'image/svg+xml' => 'svg',
            'image/avif' => 'avif',
            'video/mp4' => 'mp4',
            'video/webm' => 'webm',
            'video/quicktime' => 'mov',
            'audio/mpeg' => 'mp3',
            'audio/wav', 'audio/x-wav' => 'wav',
            'audio/ogg' => 'ogg',
            'audio/mp4' => 'm4a',
            default => '',
        };
        if ($mime_extension !== '') return $mime_extension;

        return match ($surface) {
            'video' => 'mp4',
            'audio' => 'mp3',
            default => 'png',
        };
    }

    private function mime_for_extension(string $extension, string $surface): string
    {
        return match (strtolower(ltrim($extension, '.'))) {
            'jpg', 'jpeg' => 'image/jpeg',
            'gif' => 'image/gif',
            'webp' => 'image/webp',
            'svg' => 'image/svg+xml',
            'avif' => 'image/avif',
            'mp4', 'm4v' => 'video/mp4',
            'webm' => 'video/webm',
            'mov' => 'video/quicktime',
            'mp3' => 'audio/mpeg',
            'wav' => 'audio/wav',
            'ogg' => 'audio/ogg',
            'm4a' => 'audio/mp4',
            default => match ($surface) {
                'video' => 'video/mp4',
                'audio' => 'audio/mpeg',
                default => 'image/png',
            },
        };
    }

    private function task_key(string $task_id): string
    {
        return 'pixflow_media_task_' . sanitize_key($task_id);
    }

    private function generate_image(string $protocol, string $base, string $key, string $model, string $prompt, array $input): array|\WP_Error
    {
        $aspect = (string) ($input['aspect'] ?? '1:1');
        if (in_array($protocol, ['google', 'nanobanana'], true)) {
            return $this->generate_google_image($protocol, $base, $key, $model, $prompt, $aspect);
        }
        if ($protocol === 'senseaudio') {
            return $this->generate_senseaudio_image($base, $key, $model, $prompt, $aspect);
        }
        if ($protocol === 'grok') {
            return $this->generate_grok_image($base, $key, $model, $prompt, $aspect);
        }
        if ($protocol === 'openrouter') {
            return $this->generate_openrouter_image($base, $key, $model, $prompt, $aspect);
        }
        $aihubmix_model = $this->wire_model($model, $protocol);
        if ($protocol === 'aihubmix' && (str_starts_with(strtolower($aihubmix_model), 'gemini') || str_starts_with(strtolower($aihubmix_model), 'imagen'))) {
            return $this->generate_aihubmix_gemini_image($base, $key, $aihubmix_model, $prompt, $aspect);
        }
        if (!in_array($protocol, ['openai', 'aihubmix', 'imagerouter', 'custom-image'], true)) {
            return $this->error(
                'provider_not_supported',
                'This API image provider needs a provider-specific WordPress adapter. Use OpenAI-compatible, Google, Grok, OpenRouter, ImageRouter, or SenseAudio for daemon-free image generation.',
                422
            );
        }

        $size = $this->image_size($aspect, $model);
        $body = [
            'model' => $this->wire_model($model, $protocol),
            'prompt' => $prompt,
            'n' => 1,
            'size' => $size,
        ];
        // DALL-E is the only OpenAI-compatible family that requires the
        // b64_json response flag. gpt-image models reject that field on some
        // gateways, while still returning either b64_json or a URL.
        if (str_starts_with($this->wire_model($model, $protocol), 'dall-e-')) {
            $body['response_format'] = 'b64_json';
            $body['quality'] = $this->wire_model($model, $protocol) === 'dall-e-3' ? 'hd' : 'standard';
        } else {
            $body['quality'] = $protocol === 'imagerouter' ? 'auto' : 'high';
            if ($protocol === 'imagerouter') $body['output_format'] = 'png';
        }
        $url = $this->append_api_path($base, '/images/generations');
        $headers = ['content-type' => 'application/json', 'authorization' => 'Bearer ' . $key];
        if ($protocol === 'aihubmix') $headers['APP-Code'] = 'DMCY9912';
        $remote = $this->remote($url, [
            'headers' => $headers,
            'body' => wp_json_encode($body),
        ]);
        if (is_wp_error($remote)) return $this->normalize_transport_error($remote);
        $data = $this->decode($remote);
        $entry = is_array($data) && is_array($data['data'][0] ?? null) ? $data['data'][0] : [];
        if (is_string($entry['b64_json'] ?? null) && $entry['b64_json'] !== '') {
            return ['bytes' => base64_decode($entry['b64_json'], true) ?: '', 'extension' => 'png'];
        }
        return is_string($entry['url'] ?? null) && $entry['url'] !== ''
            ? $this->download_asset($entry['url'], 'png')
            : $this->provider_error($remote, 'Image response did not contain b64_json or a URL.');
    }

    private function generate_google_image(string $protocol, string $base, string $key, string $model, string $prompt, string $aspect): array|\WP_Error
    {
        $wire_model = preg_replace('#^models/#', '', $model);
        $wire_model = is_string($wire_model) && $wire_model !== '' ? $wire_model : $model;
        // Gemini/Nano Banana uses generateContent and returns inlineData. The
        // Imagen catalogue uses predict and returns bytesBase64Encoded.
        if ($protocol === 'nanobanana' || str_contains(strtolower($wire_model), 'gemini')) {
            $url = $this->append_google_path($base, '/models/' . rawurlencode($wire_model) . ':generateContent');
            $remote = $this->remote($url, [
                'headers' => $this->google_headers($base, $key),
                'body' => wp_json_encode([
                    'contents' => [['role' => 'user', 'parts' => [['text' => $prompt]]]],
                    'generationConfig' => [
                        'responseModalities' => ['IMAGE', 'TEXT'],
                        'imageConfig' => ['aspectRatio' => $this->google_aspect($aspect)],
                    ],
                ]),
            ]);
            if (is_wp_error($remote)) return $remote;
            $data = $this->decode($remote);
            $inline = $this->find_inline_data($data);
            if ($inline !== null) return ['bytes' => base64_decode($inline['data'], true) ?: '', 'extension' => $this->extension_for_mime($inline['mimeType'] ?? 'image/png')];
            return $this->provider_error($remote, 'Google image response did not contain inline image data.');
        }
        $url = $this->append_google_path($base, '/models/' . rawurlencode($wire_model) . ':predict');
        $remote = $this->remote($url, [
            'headers' => $this->google_headers($base, $key),
            'body' => wp_json_encode([
                'instances' => [['prompt' => $prompt]],
                'parameters' => ['sampleCount' => 1, 'aspectRatio' => $this->google_aspect($aspect)],
            ]),
        ]);
        if (is_wp_error($remote)) return $remote;
        $data = $this->decode($remote);
        $prediction = is_array($data) && is_array($data['predictions'][0] ?? null) ? $data['predictions'][0] : [];
        $encoded = $prediction['bytesBase64Encoded'] ?? $prediction['bytes_base64_encoded'] ?? null;
        if (is_string($encoded) && $encoded !== '') {
            return ['bytes' => base64_decode($encoded, true) ?: '', 'extension' => 'png'];
        }
        return $this->provider_error($remote, 'Google Imagen response did not contain image bytes.');
    }

    private function generate_senseaudio_image(string $base, string $key, string $model, string $prompt, string $aspect): array|\WP_Error
    {
        $remote = $this->remote(rtrim($base, '/') . '/v1/image/sync', [
            'headers' => ['content-type' => 'application/json', 'authorization' => 'Bearer ' . $key],
            'body' => wp_json_encode(['model' => $model, 'prompt' => substr($prompt, 0, 2000), 'size' => $this->senseaudio_size($aspect)]),
        ]);
        if (is_wp_error($remote)) return $remote;
        $data = $this->decode($remote);
        if (is_array($data['base_resp'] ?? null) && (int) ($data['base_resp']['status_code'] ?? 0) !== 0) {
            return $this->provider_error($remote, 'SenseAudio image request failed.');
        }
        $asset = is_array($data) && is_string($data['url'] ?? null) ? $data['url'] : '';
        return $asset !== '' ? $this->download_asset($asset, 'png') : $this->provider_error($remote, 'SenseAudio image response did not contain a URL.');
    }

    private function generate_grok_image(string $base, string $key, string $model, string $prompt, string $aspect): array|\WP_Error
    {
        $remote = $this->remote($this->append_api_path($base, '/images/generations'), [
            'headers' => ['content-type' => 'application/json', 'authorization' => 'Bearer ' . $key],
            'body' => wp_json_encode([
                'model' => $model,
                'prompt' => $prompt,
                'n' => 1,
                'aspect_ratio' => $this->google_aspect($aspect),
                'response_format' => 'b64_json',
            ]),
        ]);
        if (is_wp_error($remote)) return $remote;
        $data = $this->decode($remote);
        $entry = is_array($data) && is_array($data['data'][0] ?? null) ? $data['data'][0] : [];
        if (is_string($entry['b64_json'] ?? null) && $entry['b64_json'] !== '') return ['bytes' => base64_decode($entry['b64_json'], true) ?: '', 'extension' => 'jpg'];
        return is_string($entry['url'] ?? null) && $entry['url'] !== ''
            ? $this->download_asset($entry['url'], 'jpg')
            : $this->provider_error($remote, 'Grok image response did not contain image data.');
    }

    private function generate_openrouter_image(string $base, string $key, string $model, string $prompt, string $aspect): array|\WP_Error
    {
        $wire_model = str_starts_with($model, 'openrouter/') ? substr($model, strlen('openrouter/')) : $model;
        $remote = $this->remote(rtrim($base, '/') . '/chat/completions', [
            'headers' => [
                'content-type' => 'application/json',
                'authorization' => 'Bearer ' . $key,
                'HTTP-Referer' => home_url('/'),
                'X-Title' => 'Pixflow Design',
            ],
            'body' => wp_json_encode([
                'model' => $wire_model,
                'messages' => [['role' => 'user', 'content' => $prompt]],
                'modalities' => str_contains(strtolower($wire_model), 'gemini') ? ['image', 'text'] : ['image'],
                'image_config' => ['aspect_ratio' => $this->google_aspect($aspect), 'image_size' => '1K'],
                'stream' => false,
            ]),
        ]);
        if (is_wp_error($remote)) return $remote;
        $data = $this->decode($remote);
        $images = $data['choices'][0]['message']['images'] ?? null;
        $image_url = is_array($images) && is_array($images[0] ?? null) ? ($images[0]['image_url']['url'] ?? '') : '';
        if (!is_string($image_url) || $image_url === '') return $this->provider_error($remote, 'OpenRouter image response did not contain image data.');
        return $this->media_value($image_url, 'png');
    }

    private function generate_aihubmix_gemini_image(string $base, string $key, string $model, string $prompt, string $aspect): array|\WP_Error
    {
        $parts = wp_parse_url($base);
        $origin = ((string) ($parts['scheme'] ?? 'https')) . '://' . (string) ($parts['host'] ?? 'aihubmix.com');
        if (isset($parts['port'])) $origin .= ':' . (int) $parts['port'];
        $url = $origin . '/gemini/v1beta/models/' . rawurlencode($model) . ':generateContent';
        $remote = $this->remote($url, [
            'headers' => [
                'content-type' => 'application/json',
                'x-goog-api-key' => $key,
                'APP-Code' => 'DMCY9912',
            ],
            'body' => wp_json_encode([
                'contents' => [['role' => 'user', 'parts' => [['text' => $prompt]]]],
                'generationConfig' => [
                    'responseModalities' => ['TEXT', 'IMAGE'],
                    'imageConfig' => ['aspectRatio' => $this->google_aspect($aspect)],
                ],
            ]),
        ]);
        if (is_wp_error($remote)) return $remote;
        $inline = $this->find_inline_data($this->decode($remote));
        return $inline !== null
            ? ['bytes' => base64_decode((string) $inline['data'], true) ?: '', 'extension' => $this->extension_for_mime((string) ($inline['mimeType'] ?? 'image/png'))]
            : $this->provider_error($remote, 'AIHubMix Gemini response did not contain inline image data.');
    }

    private function generate_audio(string $protocol, string $base, string $key, string $model, string $prompt, array $input): array|\WP_Error
    {
        $audio_kind = sanitize_key((string) ($input['audioKind'] ?? 'speech')) ?: 'speech';
        if ($audio_kind === 'sfx' && $protocol === 'elevenlabs') {
            return $this->generate_elevenlabs_sfx($base, $key, $prompt, $input);
        }
        if ($audio_kind !== 'speech') {
            return $this->error('provider_not_supported', 'Music projects still require a provider task adapter; speech and ElevenLabs sound effects are available without the daemon.', 422);
        }
        if ($protocol === 'senseaudio') return $this->generate_senseaudio_audio($base, $key, $model, $prompt, $input);
        if ($protocol === 'grok') return $this->generate_grok_audio($base, $key, $model, $prompt, $input);
        if ($protocol === 'elevenlabs') return $this->generate_elevenlabs_audio($base, $key, $model, $prompt, $input);
        if ($protocol === 'fishaudio') return $this->generate_fishaudio_audio($base, $key, $model, $prompt, $input);
        if ($protocol === 'minimax') return $this->generate_minimax_audio($base, $key, $model, $prompt, $input);
        if (!in_array($protocol, ['openai', 'aihubmix'], true)) {
            return $this->error('provider_not_supported', 'This API provider does not expose a WordPress text-to-speech transport yet.', 422);
        }
        $url = $this->append_api_path($base, '/audio/speech');
        $headers = ['content-type' => 'application/json', 'authorization' => 'Bearer ' . $key];
        if ($protocol === 'aihubmix') $headers['APP-Code'] = 'DMCY9912';
        $remote = $this->remote($url, [
            'headers' => $headers,
            'body' => wp_json_encode([
                'model' => $this->wire_model($model, $protocol),
                'input' => $prompt,
                'voice' => sanitize_text_field((string) ($input['voice'] ?? 'alloy')) ?: 'alloy',
                'response_format' => 'mp3',
            ]),
        ]);
        if (is_wp_error($remote)) return $remote;
        $status = (int) wp_remote_retrieve_response_code($remote);
        $body = (string) wp_remote_retrieve_body($remote);
        if ($status < 200 || $status >= 300) return $this->provider_error($remote, 'Audio provider request failed.');
        if ($body === '' || str_contains(strtolower((string) wp_remote_retrieve_header($remote, 'content-type')), 'application/json')) {
            return $this->provider_error($remote, 'Audio provider returned no audio bytes.');
        }
        return ['bytes' => $body, 'extension' => 'mp3'];
    }

    private function generate_grok_audio(string $base, string $key, string $model, string $prompt, array $input): array|\WP_Error
    {
        $remote = $this->remote($this->append_api_path($base, '/tts'), [
            'headers' => ['content-type' => 'application/json', 'authorization' => 'Bearer ' . $key],
            'body' => wp_json_encode([
                'text' => $prompt,
                'voice_id' => sanitize_text_field((string) ($input['voice'] ?? 'eve')) ?: 'eve',
                'language' => 'en',
            ]),
        ]);
        return $this->raw_audio_result($remote, 'xAI TTS');
    }

    private function generate_elevenlabs_audio(string $base, string $key, string $model, string $prompt, array $input): array|\WP_Error
    {
        $wire_model = $model === 'elevenlabs-v3' ? 'eleven_v3' : $model;
        $voice = sanitize_text_field((string) ($input['voice'] ?? '21m00Tcm4TlvDq8ikWAM')) ?: '21m00Tcm4TlvDq8ikWAM';
        $url = rtrim($base, '/') . '/v1/text-to-speech/' . rawurlencode($voice) . '?output_format=mp3_44100_128';
        $remote = $this->remote($url, [
            'headers' => ['content-type' => 'application/json', 'xi-api-key' => $key],
            'body' => wp_json_encode([
                'text' => $prompt,
                'model_id' => $wire_model,
                'voice_settings' => ['stability' => 1, 'similarity_boost' => 1, 'style' => 0, 'speed' => 1, 'use_speaker_boost' => true],
            ]),
        ]);
        return $this->raw_audio_result($remote, 'ElevenLabs TTS');
    }

    private function generate_elevenlabs_sfx(string $base, string $key, string $prompt, array $input): array|\WP_Error
    {
        $duration = max(0.5, min(22, (float) ($input['duration'] ?? 5)));
        $remote = $this->remote(rtrim($base, '/') . '/v1/sound-generation', [
            'headers' => ['content-type' => 'application/json', 'xi-api-key' => $key],
            'body' => wp_json_encode([
                'text' => $prompt,
                'duration_seconds' => $duration,
                'output_format' => 'mp3_44100_128',
            ]),
        ]);
        return $this->raw_audio_result($remote, 'ElevenLabs sound effect');
    }

    private function generate_fishaudio_audio(string $base, string $key, string $model, string $prompt, array $input): array|\WP_Error
    {
        $wire_model = $model === 'fish-speech-2' ? 'speech-1.6' : $model;
        $body = [
            'text' => $prompt,
            'format' => 'mp3',
            'mp3_bitrate' => 128,
            'model' => $wire_model,
            'normalize' => true,
            'latency' => 'normal',
        ];
        $voice = sanitize_text_field((string) ($input['voice'] ?? ''));
        if ($voice !== '') $body['reference_id'] = $voice;
        $remote = $this->remote(rtrim($base, '/') . '/v1/tts', [
            'headers' => ['content-type' => 'application/json', 'authorization' => 'Bearer ' . $key],
            'body' => wp_json_encode($body),
        ]);
        return $this->raw_audio_result($remote, 'FishAudio TTS');
    }

    private function generate_minimax_audio(string $base, string $key, string $model, string $prompt, array $input): array|\WP_Error
    {
        $wire_model = $model === 'minimax-tts' ? 'speech-02-turbo' : $model;
        $remote = $this->remote(rtrim($base, '/') . '/t2a_v2', [
            'headers' => ['content-type' => 'application/json', 'authorization' => 'Bearer ' . $key],
            'body' => wp_json_encode([
                'model' => $wire_model,
                'text' => $prompt,
                'stream' => false,
                'voice_setting' => ['voice_id' => sanitize_text_field((string) ($input['voice'] ?? 'male-qn-qingse')) ?: 'male-qn-qingse', 'speed' => 1, 'vol' => 1, 'pitch' => 0],
                'audio_setting' => ['sample_rate' => 32000, 'format' => 'mp3'],
            ]),
        ]);
        if (is_wp_error($remote)) return $remote;
        $data = $this->decode($remote);
        if (is_array($data['base_resp'] ?? null) && (int) ($data['base_resp']['status_code'] ?? 0) !== 0) {
            return $this->provider_error($remote, 'MiniMax TTS request failed.');
        }
        $hex = is_array($data) ? ($data['data']['audio'] ?? '') : '';
        if (!is_string($hex) || $hex === '') return $this->provider_error($remote, 'MiniMax TTS response did not contain audio bytes.');
        return ['bytes' => hex2bin($hex) ?: '', 'extension' => 'mp3'];
    }

    private function generate_senseaudio_audio(string $base, string $key, string $model, string $prompt, array $input): array|\WP_Error
    {
        $wire_model = $model === 'senseaudio-tts' ? 'senseaudio-tts-1.5-260319' : $model;
        $remote = $this->remote(rtrim($base, '/') . '/v1/t2a_v2', [
            'headers' => ['content-type' => 'application/json', 'authorization' => 'Bearer ' . $key],
            'body' => wp_json_encode([
                'model' => $wire_model,
                'text' => $prompt,
                'stream' => false,
                'voice_setting' => ['voice_id' => sanitize_text_field((string) ($input['voice'] ?? 'female_0033_b')) ?: 'female_0033_b', 'speed' => 1, 'vol' => 1, 'pitch' => 0],
                'audio_setting' => ['format' => 'mp3', 'sample_rate' => 32000, 'bitrate' => 128000, 'channel' => 2],
            ]),
        ]);
        if (is_wp_error($remote)) return $remote;
        $data = $this->decode($remote);
        if (is_array($data['base_resp'] ?? null) && (int) ($data['base_resp']['status_code'] ?? 0) !== 0) {
            return $this->provider_error($remote, 'SenseAudio TTS request failed.');
        }
        $hex = is_array($data) ? ($data['data']['audio'] ?? '') : '';
        if (!is_string($hex) || $hex === '') return $this->provider_error($remote, 'SenseAudio TTS response did not contain audio bytes.');
        return ['bytes' => hex2bin($hex) ?: '', 'extension' => 'mp3'];
    }

    private function raw_audio_result(array|\WP_Error $remote, string $provider): array|\WP_Error
    {
        if (is_wp_error($remote)) return $remote;
        $status = (int) wp_remote_retrieve_response_code($remote);
        $body = (string) wp_remote_retrieve_body($remote);
        if ($status < 200 || $status >= 300) return $this->provider_error($remote, $provider . ' request failed.');
        if ($body === '' || str_contains(strtolower((string) wp_remote_retrieve_header($remote, 'content-type')), 'application/json')) {
            return $this->provider_error($remote, $provider . ' returned no audio bytes.');
        }
        return ['bytes' => $body, 'extension' => 'mp3'];
    }

    private function generate_video(string $protocol, string $base, string $key, string $model, string $prompt, array $input): array|\WP_Error
    {
        // The WordPress runtime submits asynchronous jobs and returns a short
        // task handle. The browser polls the task endpoint with the current
        // BYOK key, so video generation does not require a daemon process or
        // an unsafe long-running PHP request.
        if ($protocol !== 'imagerouter') {
            return $this->submit_async_video($protocol, $base, $key, $model, $prompt, $input);
        }
        $url = $this->append_api_path($base, '/videos/generations');
        $headers = ['content-type' => 'application/json', 'authorization' => 'Bearer ' . $key];
        $remote = $this->remote($url, [
            'headers' => $headers,
            'body' => wp_json_encode([
                'model' => $model,
                'prompt' => $prompt,
                'duration' => max(1, min(60, (int) ($input['duration'] ?? $input['length'] ?? 5))),
                'size' => $this->image_size((string) ($input['aspect'] ?? '16:9'), $model),
            ]),
        ]);
        if (is_wp_error($remote)) return $remote;
        $data = $this->decode($remote);
        $asset = is_array($data) && is_string($data['video_url'] ?? null) ? $data['video_url'] : (is_array($data) && is_string($data['url'] ?? null) ? $data['url'] : '');
        return $asset !== '' ? $this->download_asset($asset, 'mp4') : $this->provider_error($remote, 'Video provider response did not contain a downloadable URL.');
    }

    private function submit_async_video(string $protocol, string $base, string $key, string $model, string $prompt, array $input): array|\WP_Error
    {
        $duration = max(1, min(60, (int) ($input['duration'] ?? $input['length'] ?? 5)));
        $aspect = (string) ($input['aspect'] ?? '16:9');

        // Google AI Studio uses the same Gemini API key as Nano Banana. Keep
        // both protocol ids on this adapter so existing saved credentials and
        // the renamed "Google AI Studio" media provider remain compatible.
        if (in_array($protocol, ['google', 'nanobanana'], true)) {
            return $this->submit_google_video($base, $key, $model, $prompt, $aspect);
        }

        if ($protocol === 'volcengine') {
            $ratio = match ($aspect) {
                '1:1' => '1:1',
                '9:16' => '9:16',
                '4:3' => '4:3',
                '3:4' => '3:4',
                default => '16:9',
            };
            $full_prompt = $prompt;
            if (!preg_match('/--duration\b/i', $full_prompt)) $full_prompt .= ' --duration ' . $duration;
            if (!preg_match('/--ratio\b/i', $full_prompt)) $full_prompt .= ' --ratio ' . $ratio;
            if (!preg_match('/--resolution\b/i', $full_prompt)) $full_prompt .= ' --resolution 720p';
            $remote = $this->remote(rtrim($base, '/') . '/contents/generations/tasks', [
                'headers' => ['content-type' => 'application/json', 'authorization' => 'Bearer ' . $key],
                'body' => wp_json_encode([
                    'model' => $model,
                    'content' => [['type' => 'text', 'text' => $full_prompt]],
                ]),
            ]);
            if (is_wp_error($remote)) return $remote;
            $data = $this->decode($remote);
            $task_id = is_array($data) ? (string) ($data['id'] ?? '') : '';
            return $task_id !== ''
                ? ['task' => ['taskType' => 'volcengine', 'upstreamId' => $task_id]]
                : $this->provider_error($remote, 'Volcengine video response did not contain a task id.');
        }

        if ($protocol === 'grok') {
            $remote = $this->remote($this->append_api_path($base, '/videos/generations'), [
                'headers' => ['content-type' => 'application/json', 'authorization' => 'Bearer ' . $key],
                'body' => wp_json_encode([
                    'model' => $model,
                    'prompt' => $prompt,
                    'duration' => min(15, $duration),
                    'aspect_ratio' => $this->google_aspect($aspect),
                    'resolution' => '720p',
                ]),
            ]);
            if (is_wp_error($remote)) return $remote;
            $data = $this->decode($remote);
            $inline = is_array($data) && is_array($data['video'] ?? null) ? (string) ($data['video']['url'] ?? '') : '';
            if ($inline !== '') return $this->download_asset($inline, 'mp4');
            $task_id = is_array($data) ? (string) ($data['id'] ?? $data['request_id'] ?? '') : '';
            return $task_id !== ''
                ? ['task' => ['taskType' => 'grok', 'upstreamId' => $task_id]]
                : $this->provider_error($remote, 'Grok video response did not contain a task id.');
        }

        if ($protocol === 'openrouter') {
            $wire_model = str_starts_with($model, 'openrouter/') ? substr($model, strlen('openrouter/')) : $model;
            $resolution = '720p';
            if (preg_match('/:(480p|720p|1080p)$/', $wire_model, $match)) {
                $wire_model = substr($wire_model, 0, -strlen($match[0]));
                $resolution = $match[1];
            }
            $remote = $this->remote(rtrim($base, '/') . '/videos', [
                'headers' => [
                    'content-type' => 'application/json',
                    'authorization' => 'Bearer ' . $key,
                    'HTTP-Referer' => home_url('/'),
                    'X-Title' => 'Pixflow Design',
                ],
                'body' => wp_json_encode([
                    'model' => $wire_model,
                    'prompt' => $prompt,
                    'aspect_ratio' => $this->google_aspect($aspect),
                    'resolution' => $resolution,
                    'duration' => $duration,
                ]),
            ]);
            if (is_wp_error($remote)) return $remote;
            $data = $this->decode($remote);
            $task_id = is_array($data) ? (string) ($data['id'] ?? '') : '';
            $poll_url = is_array($data) ? (string) ($data['polling_url'] ?? '') : '';
            if ($task_id === '' || $poll_url === '') return $this->provider_error($remote, 'OpenRouter video response did not contain a task id.');
            if ($this->validate_task_poll_url($poll_url, $base) !== null) return $this->error('unsafe_media_url', 'The provider returned an unsafe polling URL.', 502);
            return ['task' => ['taskType' => 'openrouter', 'upstreamId' => $task_id, 'pollUrl' => $poll_url]];
        }

        if ($protocol === 'aihubmix') {
            $wire_model = preg_replace('/^aihubmix-/', '', $model);
            $wire_model = is_string($wire_model) && $wire_model !== '' ? $wire_model : $model;
            $remote = $this->remote(rtrim($base, '/') . '/videos', [
                'headers' => [
                    'content-type' => 'application/json',
                    'authorization' => 'Bearer ' . $key,
                    'APP-Code' => 'DMCY9912',
                ],
                'body' => wp_json_encode([
                    'model' => $wire_model,
                    'prompt' => $prompt,
                    'size' => $this->image_size($aspect, $model),
                    'seconds' => $this->aihubmix_video_seconds($wire_model, $duration),
                ]),
            ]);
            if (is_wp_error($remote)) return $remote;
            $data = $this->decode($remote);
            $task_id = is_array($data) ? (string) ($data['id'] ?? $data['data']['id'] ?? '') : '';
            return $task_id !== ''
                ? ['task' => ['taskType' => 'aihubmix', 'upstreamId' => $task_id]]
                : $this->provider_error($remote, 'AIHubMix video response did not contain a task id.');
        }

        return $this->error('provider_not_supported', 'This video provider does not expose a daemon-free WordPress task adapter yet. Use Local CLI/Bridge for this provider.', 422);
    }

    /**
     * Submit a Google AI Studio video request.
     *
     * Veo is a long-running Gemini operation (`predictLongRunning`) while
     * Gemini Omni Flash returns an Interaction containing inline video data.
     * Both are request-scoped BYOK calls; the API key is never written to the
     * transient task record.
     */
    private function submit_google_video(string $base, string $key, string $model, string $prompt, string $aspect): array|\WP_Error
    {
        $wire_model = preg_replace('#^models/#', '', trim($model));
        $wire_model = is_string($wire_model) && $wire_model !== '' ? $wire_model : $model;
        $lower_model = strtolower($wire_model);

        if (str_contains($lower_model, 'omni-flash')) {
            $remote = $this->remote($this->append_google_path($base, '/interactions'), [
                'headers' => $this->google_headers($base, $key),
                'body' => wp_json_encode([
                    'model' => $wire_model,
                    'input' => $prompt,
                    'response_format' => [
                        'type' => 'video',
                        'aspect_ratio' => in_array($aspect, ['16:9', '9:16'], true) ? $aspect : '16:9',
                    ],
                ]),
            ]);
            if (is_wp_error($remote)) return $remote;
            $data = $this->decode($remote);
            $video = $this->find_google_interaction_video($data);
            if ($video !== null) {
                $encoded = (string) ($video['data'] ?? '');
                if ($encoded !== '') {
                    return [
                        'bytes' => base64_decode($encoded, true) ?: '',
                        'extension' => 'mp4',
                    ];
                }
                $uri = (string) ($video['uri'] ?? '');
                if ($uri !== '') return $this->download_google_asset($uri, $base, $key, 'mp4');
            }
            return $this->provider_error($remote, 'Google Gemini Omni response did not contain video data.');
        }

        $remote = $this->remote(
            $this->append_google_path($base, '/models/' . rawurlencode($wire_model) . ':predictLongRunning'),
            [
                'headers' => $this->google_headers($base, $key),
                'body' => wp_json_encode([
                    'instances' => [['prompt' => $prompt]],
                    'parameters' => [
                        'aspectRatio' => in_array($aspect, ['16:9', '9:16'], true) ? $aspect : '16:9',
                    ],
                ]),
            ],
        );
        if (is_wp_error($remote)) return $remote;
        $data = $this->decode($remote);
        $operation_name = is_array($data) ? (string) ($data['name'] ?? '') : '';
        return $operation_name !== ''
            ? ['task' => ['taskType' => 'google-veo', 'operationName' => $operation_name]]
            : $this->provider_error($remote, 'Google Veo response did not contain an operation name.');
    }

    private function poll_video_task(array $task, string $key): array|\WP_Error
    {
        $type = (string) ($task['taskType'] ?? '');
        $base = rtrim((string) ($task['baseUrl'] ?? ''), '/');
        if ($type === 'google-veo') {
            $operation_name = ltrim((string) ($task['operationName'] ?? ''), '/');
            if ($base === '' || $operation_name === '') {
                return $this->error('media_task_failed', 'The Google Veo task is missing provider context.', 502);
            }
            $url = $this->append_google_path($base, '/' . $operation_name);
            if ($this->validate_task_poll_url($url, $base) !== null) {
                return $this->error('media_task_failed', 'The Google Veo operation URL is invalid.', 502);
            }
            $remote = wp_safe_remote_get($url, [
                'timeout' => self::TIMEOUT,
                'redirection' => 0,
                'headers' => $this->google_headers($base, $key),
            ]);
            if (is_wp_error($remote)) return $remote;
            $status_code = (int) wp_remote_retrieve_response_code($remote);
            if ($status_code < 200 || $status_code >= 300) {
                return $this->provider_error($remote, 'Google Veo rejected the operation status request.');
            }
            $data = $this->decode($remote);
            if (!is_array($data)) {
                return $this->error('media_task_failed', 'Google Veo returned an invalid operation response.', 502);
            }
            if (is_array($data['error'] ?? null)) {
                return $this->error(
                    'media_task_failed',
                    sanitize_text_field((string) ($data['error']['message'] ?? 'Google Veo generation failed.')),
                    502,
                );
            }
            if (($data['done'] ?? false) !== true) {
                return [
                    'status' => 'pending',
                    'providerStatus' => 'running',
                    'detail' => 'Google Veo video task is still running.',
                ];
            }
            $video = $data['response']['generateVideoResponse']['generatedSamples'][0]['video'] ?? null;
            if (is_array($video)) {
                $encoded = (string) ($video['bytesBase64Encoded'] ?? $video['bytes_base64_encoded'] ?? '');
                if ($encoded !== '') {
                    return [
                        'status' => 'complete',
                        'bytes' => base64_decode($encoded, true) ?: '',
                        'extension' => 'mp4',
                    ];
                }
                $uri = (string) ($video['uri'] ?? '');
                if ($uri !== '') {
                    $download = $this->download_google_asset($uri, $base, $key, 'mp4');
                    if (is_wp_error($download)) return $download;
                    return $download + ['status' => 'complete'];
                }
            }
            return $this->error('media_task_failed', 'The completed Google Veo operation did not contain a downloadable video.', 502);
        }
        $upstream_id = rawurlencode((string) ($task['upstreamId'] ?? ''));
        if ($base === '' || $upstream_id === '') return $this->error('media_task_failed', 'The media task is missing provider context.', 502);

        $url = match ($type) {
            'volcengine' => $base . '/contents/generations/tasks/' . $upstream_id,
            'grok', 'aihubmix' => $this->append_api_path($base, '/videos/' . $upstream_id),
            'openrouter' => (string) ($task['pollUrl'] ?? ''),
            default => '',
        };
        if ($url === '' || $this->validate_task_poll_url($url, $base) !== null) return $this->error('media_task_failed', 'The media task polling URL is invalid.', 502);
        $headers = ['authorization' => 'Bearer ' . $key];
        if ($type === 'openrouter') {
            $headers['HTTP-Referer'] = home_url('/');
            $headers['X-Title'] = 'Pixflow Design';
        } elseif ($type === 'aihubmix') {
            $headers['APP-Code'] = 'DMCY9912';
        }
        $remote = wp_remote_get($url, [
            'timeout' => self::TIMEOUT,
            'redirection' => 0,
            'headers' => $headers,
        ]);
        if (is_wp_error($remote)) return $remote;
        $status_code = (int) wp_remote_retrieve_response_code($remote);
        if ($status_code < 200 || $status_code >= 300) return $this->provider_error($remote, 'The media task provider rejected the status request.');
        $data = $this->decode($remote);
        $status = strtolower((string) ($data['status'] ?? $data['data']['status'] ?? 'pending'));
        if (in_array($status, ['failed', 'error', 'cancelled', 'canceled', 'expired'], true)) {
            $reason = is_array($data['error'] ?? null) ? (string) ($data['error']['message'] ?? $status) : (string) ($data['error'] ?? $status);
            return $this->error('media_task_failed', sanitize_text_field($reason), 502);
        }
        if (!in_array($status, ['completed', 'succeeded', 'success', 'done'], true)) {
            return ['status' => 'pending', 'providerStatus' => $status, 'detail' => $type . ' video task is ' . $status . '.'];
        }

        $asset = '';
        if ($type === 'volcengine') {
            $asset = is_array($data['content'] ?? null) ? (string) ($data['content']['video_url'] ?? '') : '';
        } elseif ($type === 'grok') {
            $asset = is_array($data['video'] ?? null) ? (string) ($data['video']['url'] ?? '') : '';
        } elseif ($type === 'openrouter') {
            $urls = is_array($data['unsigned_urls'] ?? null) ? $data['unsigned_urls'] : [];
            $asset = is_string($urls[0] ?? null) ? $urls[0] : '';
        } elseif ($type === 'aihubmix') {
            $asset = (string) ($data['video_url'] ?? $data['url'] ?? $data['output_url'] ?? $data['data']['video_url'] ?? $data['data']['url'] ?? '');
        }
        if ($asset !== '') return $this->download_asset($asset, 'mp4');
        if ($type === 'aihubmix') {
            $content = $this->append_api_path($base, '/videos/' . $upstream_id . '/content');
            $download = wp_remote_get($content, [
                'timeout' => self::TIMEOUT,
                'redirection' => 0,
                'headers' => ['authorization' => 'Bearer ' . $key, 'APP-Code' => 'DMCY9912'],
            ]);
            if (!is_wp_error($download) && (int) wp_remote_retrieve_response_code($download) >= 200 && (int) wp_remote_retrieve_response_code($download) < 300) {
                return ['status' => 'complete', 'bytes' => (string) wp_remote_retrieve_body($download), 'extension' => 'mp4'];
            }
        }
        return $this->error('media_task_failed', 'The completed media task did not contain a downloadable video.', 502);
    }

    /** Find the REST Interactions API's model-output video content block. */
    private function find_google_interaction_video(mixed $data): ?array
    {
        if (!is_array($data)) return null;
        $steps = is_array($data['steps'] ?? null) ? $data['steps'] : [];
        foreach ($steps as $step) {
            if (!is_array($step) || ($step['type'] ?? '') !== 'model_output') continue;
            $content = is_array($step['content'] ?? null) ? $step['content'] : [];
            foreach ($content as $part) {
                if (!is_array($part) || ($part['type'] ?? '') !== 'video') continue;
                return [
                    'data' => is_string($part['data'] ?? null) ? $part['data'] : '',
                    'uri' => is_string($part['uri'] ?? null) ? $part['uri'] : '',
                ];
            }
        }
        return null;
    }

    private function download_google_asset(string $url, string $base, string $key, string $extension): array|\WP_Error
    {
        // Credentials belong to the configured API origin, not to arbitrary
        // model-output URLs or the storage host behind a signed redirect.
        $origin = static function (string $value): array {
            $parts = wp_parse_url($value);
            $scheme = strtolower((string) ($parts['scheme'] ?? ''));
            return [$scheme, strtolower((string) ($parts['host'] ?? '')), (int) ($parts['port'] ?? ($scheme === 'https' ? 443 : 80))];
        };
        $credential_origin = $origin($base);
        $headers = $origin($url) === $credential_origin ? $this->google_headers($base, $key) : [];
        $require_https = $credential_origin[0] === 'https';
        for ($hop = 0; $hop <= 3; $hop++) {
            if ($this->validate_url($url) !== null || ($require_https && $origin($url)[0] !== 'https')) {
                return $this->error('unsafe_media_url', 'The Google provider returned an unsafe media URL.', 502);
            }
            $require_https = $require_https || $origin($url)[0] === 'https';
            if ($origin($url) !== $credential_origin) $headers = [];
            $remote = wp_safe_remote_get($url, ['timeout' => self::TIMEOUT, 'redirection' => 0, 'headers' => $headers]);
            if (is_wp_error($remote)) return $remote;
            $status = (int) wp_remote_retrieve_response_code($remote);
            if ($status >= 200 && $status < 300) return ['bytes' => (string) wp_remote_retrieve_body($remote), 'extension' => $extension];
            $location = (string) wp_remote_retrieve_header($remote, 'location');
            if (!in_array($status, [301, 302, 303, 307, 308], true) || $location === '') break;
            $url = \WP_Http::make_absolute_url($location, $url);
        }
        return $this->error('media_download_failed', 'Could not download the generated Google media.', 502);
    }

    private function aihubmix_video_seconds(string $model, int $duration): int
    {
        $model = strtolower($model);
        if (str_contains($model, 'veo')) {
            return in_array($duration, [4, 6, 8], true) ? $duration : 8;
        }
        if (str_contains($model, 'sora')) {
            return in_array($duration, [4, 8, 12], true) ? $duration : 8;
        }
        return in_array($duration, [5, 10], true) ? $duration : 5;
    }

    private function validate_task_poll_url(string $url, string $base): ?\WP_Error
    {
        $validation = $this->validate_url($url);
        if ($validation !== null) return $validation;
        $url_parts = wp_parse_url($url);
        $base_parts = wp_parse_url($base);
        $url_host = strtolower((string) ($url_parts['host'] ?? ''));
        $base_host = strtolower((string) ($base_parts['host'] ?? ''));
        if ($url_host !== $base_host && $url_host !== 'openrouter.ai' && $base_host !== 'openrouter.ai') {
            return $this->error('unsafe_provider_url', 'The provider polling URL does not match the configured provider.', 400);
        }
        return null;
    }

    private function remote(string $url, array $args): array|\WP_Error
    {
        return wp_remote_request($url, array_merge([
            'method' => 'POST',
            'timeout' => self::TIMEOUT,
            'redirection' => 0,
            'data_format' => 'body',
        ], $args));
    }

    private function download_asset(string $url, string $extension): array|\WP_Error
    {
        if ($this->validate_url($url) !== null) return $this->error('unsafe_media_url', 'The provider returned an unsafe media URL.', 502);
        $remote = wp_safe_remote_get($url, ['timeout' => self::TIMEOUT, 'redirection' => 0]);
        if (is_wp_error($remote)) return $remote;
        $status = (int) wp_remote_retrieve_response_code($remote);
        if ($status < 200 || $status >= 300) return $this->error('media_download_failed', 'Could not download the generated media.', 502);

        return ['bytes' => (string) wp_remote_retrieve_body($remote), 'extension' => $extension];
    }

    /** Decode an inline data URL, raw base64 value, or safely download a URL. */
    private function media_value(string $value, string $fallback_extension): array|\WP_Error
    {
        if (preg_match('#^data:([^;]+);base64,(.+)$#s', $value, $match)) {
            $bytes = base64_decode($match[2], true);
            if ($bytes === false || $bytes === '') return $this->error('invalid_media_data', 'The provider returned invalid inline media data.', 502);
            return ['bytes' => $bytes, 'extension' => $this->extension_for_mime($match[1])];
        }
        if (preg_match('#^https?://#i', $value)) return $this->download_asset($value, $fallback_extension);
        $bytes = base64_decode($value, true);
        if ($bytes === false || $bytes === '') return $this->error('invalid_media_data', 'The provider returned invalid media data.', 502);

        return ['bytes' => $bytes, 'extension' => $fallback_extension];
    }

    private function decode(array|\WP_Error $remote): mixed
    {
        return json_decode((string) wp_remote_retrieve_body($remote), true);
    }

    private function provider_error(array|\WP_Error $remote, string $fallback): \WP_Error
    {
        if (is_wp_error($remote)) return $this->normalize_transport_error($remote);
        $data = $this->decode($remote);
        $message = is_array($data) && is_string($data['error']['message'] ?? null)
            ? $data['error']['message']
            : (is_array($data) && is_string($data['message'] ?? null) ? $data['message'] : $fallback);
        return $this->error('provider_request_failed', sanitize_text_field($message), 502);
    }

    /**
     * WordPress returns socket/DNS/TLS failures as WP_Error. Preserve the
     * useful transport message but attach an HTTP status so REST callers can
     * render a provider error instead of receiving a generic 500 response.
     */
    private function normalize_transport_error(\WP_Error $error): \WP_Error
    {
        if (!in_array($error->get_error_code(), ['http_request_failed', 'http_request_failed_timeout'], true)) {
            return $error;
        }

        $message = sanitize_text_field($error->get_error_message());
        if ($message === '') $message = 'The media provider request failed.';

        return $this->error('provider_request_failed', $message, 502);
    }

    private function validate_url(string $url): ?\WP_Error
    {
        if (!wp_http_validate_url($url)) return $this->error('invalid_provider_url', 'Provider base URL must be an http(s) URL.', 400);
        $scheme = strtolower((string) wp_parse_url($url, PHP_URL_SCHEME));
        if (!in_array($scheme, ['http', 'https'], true)) return $this->error('invalid_provider_url', 'Provider base URL must be an http(s) URL.', 400);
        $host = (string) wp_parse_url($url, PHP_URL_HOST);
        if ($host === '' || in_array(strtolower($host), ['localhost', '127.0.0.1', '::1'], true)) return $this->error('unsafe_provider_url', 'Local provider URLs are not available from the WordPress runtime.', 400);
        if (filter_var($host, FILTER_VALIDATE_IP) !== false) {
            $flags = FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE;
            if (filter_var($host, FILTER_VALIDATE_IP, $flags) === false) return $this->error('unsafe_provider_url', 'Private provider URLs are not available from the WordPress runtime.', 400);
        }

        return null;
    }

    private function append_api_path(string $base, string $suffix): string
    {
        $parts = wp_parse_url($base);
        $path = rtrim((string) ($parts['path'] ?? ''), '/');
        $path = preg_match('#/v\d+($|/)#', $path) ? $path . $suffix : $path . '/v1' . $suffix;
        $origin = ((string) ($parts['scheme'] ?? 'https')) . '://' . (string) ($parts['host'] ?? '');
        if (isset($parts['port'])) $origin .= ':' . (int) $parts['port'];
        return $origin . $path;
    }

    private function append_google_path(string $base, string $suffix): string
    {
        $parts = wp_parse_url($base);
        $path = rtrim((string) ($parts['path'] ?? ''), '/');
        if (str_ends_with($path, '/v1')) {
            $path = substr($path, 0, -strlen('/v1')) . '/v1beta';
        } elseif (!str_ends_with($path, '/v1beta')) {
            $path .= '/v1beta';
        }
        $origin = ((string) ($parts['scheme'] ?? 'https')) . '://' . (string) ($parts['host'] ?? '');
        if (isset($parts['port'])) $origin .= ':' . (int) $parts['port'];
        return $origin . $path . $suffix;
    }

    private function google_headers(string $base, string $key): array
    {
        $host = strtolower((string) wp_parse_url($base, PHP_URL_HOST));
        return $host === 'generativelanguage.googleapis.com'
            ? ['content-type' => 'application/json', 'x-goog-api-key' => $key]
            : ['content-type' => 'application/json', 'authorization' => 'Bearer ' . $key];
    }

    private function wire_model(string $model, string $protocol): string
    {
        $wired = $protocol === 'aihubmix' ? preg_replace('/^aihubmix-/', '', $model) : $model;
        return is_string($wired) ? $wired : $model;
    }

    private function image_size(string $aspect, string $model = ''): string
    {
        if (str_starts_with($model, 'gpt-image-') || $model === 'dall-e-3') {
            return match ($aspect) {
                '16:9' => '1792x1024',
                '9:16' => '1024x1792',
                '4:3' => '1408x1056',
                '3:4' => '1056x1408',
                default => '1024x1024',
            };
        }
        return match ($aspect) {
            '16:9' => '1280x720',
            '9:16' => '720x1280',
            '4:3' => '1024x768',
            '3:4' => '768x1024',
            default => '1024x1024',
        };
    }

    private function senseaudio_size(string $aspect): string
    {
        return match ($aspect) {
            '16:9' => '1280x720',
            '9:16' => '720x1280',
            '4:3' => '1024x768',
            '3:4' => '768x1024',
            default => '1024x1024',
        };
    }

    private function google_aspect(string $aspect): string
    {
        return in_array($aspect, ['1:1', '16:9', '9:16', '4:3', '3:4'], true) ? $aspect : '1:1';
    }

    private function find_inline_data(mixed $data): ?array
    {
        if (!is_array($data)) return null;
        foreach (($data['candidates'] ?? []) as $candidate) {
            foreach (($candidate['content']['parts'] ?? []) as $part) {
                if (is_array($part) && is_array($part['inlineData'] ?? null) && is_string($part['inlineData']['data'] ?? null)) {
                    return $part['inlineData'];
                }
            }
        }

        return null;
    }

    private function extension_for_mime(string $mime): string
    {
        return match (strtolower(trim(explode(';', $mime)[0]))) {
            'image/jpeg' => 'jpg',
            'image/webp' => 'webp',
            default => 'png',
        };
    }

    private function error(string $code, string $message, int $status): \WP_Error
    {
        return new \WP_Error($code, $message, ['status' => $status]);
    }
}
