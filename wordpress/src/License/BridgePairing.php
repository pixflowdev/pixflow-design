<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\License;
use PixflowDesign\WordPress\Admin\WpAdminPairingService;
if (!defined('ABSPATH')) exit;

/** Browser authorization carries only a short-lived PKCE code. */
final class BridgePairing
{
    public function register(): void
    {
        add_action('rest_api_init', function (): void {
            register_rest_route('pixflow-design/v1', '/license/pairing/authorize', [
                'methods'=>'POST', 'permission_callback'=>[$this,'can_authorize'], 'callback'=>[$this,'authorize'],
            ]);
            register_rest_route('pixflow-design/v1', '/license/pairing/exchange', [
                'methods'=>'POST', 'permission_callback'=>[$this,'server_exchange'], 'callback'=>[$this,'exchange'],
            ]);
        });
    }

    public function can_authorize(\WP_REST_Request $request): bool|\WP_Error
    {
        if (!is_user_logged_in()) return $this->failure('pairing_login_required');
        if (!current_user_can('manage_options')) return $this->failure('pairing_admin_required');
        if (wp_verify_nonce((string)$request->get_header('x_wp_nonce'), 'wp_rest') === false) return $this->failure('pairing_nonce_invalid');
        return true;
    }

    public function server_exchange(\WP_REST_Request $request): bool
    {
        // Browsers never receive the credential/grant response.
        return !$request->get_header('origin') && !$request->get_header('sec_fetch_site');
    }

    public function authorize(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $challenge = (string)$request->get_param('challenge');
        $site = SiteIdentity::normalize_url(site_url('/'));
        if (!preg_match('/^[A-Za-z0-9_-]{43}$/D', $challenge)) return $this->failure('invalid_pairing_request');
        if (SiteIdentity::normalize_url((string)$request->get_param('siteUrl')) !== $site) return $this->failure('pairing_site_mismatch');
        $user = get_current_user_id();
        $rate = 'pixflow_pairing_rate_' . $user;
        $count = (int)get_transient($rate);
        if ($count >= 5) return $this->failure('pairing_rate_limit');
        set_transient($rate, $count + 1, 300);
        $code = bin2hex(random_bytes(32));
        set_transient('pixflow_pair_' . hash('sha256',$code), ['challenge'=>$challenge,'site'=>$site,'user'=>$user,'expires'=>time()+120], 120);
        return new \WP_REST_Response(['code'=>$code,'expiresAt'=>time()+120],200,['Cache-Control'=>'no-store']);
    }

    public function exchange(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $code=(string)$request->get_param('code'); $verifier=(string)$request->get_param('verifier');
        if (!preg_match('/^[a-f0-9]{64}$/D',$code) || !preg_match('/^[A-Za-z0-9_-]{43,128}$/D',$verifier)) return $this->failure('invalid_pairing_code');
        $key='pixflow_pair_' . hash('sha256',$code);
        // add_option is atomic across PHP workers; consume only once.
        $lock=$key.'_lock';
        if (!add_option($lock,time(),'',false)) return $this->failure('pairing_in_progress');
        try {
            $record=get_transient($key);
            if (!is_array($record) || $record['expires'] <= time()) return $this->failure('pairing_expired');
            if ($record['site'] !== SiteIdentity::normalize_url(site_url('/'))) return $this->failure('pairing_site_changed');
            if (!hash_equals($record['challenge'],SignedEntitlement::encode(hash('sha256',$verifier,true)))) return $this->failure('invalid_pairing_code');
            if (!user_can((int)$record['user'],'manage_options')) return $this->failure('pairing_admin_required');
            delete_transient($key);
            wp_set_current_user((int)$record['user']);
            $central=new CentralEntitlements();
            $service=new WpAdminPairingService();
            $credential=$service->issue();
            try {
                // Re-pairing must obtain evidence issued after a previous bridge denial.
                // A still-valid cached grant can predate revoked local credentials.
                $token = '';
                $configuration = null;
                if ($central->allows('wordpress:mutate')) {
                    $refreshed = $central->refresh();
                    if (!empty($refreshed['ok'])) {
                        $delivery = $central->deliver_to_bridge();
                        $body = $delivery->get_data();
                        if ($delivery->get_status() === 200 && !empty($body['token'])) {
                            $configuration = $central->bridge_configuration($credential['token']);
                            $token = $body['token'];
                        }
                    }
                }
                $configuration ??= FreeBridgeIdentity::configuration($credential['token']);
                $configuration['freeAccess'] = true;
                return new \WP_REST_Response(['configuration'=>$configuration,'token'=>$token],200,['Cache-Control'=>'no-store']);
            } catch (\Throwable) {
                $service->revoke($credential['tokenId']);
                return $this->failure('pairing_grant_failed');
            }
        } finally { delete_option($lock); }
    }

    private function failure(string $code): \WP_Error
    {
        $message = match ($code) {
            'pairing_login_required' => 'Your WordPress login has expired. Sign in again and retry Connect.',
            'pairing_admin_required' => 'Your WordPress account needs administrator permissions to pair the Bridge.',
            'pairing_nonce_invalid' => 'Your WordPress security token is missing or invalid. Reload the page and retry Connect.',
            'pairing_site_mismatch' => 'The selected Bridge site does not match WordPress Address in Settings > General. Select the matching site and reconnect.',
            'invalid_pairing_request' => 'The pairing challenge is invalid. Start Connect again.',
            'license_required' => 'This site has no current license authorization. Revalidate the license in Pixflow settings.',
            'pairing_rate_limit' => 'Too many pairing attempts. Wait five minutes before connecting again.',
            'pairing_in_progress' => 'This pairing request is already being processed. Wait for it to finish.',
            'pairing_expired' => 'This pairing code has expired or has already been used. Start Connect again.',
            'pairing_site_changed' => 'The WordPress site address changed during pairing. Start Connect again.',
            'invalid_pairing_code' => 'The pairing code or its verification proof is invalid. Start Connect again.',
            'pairing_grant_failed' => 'WordPress could not obtain fresh Bridge authorization from Pixflow. Check the license status and connection to pixflow.dev.',
            default => 'WordPress could not complete the pairing operation. Contact support with this error code.',
        };
        return new \WP_Error($code, $message, ['status' => $code === 'pairing_rate_limit' ? 429 : 403]);
    }
}
