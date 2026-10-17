<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Resources;

use PixflowDesign\WordPress\License\LicenseService;

if (!defined('ABSPATH')) {
    exit;
}

final class ResourcePackInstallService
{
    public function __construct(
        private readonly ResourcePackManifestService $manifest_service = new ResourcePackManifestService(),
        private readonly ResourcePackRepository $repository = new ResourcePackRepository(),
        private readonly ResourcePackPathService $paths = new ResourcePackPathService(),
        private readonly LicenseService $license_service = new LicenseService(),
    ) {
    }

    public function catalog(bool $refresh = false): array
    {
        $installed = $this->repository->installed();
        // The inherited download catalogue is retired. Local records remain
        // available for maintenance without a network request or option rewrite.
        $manifest = ['schemaVersion' => '1.0', 'product' => 'pixflow-design-resources', 'packs' => []];
        foreach ($installed as $slug => $record) {
            if (in_array($slug, ['plugins', 'design-templates', 'design-systems'], true)) continue;
            if (!is_array($record)) continue;
            $manifest['packs'][] = array_merge($record, [
                'slug' => (string) $slug,
                'name' => (string) ($record['name'] ?? $slug),
                'version' => (string) ($record['version'] ?? '0.0.0'),
                'optional' => true,
                'recommended' => false,
                'retired' => true,
            ]);
        }

        $packs = [];
        foreach ($manifest['packs'] as $pack) {
            $slug = (string) ($pack['slug'] ?? '');
            $record = is_array($installed[$slug] ?? null) ? $installed[$slug] : null;
            $packs[] = $pack + [
                'installed' => $record !== null && (string) ($record['status'] ?? '') === 'installed',
                'installedVersion' => is_array($record) ? (string) ($record['version'] ?? '') : '',
                'status' => is_array($record) ? (string) ($record['status'] ?? 'not-installed') : 'not-installed',
                'path' => is_array($record) ? (string) ($record['path'] ?? '') : '',
                'needsUpdate' => is_array($record) && $this->pack_needs_update($pack, $record),
                'compatibility' => $pack['compatibility'] ?? [],
                'operation' => $this->repository->active_operation_for_slug($slug),
            ];
        }

        return [
            'manifest' => $manifest,
            'packs' => $packs,
            'installed' => $installed,
            'operations' => $this->repository->operations(),
            'bridgeMirror' => [
                'required' => false,
                'canonicalOwner' => 'wordpress',
                'status' => 'optional',
                'message' => 'The bridge may mirror resource packs for Local CLI speed, but WordPress owns install/update/delete state and API/BYOK workflows do not require the bridge.',
            ],
            'migration' => [
                'legacyBundledResourcesDetected' => $this->legacy_bundled_resources_detected(),
                'preserves' => [
                    'projects',
                    'onboarding',
                    'design-system-settings',
                    'local-memory',
                    'bridge-site-folders',
                    'uploaded-user-assets',
                ],
            ],
        ];
    }

    public function install(string $slug, bool $refresh = false, ?string $action = null): array
    {
        if (in_array(sanitize_key($slug), ['plugins', 'design-templates', 'design-systems'], true)) {
            return ['ok' => false, 'status' => 'retired', 'httpStatus' => 410, 'message' => 'This resource catalogue has been retired.'];
        }
        $slug = sanitize_key($slug);
        $action = sanitize_key($action ?: ($refresh ? 'update' : 'install'));
        if ($this->repository->get($slug) === null) {
            return ['ok' => false, 'status' => 'retired', 'slug' => $slug, 'httpStatus' => 410,
                'message' => 'The Community resource catalogue has been retired. Existing resources are preserved.'];
        }
        $operation_id = $this->operation_id($slug, $action);
        if (!$this->begin_operation($operation_id, $slug, $action)) {
            return $this->operation_conflict($slug);
        }

        $pack = $this->manifest_service->pack($slug, $refresh);
        if ($pack === null) {
            return $this->operation_error($slug, $action, 'Pack is not listed in the current manifest.', $operation_id);
        }

        if (!$this->is_compatible($pack)) {
            return $this->operation_error($slug, $action, 'Pack is not compatible with this Pixflow Design plugin version.', $operation_id);
        }

        $central_protected = (!empty($pack['licenseRequired']) || in_array($slug, ['plugins', 'design-templates', 'design-systems'], true))
            && \PixflowDesign\WordPress\License\CentralEntitlements::enabled();
        if (($central_protected || !empty($pack['licenseRequired'])) && ($central_protected
            ? !(new \PixflowDesign\WordPress\License\CentralEntitlements())->allows('resources:install')
            : !$this->license_service->is_valid())) {
            return $this->operation_error($slug, $action, 'A valid Pixflow Design license is required to download this protected resource pack.', $operation_id);
        }

        $archive_url = (string) ($pack['archiveUrl'] ?? '');
        if ($archive_url === '' && !$central_protected) {
            return $this->operation_error($slug, $action, 'Pack archive is not available yet.', $operation_id);
        }

        $this->save_operation($operation_id, $slug, $action, 'downloading', 10, 'Downloading pack archive.');

        if ($central_protected) {
            $artifacts = new \PixflowDesign\WordPress\License\CentralArtifacts();
            $artifact = $artifacts->current('resource-pack', $slug);
            if (is_wp_error($artifact)) {
                $download = $artifact;
            } elseif (($artifact['version'] ?? '') !== ($pack['version'] ?? '')
                || (!empty($pack['artifact_id']) && $artifact['artifact_id'] !== $pack['artifact_id'])) {
                $download = new \WP_Error('protected_artifact_version_mismatch', 'Refresh resource metadata before installing this release.');
            } else {
                $download = $artifacts->download((string) $artifact['artifact_id'], 'resource-pack');
            }
        } else {
            $download = $this->download_archive($archive_url);
        }
        if (is_wp_error($download)) {
            return $this->operation_error($slug, $action, $download->get_error_message(), $operation_id);
        }

        $this->save_operation($operation_id, $slug, $action, 'validating', 35, 'Validating checksum.');
        $checksum = (string) ($pack['checksum'] ?? '');
        $checksum_required = !$central_protected || $checksum !== '';
        if ($checksum_required && !$this->verify_checksum($download, $checksum)) {
            @unlink($download);
            return $this->operation_error($slug, $action, 'Pack checksum did not match the manifest.', $operation_id);
        }

        $version = (string) ($pack['version'] ?? '0.0.0');
        $staging = $this->paths->staging_dir($slug, $operation_id);
        $target = $this->paths->pack_version_dir($slug, $version);

        $this->save_operation($operation_id, $slug, $action, 'extracting', 60, 'Extracting pack archive.');
        $this->paths->ensure_base_dir();
        $this->paths->remove_staging($slug, $operation_id);
        wp_mkdir_p($staging);

        $unzip = $this->unzip_archive($download, $staging);
        @unlink($download);
        if (is_wp_error($unzip)) {
            $this->paths->remove_staging($slug, $operation_id);
            return $this->operation_error($slug, $action, $unzip->get_error_message(), $operation_id);
        }

        $this->save_operation($operation_id, $slug, $action, 'activating', 85, 'Activating pack.');
        $pack_root = $this->resolve_pack_root($staging);
        $pack_manifest = $pack_root !== null ? $this->read_pack_manifest($pack_root) : null;
        if (!$this->pack_manifest_matches($pack_manifest, $pack)) {
            $this->paths->remove_staging($slug, $operation_id);
            return $this->operation_error($slug, $action, 'Pack manifest is missing or does not match the requested pack.', $operation_id);
        }

        $this->paths->remove_pack_version($slug, $version);
        wp_mkdir_p(dirname($target));
        @rename($pack_root, $target);
        if (!is_dir($target)) {
            $this->paths->remove_staging($slug, $operation_id);
            return $this->operation_error($slug, $action, 'Pack could not be activated.', $operation_id);
        }
        $this->paths->remove_staging($slug, $operation_id);

        $record = [
            'slug' => sanitize_key($slug),
            'type' => (string) ($pack['type'] ?? ''),
            'name' => (string) ($pack['name'] ?? $slug),
            'version' => $version,
            'revision' => (string) ($pack['revision'] ?? ''),
            'status' => 'installed',
            'checksum' => $checksum,
            'path' => wp_normalize_path($target),
            'manifest' => is_array($pack_manifest) ? $pack_manifest : [],
            'contentRoots' => is_array($pack_manifest['contentRoots'] ?? null) ? $pack_manifest['contentRoots'] : ($pack['contentRoots'] ?? []),
            'installedAt' => time(),
            'updatedAt' => time(),
        ];
        $this->repository->save_pack($slug, $record);
        $this->save_operation($operation_id, $slug, $action, 'complete', 100, $action === 'update' ? 'Pack updated.' : 'Pack installed.', ['pack' => $record]);
        $this->repository->release_lock($slug, $operation_id);

        return [
            'ok' => true,
            'operation' => $this->repository->operation($operation_id),
            'pack' => $record,
        ];
    }

    public function uninstall(string $slug): array
    {
        $slug = sanitize_key($slug);
        $operation_id = $this->operation_id($slug, 'delete');
        if (!$this->begin_operation($operation_id, $slug, 'delete')) {
            return $this->operation_conflict($slug);
        }

        $this->save_operation($operation_id, $slug, 'delete', 'deleting', 20, 'Deleting pack-owned files.');
        $record = $this->repository->get($slug);
        if ($record === null) {
            $this->save_operation($operation_id, $slug, 'delete', 'complete', 100, 'Pack was not installed.');
            $this->repository->release_lock($slug, $operation_id);

            return ['ok' => true, 'status' => 'not-installed', 'operation' => $this->repository->operation($operation_id)];
        }

        $version = (string) ($record['version'] ?? '');
        if ($version !== '') {
            $this->paths->remove_pack_version($slug, $version);
        }

        $this->repository->delete_pack($slug);
        $this->save_operation($operation_id, $slug, 'delete', 'complete', 100, 'Pack deleted.');
        $this->repository->release_lock($slug, $operation_id);

        return ['ok' => true, 'status' => 'deleted', 'slug' => sanitize_key($slug), 'operation' => $this->repository->operation($operation_id)];
    }

    public function repair(string $slug): array
    {
        if (in_array(sanitize_key($slug), ['plugins', 'design-templates', 'design-systems'], true)) {
            return ['ok' => false, 'status' => 'retired', 'httpStatus' => 410, 'message' => 'This resource catalogue has been retired.'];
        }
        $slug = sanitize_key($slug);
        $operation_id = $this->operation_id($slug, 'repair');
        if (!$this->begin_operation($operation_id, $slug, 'repair')) {
            return $this->operation_conflict($slug);
        }

        $this->save_operation($operation_id, $slug, 'repair', 'repairing', 25, 'Checking installed pack files.');
        $record = $this->repository->get($slug);
        if ($record === null) {
            return $this->operation_error($slug, 'repair', 'Pack is not installed.', $operation_id);
        }

        $path = (string) ($record['path'] ?? '');
        $manifest_ok = $path !== '' && is_readable($path . '/pixflow-pack.json');
        if ($manifest_ok) {
            $record['status'] = 'installed';
            $record['repairCheckedAt'] = time();
            $this->repository->save_pack($slug, $record);
            $this->save_operation($operation_id, $slug, 'repair', 'complete', 100, 'Pack files are healthy.', ['pack' => $record]);
            $this->repository->release_lock($slug, $operation_id);

            return ['ok' => true, 'status' => 'installed', 'pack' => $record, 'operation' => $this->repository->operation($operation_id)];
        }

        $record['status'] = 'repair-needed';
        $record['repairCheckedAt'] = time();
        $this->repository->save_pack($slug, $record);
        $this->save_operation($operation_id, $slug, 'repair', 'failed', 100, 'Pack manifest is missing. Reinstall or repair from the catalog.', ['pack' => $record]);
        $this->repository->release_lock($slug, $operation_id);

        return ['ok' => false, 'status' => 'repair-needed', 'pack' => $record, 'operation' => $this->repository->operation($operation_id), 'httpStatus' => 409];
    }

    public function operation_status(string $operation_id): array
    {
        $operation = $this->repository->operation($operation_id);

        return [
            'ok' => $operation !== null,
            'operation' => $operation,
        ];
    }

    private function download_archive(string $archive_url): string|\WP_Error
    {
        if (!function_exists('download_url')) {
            require_once ABSPATH . 'wp-admin/includes/file.php';
        }

        return download_url($archive_url, 300);
    }

    private function unzip_archive(string $archive_path, string $target): bool|\WP_Error
    {
        $validation = $this->validate_archive($archive_path);
        if (is_wp_error($validation)) return $validation;
        if (!function_exists('unzip_file')) {
            require_once ABSPATH . 'wp-admin/includes/file.php';
        }
        if (!function_exists('WP_Filesystem')) {
            require_once ABSPATH . 'wp-admin/includes/file.php';
        }

        WP_Filesystem();
        $result = unzip_file($archive_path, $target);

        return is_wp_error($result) ? $result : true;
    }

    private function verify_checksum(string $path, string $expected): bool
    {
        $expected = strtolower(trim(preg_replace('/^sha256:/i', '', $expected) ?? $expected));
        return preg_match('/^[a-f0-9]{64}$/D', $expected) === 1
            && hash_equals($expected, (string) hash_file('sha256', $path));
    }

    /** Validate the entire archive before any entry reaches public storage. */
    public function validate_archive(string $path): bool|\WP_Error
    {
        $error = static fn() => new \WP_Error('unsafe_resource_archive', 'The resource archive contains unsafe paths or files, or exceeds installation limits.');
        if (!class_exists(\ZipArchive::class)) return new \WP_Error('zip_required', 'PHP ZipArchive is required to validate resource packages safely.');
        $zip = new \ZipArchive();
        if ($zip->open($path) !== true) return $error();
        try {
            if ($zip->numFiles > 20000) return $error();
            $total = 0; $seen = [];
            for ($i = 0; $i < $zip->numFiles; $i++) {
                $stat = $zip->statIndex($i);
                if (!is_array($stat)) return $error();
                $name = str_replace('\\', '/', (string) $stat['name']);
                if ($name === '' || str_starts_with($name, '/') || preg_match('/[\x00-\x1f:]/', $name)) return $error();
                foreach (explode('/', rtrim($name, '/')) as $part) {
                    if ($part === '' || rtrim($part, '. ') !== $part
                        || in_array(strtolower($part), ['.htaccess', '.user.ini', 'web.config'], true)
                        || preg_match('/\.(?:php\d*|phtml|pht|phar|shtml?|cgi|fcgi|asp|aspx|ashx|asmx|jsp|jspx)(?:\.|$)/i', $part)) return $error();
                }
                $key = strtolower($name);
                if (isset($seen[$key])) return $error();
                $seen[$key] = true;
                $opsys = 0; $attrs = 0;
                if ($zip->getExternalAttributesIndex($i, $opsys, $attrs) && $opsys === 3) {
                    $type = ($attrs >> 16) & 0170000;
                    if (!in_array($type, [0, 0100000, 0040000], true)) return $error();
                }
                $total += (int) $stat['size'];
                if ($stat['size'] < 0 || $stat['size'] > 128 * 1024 * 1024 || $total > 512 * 1024 * 1024) return $error();
            }
            return true;
        } finally { $zip->close(); }
    }

    private function read_pack_manifest(string $dir): ?array
    {
        $path = $dir . '/pixflow-pack.json';
        if (!is_readable($path)) {
            $candidates = glob($dir . '/*/pixflow-pack.json');
            $path = is_array($candidates) && isset($candidates[0]) ? (string) $candidates[0] : $path;
        }

        if (!is_readable($path)) {
            return null;
        }

        $contents = (string) file_get_contents($path);
        $contents = preg_replace('/^\xEF\xBB\xBF/', '', $contents) ?? $contents;
        $json = json_decode($contents, true);

        return is_array($json) ? $json : null;
    }

    private function resolve_pack_root(string $staging): ?string
    {
        if (is_readable($staging . '/pixflow-pack.json')) {
            return $staging;
        }

        $candidates = glob($staging . '/*/pixflow-pack.json');
        if (is_array($candidates) && isset($candidates[0])) {
            return dirname((string) $candidates[0]);
        }

        return null;
    }

    private function pack_manifest_matches(?array $pack_manifest, array $pack): bool
    {
        if (!is_array($pack_manifest)) {
            return false;
        }

        $manifest_slug = sanitize_key((string) ($pack_manifest['slug'] ?? $pack_manifest['id'] ?? ''));
        $manifest_version = (string) ($pack_manifest['version'] ?? '');

        if ($manifest_slug !== (string) ($pack['slug'] ?? '') || $manifest_version !== (string) ($pack['version'] ?? '')) {
            return false;
        }

        $expected_revision = trim((string) ($pack['revision'] ?? ''));
        if ($expected_revision === '') {
            return true;
        }

        return hash_equals($expected_revision, trim((string) ($pack_manifest['revision'] ?? '')));
    }

    /**
     * Resource updates are content-owned, not plugin-release-owned.
     *
     * New manifests carry a stable content revision. Legacy installed records
     * fall back to their resource version so existing sites migrate without a
     * forced download when the first revision-aware plugin is installed.
     */
    private function pack_needs_update(array $pack, array $record): bool
    {
        $available_revision = trim((string) ($pack['revision'] ?? ''));
        $installed_revision = trim((string) ($record['revision'] ?? ($record['manifest']['revision'] ?? '')));
        if ($available_revision !== '' && $installed_revision !== '') {
            return !hash_equals($available_revision, $installed_revision);
        }

        return version_compare(
            (string) ($record['version'] ?? '0.0.0'),
            (string) ($pack['version'] ?? '0.0.0'),
            '<'
        );
    }

    private function is_compatible(array $pack): bool
    {
        $compatibility = is_array($pack['compatibility'] ?? null) ? $pack['compatibility'] : [];
        $plugin_version = defined('PIXFLOW_DESIGN_VERSION') ? PIXFLOW_DESIGN_VERSION : '0.0.0';
        $min = (string) ($compatibility['minPluginVersion'] ?? '');
        $max = (string) ($compatibility['maxPluginVersion'] ?? '');

        if ($min !== '' && version_compare($plugin_version, $min, '<')) {
            return false;
        }

        if ($max !== '' && version_compare($plugin_version, $max, '>')) {
            return false;
        }

        return true;
    }

    private function legacy_bundled_resources_detected(): bool
    {
        foreach (['skills', 'design-systems', 'design-templates', 'prompt-templates'] as $dir) {
            if (is_dir(PIXFLOW_DESIGN_PLUGIN_DIR . $dir)) {
                return true;
            }
        }

        return false;
    }

    private function operation_id(string $slug, string $action): string
    {
        return sanitize_key($action . '-' . $slug . '-' . wp_generate_uuid4());
    }

    private function begin_operation(string $operation_id, string $slug, string $action): bool
    {
        if (!$this->repository->acquire_lock($slug, $operation_id)) {
            return false;
        }

        $this->save_operation($operation_id, $slug, $action, 'queued', 0, 'Operation queued.');

        return true;
    }

    private function save_operation(string $operation_id, string $slug, string $action, string $status, int $progress, string $message, array $extra = []): void
    {
        $this->repository->save_operation($operation_id, $extra + [
            'id' => $operation_id,
            'slug' => sanitize_key($slug),
            'action' => sanitize_key($action),
            'status' => sanitize_key($status),
            'progress' => max(0, min(100, $progress)),
            'message' => sanitize_text_field($message),
            'updatedAt' => time(),
        ]);
    }

    private function operation_error(string $slug, string $action, string $message, ?string $operation_id = null): array
    {
        $operation_id = $operation_id ?: $this->operation_id($slug, $action);
        $this->save_operation($operation_id, $slug, $action, 'failed', 100, $message);
        $this->repository->release_lock($slug, $operation_id);

        return [
            'ok' => false,
            'operation' => $this->repository->operation($operation_id),
            'httpStatus' => 400,
            'error' => [
                'message' => $message,
            ],
        ];
    }

    private function operation_conflict(string $slug): array
    {
        $operation = $this->repository->active_operation_for_slug($slug);

        return [
            'ok' => false,
            'operation' => $operation,
            'httpStatus' => 423,
            'error' => [
                'message' => 'Another resource-pack operation is already running for this pack.',
            ],
        ];
    }
}
