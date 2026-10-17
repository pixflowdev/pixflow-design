<?php
declare(strict_types=1);

namespace PixflowDesign\WordPress\License;

if (!defined('ABSPATH')) exit;

/** Public Free delivery carries no licence, installation proof or site identity. */
final class FreeArtifacts
{
    public function current(): array|\WP_Error
    {
        $response = wp_safe_remote_get(CentralEntitlements::delivery_origin() . '/api/plugins/v1/free/latest', [
            'timeout' => 10, 'redirection' => 0, 'limit_response_size' => 150000,
            'headers' => ['Accept' => 'application/json'],
        ]);
        if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) return $this->failure();
        $body = json_decode((string) wp_remote_retrieve_body($response), true);
        $a = is_array($body) ? ($body['artifact'] ?? null) : null;
        if (!is_array($body) || ($body['ok'] ?? null) !== true || ($body['schema_version'] ?? null) !== 1 || !is_array($a)
            || ($a['type'] ?? '') !== 'plugin' || ($a['slug'] ?? '') !== 'pixflow-design'
            || ($a['edition'] ?? '') !== 'free' || ($a['channel'] ?? '') !== 'stable'
            || !is_string($a['artifact_id'] ?? null) || !preg_match('/\A[a-z0-9][a-z0-9._-]{0,127}\z/D', $a['artifact_id'])
            || !is_string($a['version'] ?? null) || !preg_match('/\A\d+\.\d+\.\d+(?:\.\d+)?\z/D', $a['version'])
            || !is_string($a['sha256'] ?? null) || !preg_match('/\A[a-f0-9]{64}\z/D', $a['sha256'])
            || !is_int($a['bytes'] ?? null) || $a['bytes'] <= 0 || $a['bytes'] > 67108864
            || ($a['download_url'] ?? '') !== $this->url($a['artifact_id'])) return $this->failure();
        return $a;
    }

    public function download(string $package): string|\WP_Error
    {
        $artifact = $this->current();
        if (is_wp_error($artifact) || $package !== $artifact['download_url']) return $this->failure();
        if (!function_exists('wp_tempnam')) require_once ABSPATH . 'wp-admin/includes/file.php';
        $file = wp_tempnam('pixflow-design-free.zip');
        if (!$file) return $this->failure();
        $response = wp_safe_remote_get($package, [
            'timeout' => 300, 'redirection' => 0, 'stream' => true, 'filename' => $file,
            // Match protected ZIP transport: an explicit persistent connection
            // avoids delivery-edge truncation without relaxing verification.
            'httpversion' => '1.1',
            'limit_response_size' => $artifact['bytes'] + 1,
            'headers' => ['Accept' => 'application/zip', 'Connection' => 'keep-alive'],
        ]);
        $valid = !is_wp_error($response) && wp_remote_retrieve_response_code($response) === 200
            && strtolower(trim(explode(';', (string) wp_remote_retrieve_header($response, 'content-type'))[0])) === 'application/zip'
            && hash_equals($artifact['sha256'], (string) wp_remote_retrieve_header($response, 'x-pixflow-artifact-sha256'))
            && filesize($file) === $artifact['bytes'] && hash_equals($artifact['sha256'], (string) hash_file('sha256', $file));
        if (!$valid) { @unlink($file); return $this->failure(); }
        return $file;
    }

    private function url(string $id): string
    {
        return CentralEntitlements::delivery_origin() . '/api/plugins/v1/free/download/' . rawurlencode($id);
    }

    private function failure(): \WP_Error
    {
        return new \WP_Error('free_artifact_unavailable', 'The Free plugin update could not be retrieved or verified. Please check again.');
    }
}
