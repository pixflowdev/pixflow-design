<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\License;

if (!defined('ABSPATH')) {
    exit;
}

final class BridgeEntitlement
{
    private const PRODUCT_SLUG = 'pixflow-design';
    private const TOKEN_VERSION = 1;
    private const TTL_SECONDS = 86400;
    private const GRACE_SECONDS = 86400;
    // Pixflow-owned: local bridge entitlements are signed by WordPress and
    // checked by the Pixflow Design daemon before mutating/generation calls.
    private const SIGNING_KEY = 'pixflow-design-local-entitlement-v1';

    public function issue(array $license_summary, array $site_identity): array
    {
        if (CentralEntitlements::enabled()) return [];
        if (($license_summary['valid'] ?? false) !== true) {
            return [];
        }

        $issued_at = time();
        $expires_at = $issued_at + self::TTL_SECONDS;
        $grace_expires_at = $expires_at + self::GRACE_SECONDS;

        $payload = [
            'version' => self::TOKEN_VERSION,
            'product' => self::PRODUCT_SLUG,
            'site_url' => (string) ($site_identity['site_url'] ?? ''),
            'home_url' => (string) ($site_identity['home_url'] ?? ''),
            'site_host' => (string) ($site_identity['site_host'] ?? ''),
            'site_fingerprint' => (string) ($license_summary['site_fingerprint'] ?? ''),
            'license_id' => (string) ($license_summary['license_id'] ?? ''),
            'purchase_id' => (string) ($license_summary['purchase_id'] ?? ''),
            'plugin_version' => PIXFLOW_DESIGN_VERSION,
            'issued_at' => gmdate('c', $issued_at),
            'expires_at' => gmdate('c', $expires_at),
            'grace_expires_at' => gmdate('c', $grace_expires_at),
            'expires_at_unix' => $expires_at,
            'grace_expires_at_unix' => $grace_expires_at,
        ];

        $payload_segment = self::base64url_encode((string) wp_json_encode($payload));
        $signature = hash_hmac('sha256', $payload_segment, self::SIGNING_KEY);

        return [
            'token' => $payload_segment . '.' . $signature,
            'issued_at' => $payload['issued_at'],
            'expires_at' => $payload['expires_at'],
            'grace_expires_at' => $payload['grace_expires_at'],
            'ttl_seconds' => self::TTL_SECONDS,
            'grace_seconds' => self::GRACE_SECONDS,
        ];
    }

    private static function base64url_encode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }
}
