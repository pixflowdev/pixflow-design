<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Diagnostics;

if (!defined('ABSPATH')) {
    exit;
}

/** Creates a bounded, one-time diagnostics ZIP without requiring the Bridge. */
final class DiagnosticsArchiveService
{
    private const TRANSIENT_PREFIX = 'pixflow_diag_download_';
    private const TICKET_TTL_SECONDS = 120;
    private const MAX_ATTACHMENT_BYTES = 1048576;
    private const MAX_ARCHIVE_BYTES = 26214400;
    private const MAX_DEPTH = 8;
    private const MAX_ITEMS = 256;

    public function __construct(
        private readonly DiagnosticsSnapshotService $snapshots = new DiagnosticsSnapshotService(),
    ) {
    }

    /** @return array<string, string>|\WP_Error */
    public function prepare(array $client = [], array $context = []): array|\WP_Error
    {
        try {
            $token = bin2hex(random_bytes(32));
        } catch (\Throwable) {
            return new \WP_Error('pixflow_diagnostics_ticket_failed', 'Pixflow could not create a secure diagnostics download ticket.');
        }

        $payload = [
            'userId' => get_current_user_id(),
            'createdAt' => gmdate('c'),
            'wordpress' => $this->snapshots->snapshot(),
            'client' => $this->bounded_attachment($client, 'client diagnostics'),
            'context' => $this->bounded_attachment($context, 'surface context'),
        ];
        if ($payload['client'] instanceof \WP_Error) return $payload['client'];
        if ($payload['context'] instanceof \WP_Error) return $payload['context'];

        if (!set_transient(self::TRANSIENT_PREFIX . $token, $payload, self::TICKET_TTL_SECONDS)) {
            return new \WP_Error('pixflow_diagnostics_ticket_store_failed', 'Pixflow could not store the diagnostics download ticket.');
        }

        return [
            'ticket' => $token,
            'filename' => $this->filename(),
            'expiresAt' => gmdate('c', time() + self::TICKET_TTL_SECONDS),
        ];
    }

    /** @return array{bytes: string, filename: string}|\WP_Error */
    public function consume(string $token): array|\WP_Error
    {
        $token = strtolower(trim($token));
        if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
            return new \WP_Error('pixflow_diagnostics_ticket_invalid', 'This diagnostics download ticket is invalid.');
        }

        $key = self::TRANSIENT_PREFIX . $token;
        $payload = get_transient($key);
        delete_transient($key);
        if (!is_array($payload) || (int) ($payload['userId'] ?? 0) !== get_current_user_id()) {
            return new \WP_Error('pixflow_diagnostics_ticket_expired', 'This diagnostics download has expired or was already downloaded. Export it again.');
        }

        $files = [
            'wordpress/environment.json' => $this->json($payload['wordpress'] ?? []),
            'browser/client-errors.json' => $this->json($payload['client'] ?? []),
            'browser/surface-context.json' => $this->json($payload['context'] ?? []),
        ];
        $manifest_files = [];
        foreach ($files as $name => $content) {
            $manifest_files[] = [
                'name' => $name,
                'bytes' => strlen($content),
                'sha256' => hash('sha256', $content),
            ];
        }
        $files = [
            'summary/manifest.json' => $this->json([
                'schema' => 'pixflow.diagnostics-manifest.v1',
                'app' => [
                    'name' => 'pixflow-design',
                    'version' => defined('PIXFLOW_DESIGN_VERSION') ? PIXFLOW_DESIGN_VERSION : 'unknown',
                ],
                'source' => 'pixflow-wordpress',
                'createdAt' => (string) ($payload['createdAt'] ?? gmdate('c')),
                'files' => $manifest_files,
                'bridgeEvidence' => 'optional-not-required',
                'privacy' => [
                    'postContentIncluded' => false,
                    'promptsIncluded' => false,
                    'credentialsIncluded' => false,
                    'mediaIncluded' => false,
                    'hostIdentityIncluded' => false,
                ],
            ]),
            ...$files,
        ];

        $bytes = $this->zip($files);
        if (strlen($bytes) === 0 || strlen($bytes) > self::MAX_ARCHIVE_BYTES) {
            return new \WP_Error('pixflow_diagnostics_archive_size', 'The diagnostics archive was empty or exceeded the 25 MiB limit.');
        }

        return ['bytes' => $bytes, 'filename' => $this->filename()];
    }

    private function bounded_attachment(array $value, string $label): array|\WP_Error
    {
        $safe = $this->redact($value);
        if (!is_array($safe) || strlen($this->json($safe)) > self::MAX_ATTACHMENT_BYTES) {
            return new \WP_Error('pixflow_diagnostics_attachment_size', ucfirst($label) . ' exceeded the 1 MiB diagnostics limit.');
        }
        return $safe;
    }

    private function redact(mixed $value, string $key = '', int $depth = 0): mixed
    {
        if ($depth >= self::MAX_DEPTH) return '[TRUNCATED]';
        if (preg_match('/(?:api[_-]?key|token|password|secret|authorization|cookie)/i', $key)) return '[REDACTED]';
        if (is_array($value)) {
            $result = [];
            $count = 0;
            foreach ($value as $child_key => $child) {
                if (++$count > self::MAX_ITEMS) break;
                $safe_key = is_string($child_key) ? sanitize_key($child_key) : $child_key;
                $result[$safe_key] = $this->redact($child, (string) $child_key, $depth + 1);
            }
            return $result;
        }
        if (is_bool($value) || is_int($value) || is_float($value) || $value === null) return $value;
        return substr(sanitize_textarea_field((string) $value), 0, 4000);
    }

    private function json(mixed $value): string
    {
        $json = wp_json_encode($value, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        return is_string($json) ? $json . "\n" : "{}\n";
    }

    /** @param array<string, string> $files */
    private function zip(array $files): string
    {
        $body = '';
        $directory = '';
        $offset = 0;
        $time = (int) current_time('timestamp', true);
        $dos_time = (($time % 60) >> 1) | ((int) gmdate('i', $time) << 5) | ((int) gmdate('H', $time) << 11);
        $dos_date = (int) gmdate('j', $time) | ((int) gmdate('n', $time) << 5) | (((int) gmdate('Y', $time) - 1980) << 9);

        foreach ($files as $name => $content) {
            $name = str_replace('\\', '/', ltrim($name, '/'));
            $size = strlen($content);
            $crc = crc32($content);
            $local = pack('VvvvvvVVVvv', 0x04034b50, 20, 0, 0, $dos_time, $dos_date, $crc, $size, $size, strlen($name), 0);
            $body .= $local . $name . $content;
            $directory .= pack('VvvvvvvVVVvvvvvVV', 0x02014b50, 20, 20, 0, 0, $dos_time, $dos_date, $crc, $size, $size, strlen($name), 0, 0, 0, 0, 0, $offset) . $name;
            $offset = strlen($body);
        }

        return $body . $directory . pack('VvvvvVVv', 0x06054b50, 0, 0, count($files), count($files), strlen($directory), strlen($body), 0);
    }

    private function filename(): string
    {
        return 'pixflow-design-diagnostics-' . gmdate('Y-m-d_H-i-s') . '.zip';
    }
}
