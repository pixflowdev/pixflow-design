<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Admin;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Explicit site/user pairing for headless `od` access.
 *
 * Browser REST nonces and the public site hash are deliberately not accepted
 * as CLI credentials. The bearer token is shown once, stored only as a hash,
 * can be revoked from the authenticated browser, and is bound to this site
 * and the issuing user.
 */
final class WpAdminPairingService
{
    private const USER_META_KEY = 'pixflow_design_wp_admin_pairings_v1';
    private const DEFAULT_TTL = 2_592_000; // 30 days
    private const MAX_PAIRINGS = 8;

    /** @return array{token:string, tokenId:string, siteId:string, userId:string, expiresAt:int} */
    public function issue(?int $user_id = null, int $ttl = self::DEFAULT_TTL): array
    {
        $user_id = $user_id ?: get_current_user_id();
        if ($user_id <= 0) throw new \RuntimeException('A signed-in user is required for pairing.');
        if (!WpAdminSurfacePolicy::can_use()) throw new \RuntimeException('The current user cannot pair Pixflow WP Admin access.');

        $ttl = max(300, min($ttl, self::DEFAULT_TTL));
        $token_id = 'pair_' . wp_generate_uuid4();
        // The authentication grammar deliberately accepts only a URL/header-safe
        // alphabet. Generate the secret from raw bytes so every issued token can
        // be authenticated without relying on WordPress's punctuation options.
        $secret = bin2hex(random_bytes(32));
        $token = 'pfwp_' . $user_id . '_' . $secret;
        $now = time();
        $records = $this->records($user_id);
        $records[$token_id] = [
            'tokenId' => $token_id,
            'tokenHash' => hash('sha256', $token),
            'siteId' => $this->site_id(),
            'userId' => (string) $user_id,
            'issuedAt' => $now,
            'expiresAt' => $now + $ttl,
            'lastUsedAt' => null,
            'revokedAt' => null,
        ];
        uasort($records, static fn(array $left, array $right): int => ((int) ($right['issuedAt'] ?? 0)) <=> ((int) ($left['issuedAt'] ?? 0)));
        $records = array_slice($records, 0, self::MAX_PAIRINGS, true);
        update_user_meta($user_id, self::USER_META_KEY, $records);

        return [
            'token' => $token,
            'tokenId' => $token_id,
            'siteId' => $this->site_id(),
            'userId' => (string) $user_id,
            'expiresAt' => $now + $ttl,
        ];
    }

    /** @return array{userId:int, tokenId:string}|null */
    public function authenticate_token(string $token): ?array
    {
        $token = trim($token);
        if (!preg_match('/^pfwp_(\d+)_([A-Za-z0-9_\-]+)$/', $token, $match)) return null;
        $user_id = (int) $match[1];
        if ($user_id <= 0) return null;
        $hash = hash('sha256', $token);
        $records = $this->records($user_id);
        foreach ($records as $token_id => &$record) {
            if (!is_array($record) || !hash_equals((string) ($record['tokenHash'] ?? ''), $hash)) continue;
            if (($record['siteId'] ?? '') !== $this->site_id()) return null;
            if (!empty($record['revokedAt']) || (int) ($record['expiresAt'] ?? 0) <= time()) return null;
            $record['lastUsedAt'] = time();
            update_user_meta($user_id, self::USER_META_KEY, $records);
            wp_set_current_user($user_id);
            return ['userId' => $user_id, 'tokenId' => (string) $token_id];
        }
        unset($record);
        return null;
    }

    public function authenticate_request(\WP_REST_Request $request): bool
    {
        if (WpAdminSurfacePolicy::can_use()) return true;
        $header = trim((string) $request->get_header('authorization'));
        // Some CGI/FastCGI stacks expose Authorization only through the server
        // variable and do not hydrate it into WP_REST_Request headers.
        if ($header === '') {
            $header = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
        }
        if (!preg_match('/^Bearer\s+(.+)$/i', trim($header), $match)) return false;
        return $this->authenticate_token((string) $match[1]) !== null;
    }

    public function revoke(string $token_id, ?int $user_id = null): bool
    {
        $user_id = $user_id ?: get_current_user_id();
        if ($user_id <= 0 || !WpAdminSurfacePolicy::can_use()) return false;
        $records = $this->records($user_id);
        if (!isset($records[$token_id]) || !is_array($records[$token_id])) return false;
        $records[$token_id]['revokedAt'] = time();
        update_user_meta($user_id, self::USER_META_KEY, $records);
        return true;
    }

    /** @return list<array<string, mixed>> */
    public function list(?int $user_id = null): array
    {
        $user_id = $user_id ?: get_current_user_id();
        $records = $this->records($user_id);
        return array_values(array_map(static function (array $record): array {
            unset($record['tokenHash']);
            return $record;
        }, $records));
    }

    public function site_id(): string
    {
        return hash('sha256', untrailingslashit(home_url('/')));
    }

    /** @return array<string, array<string, mixed>> */
    private function records(int $user_id): array
    {
        $records = get_user_meta($user_id, self::USER_META_KEY, true);
        return is_array($records) ? $records : [];
    }
}
