<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Http\Routes;
use PixflowDesign\WordPress\Pages\BuilderHandoffs;
if (!defined('ABSPATH')) exit;

final class BuilderHandoffRoutes
{
    public function register(): void
    {
        register_rest_route('pixflow-design/v1', '/builder-handoffs', ['methods' => ['GET', 'POST'], 'permission_callback' => [$this, 'allowed'], 'callback' => [$this, 'handle']]);
    }
    public function allowed(\WP_REST_Request $request): bool { return (new BuilderDestinationRoutes())->allowed($request); }
    public function handle(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        if (!$this->allowed($request)) return new \WP_Error('pixflow_handoff_forbidden', 'You cannot manage builder handoffs.', ['status' => 403]);
        try {
            $service = new BuilderHandoffs();
            $result = $request->get_method() === 'GET'
                ? $service->lookup($request->get_param('id'), $request->get_param('projectId'), $request->get_param('conversationId'))
                : $service->mutate($request->get_json_params());
            return $result instanceof \WP_Error ? $result : new \WP_REST_Response($result, 200, ['Cache-Control' => 'no-store']);
        } catch (\Throwable $error) {
            return new \WP_Error('pixflow_handoff_storage', 'The handoff could not be confirmed. Reopen its status before retrying.', ['status' => 503]);
        }
    }
}
