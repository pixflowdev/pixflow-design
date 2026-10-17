<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Resources {
    class ResourcePackManifestService {
        public function manifest(bool $refresh = false): array { throw new \RuntimeException('Unexpected catalogue network dependency'); }
        public function pack(string $slug, bool $refresh = false): ?array { throw new \RuntimeException('Unexpected new download'); }
    }
    class ResourcePackRepository {
        public array $records = [];
        public function installed(): array { return $this->records; }
        public function get(string $slug): ?array { return $this->records[$slug] ?? null; }
        public function operations(): array { return []; }
        public function active_operation_for_slug(string $slug): ?array { return null; }
    }
    class ResourcePackPathService {}
}
namespace PixflowDesign\WordPress\License { class LicenseService {} }
namespace {
    define('ABSPATH', __DIR__ . '/');
    define('PIXFLOW_DESIGN_PLUGIN_DIR', dirname(__DIR__) . '/');
    function sanitize_key(string $value): string { return preg_replace('/[^a-z0-9_-]/', '', strtolower($value)); }
    function check(bool $ok, string $message): void { if (!$ok) throw new \RuntimeException($message); }
    require __DIR__ . '/../src/Resources/ResourcePackInstallService.php';
    $repo = new \PixflowDesign\WordPress\Resources\ResourcePackRepository();
    $service = new \PixflowDesign\WordPress\Resources\ResourcePackInstallService(repository: $repo);
    check($service->catalog(true)['packs'] === [], 'Fresh Free/Pro requires no remote resources');
    foreach (['plugins', 'design-templates', 'design-systems', 'core-skills', 'unknown'] as $slug) {
        check($service->install($slug)['httpStatus'] === 410, 'Retired packs cannot be installed by stale UI or direct requests');
    }
    $repo->records = ['plugins' => ['version' => '1.1.4', 'status' => 'installed', 'path' => '/private/preserved', 'contentRoots' => ['plugins' => 'plugins'], 'customSetting' => 'keep']];
    $before = serialize($repo->records);
    $catalog = $service->catalog(true);
    check($catalog['packs'] === [], 'Retired packs disappear immediately, even while cleanup is pending');
    check($service->install('plugins')['httpStatus'] === 410, 'Old installed records cannot reinstall retired packs');
    check($service->repair('plugins')['httpStatus'] === 410, 'Retired packs cannot be repaired back into use');
    check(serialize($repo->records) === $before, 'Catalogue inspection preserves every saved setting');
    echo "Resource catalogue retirement: passed\n";
}
