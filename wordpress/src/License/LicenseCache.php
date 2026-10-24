<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\License;

use PixflowDesign\WordPress\Security\SecretBox;

if (!defined('ABSPATH')) {
    exit;
}

final class LicenseCache
{
    private const OPTION_KEY = 'pixflow_design_site_license_cache';
    private const LEGACY_OPTION_KEY = 'pixflow_ai_site_license_cache';
    private const LEGACY_MIGRATION_OPTION_KEY = 'pixflow_design_site_license_legacy_migrated_at';

    public function summary(): array
    {
        $cache = $this->read();
        if ($cache === [] || isset($cache['reset_marker'])) {
            return [
                'present' => false,
                'valid' => false,
                'status' => 'missing',
                'message' => 'Free WordPress and Gutenberg editing is ready. Add a licence for Pixflow Design Pro.',
                'site_fingerprint' => '',
                'license_id' => '',
                'purchase_id' => '',
                'license_key_masked' => '',
                'license_expires_at' => '',
                'activation_limit' => null,
                'activations_count' => null,
                'template_access_token_present' => false,
                'template_access_token_expires_at' => '',
                'last_validated_at' => '',
                'updated_at' => '',
            ];
        }

        $expired = $this->is_expired($cache);
        $present = !empty($cache['encrypted_license_key']) && !empty($cache['site_fingerprint']);
        $readable = $present && SecretBox::decrypt((string) $cache['encrypted_license_key']) !== '';

        return [
            'present' => $present,
            'valid' => $present && $readable && !$expired,
            'status' => $expired ? 'expired' : ($present ? ($readable ? 'active' : 'unreadable') : 'missing'),
            'message' => $expired ? 'Your Pixflow Design Pro licence has expired. Free WordPress and Gutenberg editing remains available.' : ($present && !$readable ? 'The saved licence key cannot be decrypted. WordPress security keys may have changed. Restore those keys or reconnect your licence. Your encrypted key and content have been kept.' : ''),
            'site_fingerprint' => (string) ($cache['site_fingerprint'] ?? ''),
            'license_id' => (string) ($cache['license_id'] ?? ''),
            'purchase_id' => (string) ($cache['purchase_id'] ?? ''),
            'license_key_masked' => (string) ($cache['license_key_masked'] ?? ''),
            'license_expires_at' => (string) ($cache['license_expires_at'] ?? ''),
            'activation_limit' => $this->nullable_int($cache['activation_limit'] ?? null),
            'activations_count' => $this->nullable_int($cache['activations_count'] ?? null),
            'template_access_token_present' => !empty($cache['encrypted_template_access_token']),
            'template_access_token_expires_at' => (string) ($cache['template_access_token_expires_at'] ?? ''),
            'last_validated_at' => (string) ($cache['last_validated_at'] ?? ''),
            'updated_at' => (string) ($cache['updated_at'] ?? ''),
            'validation_url' => (string) ($cache['validation_url'] ?? 'https://pixflow.dev/wp-json/pixflow-ai/v1/license/validate'),
        ];
    }

    public function private_payload(): array
    {
        $cache = $this->read();
        if ($cache === [] || $this->is_expired($cache)) {
            return [];
        }

        $license_key = SecretBox::decrypt((string) ($cache['encrypted_license_key'] ?? ''));
        if ($license_key === '') {
            return [];
        }

        return [
            'license_key' => $license_key,
            'validation_url' => (string) ($cache['validation_url'] ?? 'https://pixflow.dev/wp-json/pixflow-ai/v1/license/validate'),
            'site_fingerprint' => (string) ($cache['site_fingerprint'] ?? ''),
            'license_id' => (string) ($cache['license_id'] ?? ''),
            'purchase_id' => (string) ($cache['purchase_id'] ?? ''),
            'template_access_token' => SecretBox::decrypt((string) ($cache['encrypted_template_access_token'] ?? '')),
            'template_access_token_expires_at' => (string) ($cache['template_access_token_expires_at'] ?? ''),
            'template_access_token_issued_at' => (string) ($cache['template_access_token_issued_at'] ?? ''),
            'template_access_token_ttl_seconds' => (int) ($cache['template_access_token_ttl_seconds'] ?? 0),
        ];
    }

    /** Expired credentials may request fresh validation, never authorize access. */
    public function renewal_credentials(): array
    {
        $cache = $this->read();
        if (!$this->is_expired($cache)) return [];
        $key = SecretBox::decrypt((string) ($cache['encrypted_license_key'] ?? ''));
        if ($key === '') return [];
        return ['license_key' => $key, 'site_fingerprint' => (string) ($cache['site_fingerprint'] ?? ''),
            'validation_url' => (string) ($cache['validation_url'] ?? '')];
    }

    public function persist(string $site_fingerprint, string $license_key, array $upstream_body, string $validation_url = 'https://pixflow.dev/api/licensing/v1/validate', ?array $expected = null): bool
    {
        $license_key = trim($license_key);
        if ($site_fingerprint === '' || $license_key === '') {
            return false;
        }

        $license_key_masked = trim((string) ($upstream_body['license_key_masked'] ?? ''));
        if ($license_key_masked === '') {
            $license_key_masked = SiteIdentity::mask_license_key($license_key);
        }

        $license_expires_at = trim((string) (
            $upstream_body['license_expires_at']
            ?? $upstream_body['license_expiry']
            ?? ''
        ));

        // Pixflow-owned: retain the remote template access token server-side so
        // the template library can be license-gated without exposing it to JS.
        $template_access_token = trim((string) ($upstream_body['template_access_token'] ?? ''));
        $existing_cache = $this->read();
        $same_site_existing_cache = $existing_cache !== []
            && (string) ($existing_cache['license_id'] ?? '') === trim((string) ($upstream_body['license_id'] ?? ''))
            && hash_equals((string) ($existing_cache['site_fingerprint'] ?? ''), $site_fingerprint)
            && hash_equals(SecretBox::decrypt((string) ($existing_cache['encrypted_license_key'] ?? '')), $license_key)
            && ($existing_cache['validation_url'] ?? 'https://pixflow.dev/wp-json/pixflow-ai/v1/license/validate') === $validation_url;
        $encrypted_template_access_token = $template_access_token !== ''
            ? SecretBox::encrypt($template_access_token)
            : ($same_site_existing_cache ? (string) ($existing_cache['encrypted_template_access_token'] ?? '') : '');

        $replacement = [
            'validation_url' => $validation_url,
            'site_fingerprint' => $site_fingerprint,
            'encrypted_license_key' => SecretBox::encrypt($license_key),
            'license_id' => trim((string) ($upstream_body['license_id'] ?? '')),
            'purchase_id' => trim((string) ($upstream_body['purchase_id'] ?? '')),
            'license_key_masked' => $license_key_masked,
            'license_expires_at' => $license_expires_at,
            'license_expires_at_source' => $license_expires_at !== '' ? 'license_expires_at' : '',
            'activation_limit' => $this->nullable_int($upstream_body['activation_limit'] ?? null),
            'activations_count' => $this->nullable_int($upstream_body['activations_count'] ?? null),
            'encrypted_template_access_token' => $encrypted_template_access_token,
            'template_access_token_expires_at' => (string) ($upstream_body['template_access_token_expires_at'] ?? ($same_site_existing_cache ? (string) ($existing_cache['template_access_token_expires_at'] ?? '') : '')),
            'template_access_token_issued_at' => (string) ($upstream_body['template_access_token_issued_at'] ?? ($same_site_existing_cache ? (string) ($existing_cache['template_access_token_issued_at'] ?? '') : '')),
            'template_access_token_ttl_seconds' => (int) ($upstream_body['template_access_token_ttl_seconds'] ?? ($same_site_existing_cache ? (int) ($existing_cache['template_access_token_ttl_seconds'] ?? 0) : 0)),
            'last_validated_at' => (string) ($upstream_body['last_validated_at'] ?? gmdate('c')),
            'updated_at' => gmdate('c'),
        ];
        $committed = $expected === null ? update_option(self::OPTION_KEY, $replacement, false) : $this->replace($expected, $replacement);
        if ($committed && !$same_site_existing_cache && class_exists(\PixflowDesign\WordPress\Templates\TemplateContentCache::class)) {
            \PixflowDesign\WordPress\Templates\TemplateContentCache::clear();
        }
        return $committed;
    }

    public function clear(?array $expected = null): bool
    {
        // Keep a non-secret tombstone: reset must also invalidate an in-flight
        // first activation whose initial cache was empty.
        $replacement = ['reset_marker' => bin2hex(random_bytes(16))];
        $committed = $expected === null ? update_option(self::OPTION_KEY, $replacement, false) : $this->replace($expected, $replacement);
        if (!$committed) return false;
        if (class_exists(\PixflowDesign\WordPress\Templates\TemplateContentCache::class)) {
            \PixflowDesign\WordPress\Templates\TemplateContentCache::clear();
        }
        delete_option(self::LEGACY_OPTION_KEY);

        // Pixflow-owned: resetting a site license must be final. Mark legacy
        // migration as consumed so old Pixflow AI cache data cannot repopulate
        // the new site-scoped license during the next async status refresh.
        update_option(self::LEGACY_MIGRATION_OPTION_KEY, gmdate('c'), false);
        return true;
    }

    /** Opaque server-only snapshot taken before a remote validation request. */
    public function snapshot(): array
    {
        return $this->read();
    }

    /** Compare database bytes, not a possibly stale per-request option cache. */
    private function replace(array $expected, array $replacement): bool
    {
        global $wpdb;
        if (isset($wpdb) && isset($wpdb->options)) {
            $changed = $wpdb->query($wpdb->prepare(
                "UPDATE {$wpdb->options} SET option_value = %s WHERE option_name = %s AND BINARY option_value = BINARY %s",
                maybe_serialize($replacement), self::OPTION_KEY, maybe_serialize($expected)
            ));
            if ($changed === 1) {
                wp_cache_delete(self::OPTION_KEY, 'options');
                wp_cache_delete('alloptions', 'options');
                return true;
            }
            return $expected === [] && $changed !== false && add_option(self::OPTION_KEY, $replacement, '', false);
        }
        if ($this->read() !== $expected) return false;
        return update_option(self::OPTION_KEY, $replacement, false);
    }

    private function read(): array
    {
        $cache = get_option(self::OPTION_KEY, []);
        if (is_array($cache) && $cache !== []) {
            return $cache;
        }

        // Pixflow-owned: migrate the old Pixflow AI cache lazily so existing
        // customers do not need to re-enter their license after updating. This
        // is deliberately one-shot so reset/site-scope invalidation cannot
        // resurrect a stale license from the legacy option.
        if (get_option(self::LEGACY_MIGRATION_OPTION_KEY, '') !== '') {
            return [];
        }

        $legacy = get_option(self::LEGACY_OPTION_KEY, []);
        if (is_array($legacy) && $legacy !== []) {
            update_option(self::OPTION_KEY, $legacy, false);
            delete_option(self::LEGACY_OPTION_KEY);
            update_option(self::LEGACY_MIGRATION_OPTION_KEY, gmdate('c'), false);
            return $legacy;
        }

        return [];
    }

    private function is_expired(array $cache): bool
    {
        if ((string) ($cache['license_expires_at_source'] ?? '') === '') {
            return false;
        }

        $timestamp = strtotime((string) ($cache['license_expires_at'] ?? ''));

        return $timestamp !== false && $timestamp > 0 && $timestamp <= time();
    }

    private function nullable_int($value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }

        return max(0, (int) $value);
    }
}
