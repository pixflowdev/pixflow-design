<?php
declare(strict_types=1);

namespace PixflowDesign\WordPress\License {
    class CentralEntitlements { public static function delivery_origin(): string { return self::authority(); }
        public static function enabled(): bool { return true; }
        public static function authority(): string { return 'https://example.test'; }
        public static function validation_url_matches(string $url): bool { return $url === 'https://example.test/validate'; }
    }
    class SiteIdentity { public static function normalize_url(string $url): string { return $url; } }
    class LicenseCache { public function private_payload(): array { return ['license_key'=>'fixture','validation_url'=>'https://example.test/validate']; } }
    class LicenseService { public function validation_url(): string { return 'https://example.test/validate'; } }
    class LicenseHttpClient { public function post_json(string $url, array $body): array { return ['status'=>200,'body'=>'{}']; } }
    class InstallationProof { public function envelope(array $installation, string $purpose, array $challenge, array $payload): array { return []; } }
}

namespace {
    $root = sys_get_temp_dir() . '/pixflow-artifact-' . bin2hex(random_bytes(6));
    mkdir($root . '/wp-admin/includes', 0700, true);
    define('ABSPATH', $root . '/');
    file_put_contents($root . '/wp-admin/includes/file.php', '<?php function wp_tempnam($name) { return tempnam(ABSPATH, "download-"); }');
    class WP_Error { public function __construct(public string $code, public string $message, public mixed $data = null) {} }
    function is_wp_error(mixed $value): bool { return $value instanceof WP_Error; }
    function site_url(string $path): string { return 'https://local.test/'; }
    function get_option(string $name, mixed $default): array {
        return ['installation'=>['id'=>'fixture','authority'=>'https://example.test','site_url'=>'https://local.test/',
            'binding'=>hash('sha256', 'https://example.test|https://local.test/|fixture')]];
    }
    function wp_json_encode(mixed $value): string { return json_encode($value, JSON_THROW_ON_ERROR); }
    function wp_remote_post(string $url, array $args): array {
        $artifact = ['artifact_id'=>'fixture','type'=>'plugin','bytes'=>7,'sha256'=>hash('sha256','fixture'),'filename'=>'fixture.zip'];
        if (str_ends_with($url, '/artifacts')) return ['status'=>200,'body'=>json_encode(['ok'=>true,'artifacts'=>[$artifact]])];
        if (($args['httpversion'] ?? '') !== '1.1' || ($args['headers']['Connection'] ?? '') !== 'keep-alive')
            throw new RuntimeException('Protected downloads must use HTTP/1.1 without WordPress forcing Connection: close.');
        if (($args['headers']['Accept'] ?? '') !== 'application/zip' || ($args['headers']['Content-Type'] ?? '') !== 'application/json'
            || !isset($args['body']) || ($args['redirection'] ?? null) !== 0 || ($args['limit_response_size'] ?? null) !== 8)
            throw new RuntimeException('Download transport change lost signed-request or bounded-download settings.');
        $GLOBALS['download_files'][] = $args['filename'];
        $mode = $GLOBALS['download_mode'] ?? 'valid';
        file_put_contents($args['filename'], $mode === 'truncated' ? 'fixt' : ($mode === 'corrupt' ? 'changed' : 'fixture'));
        return ['status'=>200,'headers'=>['content-type'=>$mode === 'wrong_type' ? 'text/html' : 'application/zip',
            'x-pixflow-artifact-sha256'=>$mode === 'wrong_header' ? str_repeat('0', 64) : $artifact['sha256']]];
    }
    function wp_remote_retrieve_response_code(array $response): int { return $response['status']; }
    function wp_remote_retrieve_body(array $response): string { return $response['body']; }
    function wp_remote_retrieve_header(array $response, string $name): string { return $response['headers'][$name]; }
    require dirname(__DIR__) . '/src/License/CentralArtifacts.php';
    try {
        if (function_exists('wp_tempnam')) throw new RuntimeException('Test requires a non-admin bootstrap.');
        $download = (new \PixflowDesign\WordPress\License\CentralArtifacts())->download('fixture', 'plugin');
        if ($download instanceof WP_Error || !is_file($download) || file_get_contents($download) !== 'fixture') throw new RuntimeException('Download failed outside admin bootstrap.');
        unlink($download);
        foreach (['truncated', 'corrupt', 'wrong_type', 'wrong_header'] as $mode) {
            $GLOBALS['download_mode'] = $mode;
            $download = (new \PixflowDesign\WordPress\License\CentralArtifacts())->download('fixture', 'plugin');
            if (!$download instanceof WP_Error || file_exists(end($GLOBALS['download_files'])))
                throw new RuntimeException('Invalid download was accepted or retained: ' . $mode);
        }
        echo "Central artifact non-admin download, persistent transport and integrity checks passed\n";
    } finally {
        foreach ($GLOBALS['download_files'] ?? [] as $path) if (is_file($path)) unlink($path);
        unlink($root . '/wp-admin/includes/file.php');
        rmdir($root . '/wp-admin/includes'); rmdir($root . '/wp-admin'); rmdir($root);
    }
}
