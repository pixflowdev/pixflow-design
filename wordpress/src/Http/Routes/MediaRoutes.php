<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Http\Routes;

use PixflowDesign\WordPress\Media\MediaLibraryService;
use PixflowDesign\WordPress\Media\MediaGenerationService;

if (!defined('ABSPATH')) {
    exit;
}

final class MediaRoutes
{
    private const NAMESPACE = 'pixflow-design/v1';

    public function __construct(
        private readonly MediaLibraryService $media = new MediaLibraryService(),
        private readonly MediaGenerationService $generation = new MediaGenerationService(),
    ) {
    }

    public function register(): void
    {
        add_action('rest_api_init', [$this, 'register_routes']);
    }

    public function register_routes(): void
    {
        register_rest_route(self::NAMESPACE, '/media', [
            [
                'methods' => 'GET',
                'callback' => [$this, 'list'],
                'permission_callback' => [$this, 'can_view_media'],
            ],
        ]);

        register_rest_route(self::NAMESPACE, '/media/import-wp', [
            [
                'methods' => 'POST',
                'callback' => [$this, 'import_wp'],
                'permission_callback' => [$this, 'can_manage_media'],
            ],
        ]);

        register_rest_route(self::NAMESPACE, '/media/attachments/(?P<id>\d+)/content', [
            [
                'methods' => 'GET',
                'callback' => [$this, 'attachment_content'],
                'permission_callback' => [$this, 'can_view_media'],
                'args' => [
                    'id' => [
                        'required' => true,
                        'sanitize_callback' => 'absint',
                    ],
                ],
            ],
        ]);

        register_rest_route(self::NAMESPACE, '/media/upload', [
            [
                'methods' => 'POST',
                'callback' => [$this, 'upload'],
                'permission_callback' => [$this, 'can_manage_media'],
            ],
        ]);

        register_rest_route(self::NAMESPACE, '/media/save-generated', [
            [
                'methods' => 'POST',
                'callback' => [$this, 'save_generated'],
                'permission_callback' => [$this, 'can_manage_media'],
            ],
        ]);

        register_rest_route(self::NAMESPACE, '/media/generate', [
            [
                'methods' => 'POST',
                'callback' => [$this, 'generate'],
                'permission_callback' => [$this, 'can_manage_media'],
            ],
        ]);

        register_rest_route(self::NAMESPACE, '/media/tasks/(?P<id>[A-Za-z0-9-]+)', [
            [
                'methods' => 'POST',
                'callback' => [$this, 'poll_task'],
                'permission_callback' => [$this, 'can_manage_media'],
                'args' => [
                    'id' => [
                        'required' => true,
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                ],
            ],
        ]);
    }

    public function can_view_media(): bool
    {
        return current_user_can('upload_files') || current_user_can('edit_posts');
    }

    public function can_manage_media(): bool
    {
        return current_user_can('upload_files');
    }

    public function list(\WP_REST_Request $request): \WP_REST_Response
    {
        $result = $this->media->list([
            'page' => (int) $request->get_param('page'),
            'perPage' => (int) $request->get_param('perPage'),
            'type' => (string) ($request->get_param('type') ?? 'all'),
            'source' => (string) ($request->get_param('source') ?? 'all'),
            'search' => (string) ($request->get_param('search') ?? ''),
        ]);

        return $this->response([
            'ok' => true,
            ...$result,
        ]);
    }

    public function import_wp(\WP_REST_Request $request): \WP_REST_Response
    {
        $body = $request->get_json_params();
        $ids = is_array($body) && is_array($body['attachmentIds'] ?? null)
            ? array_values(array_filter(array_map('intval', $body['attachmentIds'])))
            : [];

        return $this->response([
            'ok' => true,
            'items' => $this->media->import_wp_attachments($ids),
        ]);
    }

    public function attachment_content(\WP_REST_Request $request): \WP_REST_Response
    {
        $item = $this->media->read_attachment_content((int) $request->get_param('id'));
        if (is_wp_error($item)) {
            return $this->error_response($item);
        }

        return $this->response([
            'ok' => true,
            'item' => $item,
        ]);
    }

    public function upload(\WP_REST_Request $request): \WP_REST_Response
    {
        $item = $this->media->handle_upload('file', [
            'source' => sanitize_key((string) ($request->get_param('source') ?? '')),
            'projectUuid' => sanitize_text_field((string) ($request->get_param('projectUuid') ?? '')),
            'prompt' => sanitize_textarea_field((string) ($request->get_param('prompt') ?? '')),
            'provider' => sanitize_text_field((string) ($request->get_param('provider') ?? '')),
            'surface' => sanitize_key((string) ($request->get_param('surface') ?? '')),
            'title' => sanitize_text_field((string) ($request->get_param('title') ?? '')),
            'altText' => sanitize_text_field((string) ($request->get_param('altText') ?? '')),
            'caption' => sanitize_textarea_field((string) ($request->get_param('caption') ?? '')),
            'description' => sanitize_textarea_field((string) ($request->get_param('description') ?? '')),
        ]);
        if (is_wp_error($item)) {
            return $this->error_response($item);
        }

        return $this->response([
            'ok' => true,
            'item' => $item,
        ]);
    }

    public function save_generated(\WP_REST_Request $request): \WP_REST_Response
    {
        if (!\PixflowDesign\WordPress\Modules\ImageGenerationAccess::available()) return $this->error_response(new \WP_Error('pixflow_pro_image_generation_required', 'Generated-image import requires Pixflow Design Pro.', ['status' => 403]));
        $body = $request->get_json_params();
        $item = $this->media->save_generated(is_array($body) ? $body : []);
        if (is_wp_error($item)) {
            return $this->error_response($item);
        }

        return $this->response([
            'ok' => true,
            'item' => $item,
        ]);
    }

    public function generate(\WP_REST_Request $request): \WP_REST_Response
    {
        // Keep PHP above the media transport timeout so slow providers return
        // structured JSON instead of terminating the request with a fatal.
        if (function_exists('set_time_limit')) @set_time_limit(240);
        $body = $request->get_json_params();
        $result = $this->generation->generate(is_array($body) ? $body : []);
        if (is_wp_error($result)) return $this->error_response($result);

        return $this->response($result);
    }

    public function poll_task(\WP_REST_Request $request): \WP_REST_Response
    {
        if (function_exists('set_time_limit')) @set_time_limit(240);
        $body = $request->get_json_params();
        $body = is_array($body) ? $body : [];
        $body['taskId'] = sanitize_text_field((string) $request->get_param('id'));
        $result = $this->generation->poll($body);
        if (is_wp_error($result)) return $this->error_response($result);

        return $this->response($result);
    }

    private function response(array $payload, int $status = 200): \WP_REST_Response
    {
        return new \WP_REST_Response($payload, $status);
    }

    private function error_response(\WP_Error $error): \WP_REST_Response
    {
        $data = $error->get_error_data();
        $status = is_array($data) && isset($data['status']) ? (int) $data['status'] : 500;
        return $this->response([
            'ok' => false,
            'code' => $error->get_error_code(),
            'message' => $error->get_error_message(),
        ], $status);
    }
}
