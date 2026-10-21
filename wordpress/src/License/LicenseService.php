<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\License;

if (!defined('ABSPATH')) {
    exit;
}

final class LicenseService
{
    // Native Next.js validation. Old WordPress routes are not a fallback.
    private const VALIDATION_URL = 'https://pixflow.dev/api/licensing/v1/validate';
    private const STATUS_CACHE_TTL = 60;

    private static ?array $status_cache = null;
    private bool $legacy_upgrade_checked = false;

    public function __construct(
        private readonly SiteIdentity $site_identity = new SiteIdentity(),
        private readonly LicenseCache $cache = new LicenseCache(),
        private readonly BridgeEntitlement $bridge_entitlement = new BridgeEntitlement(),
        private readonly LicenseHttpClient $http_client = new LicenseHttpClient(),
    ) {
    }

    public function status(): array
    {
        if (CentralEntitlements::enabled()) {
            $license = $this->site_scoped_license_summary();
            if (($license['valid'] ?? false) === true) (new CentralEntitlements())->recover_saved_license();
            return $this->with_bridge_entitlement(['requires_license' => false, 'license' => $license], $license);
        }
        $cache_key = $this->status_cache_key();
        if (self::$status_cache !== null) {
            return self::$status_cache;
        }

        $cached = get_transient($cache_key);
        if (is_array($cached)) {
            self::$status_cache = $cached;
            return $cached;
        }

        $license = $this->site_scoped_license_summary();
        $response = [
            'requires_license' => false,
            'license' => $license,
        ];

        $response = $this->with_bridge_entitlement($response, $license);
        set_transient($cache_key, $response, self::STATUS_CACHE_TTL);
        self::$status_cache = $response;

        return $response;
    }

    public function validate(string $license_key): array
    {
        $this->clear_status_cache();
        $license_key = trim($license_key);
        if ($license_key === '') {
            return $this->denied('missing_license_key', 'Enter a license key before validating Pixflow access.');
        }

        $identity = $this->site_identity->current_payload();
        $payload = array_merge($identity, [
            'operation' => 'validate',
            'license_key' => $license_key,
        ]);

        // Pixflow-owned: use a small wrapper so local Windows installs without
        // WordPress HTTPS transports can still validate through a safe fallback.
        $response = $this->http_client->post_json($this->validation_url(), $payload);

        if (is_wp_error($response)) {
            return $this->denied(
                'license_request_failed',
                'Pixflow license validation request failed.',
                ['detail' => $response->get_error_message()]
            );
        }

        $status = (int) ($response['status'] ?? 0);
        $body = json_decode((string) ($response['body'] ?? ''), true);
        if (!is_array($body)) {
            return $this->denied('invalid_license_response', 'Pixflow license validation returned an unexpected response.', [
                'http_status' => $status,
            ]);
        }

        // A trusted authority explicitly advertises the automatic proof protocol.
        // Bootstrap consumes it through signed enrollment before native validation
        // retries; no cached permission is granted by the public callback itself.
        if (($body['verification_method'] ?? '') === 'plugin'
            && ($body['last_error'] ?? $body['status'] ?? '') === 'trial_domain_verification_required'
            && ($body['valid'] ?? false) === false
            && is_string($body['license_id'] ?? null) && $body['license_id'] !== ''
            && CentralEntitlements::validation_url_matches($this->validation_url())) {
            $expected_license_id = $body['license_id'];
            $verified = (new TrialSiteVerification())->verify_and_enroll($license_key, $expected_license_id);
            if (empty($verified['ok'])) return $this->denied((string) ($verified['code'] ?? 'trial_site_verification_unavailable'),
                $this->site_verification_message((string) ($verified['code'] ?? '')));
            $response = $this->http_client->post_json($this->validation_url(), $payload);
            if (is_wp_error($response)) return $this->denied('license_request_failed', $this->site_verification_message(''));
            $status = (int) ($response['status'] ?? 0);
            $body = json_decode((string) ($response['body'] ?? ''), true);
            if (!is_array($body) || ($body['license_id'] ?? '') !== $expected_license_id)
                return $this->denied('invalid_license_response', $this->site_verification_message(''));
        }

        $valid = $status >= 200 && $status < 300 && ($body['valid'] ?? false) === true
            && ($body['access_granted'] ?? false) === true
            && (string) ($body['status'] ?? '') === 'active';

        if (!$valid) {
            // A failed transport or malformed response is not a licence refusal.
            // Keep the encrypted credential so the next refresh can recover.
            $explicit_refusal = $status >= 200 && $status < 500
                && !in_array($status, [408, 429], true)
                && ($body['valid'] ?? null) === false
                && ($body['access_granted'] ?? null) === false;
            if (!$explicit_refusal) return $this->denied('license_verification_unavailable',
                'Pixflow could not verify the saved licence. Your saved key has been kept; retry verification shortly.',
                ['http_status' => $status]);
            $this->cache->clear();
            return array_merge($this->denied(
                (string) ($body['last_error'] ?? $body['status'] ?? 'license_validation_failed'),
                (string) ($body['message'] ?? 'Pixflow license validation failed.'),
                ['http_status' => $status]
            ), ['upstream' => $this->public_upstream_fields($body)]);
        }

        $site_fingerprint = $this->site_identity->fingerprint($identity);
        $this->cache->persist($site_fingerprint, $license_key, $body, $this->validation_url());

        if (CentralEntitlements::enabled()) {
            (new CentralEntitlements())->enroll($license_key);
        }

        $license = $this->site_scoped_license_summary();
        $response = [
            'requires_license' => false,
            'valid' => true,
            'access_granted' => true,
            'runtime_ready' => true,
            'status' => 'active',
            'message' => (string) ($body['message'] ?? 'Pixflow license validated successfully.'),
            'license' => $license,
            'upstream' => $this->public_upstream_fields($body),
        ];

        $response = $this->with_bridge_entitlement($response, $license);
        $this->write_status_cache($response);

        return $response;
    }

    public function reset(): array
    {
        if (CentralEntitlements::enabled()) {
            (new CentralEntitlements())->deny('license_reset');
        }
        $this->clear_status_cache();
        $this->cache->clear();

        return $this->status();
    }

    public function is_valid(): bool
    {
        $license = $this->site_scoped_license_summary();

        return ($license['valid'] ?? false) === true;
    }

    public function private_license_payload(): array
    {
        $payload = $this->cache->private_payload();
        if ($payload === []) {
            return [];
        }
        if (($payload['validation_url'] ?? self::VALIDATION_URL) !== $this->validation_url()) return [];

        $expected_fingerprint = $this->site_identity->fingerprint($this->site_identity->current_payload());
        if (!hash_equals($expected_fingerprint, (string) ($payload['site_fingerprint'] ?? ''))) {
            // Pixflow-owned: license keys are site scoped. A copied option or a
            // bridge/site switch must not grant access to another WP install.
            $this->cache->clear();
            return [];
        }

        $token = trim((string) ($payload['template_access_token'] ?? ''));
        $expires_at = strtotime((string) ($payload['template_access_token_expires_at'] ?? ''));
        if ($token === '' || $expires_at === false || $expires_at <= time() + 60) {
            $license_key = trim((string) ($payload['license_key'] ?? ''));
            if ($license_key !== '') {
                $result = $this->validate($license_key);
                if (($result['valid'] ?? false) === true) {
                    $payload = $this->cache->private_payload();
                    if ($payload === [] || !hash_equals($expected_fingerprint, (string) ($payload['site_fingerprint'] ?? ''))) {
                        return [];
                    }
                } else return [];
            } else return [];
        }

        $expires_at = strtotime((string) ($payload['template_access_token_expires_at'] ?? ''));
        if (trim((string) ($payload['template_access_token'] ?? '')) === '' || $expires_at === false || $expires_at <= time()) return [];

        return array_merge($payload, $this->site_identity->current_payload());
    }

    private function denied(string $code, string $message, array $extra = []): array
    {
        return array_merge([
            'requires_license' => false,
            'valid' => false,
            'access_granted' => false,
            'runtime_ready' => true,
            'status' => 'invalid',
            'last_error' => $code,
            'message' => $message,
            'license' => $this->cache->summary(),
        ], $extra);
    }

    private function site_scoped_license_summary(): array
    {
        if (!$this->legacy_upgrade_checked) {
            $this->legacy_upgrade_checked = true;
            $key = self::legacy_upgrade_key($this->cache->private_payload(),
                $this->site_identity->fingerprint($this->site_identity->current_payload()), $this->validation_url());
            // Upgrade the existing production identity through live validation
            // and enrollment; a cached grant is never promoted to the new contract.
            if ($key !== '') $this->validate($key);
        }
        $license = $this->cache->summary();
        if (($license['validation_url'] ?? self::VALIDATION_URL) !== $this->validation_url()) {
            return ['valid' => false, 'present' => false, 'status' => 'authority_changed'];
        }
        if (($license['valid'] ?? false) !== true) {
            return $license;
        }

        $expected_fingerprint = $this->site_identity->fingerprint($this->site_identity->current_payload());
        if (hash_equals($expected_fingerprint, (string) ($license['site_fingerprint'] ?? ''))) {
            return $license;
        }

        // Pixflow-owned: never reuse a cached license across WP sites. Clear
        // mismatches so the wizard asks for a site-specific activation.
        $this->cache->clear();

        return $this->cache->summary();
    }

    private static function legacy_upgrade_key(array $payload, string $fingerprint, string $target): string
    {
        if ($target !== self::VALIDATION_URL
            || ($payload['validation_url'] ?? 'https://pixflow.dev/wp-json/pixflow-ai/v1/license/validate') !== 'https://pixflow.dev/wp-json/pixflow-ai/v1/license/validate'
            || $fingerprint === '' || !hash_equals($fingerprint, (string) ($payload['site_fingerprint'] ?? ''))) return '';
        return trim((string) ($payload['license_key'] ?? ''));
    }

    private function with_bridge_entitlement(array $response, array $license): array
    {
        if (CentralEntitlements::enabled()) {
            // Central bearer grants are delivered server-to-server, never in browser status.
            $response['central_entitlement'] = (new CentralEntitlements())->status();
            $ready = ($response['central_entitlement']['valid'] ?? false) === true;
            $response['runtime_ready'] = true;
            $response['license']['valid'] = ($license['valid'] ?? false) === true && $ready;
            // Reuse the existing verified licence. Reading migration guidance
            // must never enroll again, allocate a site or start a trial.
            $response['pro'] = (new ProInstallation())->status($response['license']['valid'], !empty($license['license_id']));
            unset($response['bridge_entitlement']);
            return $response;
        }
        if (($license['valid'] ?? false) !== true) {
            return $response;
        }

        // Pixflow-owned: pass a long-lived local entitlement to the daemon so
        // generation requests stay available during normal all-day sessions.
        $entitlement = $this->bridge_entitlement->issue($license, $this->site_identity->current_payload());
        if ($entitlement !== []) {
            $response['bridge_entitlement'] = $entitlement;
        }

        return $response;
    }

    private function status_cache_key(): string
    {
        $identity = $this->site_identity->current_payload();
        $version = defined('PIXFLOW_DESIGN_VERSION') ? PIXFLOW_DESIGN_VERSION : 'dev';

        return 'pixflow_design_license_status_' . md5($version . '|' . $this->validation_url() . '|' . $this->site_identity->fingerprint($identity));
    }

    public function validation_url(): string
    {
        $environment = function_exists('wp_get_environment_type') ? wp_get_environment_type() : 'production';
        $local = ($this->site_identity->current_payload()['is_local_site'] ?? false) === true;
        if (!$local && !in_array($environment, ['local', 'development', 'staging'], true)) return self::VALIDATION_URL;
        $url = defined('PIXFLOW_DESIGN_LICENSE_VALIDATION_URL') ? constant('PIXFLOW_DESIGN_LICENSE_VALIDATION_URL') : '';
        if (!is_string($url) || $url === '') return self::VALIDATION_URL;
        $parts = wp_parse_url($url);
        if (!is_array($parts) || ($parts['scheme'] ?? '') !== 'https' || empty($parts['host'])
            || isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment'])) return self::VALIDATION_URL;
        return $url;
    }

    private function write_status_cache(array $response): void
    {
        self::$status_cache = $response;
        set_transient($this->status_cache_key(), $response, self::STATUS_CACHE_TTL);
    }

    private function clear_status_cache(): void
    {
        self::$status_cache = null;
        delete_transient($this->status_cache_key());
    }

    private function public_upstream_fields(array $body): array
    {
        return [
            'license_key_masked' => (string) ($body['license_key_masked'] ?? ''),
            'license_id' => (string) ($body['license_id'] ?? ''),
            'purchase_id' => (string) ($body['purchase_id'] ?? ''),
            'activation_limit' => $body['activation_limit'] ?? null,
            'activations_count' => $body['activations_count'] ?? null,
            'license_expires_at' => (string) ($body['license_expires_at'] ?? $body['license_expiry'] ?? ''),
        ];
    }

    private function site_verification_message(string $code): string
    {
        return match ($code) {
            'trial_domain_used' => __('This domain and its subdomains have already used a Pro trial. View pricing or contact Pixflow support. Your saved content is unchanged.', 'pixflow-design'),
            'trial_domain_review_required' => __('This website needs a trial history review. Contact Pixflow support; your saved content is unchanged.', 'pixflow-design'),
            'trial_site_https_required' => __('Automatic trial verification requires a public HTTPS website. Local testing remains available within your trial.', 'pixflow-design'),
            'trial_site_unreachable' => __('Pixflow could not reach this website to verify it. Check HTTPS and any firewall or password protection, then retry activation.', 'pixflow-design'),
            'trial_access_expired' => __('Your Pro trial has expired. Free remains available and your saved content is unchanged.', 'pixflow-design'),
            'trial_rate_limited' => __('Please wait a few minutes before retrying trial activation.', 'pixflow-design'),
            default => __('Automatic website verification could not finish. Retry activation. Your saved content is unchanged.', 'pixflow-design'),
        };
    }
}
