<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Http\Routes;

use PixflowDesign\WordPress\Pages\BuilderDestinations;

if (!defined('ABSPATH')) exit;

/** Cookie/nonce authenticated site operations, shared by UI and CLI. */
final class BuilderDestinationRoutes
{
    public function register(): void
    {
        register_rest_route('pixflow-design/v1', '/builder-destinations', [
            'methods' => ['GET', 'POST'], 'permission_callback' => [$this, 'allowed'], 'callback' => [$this, 'handle'],
        ]);
    }
    public function allowed(\WP_REST_Request $request): bool
    {
        return get_current_user_id() > 0 && current_user_can('manage_options') && current_user_can('edit_posts')
            && (bool) wp_verify_nonce($request->get_header('X-WP-Nonce'), 'wp_rest');
    }
    public function handle(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        if (!$this->allowed($request)) return new \WP_Error('pixflow_destination_forbidden', 'You cannot open builder destinations.', ['status' => 403]);
        $service = new BuilderDestinations();
        $result = $request->get_method() === 'GET'
            ? $service->listing($request->get_param('builder'), $request->get_param('search'))
            : $service->mutate($request->get_json_params());
        return $result instanceof \WP_Error ? $result : new \WP_REST_Response($result, 200, ['Cache-Control' => 'no-store']);
    }
}
