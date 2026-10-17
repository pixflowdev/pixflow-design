<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\License;

if (!defined('ABSPATH')) exit;

/** Verifies central grants; never derives permission from a cached validity flag. */
final class SignedEntitlement
{
    public function verify(string $token, array $keys, array $identity, string $scope, int $now, bool $network_unavailable = false, bool $denied = false, int $minimum_revision = 0): ?array
    {
        try {
            if ($denied || strlen($token) > 16384) return null;
            $parts = explode('.', $token);
            if (count($parts) !== 3) return null;
            [$header_part, $payload_part, $signature_part] = $parts;
            $header = json_decode(self::decode($header_part), true, 32, JSON_THROW_ON_ERROR);
            if (!is_array($header) || ($header['alg'] ?? '') !== 'RS256'
                || ($header['typ'] ?? '') !== 'pixflow-entitlement+jwt'
                || !is_string($header['kid'] ?? null) || array_key_exists('crit', $header)
                || !isset($keys[$header['kid']])) return null;
            $key = openssl_pkey_get_public($keys[$header['kid']]);
            if ($key === false) return null;
            $details = openssl_pkey_get_details($key);
            if (!is_array($details) || $details['type'] !== OPENSSL_KEYTYPE_RSA || $details['bits'] < 2048) return null;
            if (openssl_verify($header_part . '.' . $payload_part, self::decode($signature_part), $key, OPENSSL_ALGO_SHA256) !== 1) return null;
            $claims = json_decode(self::decode($payload_part), true, 32, JSON_THROW_ON_ERROR);
            if (!is_array($claims) || ($claims['ver'] ?? null) !== 2) return null;
            foreach (['iss', 'aud', 'installation_id', 'site_fingerprint', 'license_id'] as $field) {
                if (!is_string($identity[$field] ?? null) || $identity[$field] === '' || ($claims[$field] ?? null) !== $identity[$field]) return null;
            }
            if (($claims['sub'] ?? null) !== $identity['license_id']
                || empty($identity['key_thumbprint']) || ($claims['cnf']['jkt'] ?? null) !== $identity['key_thumbprint']
                || !is_string($claims['jti'] ?? null) || $claims['jti'] === ''
                || !is_array($claims['scopes'] ?? null) || !in_array($scope, $claims['scopes'], true)) return null;
            foreach ($claims['scopes'] as $value) if (!is_string($value)) return null;
            foreach (['iat', 'nbf', 'exp', 'refresh_after', 'offline_until', 'access_until', 'revocation_version'] as $field) {
                if (!is_int($claims[$field] ?? null) || $claims[$field] < 0) return null;
            }
            if ($claims['revocation_version'] < $minimum_revision
                || $claims['iat'] > $now + 60 || $claims['nbf'] > $now + 60
                || $claims['exp'] <= $claims['iat'] || $claims['exp'] - $claims['iat'] > 900
                || $claims['nbf'] > $claims['exp'] || $claims['refresh_after'] < $claims['iat'] || $claims['refresh_after'] > $claims['exp']
                || $claims['offline_until'] < $claims['exp'] || $claims['offline_until'] > $claims['iat'] + 86400
                || $claims['offline_until'] > $claims['access_until'] || $now >= $claims['access_until']) return null;
            if ($now >= $claims['exp'] && (!$network_unavailable || $now >= $claims['offline_until'])) return null;
            return $claims;
        } catch (\Throwable) {
            return null;
        }
    }

    public static function encode(string $bytes): string
    {
        return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
    }

    public static function decode(string $segment): string
    {
        if (!preg_match('/^[A-Za-z0-9_-]+$/D', $segment)) throw new \InvalidArgumentException('Invalid token encoding.');
        $bytes = base64_decode(strtr($segment, '-_', '+/'), true);
        if ($bytes === false || self::encode($bytes) !== $segment) throw new \InvalidArgumentException('Noncanonical token encoding.');
        return $bytes;
    }

    /** RSA public JWKS material only; private parameters are never accepted. */
    public static function public_keys(array $jwks): array
    {
        $result = [];
        foreach ((array) ($jwks['keys'] ?? []) as $jwk) {
            if (!is_array($jwk) || ($jwk['kty'] ?? '') !== 'RSA' || isset($jwk['d'])
                || ($jwk['alg'] ?? 'RS256') !== 'RS256' || ($jwk['use'] ?? 'sig') !== 'sig'
                || !is_string($jwk['kid'] ?? null) || $jwk['kid'] === '') continue;
            try {
                $integers = '';
                foreach (['n', 'e'] as $field) {
                    $bytes = self::decode((string) ($jwk[$field] ?? ''));
                    if ((ord($bytes[0]) & 128) !== 0) $bytes = "\0" . $bytes;
                    $integers .= self::der(2, $bytes);
                }
                $rsa = self::der(48, $integers);
                $spki = self::der(48, hex2bin('300d06092a864886f70d0101010500') . self::der(3, "\0" . $rsa));
                $result[$jwk['kid']] = "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($spki), 64, "\n") . "-----END PUBLIC KEY-----\n";
            } catch (\Throwable) { continue; }
        }
        return $result;
    }

    private static function der(int $tag, string $value): string
    {
        $length = strlen($value);
        if ($length < 128) return chr($tag) . chr($length) . $value;
        $encoded = ltrim(pack('N', $length), "\0");
        return chr($tag) . chr(128 | strlen($encoded)) . $encoded . $value;
    }
}
