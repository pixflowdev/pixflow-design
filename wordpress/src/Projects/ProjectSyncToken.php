<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Projects;

if (!defined('ABSPATH')) {
    exit;
}

final class ProjectSyncToken
{
    private const TTL_SECONDS = 3600;

    public function issue(): array
    {
        $user_id = get_current_user_id();
        if ($user_id <= 0 || !current_user_can('edit_posts')) {
            return [
                'ok' => false,
                'code' => 'forbidden',
                'message' => 'You do not have permission to sync Pixflow projects.',
                'status' => 403,
            ];
        }

        $token = function_exists('wp_generate_password')
            ? wp_generate_password(48, false, false)
            : bin2hex(random_bytes(24));

        // Pixflow-owned: local bridge uploads originate from 127.0.0.1 and
        // cannot carry WordPress cookies. This token is short-lived and scoped
        // to project sync endpoints only.
        set_transient($this->storage_key($token), [
            'user_id' => $user_id,
            'issued_at' => time(),
        ], self::TTL_SECONDS);

        return [
            'ok' => true,
            'token' => $token,
            'expiresIn' => self::TTL_SECONDS,
        ];
    }

    public function authenticate(): bool
    {
        $token = $this->request_token();
        if ($token === '') {
            return false;
        }

        $payload = get_transient($this->storage_key($token));
        if (!is_array($payload)) {
            return false;
        }

        $user_id = (int) ($payload['user_id'] ?? 0);
        if ($user_id <= 0 || get_user_by('id', $user_id) === false) {
            return false;
        }

        wp_set_current_user($user_id);

        return current_user_can('edit_posts');
    }

    private function request_token(): string
    {
        $header = (string) ($_SERVER['HTTP_X_PIXFLOW_SYNC_TOKEN'] ?? '');
        if ($header !== '') {
            return sanitize_text_field($header);
        }

        $authorization = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? '');
        if (preg_match('/^Bearer\s+(.+)$/i', $authorization, $matches)) {
            return sanitize_text_field((string) $matches[1]);
        }

        return '';
    }

    private function storage_key(string $token): string
    {
        return 'pixflow_project_sync_' . hash('sha256', $token . wp_salt('auth'));
    }
}
