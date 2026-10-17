<?php
declare(strict_types=1);

namespace PixflowDesign\WordPress\Media;

if (!defined('ABSPATH')) { exit; }

final class UnsplashConnectionService
{
    /** Test the supplied draft key without storing or returning credentials. */
    public function test(array $input): array
    {
        $key = is_string($input['apiKey'] ?? null) ? trim($input['apiKey']) : '';
        $result = ['ok' => false, 'kind' => 'missing_key', 'status' => 400, 'limit' => null, 'remaining' => null];
        if ($key === '') return $result;

        $remote = wp_remote_get('https://api.unsplash.com/photos?page=1&per_page=1', [
            'timeout' => 15,
            'redirection' => 0,
            'headers' => ['Authorization' => 'Client-ID ' . $key, 'Accept-Version' => 'v1'],
        ]);
        $status = is_wp_error($remote) ? 0 : (int) wp_remote_retrieve_response_code($remote);
        $result['status'] = $status;
        $result['ok'] = $status >= 200 && $status < 300;
        $result['kind'] = $result['ok'] ? 'success' : match ($status) {
            401, 403 => 'auth_failed',
            429 => 'rate_limited',
            default => 'upstream_error',
        };
        if (!is_wp_error($remote)) {
            foreach (['limit', 'remaining'] as $field) {
                $value = (string) wp_remote_retrieve_header($remote, 'x-ratelimit-' . $field);
                $result[$field] = ctype_digit($value) ? (int) $value : null;
            }
        }
        return $result;
    }
}
