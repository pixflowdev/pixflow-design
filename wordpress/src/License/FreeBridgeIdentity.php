<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\License;
if (!defined('ABSPATH')) exit;

/** A site-owned identity for Free pairing, never a Pro entitlement or licence. */
final class FreeBridgeIdentity
{
    public static function configuration(string $credential): array
    {
        $option = 'pixflow_design_free_bridge_identity';
        $site = SiteIdentity::normalize_url(site_url('/'));
        $installation = get_option($option, []);
        if (!is_array($installation) || ($installation['site_url'] ?? '') !== $site) {
            $installation = (new InstallationProof())->create(CentralEntitlements::authority(), '');
            update_option($option, $installation, false);
        }
        $key = openssl_pkey_get_public($installation['public_key_pem']);
        $details = $key ? openssl_pkey_get_details($key) : false;
        if (!is_array($details)) throw new \RuntimeException('Site public key unavailable.');
        return ['freeAccess' => true, 'identity' => [
            'issuer' => CentralEntitlements::authority(), 'audience' => 'pixflow-design-bridge',
            'installationId' => $installation['id'], 'siteFingerprint' => InstallationProof::site_fingerprint($site),
            'keyThumbprint' => $installation['thumbprint'], 'licenseId' => '',
        ], 'keys' => [], 'installationPublicKey' => ['kty' => 'RSA',
            'n' => SignedEntitlement::encode($details['rsa']['n']), 'e' => SignedEntitlement::encode($details['rsa']['e'])],
            'wordpressUrl' => $site, 'wordpressPairingToken' => $credential];
    }
}
