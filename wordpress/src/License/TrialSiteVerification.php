<?php
declare(strict_types=1);

namespace PixflowDesign\WordPress\License;

if (!defined('ABSPATH')) exit;

/** Publishes an authority-issued, installation-bound proof only during explicit trial activation. */
final class TrialSiteVerification
{
    private const PREFIX = 'pixflow_trial_site_proof_';
    private const ROUTE = 'pixflow-design/v1/license/site-proof';
    private const MAX_TTL = 600;

    public function register(): void
    {
        add_action('rest_api_init', function (): void {
            register_rest_route('pixflow-design/v1', '/license/site-proof/(?P<proof_id>[a-f0-9-]{36})', [
                'methods' => 'GET', 'permission_callback' => '__return_true', 'callback' => [$this, 'proof'],
            ]);
        });
    }

    /** A public read of a pre-existing proof; never creates challenges, signs input or performs HTTP. */
    public function proof(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $id = $request->get_param('proof_id');
        if (!is_string($id) || !self::uuid($id)) return $this->not_found();
        $entry = get_transient(self::PREFIX . $id);
        $proof = is_array($entry) ? ($entry['proof'] ?? []) : [];
        if (!is_array($proof) || ($proof['proof_id'] ?? '') !== $id
            || ($proof['expires_at'] ?? 0) <= time()
            || ($entry['authority'] ?? '') !== CentralEntitlements::authority()
            || ($proof['site_url'] ?? '') !== SiteIdentity::normalize_url(site_url('/'))) return $this->not_found();
        return new \WP_REST_Response($proof, 200, [
            'Cache-Control' => 'no-store, private, max-age=0', 'Pragma' => 'no-cache',
            'X-Robots-Tag' => 'noindex, nofollow', 'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    /** Verify the site and signed grants without changing cached licence permissions. */
    public function verify_and_enroll(string $license_key, string $license_id, ?array $pending_installation = null): array
    {
        $proof_id = null;
        try {
            if ($license_key === '' || $license_id === '' || strlen($license_id) > 128
                || !CentralEntitlements::validation_url_matches((new LicenseService())->validation_url()))
                return $this->failure('trial_site_verification_invalid');
            $installation = $pending_installation ?? (new InstallationProof())->load_or_create(CentralEntitlements::authority(), $license_key);
            if (($installation['authority'] ?? '') !== CentralEntitlements::authority()
                || ($installation['site_url'] ?? '') !== SiteIdentity::normalize_url(site_url('/'))
                || !hash_equals(hash('sha256', CentralEntitlements::authority() . '|' . $installation['site_url'] . '|' . $license_key), (string) ($installation['binding'] ?? '')))
                return $this->failure('trial_site_verification_invalid');
            $url = rest_url(self::ROUTE);
            $parts = wp_parse_url($url); $site = wp_parse_url($installation['site_url']);
            if (!is_array($parts) || !is_array($site) || ($parts['scheme'] ?? '') !== 'https'
                || ($site['scheme'] ?? '') !== 'https' || empty($parts['host'])
                || strtolower($parts['host']) !== strtolower($site['host'] ?? '')
                || ($parts['port'] ?? 443) !== ($site['port'] ?? 443)
                || isset($parts['user']) || isset($parts['pass']) || isset($parts['fragment']))
                return $this->failure('trial_site_https_required');
            $payload = ['installation_id' => $installation['id'], 'license_key' => $license_key,
                'site_url' => $installation['site_url'], 'public_key_pem' => $installation['public_key_pem']];
            $prepared = $this->signed_request($installation, 'verify-site', $payload + ['action' => 'prepare', 'proof_url' => $url]);
            if (empty($prepared['ok'])) return $prepared;
            $proof = $prepared['proof'] ?? null;
            if (!$this->valid_proof($proof, $installation)
                || ($prepared['proof_id'] ?? '') !== $proof['proof_id']
                || ($prepared['expires_at'] ?? 0) !== $proof['expires_at']) return $this->failure('trial_site_proof_invalid');
            $proof_id = $proof['proof_id'];
            $ttl = $proof['expires_at'] - time();
            // WordPress interprets a zero TTL as no expiry, so recheck at storage.
            if ($ttl <= 0) return $this->failure('trial_site_proof_expired');
            if (!set_transient(self::PREFIX . $proof_id, ['authority' => CentralEntitlements::authority(), 'proof' => $proof], $ttl))
                return $this->failure('trial_site_proof_storage_failed');
            $completed = $this->signed_request($installation, 'verify-site', $payload + ['action' => 'complete', 'proof_id' => $proof_id]);
            if (empty($completed['ok'])) return $completed;
            if (($completed['verified'] ?? false) !== true) return $this->failure('trial_site_proof_invalid');
            // Only signed enrollment may consume the server's exact-site/key proof into a domain claim.
            $enrolled = $this->signed_request($installation, 'enroll', $payload);
            if (empty($enrolled['ok'])) return $enrolled;
            $keys_response = wp_remote_get(CentralEntitlements::delivery_origin() . '/api/licensing/v2/keys', ['timeout' => 15, 'redirection' => 0]);
            if (is_wp_error($keys_response) || wp_remote_retrieve_response_code($keys_response) !== 200)
                return $this->failure('trial_site_verification_unavailable');
            $raw = (string) wp_remote_retrieve_body($keys_response);
            if (strlen($raw) > 65536) return $this->failure('invalid_central_entitlement');
            $keys = SignedEntitlement::public_keys(json_decode($raw, true, 32, JSON_THROW_ON_ERROR));
            foreach (['wordpress' => 'wordpress:mutate', 'bridge' => 'bridge:mutate'] as $audience => $scope) {
                $claims = (new SignedEntitlement())->verify((string) ($enrolled['entitlements'][$audience]['token'] ?? ''), $keys, [
                    'iss' => CentralEntitlements::authority(), 'aud' => $audience === 'wordpress' ? 'pixflow-design-wordpress-local' : 'pixflow-design-bridge',
                    'installation_id' => $installation['id'], 'site_fingerprint' => InstallationProof::site_fingerprint($installation['site_url']),
                    'license_id' => $license_id, 'key_thumbprint' => $installation['thumbprint'],
                ], $scope, time());
                if ($claims === null) return $this->failure('invalid_central_entitlement');
            }
            // Internal caller only: recovery can accept these verified replacement
            // grants after native validation, without ever committing the old key.
            return ['ok' => true, 'enrollment' => $enrolled];
        } catch (\Throwable) {
            return $this->failure('trial_site_verification_unavailable');
        } finally {
            if ($proof_id !== null) delete_transient(self::PREFIX . $proof_id);
        }
    }

    private function signed_request(array $installation, string $purpose, array $payload): array
    {
        $base = CentralEntitlements::delivery_origin() . '/api/licensing/v2';
        $http = new LicenseHttpClient();
        $challenge = $this->response($http->post_json($base . '/challenge', ['purpose' => $purpose, 'installation_id' => $installation['id']]), false);
        if (empty($challenge['ok'])) return $challenge;
        $envelope = (new InstallationProof())->envelope($installation, $purpose, $challenge, $payload);
        return $this->response($http->post_json($base . '/' . $purpose, $envelope));
    }

    private function response(array|\WP_Error $response, bool $requires_ok = true): array
    {
        if (is_wp_error($response)) return $this->failure('trial_site_verification_unavailable');
        $raw = (string) ($response['body'] ?? '');
        if (strlen($raw) > 65536) return $this->failure('trial_site_proof_invalid');
        $body = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
        if (!is_array($body)) return $this->failure('trial_site_proof_invalid');
        if (($response['status'] ?? 0) !== 200 || ($requires_ok && ($body['ok'] ?? false) !== true)) {
            $code = $body['code'] ?? null;
            if (!is_string($code) || !preg_match('/^[a-z][a-z0-9_]{0,79}$/D', $code)) $code = 'trial_site_verification_unavailable';
            return $this->failure($code);
        }
        return ['ok' => true] + $body;
    }

    private function valid_proof($proof, array $installation): bool
    {
        if (!is_array($proof) || count($proof) !== 7 || ($proof['schema'] ?? '') !== 'pixflow.trial-site-proof.v1'
            || !is_string($proof['proof_id'] ?? null) || !self::uuid($proof['proof_id'])
            || !is_string($proof['token'] ?? null) || !preg_match('/^[A-Za-z0-9_-]{43}$/D', $proof['token'])
            || !is_int($proof['expires_at'] ?? null) || $proof['expires_at'] <= time()
            || $proof['expires_at'] > time() + self::MAX_TTL) return false;
        return ($proof['installation_id'] ?? '') === $installation['id']
            && ($proof['site_url'] ?? '') === $installation['site_url']
            && ($proof['key_thumbprint'] ?? '') === $installation['thumbprint'];
    }

    private static function uuid(string $value): bool
    {
        return preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/D', $value) === 1;
    }

    private function failure(string $code): array
    {
        return ['ok' => false, 'code' => $code];
    }

    private function not_found(): \WP_Error
    {
        return new \WP_Error('trial_site_proof_not_found', 'Site verification proof is unavailable.', ['status' => 404]);
    }
}
