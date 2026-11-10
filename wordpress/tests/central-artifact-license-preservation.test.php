<?php
declare(strict_types=1);

namespace PixflowDesign\WordPress\License {
    class CentralEntitlements {
        public static function enabled(): bool { return true; }
        public static function authority(): string { return 'https://authority.test'; }
        public static function delivery_origin(): string { return self::authority(); }
        public static function validation_url_matches(string $url): bool { return $url === self::authority() . '/validate'; }
        public function deny(string $code): void {
            $GLOBALS['state']['denied'] = true;
            $GLOBALS['state']['denial_code'] = $code;
            $GLOBALS['state']['tokens'] = [];
        }
    }
    class SiteIdentity { public static function normalize_url(string $url): string { return rtrim($url, '/'); } }
    class LicenseCache { public function private_payload(): array { return ['license_key'=>'synthetic', 'validation_url'=>CentralEntitlements::authority() . '/validate']; } }
    class LicenseService { public function validation_url(): string { return CentralEntitlements::authority() . '/validate'; } }
    class LicenseHttpClient { public function post_json(string $url, array $payload): array { return ['status'=>$GLOBALS['challenge_status'], 'body'=>'{}']; } }
    class InstallationProof { public function envelope(array $installation, string $purpose, array $challenge, array $payload): array { return []; } }
}
namespace {
    define('ABSPATH', __DIR__ . '/');
    class WP_Error { public function __construct(public string $code, public string $message, public mixed $data = null) {} }
    function is_wp_error(mixed $value): bool { return $value instanceof WP_Error; }
    function get_option(string $key, mixed $default = null): array { return $GLOBALS['state']; }
    function site_url(string $path): string { return $GLOBALS['site_url'] . $path; }
    function wp_json_encode(mixed $value): string { return json_encode($value, JSON_THROW_ON_ERROR); }
    function wp_remote_post(string $url, array $args): array { return ['status'=>$GLOBALS['catalog_status'], 'body'=>'{}']; }
    function wp_remote_retrieve_response_code(array $response): int { return $response['status']; }
    function wp_remote_retrieve_body(array $response): string { return $response['body']; }
    require dirname(__DIR__) . '/src/License/CentralArtifacts.php';
    $baseline = ['installation'=>['id'=>'synthetic', 'authority'=>'https://authority.test', 'site_url'=>'https://site.test',
        'binding'=>hash('sha256', 'https://authority.test|https://site.test|synthetic')],
        'tokens'=>['wordpress'=>'existing-signed-token'], 'denied'=>false, 'denial_code'=>'', 'epoch'=>4];
    foreach (['cli_site_mismatch', 'missing_installation', 'binding_mismatch', 'challenge_401', 'challenge_403', 'catalog_401', 'catalog_403', 'catalog_503', 'existing_revocation'] as $scenario) {
        $GLOBALS['state']=$baseline;
        $GLOBALS['site_url']='https://site.test';
        $GLOBALS['challenge_status']=200;
        $GLOBALS['catalog_status']=403;
        if ($scenario === 'cli_site_mismatch') $GLOBALS['site_url']='https://127.0.0.1';
        if ($scenario === 'missing_installation') unset($GLOBALS['state']['installation']);
        if ($scenario === 'binding_mismatch') $GLOBALS['state']['installation']['binding']='different';
        if (str_starts_with($scenario, 'challenge_')) $GLOBALS['challenge_status']=(int) substr($scenario, 10);
        if (str_starts_with($scenario, 'catalog_')) $GLOBALS['catalog_status']=(int) substr($scenario, 8);
        if ($scenario === 'existing_revocation') { $GLOBALS['state']['denied']=true; $GLOBALS['state']['denial_code']='license_revoked'; $GLOBALS['state']['tokens']=[]; }
        $before=$GLOBALS['state'];
        $result=(new \PixflowDesign\WordPress\License\CentralArtifacts())->catalog();
        if (!$result instanceof WP_Error) throw new RuntimeException($scenario . ': unauthorized artifact was accepted');
        if ($GLOBALS['state'] !== $before) throw new RuntimeException($scenario . ': artifact failure changed licence state');
    }
    echo "Artifact failures preserve licence state without granting artifact access (9 scenarios)\n";
}
