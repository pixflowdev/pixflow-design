<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\License;

if (!defined('ABSPATH')) {
    exit;
}

final class SiteIdentity
{
    public const PRODUCT_SLUG = 'pixflow-ai';

    public function current_payload(): array
    {
        global $wp_version;

        $site_url = self::normalize_url(site_url('/'));
        $home_url = self::normalize_url(home_url('/'));
        $host = wp_parse_url($home_url ?: $site_url, PHP_URL_HOST);
        $site_host = is_string($host) ? strtolower(trim($host)) : '';
        $is_local_site = self::is_local_site($site_url, $home_url, $site_host);

        $payload = [
            'site_url' => $site_url,
            'home_url' => $home_url,
            'site_host' => $site_host,
            // Pixflow-owned: preserve the existing Pixflow AI license product
            // identity so current customers can update into Pixflow Design.
            'product' => self::PRODUCT_SLUG,
            'plugin_version' => PIXFLOW_DESIGN_VERSION,
            'wordpress_version' => is_string($wp_version) ? $wp_version : '',
            'php_version' => PHP_VERSION,
        ];

        if ($is_local_site) {
            // Pixflow-owned: local/dev sites still require a valid license key,
            // but must not consume a customer's production activation count.
            // The licensing server treats this as validation-only access.
            $payload['site_environment'] = 'local';
            $payload['is_local_site'] = true;
            $payload['activation_mode'] = 'validate_only';
        } else {
            $payload['site_environment'] = 'production';
            $payload['is_local_site'] = false;
            $payload['activation_mode'] = 'activate';
        }

        return $payload;
    }

    public function fingerprint(array $payload): string
    {
        return hash('sha256', implode('|', [
            (string) ($payload['site_url'] ?? home_url('/')),
            (string) ($payload['home_url'] ?? home_url('/')),
            (string) ($payload['site_host'] ?? wp_parse_url(home_url('/'), PHP_URL_HOST)),
            (string) ($payload['product'] ?? self::PRODUCT_SLUG),
        ]));
    }

    public static function normalize_url(string $url): string
    {
        return rtrim(trim($url), '/');
    }

    private static function is_local_site(string $site_url, string $home_url, string $site_host): bool
    {
        if (in_array($site_host, ['localhost', '127.0.0.1', '::1'], true)) {
            return true;
        }

        if (
            str_ends_with($site_host, '.local')
            || str_ends_with($site_host, '.test')
            || str_ends_with($site_host, '.localhost')
        ) {
            return true;
        }

        foreach ([$site_url, $home_url] as $url) {
            $host = wp_parse_url($url, PHP_URL_HOST);
            if (!is_string($host)) {
                continue;
            }
            $host = strtolower(trim($host));
            if (preg_match('/^(10|127)\./', $host) === 1) {
                return true;
            }
            if (preg_match('/^192\.168\./', $host) === 1) {
                return true;
            }
            if (preg_match('/^172\.(1[6-9]|2\d|3[0-1])\./', $host) === 1) {
                return true;
            }
        }

        return false;
    }

    public static function mask_license_key(string $license_key): string
    {
        $license_key = trim($license_key);
        if ($license_key === '') {
            return '';
        }

        return substr($license_key, 0, 4)
            . str_repeat('*', max(4, strlen($license_key) - 8))
            . substr($license_key, -4);
    }
}
