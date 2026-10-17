<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Http\Routes;

use PixflowDesign\WordPress\Onboarding\UserOnboardingProfile;

if (!defined('ABSPATH')) {
    exit;
}

final class OnboardingRoutes
{
    private const NAMESPACE = 'pixflow-design/v1';

    public function __construct(
        private readonly UserOnboardingProfile $profiles = new UserOnboardingProfile(),
    ) {
    }

    public function register(): void
    {
        // Pixflow-owned: onboarding is per WordPress user and mirrored into
        // the local bridge so fresh browsers/bridges can hydrate from WP.
        register_rest_route(self::NAMESPACE, '/onboarding/profile', [
            [
                'methods' => 'GET',
                'callback' => [$this, 'get'],
                'permission_callback' => [$this, 'can_use_onboarding'],
            ],
            [
                'methods' => ['POST', 'PUT', 'PATCH'],
                'callback' => [$this, 'save'],
                'permission_callback' => [$this, 'can_use_onboarding'],
            ],
            [
                'methods' => 'DELETE',
                'callback' => [$this, 'reset'],
                'permission_callback' => [$this, 'can_use_onboarding'],
            ],
        ]);
    }

    public function can_use_onboarding(): bool
    {
        return current_user_can('edit_posts');
    }

    public function get(): \WP_REST_Response
    {
        return $this->response([
            'ok' => true,
            'profile' => $this->profiles->get(get_current_user_id()),
            'userId' => get_current_user_id(),
        ]);
    }

    public function save(\WP_REST_Request $request): \WP_REST_Response
    {
        $body = $request->get_json_params();
        $body = is_array($body) ? $body : [];
        $profile = is_array($body['profile'] ?? null) ? $body['profile'] : $body;

        return $this->response([
            'ok' => true,
            'profile' => $this->profiles->save(get_current_user_id(), $profile),
            'userId' => get_current_user_id(),
        ]);
    }

    public function reset(): \WP_REST_Response
    {
        return $this->response([
            'ok' => true,
            'profile' => $this->profiles->reset(get_current_user_id()),
            'userId' => get_current_user_id(),
        ]);
    }

    private function response(array $data, int $status = 200): \WP_REST_Response
    {
        return new \WP_REST_Response($data, $status);
    }
}
