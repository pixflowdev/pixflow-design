<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Http\Routes;

use PixflowDesign\WordPress\Resources\ResourcePackInstallService;

if (!defined('ABSPATH')) {
    exit;
}

final class ResourcePackRoutes
{
    private const NAMESPACE = 'pixflow-design/v1';

    public function __construct(
        private readonly ResourcePackInstallService $packs = new ResourcePackInstallService(),
    ) {
    }

    public function register(): void
    {
        add_action('rest_api_init', [$this, 'register_routes']);
    }

    public function register_routes(): void
    {
        register_rest_route(self::NAMESPACE, '/resource-packs', [
            'methods' => 'GET',
            'callback' => [$this, 'catalog'],
            'permission_callback' => [$this, 'can_use_resource_packs'],
            'args' => [
                'refresh' => [
                    'type' => 'boolean',
                    'required' => false,
                    'default' => false,
                ],
            ],
        ]);

        register_rest_route(self::NAMESPACE, '/resource-packs/refresh', [
            'methods' => 'POST',
            'callback' => [$this, 'refresh'],
            'permission_callback' => [$this, 'can_use_resource_packs'],
        ]);

        register_rest_route(self::NAMESPACE, '/resource-packs/(?P<slug>[a-z0-9_-]+)', [
            [
                'methods' => 'GET',
                'callback' => [$this, 'detail'],
                'permission_callback' => [$this, 'can_use_resource_packs'],
            ],
            [
                'methods' => 'DELETE',
                'callback' => [$this, 'delete'],
                'permission_callback' => [$this, 'can_manage_resource_packs'],
            ],
        ]);

        register_rest_route(self::NAMESPACE, '/resource-packs/(?P<slug>[a-z0-9_-]+)/install', [
            'methods' => 'POST',
            'callback' => [$this, 'install'],
            'permission_callback' => [$this, 'can_manage_resource_packs'],
        ]);

        register_rest_route(self::NAMESPACE, '/resource-packs/(?P<slug>[a-z0-9_-]+)/update', [
            'methods' => 'POST',
            'callback' => [$this, 'update'],
            'permission_callback' => [$this, 'can_manage_resource_packs'],
        ]);

        register_rest_route(self::NAMESPACE, '/resource-packs/(?P<slug>[a-z0-9_-]+)/repair', [
            'methods' => 'POST',
            'callback' => [$this, 'repair'],
            'permission_callback' => [$this, 'can_manage_resource_packs'],
        ]);

        register_rest_route(self::NAMESPACE, '/resource-packs/operations/(?P<operation>[a-z0-9_-]+)', [
            'methods' => 'GET',
            'callback' => [$this, 'operation'],
            'permission_callback' => [$this, 'can_use_resource_packs'],
        ]);
    }

    public function can_use_resource_packs(): bool
    {
        return current_user_can('edit_posts');
    }

    public function can_manage_resource_packs(): bool
    {
        return current_user_can('manage_options') || current_user_can('edit_theme_options');
    }

    public function catalog(\WP_REST_Request $request): \WP_REST_Response
    {
        return $this->response($this->packs->catalog((bool) $request->get_param('refresh')));
    }

    public function refresh(): \WP_REST_Response
    {
        return $this->response($this->packs->catalog(true));
    }

    public function detail(\WP_REST_Request $request): \WP_REST_Response
    {
        $slug = sanitize_key((string) $request['slug']);
        $catalog = $this->packs->catalog(false);
        foreach ($catalog['packs'] as $pack) {
            if ((string) ($pack['slug'] ?? '') === $slug) {
                return $this->response(['ok' => true, 'pack' => $pack]);
            }
        }

        return $this->response(['ok' => false, 'error' => ['message' => 'Resource pack not found.']], 404);
    }

    public function install(\WP_REST_Request $request): \WP_REST_Response
    {
        $result = $this->packs->install((string) $request['slug'], false, 'install');

        return $this->response($result, $this->status_for_result($result));
    }

    public function update(\WP_REST_Request $request): \WP_REST_Response
    {
        $result = $this->packs->install((string) $request['slug'], true, 'update');

        return $this->response($result, $this->status_for_result($result));
    }

    public function delete(\WP_REST_Request $request): \WP_REST_Response
    {
        return $this->response($this->packs->uninstall((string) $request['slug']));
    }

    public function repair(\WP_REST_Request $request): \WP_REST_Response
    {
        $result = $this->packs->repair((string) $request['slug']);

        return $this->response($result, $this->status_for_result($result));
    }

    public function operation(\WP_REST_Request $request): \WP_REST_Response
    {
        $result = $this->packs->operation_status((string) $request['operation']);

        return $this->response($result, !empty($result['ok']) ? 200 : 404);
    }

    private function response(array $payload, int $status = 200): \WP_REST_Response
    {
        return new \WP_REST_Response($payload, $status);
    }

    private function status_for_result(array $result): int
    {
        if (!empty($result['ok'])) {
            return 200;
        }

        $status = (int) ($result['httpStatus'] ?? 400);

        return $status >= 400 && $status <= 599 ? $status : 400;
    }
}
