<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\License;

use PixflowDesign\WordPress\Security\SecretBox;

if (!defined('ABSPATH')) exit;

/** Opt-in central authority client. Tokens and installation proofs never enter UI status. */
final class CentralEntitlements
{
    private const OPTION = 'pixflow_design_central_entitlements_v2';
    private const LOCK = 'pixflow_design_central_entitlements_refresh_lock';
    public const REFRESH_HOOK = 'pixflow_design_central_entitlements_refresh';
    private static bool $request_refresh_scheduled = false;

    public static function enabled(): bool
    {
        // v2.0.0 has one authorization contract in every environment.
        return true;
    }

    public static function authority(): string
    {
        // Only an explicit non-production endpoint selects the staging issuer.
        // Never infer authority from a token or accept an arbitrary issuer.
        $environment = function_exists('wp_get_environment_type') ? wp_get_environment_type() : 'production';
        if (in_array($environment, ['local', 'development', 'staging'], true)
            && defined('PIXFLOW_DESIGN_LICENSE_VALIDATION_URL')
            && in_array(PIXFLOW_DESIGN_LICENSE_VALIDATION_URL, [
                'https://staging.pixflow.dev/api/licensing/v1/validate',
                'https://staging.pixflow.dev/wp-json/pixflow-ai/v1/license/validate',
                'https://preview.pixflow.dev/api/licensing/v1/validate',
                'https://preview.pixflow.dev/wp-json/pixflow-ai/v1/license/validate',
            ], true)) return 'https://preview.pixflow.dev';
        return 'https://pixflow.dev';
    }

    /** Explicit QA transport only; signed tokens keep the established issuer. */
    public static function delivery_origin(): string
    {
        if (self::authority() === 'https://preview.pixflow.dev'
            && defined('PIXFLOW_DESIGN_LICENSE_VALIDATION_URL')
            && in_array(PIXFLOW_DESIGN_LICENSE_VALIDATION_URL, [
                'https://staging.pixflow.dev/api/licensing/v1/validate',
                'https://staging.pixflow.dev/wp-json/pixflow-ai/v1/license/validate',
            ], true)) return 'https://staging.pixflow.dev';
        return self::authority();
    }

    public static function validation_url_matches(string $url): bool
    {
        if ($url === self::delivery_origin() . '/api/licensing/v1/validate') return true;
        // Temporary explicit QA compatibility while the staging alias rolls out.
        return self::authority() === 'https://preview.pixflow.dev'
            && $url === self::delivery_origin() . '/wp-json/pixflow-ai/v1/license/validate';
    }

    public function register(): void
    {
        (new BridgePairing())->register();
        (new InstallationRecovery())->register();
        (new TrialSiteVerification())->register();
        add_action(self::REFRESH_HOOK, [$this, 'refresh']);
        add_filter('rest_request_before_callbacks', [$this, 'authorize_rest'], 10, 3);
        add_action('rest_api_init', function (): void {
            register_rest_route('pixflow-design/v1', '/license/central-bridge', [
                'methods' => 'POST', 'permission_callback' => [$this, 'can_deliver_to_bridge'],
                'callback' => [$this, 'deliver_to_bridge'],
            ]);
        });
    }

    public function can_deliver_to_bridge(\WP_REST_Request $request): bool
    {
        // Deliberately require a paired server credential; browser cookies/nonces do not grant token delivery.
        if (!self::enabled() || !preg_match('/^Bearer (pfwp_[A-Za-z0-9_\-]+)$/D', trim((string) $request->get_header('authorization')), $match)) return false;
        return (new \PixflowDesign\WordPress\Admin\WpAdminPairingService())->authenticate_token($match[1]) !== null
            && current_user_can('edit_posts');
    }

    public function deliver_to_bridge(): \WP_REST_Response
    {
        $state = $this->state();
        $claims = $this->verified($state, 'bridge', 'bridge:mutate');
        if ($claims === null || time() >= $claims['refresh_after']) {
            // Free requests never wait for an unavailable licensing service.
            // Refresh Pro in the background; verified access still has its hard deadline.
            if (!empty($state['installation']['id']) && empty($state['denied'])) $this->schedule_refresh();
        }
        // This route already authenticated a revocable WordPress pairing credential.
        // Free access is independent of the paid grant, including after expiry.
        if ($claims === null) return new \WP_REST_Response(['ok' => true, 'free_access' => true], 200, ['Cache-Control' => 'private, no-store']);
        return new \WP_REST_Response(['ok' => true, 'token' => SecretBox::decrypt($state['tokens']['bridge']),
            'free_access' => true, 'features' => array_keys(\PixflowDesign\WordPress\Modules\FeatureContributions::all()),
            'network_unavailable' => !empty($state['network_unavailable'])], 200, ['Cache-Control' => 'private, no-store']);
    }

    public function authorize_rest($response, array $handler, \WP_REST_Request $request)
    {
        if (!self::enabled() || $response !== null || $request->get_method() === 'OPTIONS') return $response;
        $route = rtrim($request->get_route(), '/');
        if (!str_starts_with($route, '/pixflow-design/v1/')) return $response;
        $path = substr($route, strlen('/pixflow-design/v1/'));
        // Account authentication and recovery remain usable without a product
        // entitlement. Their own permission, challenge and verification checks
        // still run; this exemption grants no authenticated session itself.
        if ($path === 'two-factor' || str_starts_with($path, 'two-factor/')) return $response;
        // Recovery, license activation and public runtime probes remain available.
        if (in_array($path, ['license/status', 'license/validate', 'license/reset', 'license/central-bridge', 'license/recovery/prepare', 'license/recovery/complete', 'od/health', 'od/version'], true)) return $response;
        // Core routes retain their WordPress permissions. Only Pro-owned handlers
        // require a paid/trial grant; shared dispatchers check feature availability.
        if (preg_match('#^(?:bricks|etch|elementor|generateblocks|templates|fonts|icons/packs|sitemap|mcp)(?:/|$)#', $path)
            && !$this->allows('wordpress:mutate'))
            return new \WP_Error('pixflow_pro_required', 'This feature requires an active Pixflow Design Pro licence or trial. Free WordPress and Gutenberg editing remains available.', ['status' => 403]);
        $callback = $handler['callback'] ?? null;
        try {
            $reflection = is_array($callback) ? new \ReflectionMethod($callback[0], $callback[1])
                : ($callback instanceof \Closure ? new \ReflectionFunction($callback) : null);
            $file = str_replace('\\', '/', (string) ($reflection?->getFileName() ?: ''));
            $pro = defined('PIXFLOW_DESIGN_PRO_PLUGIN_DIR') ? rtrim(PIXFLOW_DESIGN_PRO_PLUGIN_DIR, '/\\') : dirname(__DIR__, 3) . '/wordpress-pro';
            if (str_starts_with($file, str_replace('\\', '/', $pro) . '/') && !$this->allows('wordpress:mutate'))
                return new \WP_Error('pixflow_pro_required', 'This feature requires an active Pixflow Design Pro licence or trial. Free WordPress and Gutenberg editing remains available.', ['status' => 403]);
        } catch (\ReflectionException) { /* WordPress validates the handler. */ }
        return $response;
    }

    public function enroll(string $license_key, ?array $expected_state = null): array
    {
        if (!self::enabled()) return ['ok' => false, 'code' => 'central_entitlements_disabled'];
        if (!self::validation_url_matches((new LicenseService())->validation_url())) {
            $this->deny('license_authority_mismatch');
            return ['ok' => false, 'code' => 'license_authority_mismatch'];
        }
        try {
            $installation = (new InstallationProof())->load_or_create(self::authority(), $license_key);
        } catch (\Throwable) {
            $this->deny('installation_key_unavailable');
            return ['ok' => false, 'code' => 'installation_key_unavailable'];
        }
        $old = $this->state();
        if ($expected_state !== null && $old !== $expected_state) return ['ok' => false, 'code' => 'entitlement_state_changed'];
        if (($old['installation']['id'] ?? '') === $installation['id']) {
            if ($old['installation'] !== $installation) {
                $before = $old;
                $old['installation'] = $installation;
                if (!$this->replace_state($before, $old)) return ['ok' => false, 'code' => 'entitlement_state_changed'];
            }
            $existing = $this->verified($old, 'wordpress', 'wordpress:mutate');
            if ($existing !== null && time() < $existing['refresh_after']) return ['ok' => true];
            return $this->refresh($expected_state === null ? null : $old);
        }
        $state = ['installation' => $installation, 'epoch' => (int) ($old['epoch'] ?? 0) + 1, 'license_id' => '', 'tokens' => [], 'keys' => [], 'denied' => true, 'network_unavailable' => false, 'revision' => 0];
        if (!$this->replace_state($old, $state)) return ['ok' => false, 'code' => 'entitlement_state_changed'];
        return $this->exchange('enroll', $state, ['installation_id' => $installation['id'], 'license_key' => $license_key,
            'site_url' => $installation['site_url'], 'public_key_pem' => $installation['public_key_pem']]);
    }

    /** Recover a same-site saved licence using the authority, never a cached grant.
     * Explicit denial/reset remains final until the customer activates again.
     * The lock and retry interval keep simultaneous settings/status requests
     * from repeatedly contacting the authority during an outage.
     */
    public function recover_saved_license(): void
    {
        $state = $this->state();
        if (!empty($state['denial_code']) || $this->verified($state, 'wordpress', 'wordpress:mutate') !== null) return;
        $cache = new LicenseCache();
        $payload = $cache->private_payload();
        $identity = new SiteIdentity();
        $target = (new LicenseService())->validation_url();
        if (($cache->summary()['valid'] ?? false) !== true || empty($payload['license_key'])
            || ($payload['validation_url'] ?? '') !== $target || !self::validation_url_matches($target)
            || !hash_equals($identity->fingerprint($identity->current_payload()), (string) ($payload['site_fingerprint'] ?? ''))) return;
        // Unknown denied states are not migration candidates. An interrupted
        // first enrollment has an installation but no tokens or license ID.
        if (!empty($state['denied']) && (empty($state['installation']['id']) || !empty($state['tokens']) || !empty($state['license_id']))) return;
        $lock_key = 'pixflow_design_saved_license_recovery_lock';
        $retry_key = 'pixflow_design_saved_license_recovery_' . hash('sha256', $target . '|' . $payload['site_fingerprint'] . '|' . $payload['license_key']);
        if (get_transient($retry_key) !== false) return;
        $lock = (int) get_option($lock_key, 0);
        if ($lock > 0 && $lock < time() - 180) delete_option($lock_key);
        if (!add_option($lock_key, time(), '', false)) return;
        try {
            if (get_transient($retry_key) !== false) return;
            set_transient($retry_key, true, 60);
            // Recheck after acquiring the lock; reset/revocation must win.
            $latest = $this->state();
            if ($latest !== $state || $cache->private_payload() !== $payload) return;
            $result = $this->enroll($payload['license_key'], $state);
            if (($result['ok'] ?? false) === true) delete_transient($retry_key);
        } finally {
            delete_option($lock_key);
        }
    }

    public function refresh(?array $expected_state = null): array
    {
        if (!self::enabled()) return ['ok' => false];
        $state = $this->state();
        if ($expected_state !== null && $state !== $expected_state) return ['ok' => false, 'code' => 'entitlement_state_changed'];
        if (empty($state['installation']['id'])) return ['ok' => false, 'code' => 'installation_missing'];
        // add_option is atomic across concurrent PHP requests. Recover a stale lock after its lease.
        $lock = (int) get_option(self::LOCK, 0);
        if ($lock && $lock < time() - 90) delete_option(self::LOCK);
        if (!add_option(self::LOCK, time(), '', false)) return ['ok' => false, 'code' => 'refresh_in_progress'];
        try {
            // An interrupted first enrollment has no refreshable grant yet.
            // Both scheduled recovery and an explicit retry reuse its identity.
            if (empty($state['tokens']) && empty($state['license_id']) && empty($state['denial_code'])) {
                $payload = (new LicenseCache())->private_payload();
                $identity = new SiteIdentity();
                $installation = $state['installation'];
                if (empty($payload['license_key']) || ($payload['validation_url'] ?? '') !== (new LicenseService())->validation_url()
                    || !self::validation_url_matches((string) ($payload['validation_url'] ?? ''))
                    || !hash_equals($identity->fingerprint($identity->current_payload()), (string) ($payload['site_fingerprint'] ?? ''))
                    || ($installation['authority'] ?? '') !== self::authority()
                    || ($installation['site_url'] ?? '') !== SiteIdentity::normalize_url(site_url('/'))
                    || !hash_equals((string) ($installation['binding'] ?? ''), hash('sha256', self::authority() . '|' . $installation['site_url'] . '|' . $payload['license_key'])))
                    return ['ok' => false, 'code' => 'license_authority_mismatch'];
                return $this->exchange('enroll', $state, ['installation_id' => $installation['id'], 'license_key' => $payload['license_key'],
                    'site_url' => $installation['site_url'], 'public_key_pem' => $installation['public_key_pem']]);
            }
            return $this->exchange('refresh', $state, ['installation_id' => $state['installation']['id']]);
        } finally { delete_option(self::LOCK); }
    }

    public function allows(string $scope): bool
    {
        if (!self::enabled()) return true;
        $state = $this->state();
        $claims = $this->verified($state, 'wordpress', $scope);
        if ($claims !== null && time() >= $claims['refresh_after']) $this->schedule_refresh();
        if ($claims === null && empty($state['denied'])) $this->schedule_refresh();
        if (($claims === null || time() >= $claims['refresh_after'])
            && !empty($state['installation']['id']) && empty($state['denied'])
            && function_exists('current_user_can') && current_user_can('edit_posts')) {
            if ($claims === null) {
                $this->refresh_for_active_editor($state);
                $claims = $this->verified($this->state(), 'wordpress', $scope);
            } elseif (!self::$request_refresh_scheduled && function_exists('add_action')) {
                self::$request_refresh_scheduled = true;
                // Keep healthy editor heartbeats fast. A shutdown callback does
                // not depend on WP-Cron or a successful loopback request.
                add_action('shutdown', function () use ($state): void {
                    if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
                    $this->refresh_for_active_editor($state);
                });
            }
        }
        return $claims !== null;
    }

    /** Cron-independent renewal, never permission derived from a cached flag.
     * The refresh lock/expected state serialize grants; failed transports retain
     * only the authority-signed offline window and use a bounded retry cadence.
     */
    private function refresh_for_active_editor(array $state): void
    {
        $key = 'pixflow_design_editor_refresh_' . substr(hash('sha256', (string) ($state['installation']['id'] ?? '') . ':' . ($state['epoch'] ?? 0)), 0, 24);
        if (get_transient($key)) return;
        set_transient($key, true, 60);
        $this->refresh($state);
    }

    public function deny(string $code): void
    {
        $state = $this->state();
        $state['denied'] = true;
        $state['epoch'] = (int) ($state['epoch'] ?? 0) + 1;
        $state['denial_code'] = $code;
        $state['tokens'] = [];
        $state['network_unavailable'] = false;
        update_option(self::OPTION, $state, false);
        if (class_exists(\PixflowDesign\WordPress\Templates\TemplateContentCache::class)) \PixflowDesign\WordPress\Templates\TemplateContentCache::clear();
    }

    public function status(): array
    {
        $state = $this->state();
        $claims = $this->verified($state, 'wordpress', 'wordpress:mutate');
        return ['enabled' => self::enabled(), 'valid' => $claims !== null,
            'offline' => $claims !== null && time() >= $claims['exp'],
            'expires_at' => $claims['exp'] ?? 0, 'offline_until' => $claims['offline_until'] ?? 0,
            'code' => $state['denial_code'] ?? ''];
    }

    /** Server-side pairing export for protected bridge storage; never expose through a browser route. */
    public function bridge_configuration(string $pairing_token): array
    {
        $state = $this->state();
        if ($this->verified($state, 'bridge', 'bridge:mutate') === null) throw new \RuntimeException('A verified bridge grant is required before pairing.');
        $installation = $state['installation'];
        $key = openssl_pkey_get_public($installation['public_key_pem']);
        $details = $key ? openssl_pkey_get_details($key) : false;
        if (!is_array($details)) throw new \RuntimeException('Installation public key unavailable.');
        $keys = [];
        foreach ($state['jwks']['keys'] ?? [] as $jwk) if (isset($jwk['kid'])) $keys[$jwk['kid']] = $jwk;
        return ['identity' => ['issuer' => self::authority(), 'audience' => 'pixflow-design-bridge',
            'installationId' => $installation['id'], 'siteFingerprint' => InstallationProof::site_fingerprint($installation['site_url']),
            'keyThumbprint' => $installation['thumbprint'], 'licenseId' => $state['license_id']],
            'keys' => $keys, 'installationPublicKey' => ['kty' => 'RSA', 'n' => SignedEntitlement::encode($details['rsa']['n']), 'e' => SignedEntitlement::encode($details['rsa']['e'])],
            'wordpressUrl' => $installation['site_url'], 'wordpressPairingToken' => $pairing_token];
    }

    /** Commit only authority-verified replacement grants, preserving the old state on failure. */
    public function accept_recovery(array $installation, array $body, array $jwks, array $expected, ?array $recoveredLicense = null): array
    {
        $state = ['installation' => $installation, 'epoch' => (int) ($expected['epoch'] ?? 0) + 1,
            'license_id' => $recoveredLicense['license_id'] ?? (new LicenseCache())->private_payload()['license_id'] ?? '',
            'keys' => SignedEntitlement::public_keys($jwks), 'jwks' => $jwks, 'tokens' => [],
            'denied' => false, 'network_unavailable' => false, 'denial_code' => '', 'revision' => 0];
        foreach (['wordpress' => 'wordpress:mutate', 'bridge' => 'bridge:mutate'] as $audience => $scope) {
            $state['tokens'][$audience] = SecretBox::encrypt((string) ($body['entitlements'][$audience]['token'] ?? ''));
            if (!SecretBox::is_encrypted($state['tokens'][$audience]) || $this->verified($state, $audience, $scope, $recoveredLicense) === null)
                return ['ok' => false, 'code' => 'invalid_recovery_entitlement'];
        }
        $latest = $this->state();
        if (($latest['epoch'] ?? 0) !== ($expected['epoch'] ?? 0)
            || ($latest['installation']['id'] ?? '') !== ($expected['installation']['id'] ?? ''))
            return ['ok' => false, 'code' => 'entitlement_state_changed'];
        $claims = $this->verified($state, 'wordpress', 'wordpress:mutate', $recoveredLicense);
        $state['revision'] = $claims['revocation_version'];
        // One canonical option commit; load_or_create can heal the secondary index.
        if (!update_option(self::OPTION, $state, false)) return ['ok' => false, 'code' => 'recovery_storage_failed'];
        if ($recoveredLicense !== null) {
            $identity = new SiteIdentity();
            (new LicenseCache())->persist($identity->fingerprint($identity->current_payload()),
                $recoveredLicense['license_key'], $recoveredLicense['upstream'], $recoveredLicense['validation_url']);
            if ($this->verified($state, 'wordpress', 'wordpress:mutate') === null)
                return ['ok' => false, 'code' => 'recovery_storage_failed'];
        }
        (new InstallationProof())->store($installation);
        if (class_exists(\PixflowDesign\WordPress\Templates\TemplateContentCache::class)) \PixflowDesign\WordPress\Templates\TemplateContentCache::clear();
        $this->schedule_refresh(max(time() + 1, $claims['refresh_after']));
        return ['ok' => true];
    }

    private function state(): array
    {
        $state = get_option(self::OPTION, []);
        return is_array($state) ? $state : [];
    }

    private function verified(array $state, string $audience, string $scope, ?array $recoveredLicense = null): ?array
    {
        $installation = $state['installation'] ?? [];
        if (($installation['authority'] ?? '') !== self::authority()
            || ($installation['site_url'] ?? '') !== SiteIdentity::normalize_url(site_url('/'))) return null;
        $license = $recoveredLicense ?? (new LicenseCache())->private_payload();
        if (($license['license_id'] ?? '') !== ($state['license_id'] ?? '')
            || !self::validation_url_matches((string) ($license['validation_url'] ?? ''))
            || ($license['validation_url'] ?? '') !== (new LicenseService())->validation_url()) return null;
        $binding = hash('sha256', self::authority() . '|' . $installation['site_url'] . '|' . ($license['license_key'] ?? ''));
        if (!hash_equals($installation['binding'] ?? '', $binding)) return null;
        $token = SecretBox::decrypt((string) ($state['tokens'][$audience] ?? ''));
        return (new SignedEntitlement())->verify($token, $state['keys'] ?? [], [
            'iss' => self::authority(), 'aud' => $audience === 'wordpress' ? 'pixflow-design-wordpress-local' : 'pixflow-design-bridge',
            'installation_id' => $installation['id'] ?? '', 'site_fingerprint' => InstallationProof::site_fingerprint($installation['site_url']),
            'license_id' => $state['license_id'] ?? '', 'key_thumbprint' => $installation['thumbprint'] ?? '',
        ], $scope, time(), !empty($state['network_unavailable']), !empty($state['denied']), (int) ($state['revision'] ?? 0));
    }

    private function exchange(string $purpose, array $state, array $payload): array
    {
        $base = self::delivery_origin() . '/api/licensing/v2';
        $http = new LicenseHttpClient();
        $challenge = $http->post_json($base . '/challenge', ['purpose' => $purpose, 'installation_id' => $state['installation']['id']]);
        if (is_wp_error($challenge)) return $this->transport_failure($state);
        if ((int) ($challenge['status'] ?? 0) !== 200) return $this->rejected_response($challenge, $state);
        try {
            $envelope = (new InstallationProof())->envelope($state['installation'], $purpose, json_decode($challenge['body'], true, 32, JSON_THROW_ON_ERROR), $payload);
        } catch (\Throwable) { $this->deny('invalid_challenge'); return ['ok' => false, 'code' => 'invalid_challenge']; }
        $response = $http->post_json($base . '/' . $purpose, $envelope);
        if (is_wp_error($response)) return $this->transport_failure($state);
        if ((int) ($response['status'] ?? 0) !== 200) return $this->rejected_response($response, $state);
        $body = json_decode((string) ($response['body'] ?? ''), true);
        $keys_response = wp_remote_get($base . '/keys', ['timeout' => 15, 'redirection' => 0]);
        if (is_wp_error($keys_response)) return $this->transport_failure($state);
        if (wp_remote_retrieve_response_code($keys_response) !== 200) return $this->rejected_response([
            'status' => wp_remote_retrieve_response_code($keys_response),
            'body' => wp_remote_retrieve_body($keys_response),
        ], $state);
        $keys_body = json_decode(wp_remote_retrieve_body($keys_response), true);
        $state['keys'] = SignedEntitlement::public_keys(is_array($keys_body) ? $keys_body : []);
        $state['jwks'] = is_array($keys_body) ? $keys_body : [];
        $state['license_id'] = (new LicenseCache())->private_payload()['license_id'] ?? '';
        $state['network_unavailable'] = false;
        $state['denied'] = false;
        $state['denial_code'] = '';
        foreach (['wordpress' => 'wordpress:mutate', 'bridge' => 'bridge:mutate'] as $audience => $scope) {
            $token = (string) ($body['entitlements'][$audience]['token'] ?? '');
            $state['tokens'][$audience] = SecretBox::encrypt($token);
            if (!SecretBox::is_encrypted($state['tokens'][$audience]) || $this->verified($state, $audience, $scope) === null) {
                $this->deny('invalid_central_entitlement'); return ['ok' => false, 'code' => 'invalid_central_entitlement'];
            }
        }
        $claims = $this->verified($state, 'wordpress', 'wordpress:mutate');
        $state['revision'] = $claims['revocation_version'];
        if (!$this->commit_exchange($state)) return ['ok' => false, 'code' => 'entitlement_state_changed'];
        $this->schedule_refresh(max(time() + 1, $claims['refresh_after']));
        return ['ok' => true];
    }

    private function transport_failure(array $state): array
    {
        // An explicit denial is never erased by a later network outage.
        $state['network_unavailable'] = true;
        $this->commit_exchange($state);
        $this->schedule_refresh(time() + 60);
        return ['ok' => false, 'code' => 'network_unavailable'];
    }

    private function rejected_response(array $response, array $state): array
    {
        $status = (int) ($response['status'] ?? 0);
        // Temporary service failures retain only the authority's already-signed offline window.
        if ($status === 408 || $status === 429 || ($status >= 500 && $status <= 599)) return $this->transport_failure($state);
        $body = json_decode((string) ($response['body'] ?? ''), true);
        $code = (string) ($body['code'] ?? $body['error']['code'] ?? 'central_entitlement_denied');
        $this->deny($code);
        return ['ok' => false, 'code' => $code];
    }

    private function schedule_refresh(?int $at = null): void
    {
        if (!wp_next_scheduled(self::REFRESH_HOOK)) wp_schedule_single_event($at ?? time() + 1, self::REFRESH_HOOK);
    }

    private function commit_exchange(array $state): bool
    {
        $latest = $this->state();
        if (($latest['installation']['id'] ?? '') !== ($state['installation']['id'] ?? '')
            || ($latest['epoch'] ?? 0) !== ($state['epoch'] ?? 0)) return false;
        return $this->replace_state($latest, $state);
    }

    /** Compare the stored bytes atomically so a reset on another PHP worker wins.
     * get_option() alone can return a request-local stale copy during an HTTP
     * exchange. Never adopt a newer epoch or overwrite it from that cache.
     */
    private function replace_state(array $expected, array $replacement): bool
    {
        global $wpdb;
        if (isset($wpdb) && isset($wpdb->options)) {
            $changed = $wpdb->query($wpdb->prepare(
                "UPDATE {$wpdb->options} SET option_value = %s WHERE option_name = %s AND BINARY option_value = BINARY %s",
                maybe_serialize($replacement), self::OPTION, maybe_serialize($expected)
            ));
            if ($changed === 1) {
                wp_cache_delete(self::OPTION, 'options');
                wp_cache_delete('alloptions', 'options');
                return true;
            }
            // First installation: add_option is an atomic insert and cannot
            // replace an installation another request has just committed.
            if ($expected === [] && $changed !== false) return add_option(self::OPTION, $replacement, '', false);
            // A persistent object cache may retain the losing snapshot across
            // requests. Reject the write, but let the next read see the winner.
            wp_cache_delete(self::OPTION, 'options');
            wp_cache_delete('alloptions', 'options');
            return false;
        }
        // Standalone PHP fixtures do not bootstrap a WordPress database.
        if ($this->state() !== $expected) return false;
        return update_option(self::OPTION, $replacement, false);
    }
}
