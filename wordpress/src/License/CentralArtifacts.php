<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\License;

if (!defined('ABSPATH')) exit;

/** Hosted artifacts always require fresh signed installation proof and live server authorization. */
final class CentralArtifacts
{
    public function current(string $type, string $slug): array|\WP_Error
    {
        $catalog = $this->catalog();
        if (is_wp_error($catalog)) return $catalog;
        return self::select_current($catalog, $type, $slug);
    }

    public static function select_current(array $catalog, string $type, string $slug): array|\WP_Error
    {
        $matches = array_values(array_filter($catalog, static fn($entry): bool => is_array($entry)
            && ($entry['type'] ?? '') === $type && ($entry['slug'] ?? '') === $slug
            && ($entry['channel'] ?? '') === 'stable' && ($entry['current'] ?? false) === true));
        if (count($matches) !== 1 || empty($matches[0]['artifact_id']) || empty($matches[0]['version'])) {
            return new \WP_Error('artifact_release_unavailable', 'A unique current artifact release is required.');
        }
        return $matches[0];
    }

    public function catalog(): array|\WP_Error
    {
        $request = $this->request('artifacts', []);
        if (is_wp_error($request)) return $request;
        $response = wp_remote_post($request['url'], $request['args']);
        if (is_wp_error($response)) return $response;
        $status = wp_remote_retrieve_response_code($response);
        if ($status !== 200) return $this->failure($status);
        $body = json_decode(wp_remote_retrieve_body($response), true);
        if (!is_array($body) || ($body['ok'] ?? false) !== true || !is_array($body['artifacts'] ?? null)) return $this->failure(502);
        return $body['artifacts'];
    }

    public function download(string $artifact_id, string $type): string|\WP_Error
    {
        $catalog = $this->catalog();
        if (is_wp_error($catalog)) return $catalog;
        $artifact = null;
        foreach ($catalog as $entry) if (($entry['artifact_id'] ?? '') === $artifact_id && ($entry['type'] ?? '') === $type) $artifact = $entry;
        if ($artifact === null || !preg_match('/^[a-f0-9]{64}$/D', (string) ($artifact['sha256'] ?? ''))
            || !is_int($artifact['bytes'] ?? null) || $artifact['bytes'] <= 0
            || !preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]*\.zip$/D', (string) ($artifact['filename'] ?? ''))) return $this->failure(404);
        $request = $this->request('download', ['artifact_id' => $artifact_id]);
        if (is_wp_error($request)) return $request;
        // REST and CLI requests do not load WordPress's admin file helpers.
        if (!function_exists('wp_tempnam')) require_once ABSPATH . 'wp-admin/includes/file.php';
        $temporary = wp_tempnam($artifact['filename']);
        if (!$temporary) return $this->failure(500);
        $response = wp_remote_post($request['url'], array_merge($request['args'], [
            'timeout' => 300, 'stream' => true, 'filename' => $temporary,
            // WordPress otherwise sends Connection: close, which can truncate
            // the protected ZIP at the delivery edge. Keep the signed request
            // and all integrity checks; only this download uses persistent HTTP.
            'httpversion' => '1.1',
            'headers' => array_merge($request['args']['headers'], ['Connection' => 'keep-alive']),
            'limit_response_size' => $artifact['bytes'] + 1,
        ]));
        if (is_wp_error($response)) { @unlink($temporary); return $response; }
        $status = wp_remote_retrieve_response_code($response);
        $valid = $status === 200 && strtolower(trim(explode(';', wp_remote_retrieve_header($response, 'content-type'))[0])) === 'application/zip'
            && hash_equals($artifact['sha256'], (string) wp_remote_retrieve_header($response, 'x-pixflow-artifact-sha256'))
            && filesize($temporary) === $artifact['bytes'] && hash_equals($artifact['sha256'], (string) hash_file('sha256', $temporary));
        if (!$valid) { @unlink($temporary); return $this->failure($status === 200 ? 502 : $status); }
        return $temporary;
    }

    private function request(string $purpose, array $payload): array|\WP_Error
    {
        if (!CentralEntitlements::enabled()) return $this->failure(403);
        $state = get_option('pixflow_design_central_entitlements_v2', []);
        $installation = is_array($state) ? ($state['installation'] ?? []) : [];
        if (empty($installation['id']) || ($installation['authority'] ?? '') !== CentralEntitlements::authority()
            || ($installation['site_url'] ?? '') !== SiteIdentity::normalize_url(site_url('/'))) return $this->failure(403);
        $license = (new LicenseCache())->private_payload();
        if (!CentralEntitlements::validation_url_matches((string) ($license['validation_url'] ?? ''))
            || ($license['validation_url'] ?? '') !== (new LicenseService())->validation_url()) return $this->failure(403);
        $binding = hash('sha256', CentralEntitlements::authority() . '|' . $installation['site_url'] . '|' . ($license['license_key'] ?? ''));
        if (!hash_equals($installation['binding'] ?? '', $binding)) return $this->failure(403);
        $base = CentralEntitlements::delivery_origin() . '/api/licensing/v2';
        $challenge = (new LicenseHttpClient())->post_json($base . '/challenge', ['purpose' => $purpose, 'installation_id' => $installation['id']]);
        if (is_wp_error($challenge)) return $challenge;
        if (($challenge['status'] ?? 0) !== 200) return $this->failure((int) ($challenge['status'] ?? 502));
        try {
            $envelope = (new InstallationProof())->envelope($installation, $purpose, json_decode($challenge['body'], true, 32, JSON_THROW_ON_ERROR), array_merge($payload, ['installation_id' => $installation['id']]));
        } catch (\Throwable) { return $this->failure(502); }
        return ['url' => $base . '/' . $purpose, 'args' => ['timeout' => 25, 'redirection' => 0,
            'headers' => ['Content-Type' => 'application/json', 'Accept' => $purpose === 'download' ? 'application/zip' : 'application/json'],
            'body' => wp_json_encode($envelope)]];
    }

    private function failure(int $status): \WP_Error
    {
        // Artifact authorization is scoped to this request. A local identity
        // mismatch or an HTTP 401/403 does not establish licence revocation.
        // CentralEntitlements owns authoritative denial and signed-grant expiry.
        return new \WP_Error('protected_artifact_unavailable', 'The protected artifact could not be authorized or verified.', ['status' => $status]);
    }
}
