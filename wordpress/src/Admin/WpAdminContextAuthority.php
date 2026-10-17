<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Admin;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Issues short-lived, tab-bound proof of the latest server-verified WP Admin
 * object context. The latest-token record makes navigation in one tab revoke
 * that tab's prior review authority without affecting another tab.
 */
final class WpAdminContextAuthority
{
    private const META = 'pixflow_design_wp_admin_context_authority_v1';
    private const TTL = 900;

    public function __construct(private readonly WpAdminContext $context = new WpAdminContext())
    {
    }

    /** @param array<string, mixed> $context */
    public function issue(array $context, string $tab_id, string $target_provenance = 'active_context_target'): array|\WP_Error
    {
        $tab_id = $this->bounded($tab_id, 128);
        $identity = is_array($context['identity'] ?? null) ? $context['identity'] : [];
        if ($tab_id === '' || ($identity['schema'] ?? '') !== 'pixflow.wp-admin.context-identity.v1') {
            return $this->error('invalid_context', 'A verified WP Admin context and tab identity are required.', 400);
        }
        $target_provenance = sanitize_key($target_provenance);
        if (!in_array($target_provenance, ['active_context_target', 'explicit_user_target'], true)) {
            return $this->error('invalid_target_provenance', 'The WP Admin target provenance is invalid.', 400);
        }
        $identity['tabId'] = $tab_id;
        $now = time();
        $payload = [
            'schema' => 'pixflow.wp-admin.context-authority.v1',
            'version' => 1,
            'identity' => $identity,
            'targetProvenance' => $target_provenance,
            'issuedAt' => $now,
            'expiresAt' => $now + self::TTL,
            'nonce' => wp_generate_uuid4(),
        ];
        $encoded = $this->encode($payload);
        $token = 'pfctx_' . $encoded . '.' . hash_hmac('sha256', $encoded, $this->secret());
        $records = $this->records();
        $record_key = $this->record_key($tab_id, $target_provenance, $identity);
        $current = is_array($records[$record_key] ?? null) ? $records[$record_key] : [];
        $identity_hash = hash('sha256', $this->canonical($identity));
        $token_hash = hash('sha256', $token);
        $token_hashes = [$token_hash];
        if (($current['identityHash'] ?? '') === $identity_hash) {
            $previous = is_array($current['tokenHashes'] ?? null) ? $current['tokenHashes'] : [];
            if (is_string($current['tokenHash'] ?? null)) array_unshift($previous, (string) $current['tokenHash']);
            foreach ($previous as $previous_hash) {
                if (is_string($previous_hash) && preg_match('/^[a-f0-9]{64}$/', $previous_hash) === 1) {
                    $token_hashes[] = $previous_hash;
                }
            }
        }
        // Assignment to an existing associative key does not move that key
        // to the end of PHP's insertion order. Promote every refreshed record
        // explicitly so the bounded store evicts the least-recently issued
        // context instead of a token that was just refreshed for this turn.
        unset($records[$record_key]);
        $records[$record_key] = [
            'tokenHash' => $token_hash,
            // Same-context hydration may race with an in-flight read. Retain
            // recent hashes only while the complete signed identity is
            // unchanged; navigation replaces this list and revokes them.
            'tokenHashes' => array_slice(array_values(array_unique($token_hashes)), 0, 64),
            'identityHash' => $identity_hash,
            'expiresAt' => $payload['expiresAt'],
            'objectId' => $identity['objectId'] ?? null,
            'contextRevision' => $identity['contextRevision'] ?? '',
            'contentFingerprint' => $identity['contentFingerprint'] ?? null,
        ];
        update_user_meta(get_current_user_id(), self::META, array_slice($records, -16, null, true));
        return ['identity' => $identity, 'token' => $token, 'expiresAt' => $payload['expiresAt']];
    }

    /** @param array<string, mixed> $binding @return array<string, mixed>|\WP_Error */
    public function verify(array $binding): array|\WP_Error
    {
        $token = is_string($binding['contextAuthority'] ?? null) ? (string) $binding['contextAuthority'] : '';
        if (!str_starts_with($token, 'pfctx_') || !str_contains($token, '.')) {
            return $this->error('context_authority_required', 'Fresh WP Admin context authority is required.', 409);
        }
        [$encoded, $signature] = explode('.', substr($token, 6), 2);
        $expected = hash_hmac('sha256', $encoded, $this->secret());
        if (!hash_equals($expected, $signature)) return $this->error('context_authority_invalid', 'WP Admin context authority is invalid.', 403);
        $payload = $this->decode($encoded);
        $identity = is_array($payload['identity'] ?? null) ? $payload['identity'] : [];
        $tab_id = $this->bounded((string) ($binding['tabId'] ?? ''), 128);
        $target_provenance = sanitize_key((string) ($binding['targetProvenance'] ?? ''));
        if (($payload['schema'] ?? '') !== 'pixflow.wp-admin.context-authority.v1'
            || (int) ($payload['expiresAt'] ?? 0) <= time()
            || $tab_id === ''
            || !hash_equals((string) ($payload['targetProvenance'] ?? ''), $target_provenance)
            || !hash_equals((string) ($identity['tabId'] ?? ''), $tab_id)
            || !hash_equals((string) ($identity['userId'] ?? ''), (string) get_current_user_id())) {
            return $this->error('context_mismatch', 'The action no longer matches the active WordPress Admin context.', 409);
        }
        $record = $this->records()[$this->record_key($tab_id, $target_provenance, $identity)] ?? null;
        $candidate_hash = hash('sha256', $token);
        $accepted_hashes = is_array($record['tokenHashes'] ?? null) ? $record['tokenHashes'] : [];
        if (is_string($record['tokenHash'] ?? null)) array_unshift($accepted_hashes, (string) $record['tokenHash']);
        $accepted = is_array($record) && array_reduce(
            $accepted_hashes,
            static fn(bool $match, mixed $stored): bool => $match || (is_string($stored) && hash_equals($stored, $candidate_hash)),
            false,
        );
        if (!$accepted) {
            return $this->error('context_mismatch', 'The action belongs to an earlier page or tab context.', 409);
        }
        $client_identity = is_array($binding['contextIdentity'] ?? null) ? $binding['contextIdentity'] : [];
        if (!hash_equals($this->canonical($identity), $this->canonical($client_identity))) {
            return $this->error('context_mismatch', 'The supplied action identity differs from its server authority.', 409);
        }
        $object_kind = (string) ($identity['objectKind'] ?? '');
        $live_hints = [
            'screenId' => $identity['screenId'] ?? '',
            'base' => $identity['screenBase'] ?? '',
        ];
        if ($object_kind === 'post') {
            $live_hints['postType'] = $identity['objectType'] ?? '';
            $live_hints['postId'] = $identity['objectId'] ?? null;
        } elseif ($object_kind === 'term') {
            $live_hints['taxonomy'] = $identity['objectType'] ?? '';
            $live_hints['termId'] = $identity['objectId'] ?? null;
        }
        $live = $this->context->snapshot($live_hints);
        $live_identity = is_array($live['identity'] ?? null) ? $live['identity'] : [];
        foreach (['siteHash', 'userId', 'objectKind', 'objectType', 'objectId', 'contextRevision', 'contentFingerprint'] as $field) {
            if ((string) ($live_identity[$field] ?? '') !== (string) ($identity[$field] ?? '')) {
                return $this->error('context_mismatch', 'The WordPress object changed after this action was prepared.', 409);
            }
        }
        return $payload;
    }

    /** @return array<string, array<string, mixed>> */
    private function records(): array
    {
        $value = get_user_meta(get_current_user_id(), self::META, true);
        return is_array($value) ? $value : [];
    }

    private function secret(): string
    {
        return function_exists('wp_salt') ? wp_salt('auth') : (defined('AUTH_SALT') ? (string) AUTH_SALT : 'pixflow-context-authority');
    }

    /** @param array<string, mixed> $identity */
    private function record_key(string $tab_id, string $provenance, array $identity): string
    {
        $target = $provenance === 'explicit_user_target'
            ? ':' . (string) ($identity['objectKind'] ?? '') . ':' . (string) ($identity['objectType'] ?? '') . ':' . (string) ($identity['objectId'] ?? '')
            : ':active';
        return hash('sha256', $tab_id . ':' . $provenance . $target);
    }

    /** @param array<string, mixed> $payload */
    private function encode(array $payload): string
    {
        return rtrim(strtr(base64_encode((string) wp_json_encode($payload)), '+/', '-_'), '=');
    }

    /** @return array<string, mixed> */
    private function decode(string $encoded): array
    {
        $json = base64_decode(strtr($encoded, '-_', '+/'), true);
        $value = is_string($json) ? json_decode($json, true) : null;
        return is_array($value) ? $value : [];
    }

    /** @param array<string, mixed> $value */
    private function canonical(array $value): string
    {
        ksort($value);
        return (string) wp_json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }

    private function bounded(string $value, int $max): string
    {
        return substr(sanitize_text_field($value), 0, $max);
    }

    private function error(string $code, string $message, int $status): \WP_Error
    {
        return new \WP_Error($code, $message, ['status' => $status, 'retryable' => false]);
    }
}
