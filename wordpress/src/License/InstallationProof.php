<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\License;

use PixflowDesign\WordPress\Security\SecretBox;

if (!defined('ABSPATH')) exit;

/** Each installation owns its key. This is proof of enrollment, not a grant signer. */
final class InstallationProof
{
    private const OPTION = 'pixflow_design_installation_proof_v2';

    public function load_or_create(string $authority, string $license_key): array
    {
        $site = SiteIdentity::normalize_url(site_url('/'));
        $binding = hash('sha256', $authority . '|' . $site . '|' . $license_key);
        $stored = get_option(self::OPTION, []);
        $identities = is_array($stored) ? ($stored['identities'] ?? []) : [];
        if (is_array($stored) && !empty($stored['binding'])) $identities[$stored['binding']] = $stored;
        // The committed entitlement is canonical after recovery, including a crash
        // between committing the grant and updating the identity index.
        $central = get_option('pixflow_design_central_entitlements_v2', []);
        $active = is_array($central) ? ($central['installation'] ?? []) : [];
        if (($active['binding'] ?? '') === $binding && !empty($active['private_key'])) return $active;
        // HTTPS upgrades keep the same proven installation, not a replacement
        // identity for an activation that the authority already knows.
        foreach (array_merge([$active], array_values($identities)) as $candidate) {
            $old_site = (string) ($candidate['site_url'] ?? '');
            if (!str_starts_with($site, 'https://') || !str_starts_with($old_site, 'http://')
                || self::site_fingerprint($old_site) !== self::site_fingerprint($site)
                || ($candidate['authority'] ?? '') !== $authority || empty($candidate['private_key'])
                || !hash_equals((string) ($candidate['binding'] ?? ''), hash('sha256', $authority . '|' . $old_site . '|' . $license_key))) continue;
            $candidate['site_url'] = $site;
            $candidate['binding'] = $binding;
            $this->store($candidate);
            return $candidate;
        }
        if (isset($identities[$binding])) return $identities[$binding];
        $stored = $this->create($authority, $license_key);
        $this->store($stored);
        return $stored;
    }

    public function store(array $installation): void
    {
        $stored = get_option(self::OPTION, []);
        $identities = is_array($stored) ? ($stored['identities'] ?? []) : [];
        if (is_array($stored) && !empty($stored['binding'])) $identities[$stored['binding']] = $stored;
        $identities[$installation['binding']] = $installation;
        update_option(self::OPTION, ['identities' => $identities], false);
    }

    /** Generate a candidate without replacing any currently usable identity. */
    public function create(string $authority, string $license_key): array
    {
        $site = SiteIdentity::normalize_url(site_url('/'));
        $binding = hash('sha256', $authority . '|' . $site . '|' . $license_key);
        // PHP on Windows can require a config file even for RSA generation and
        // export. Scope our config to these operations; do not change the host's
        // environment, TLS trust, OpenSSL providers or security settings.
        $key_options = ['private_key_type' => OPENSSL_KEYTYPE_RSA, 'private_key_bits' => 2048,
            'config' => __DIR__ . '/installation-openssl.cnf'];
        $key = openssl_pkey_new($key_options);
        if ($key === false || !openssl_pkey_export($key, $private, null, $key_options)) throw new \RuntimeException('Installation key creation failed. Check the PHP OpenSSL configuration.');
        $details = openssl_pkey_get_details($key);
        if (!is_array($details)) throw new \RuntimeException('Installation public key is unavailable.');
        $encrypted = SecretBox::encrypt($private);
        if (!SecretBox::is_encrypted($encrypted)) throw new \RuntimeException('Encrypted installation key storage is unavailable.');
        $thumbprint_json = json_encode(['e' => SignedEntitlement::encode($details['rsa']['e']), 'kty' => 'RSA', 'n' => SignedEntitlement::encode($details['rsa']['n'])], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $stored = ['id' => wp_generate_uuid4(), 'binding' => $binding, 'authority' => $authority,
            'site_url' => $site, 'public_key_pem' => $details['key'], 'private_key' => $encrypted,
            'thumbprint' => SignedEntitlement::encode(hash('sha256', $thumbprint_json, true))];
        return $stored;
    }

    public function envelope(array $installation, string $purpose, array $challenge, array $payload): array
    {
        if (!in_array($purpose, ['enroll', 'refresh', 'revoke', 'artifacts', 'download', 'verify-site', 'skill-catalogue', 'skill-download'], true)) throw new \InvalidArgumentException('Unsupported proof purpose.');
        if (empty($challenge['challenge_id']) || empty($challenge['nonce']) || (int) ($challenge['expires_at'] ?? 0) <= time()) throw new \RuntimeException('Installation challenge is invalid or expired.');
        $encoded = SignedEntitlement::encode(json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
        $message = implode("\n", ['pixflow-installation-v2', 'POST', '/api/licensing/v2/' . $purpose, $challenge['challenge_id'], $challenge['nonce'], $encoded]);
        $private = SecretBox::decrypt((string) ($installation['private_key'] ?? ''));
        if ($private === '' || !openssl_sign($message, $signature, $private, OPENSSL_ALGO_SHA256)) throw new \RuntimeException('Installation proof signing failed.');
        return ['challenge_id' => $challenge['challenge_id'], 'nonce' => $challenge['nonce'], 'payload' => $encoded, 'signature' => SignedEntitlement::encode($signature)];
    }

    /** Native server identity, separate from WordPress's historic hashed identity. */
    public static function site_fingerprint(string $site): string
    {
        $url = wp_parse_url($site);
        if (!is_array($url) || empty($url['host'])) return '';
        $port = (int) ($url['port'] ?? 0);
        $default = ($url['scheme'] ?? '') === 'https' ? 443 : 80;
        return strtolower($url['host']) . ($port && $port !== $default ? ':' . $port : '') . rtrim($url['path'] ?? '', '/');
    }
}
