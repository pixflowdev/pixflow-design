<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\License;

if (!defined('ABSPATH')) {
    exit;
}

/** Directory builds use the site's WordPress HTTP transport exclusively. */
final class LicenseHttpClient
{
    public function post_json(string $url, array $payload): array|\WP_Error
    {
        $response = wp_remote_post($url, [
            'timeout' => 20,
            'redirection' => 0,
            'headers' => [
                'Accept' => 'application/json',
                'Content-Type' => 'application/json',
            ],
            'body' => wp_json_encode($payload),
        ]);

        if (is_wp_error($response)) {
            return $response;
        }

        return [
            'status' => (int) wp_remote_retrieve_response_code($response),
            'body' => (string) wp_remote_retrieve_body($response),
        ];
    }
}
