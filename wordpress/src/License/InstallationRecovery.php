<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\License;
use PixflowDesign\WordPress\Security\SecretBox;
if (!defined('ABSPATH')) exit;

/** Owner-approved replacement of a lost installation key; only public requests enter the browser. */
final class InstallationRecovery
{
    private const PENDING = 'pixflow_design_installation_recovery_v1';
    private const LOCK = 'pixflow_design_central_entitlements_refresh_lock';

    public function register(): void
    {
        add_action('rest_api_init', function (): void {
            foreach (['prepare', 'complete'] as $action) register_rest_route('pixflow-design/v1', '/license/recovery/' . $action, [
                'methods' => 'POST', 'permission_callback' => [$this, 'can_authorize'], 'callback' => [$this, $action],
            ]);
        });
    }

    public function can_authorize(\WP_REST_Request $request): bool
    {
        if ((new BridgePairing())->can_authorize($request) === true) return true;
        // Headless CLI uses the existing revocable administrator pairing credential.
        if ($request->get_header('origin') || $request->get_header('sec_fetch_site')) return false;
        if (!preg_match('/^Bearer (pfwp_[A-Za-z0-9_\-]+)$/D', trim((string) $request->get_header('authorization')), $match)) return false;
        return (new \PixflowDesign\WordPress\Admin\WpAdminPairingService())->authenticate_token($match[1]) !== null
            && current_user_can('manage_options');
    }

    public function prepare(?\WP_REST_Request $request = null): \WP_REST_Response|\WP_Error
    {
        return $this->locked(function () use ($request): array {
            $license = (new LicenseCache())->private_payload();
            $entered = $request?->get_param('license_key');
            if ($entered !== null && !is_string($entered)) return ['ok' => false, 'code' => 'license_key_required'];
            $cachedKey = ($license['validation_url'] ?? '') === (new LicenseService())->validation_url() ? (string) ($license['license_key'] ?? '') : '';
            $key = trim((string) $entered) ?: $cachedKey;
            if ($key === '' || strlen($key) > 1024) return ['ok' => false, 'code' => 'license_key_required'];
            $authority = CentralEntitlements::authority();
            $site = SiteIdentity::normalize_url(site_url('/'));
            $binding = hash('sha256', $authority . '|' . $site . '|' . $key);
            $pending = get_option(self::PENDING, []);
            if (!is_array($pending) || ($pending['binding'] ?? '') !== $binding || empty($pending['recovery_license_key'])) {
                $pending = (new InstallationProof())->create($authority, $key);
                $pending['recovery_license_key'] = SecretBox::encrypt($key);
                if (!SecretBox::is_encrypted($pending['recovery_license_key'])) return ['ok' => false, 'code' => 'recovery_storage_failed'];
                if (!update_option(self::PENDING, $pending, false)) return ['ok' => false, 'code' => 'recovery_storage_failed'];
            }
            return ['ok' => true, 'request' => ['schema' => 'pixflow.installation-recovery.v1',
                'installation_id' => $pending['id'], 'public_key_pem' => $pending['public_key_pem'], 'site_url' => $site],
                'account_url' => $authority === 'https://preview.pixflow.dev'
                    ? 'https://staging.pixflow.dev/account/licenses' : 'https://pixflow.dev/account/licenses'];
        });
    }

    public function complete(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        return $this->locked(function () use ($request): array {
            $pending = get_option(self::PENDING, []);
            $license = (new LicenseCache())->private_payload();
            $authority = CentralEntitlements::authority();
            $encrypted = is_array($pending) ? (string) ($pending['recovery_license_key'] ?? '') : '';
            $key = $encrypted !== '' ? (SecretBox::is_encrypted($encrypted) ? SecretBox::decrypt($encrypted) : '') : (string) ($license['license_key'] ?? '');
            if ($key === '') return ['ok' => false, 'code' => 'license_key_required'];
            $binding = hash('sha256', $authority . '|' . SiteIdentity::normalize_url(site_url('/')) . '|' . $key);
            if (!is_array($pending) || empty($pending['id']) || ($pending['binding'] ?? '') !== $binding
                || !hash_equals($pending['id'], (string) $request->get_param('installation_id')))
                return ['ok' => false, 'code' => 'recovery_request_changed'];
            $expected = get_option('pixflow_design_central_entitlements_v2', []);
            $expected = is_array($expected) ? $expected : [];
            $base = CentralEntitlements::delivery_origin() . '/api/licensing/v2';
            $http = new LicenseHttpClient();
            $challenge = $http->post_json($base . '/challenge', ['purpose' => 'enroll', 'installation_id' => $pending['id']]);
            if (is_wp_error($challenge) || (int) ($challenge['status'] ?? 0) !== 200) return ['ok' => false, 'code' => 'recovery_not_ready'];
            $payload = ['installation_id' => $pending['id'], 'public_key_pem' => $pending['public_key_pem'],
                'site_url' => $pending['site_url'], 'license_key' => $key];
            $envelope = (new InstallationProof())->envelope($pending, 'enroll', json_decode($challenge['body'], true, 32, JSON_THROW_ON_ERROR), $payload);
            $response = $http->post_json($base . '/enroll', $envelope);
            $refusal = !is_wp_error($response) ? json_decode((string) ($response['body'] ?? ''), true) : null;
            if (is_array($refusal) && ($refusal['code'] ?? '') === 'trial_domain_verification_required'
                && ($refusal['verification_method'] ?? '') === 'plugin'
                && is_string($refusal['license_id'] ?? null) && $refusal['license_id'] !== '') {
                // Owner approval registered this replacement. It must prove its own
                // site/key; never reuse the previous installation's consumed proof.
                $automatic = (new TrialSiteVerification())->verify_and_enroll($key, $refusal['license_id'], $pending);
                if (empty($automatic['ok'])) return ['ok' => false, 'code' => $automatic['code'] ?? 'recovery_not_ready'];
                $response = ['status' => 200, 'body' => json_encode($automatic['enrollment'], JSON_THROW_ON_ERROR)];
            }
            if (is_wp_error($response) || (int) ($response['status'] ?? 0) !== 200) return ['ok' => false, 'code' => 'recovery_not_approved'];
            $keys = wp_remote_get($base . '/keys', ['timeout' => 15, 'redirection' => 0]);
            if (is_wp_error($keys) || wp_remote_retrieve_response_code($keys) !== 200) return ['ok' => false, 'code' => 'recovery_keys_unavailable'];
            // Revalidate only after the authority accepts the owner-approved replacement.
            // Do not call LicenseService::validate here: it enrolls the old local identity.
            $recoveredLicense = null;
            if (($license['license_key'] ?? '') !== $key || empty($license['license_id'])) {
                $validation = $http->post_json((new LicenseService())->validation_url(), array_merge(
                    (new SiteIdentity())->current_payload(), ['operation' => 'validate', 'license_key' => $key]));
                $validated = !is_wp_error($validation) ? json_decode((string) ($validation['body'] ?? ''), true) : null;
                if (is_wp_error($validation) || (int) ($validation['status'] ?? 0) !== 200 || !is_array($validated)
                    || ($validated['valid'] ?? false) !== true || ($validated['access_granted'] ?? false) !== true
                    || ($validated['status'] ?? '') !== 'active' || empty($validated['license_id']))
                    return ['ok' => false, 'code' => 'recovery_license_unavailable'];
                $recoveredLicense = ['license_key' => $key, 'license_id' => $validated['license_id'],
                    'validation_url' => (new LicenseService())->validation_url(), 'upstream' => $validated];
            }
            unset($pending['recovery_license_key']);
            $result = (new CentralEntitlements())->accept_recovery($pending,
                json_decode($response['body'], true, 32, JSON_THROW_ON_ERROR),
                json_decode(wp_remote_retrieve_body($keys), true, 32, JSON_THROW_ON_ERROR), $expected, $recoveredLicense);
            if (!empty($result['ok'])) delete_option(self::PENDING);
            return $result;
        });
    }

    private function locked(callable $action): \WP_REST_Response|\WP_Error
    {
        $lock = (int) get_option(self::LOCK, 0);
        if ($lock && $lock < time() - 90) delete_option(self::LOCK);
        if (!add_option(self::LOCK, time(), '', false)) return new \WP_Error('recovery_in_progress', 'An installation request is already running.', ['status' => 409]);
        try {
            $result = $action();
            if (empty($result['ok'])) return new \WP_Error($result['code'], match ($result['code']) {
                'license_key_required' => 'Enter your Pixflow license key above, then prepare the recovery request.',
                'recovery_storage_failed' => 'WordPress could not securely save the recovery request. Check database and encryption availability, then retry.',
                'recovery_request_changed' => 'Prepare a new recovery request for this site, then approve that request in your Pixflow account.',
                'recovery_license_unavailable' => 'The replacement was accepted, but license validation could not finish. Retry Finish approved recovery.',
                'recovery_not_ready', 'recovery_not_approved' => 'Approve this recovery request in your Pixflow account, then choose Finish approved recovery.',
                default => 'Recovery could not verify the replacement. Your existing installation has been preserved. Try again.',
            }, ['status' => 409]);
            return new \WP_REST_Response($result, 200, ['Cache-Control' => 'private, no-store']);
        } catch (\Throwable) {
            return new \WP_Error('recovery_failed', 'Installation recovery could not be completed. Your existing installation key has been preserved.', ['status' => 409]);
        } finally { delete_option(self::LOCK); }
    }
}
