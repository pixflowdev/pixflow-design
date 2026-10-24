<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Resources;

if (!defined('ABSPATH')) {
    exit;
}

final class ResourcePackPathService
{
    private const BASE_RELATIVE_DIR = 'pixflow-design/resource-packs';
    private const PREPARATION_RETRY = 'pixflow_design_private_resource_retry';
    private const DISMISS_UNTIL = 'pixflow_design_resource_notice_dismiss_until';

    /** Store only known diagnostic messages, never exception paths or credentials. */
    private static function record_failure(\Throwable $error): void
    {
        $known = [
            'Encrypted resource migration is continuing. Original files have been kept.' => 'Pixflow is securing saved resources in encrypted storage. Original files are retained until verification finishes; preparation will resume automatically.',
            'Resource changed after migration. Both copies have been kept.' => 'A resource changed during recovery. Pixflow has kept both copies rather than overwrite newer content.',
            'Verified resources are encrypted, but original cleanup is not permitted.' => 'Resources are safely copied to encrypted storage, but this server denied removal of the older files. The original folder still needs protection from web access.',
            'The resource encryption key is missing. Restore the matching database backup; encrypted files have been kept.' => 'The resource encryption key is missing from this database. Restore the matching database backup. Encrypted files have been kept.',
            'Could not create private storage.' => 'The web server cannot create the private resource directory outside the public website. Ask your host to provide a writable private directory using PIXFLOW_DESIGN_PRIVATE_RESOURCE_DIR.',
            'Could not lock private storage.' => 'The private resource directory exists, but the web server cannot acquire its migration lock. Ask your host to check its ownership and write permissions.',
            'Both legacy and private storage trees exist; migration needs host assistance.' => 'Both the old resource folder and the private destination contain files. Pixflow has not merged or overwritten either copy. Ask your host to reconcile them with a backup.',
            'Could not move legacy files to private storage.' => 'The web server could not move the old resource folder to private storage. Check directory permissions and whether the locations are on different filesystems.',
            'Configure private Pixflow storage outside the web root.' => 'Pixflow cannot identify a safe private location. Ask your host to configure PIXFLOW_DESIGN_PRIVATE_RESOURCE_DIR outside the public website.',
            'Private storage must be outside public directories.' => 'The configured private resource directory is inside a public website directory. Ask your host to configure a location outside the public website.',
            'This site moved. Configure and migrate its private storage directory before using this collection.' => 'The saved resource location belongs to a different site path. Ask your host to migrate and configure the private directory for this site.',
            'Linked private storage is not allowed.' => 'A resource path contains a symbolic link. Pixflow has left it untouched; ask your host to provide a direct private directory.',
            'Legacy resource migration needs host assistance.' => 'An older bundled resource folder conflicts with its preserved copy or contains a symbolic link. Both copies have been kept for review.',
        ];
        // Fixed product errors only: never disclose arbitrary exception paths.
        foreach ([
            'Resource encryption is unavailable.', 'Encrypted resource storage is not writable.',
            'The resource encryption key is invalid. Files have been kept.',
            'Linked encrypted storage is not allowed.', 'Invalid encrypted storage path.',
            'Invalid resource path.', 'Invalid resource name.', 'Resource index is invalid. Files have been kept.',
            'Resource exceeds the encrypted transfer limit. Original file has been kept.',
            'Linked resources cannot be migrated.', 'Resource source is unavailable.',
            'Unsafe resource source. Original files have been kept.', 'Cannot read resource source.',
            'Conflicting resource copies have been kept.', 'Resource changed during migration. Both copies have been kept.',
            'Another resource operation is in progress. Try again.', 'Resource lock unavailable.',
            'Could not commit resource index. Original files have been kept.',
            'Could not save resource recovery state.', 'Could not activate encrypted resources.',
            'Cannot lock encrypted storage.', 'Cannot stage encrypted resource.', 'Incomplete encrypted write.',
            'Cannot flush encrypted resource.', 'Cannot activate encrypted resource.', 'Resource encryption failed.',
            'Encrypted resource authentication failed. Files have been kept.',
        ] as $safe) $known[$safe] = $safe;
        update_option('pixflow_design_private_resource_error', true, false);
        update_option('pixflow_design_private_resource_diagnostic', [
            'reason' => $known[$error->getMessage()] ?? 'Resource preparation failed safely. Files have been retained. Ask your host to check private directory permissions and legacy resource paths.',
            'checkedAt' => gmdate('c'),
        ], false);
    }

    public function base_dir(): string
    {
        $encrypted = $this->encrypted_tree();
        if ($encrypted !== null) return \PixflowDesign\WordPress\Storage\EncryptedResourceReader::mount($encrypted);
        try { return (new \PixflowDesign\WordPress\Storage\PrivateDirectory(
            'resource-packs', 'pixflow_design_private_resource_root', 'PIXFLOW_DESIGN_PRIVATE_RESOURCE_DIR'
        ))->directory(); } catch (\RuntimeException $error) {
            // Invalid configuration, symlinks and conflicting trees must still fail closed.
            if ($error->getMessage() !== 'Could not create private storage.') throw $error;
            if (class_exists('PixflowDesign\\WordPress\\CreativeSkills\\SkillLibrary')
                && !method_exists('PixflowDesign\\WordPress\\CreativeSkills\\SkillLibrary', 'supports_encrypted_resources')) throw $error;
            $tree = \PixflowDesign\WordPress\Storage\EncryptedResourceMigration::prepare(
                $this->physical_uploads_path('pixflow-design/encrypted-resources-v1'), $this->migration_sources()
            );
            return \PixflowDesign\WordPress\Storage\EncryptedResourceReader::mount($tree);
        }
    }

    /** Only a completed migration may select this backend; never guess from a failure. */
    public function encrypted_tree(): ?\PixflowDesign\WordPress\Storage\EncryptedResourceTree
    {
        if (get_option('pixflow_design_resource_storage_backend', '') !== 'encrypted-v1') return null;
        return new \PixflowDesign\WordPress\Storage\EncryptedResourceTree($this->physical_uploads_path('pixflow-design/encrypted-resources-v1'));
    }

    private function migration_sources(): array
    {
        $sources = [$this->physical_uploads_path(self::BASE_RELATIVE_DIR) => ''];
        $package = realpath(PIXFLOW_DESIGN_PLUGIN_DIR);
        if ($package === false) throw new \RuntimeException('Plugin resource root is unavailable.');
        foreach (BundledResources::COLLECTIONS as $collection) {
            $sources[wp_normalize_path($package) . '/' . $collection] = '_legacy-bundled/' . hash('sha256', PIXFLOW_DESIGN_PLUGIN_DIR) . '/' . $collection;
        }
        return $sources;
    }

    public function recover_encrypted_migration(): void
    {
        $tree = $this->encrypted_tree();
        if ($tree === null) return;
        // Reconstruct trusted paths; never delete paths supplied by a saved receipt.
        $tree->locked(function () use ($tree): void {
        foreach ($this->migration_sources() as $source => $prefix) {
            if (is_dir($source) && !$tree->import($source, $prefix)['complete']) {
                throw new \RuntimeException('Encrypted resource migration is continuing. Original files have been kept.');
            }
            if (!\PixflowDesign\WordPress\Storage\EncryptedResourceMigration::retire($tree, $source, $prefix)) {
                throw new \RuntimeException('Encrypted resource migration is continuing. Original files have been kept.');
            }
        }
        }, 'recovery');
    }

    public function base_url(): string
    {
        // Resources are delivered by authenticated, sandboxed registry routes.
        return '';
    }

    public static function register(): void
    {
        add_filter('debug_information', static function (array $info): array {
            $fields = [];
            try {
                $paths = new self();
                $tree = $paths->encrypted_tree();
                $fields['backend'] = ['label'=>'Storage backend', 'value'=>$tree ? 'Encrypted resources (database key)' : 'Private filesystem'];
                if ($tree === null && get_option('pixflow_design_resource_encryption_key_v1', null) !== null) {
                    $tree = new \PixflowDesign\WordPress\Storage\EncryptedResourceTree($paths->physical_uploads_path('pixflow-design/encrypted-resources-v1'));
                    $fields['backend']['value'] = 'Preparing encrypted resources; originals retained';
                }
                if ($tree !== null) {
                    $entries = $tree->entries();
                    $fields['files'] = ['label'=>'Verified encrypted files', 'value'=>count($entries)];
                    $fields['bytes'] = ['label'=>'Preserved resource bytes', 'value'=>array_sum(array_column($entries, 'bytes'))];
                }
                $remaining = 0;
                foreach ($paths->migration_sources() as $source => $_prefix) if (file_exists($source) || is_link($source)) $remaining++;
                $fields['legacy'] = ['label'=>'Legacy folders awaiting recovery', 'value'=>$remaining];
                $fields['error'] = ['label'=>'Preparation requires attention', 'value'=>get_option('pixflow_design_private_resource_error') ? 'Yes' : 'No'];
                $diagnostic = get_option('pixflow_design_private_resource_diagnostic', []);
                if (get_option('pixflow_design_private_resource_error') && is_array($diagnostic)) {
                    $fields['reason'] = ['label'=>'Last preparation result', 'value'=>(string) ($diagnostic['reason'] ?? 'Not yet checked')];
                }
            } catch (\Throwable) {
                $fields['error'] = ['label'=>'Preparation requires attention', 'value'=>'Yes; files retained. Check the Pixflow storage notice.'];
            }
            $info['pixflow-resources'] = ['label'=>'Pixflow resource storage', 'fields'=>$fields];
            return $info;
        });
        add_action('admin_post_pixflow_dismiss_resource_notice', static function (): void {
            if (!current_user_can('manage_options')) wp_die('You are not allowed to dismiss this notice.', '', ['response' => 403]);
            check_admin_referer('pixflow_dismiss_resource_notice');
            update_user_meta(get_current_user_id(), self::DISMISS_UNTIL, time() + 28 * DAY_IN_SECONDS);
            wp_safe_redirect(wp_get_referer() ?: admin_url());
            exit;
        });
        add_filter('rest_pre_dispatch', static function ($result, $server, $request) {
            if ($result !== null || !preg_match('~^/pixflow-design/v1/(?:resource-packs|od/(?:plugins|skills|design-templates|design-systems|prompt-templates|marketplaces))(?:/|$)~', $request->get_route())) return $result;
            // Skill readers enforce their own paths. A failed migration of old
            // design examples must not hide the self-contained Free catalogue.
            if (preg_match('~^/pixflow-design/v1/od/skills(?:/|$)~', $request->get_route())) return $result;
            if (preg_match('~^/pixflow-design/v1/od/plugins(?:$|/(?:od-default|web-clone)(?:/|$))~', $request->get_route())) return $result;
            try {
                (new self())->base_dir();
                BundledResources::prepare();
                (new self())->recover_encrypted_migration();
                delete_option('pixflow_design_private_resource_error');
                delete_option('pixflow_design_private_resource_diagnostic');
                delete_transient(self::PREPARATION_RETRY);
            }
            catch (\Throwable $error) {
                self::record_failure($error);
                return new \WP_Error('private_resources_unavailable', 'Private resources are unavailable. Ask the site administrator to check the Pixflow storage notice.', ['status'=>503]);
            }
            return $result;
        }, 10, 3);
        add_action('init', static function (): void {
            if (!BundledResources::needs_private_preparation()) {
                delete_option('pixflow_design_private_resource_error');
                delete_option('pixflow_design_private_resource_diagnostic');
                delete_transient(self::PREPARATION_RETRY);
                return;
            }
            // An unwritable host cannot be repaired by retrying a migration on
            // every page/asset/REST request. Back off only automatic init work;
            // explicit resource operations still validate storage and fail closed.
            // A host configuration change retries immediately, without waiting.
            $context = hash('sha256', serialize([
                'resource-recovery-encrypted-v5',
                PIXFLOW_DESIGN_PLUGIN_DIR,
                defined('PIXFLOW_DESIGN_VERSION') ? PIXFLOW_DESIGN_VERSION : '',
                defined('PIXFLOW_DESIGN_PRIVATE_RESOURCE_DIR') ? PIXFLOW_DESIGN_PRIVATE_RESOURCE_DIR : '',
                get_option('pixflow_design_private_resource_root', ''),
                get_option('pixflow_design_private_resource_root_origin', ''),
                $_SERVER['DOCUMENT_ROOT'] ?? '',
            ]));
            $retry = get_transient(self::PREPARATION_RETRY);
            if (is_array($retry) && ($retry['context'] ?? '') === $context
                && is_int($retry['after'] ?? null) && $retry['after'] > time()
                && $retry['after'] <= time() + 300) return;
            try {
                (new self())->base_dir();
                BundledResources::prepare();
                (new self())->recover_encrypted_migration();
                delete_option('pixflow_design_private_resource_error');
                delete_option('pixflow_design_private_resource_diagnostic');
                delete_transient(self::PREPARATION_RETRY);
            } catch (\Throwable $error) {
                self::record_failure($error);
                // Productive batches should resume promptly; genuine host failures
                // retain the long backoff that prevents repeated slow admin loads.
                $delay = in_array($error->getMessage(), [
                    'Encrypted resource migration is continuing. Original files have been kept.',
                    'Another resource operation is in progress. Try again.',
                ], true) ? 5 : 300;
                set_transient(self::PREPARATION_RETRY, ['context'=>$context, 'after'=>time() + $delay], $delay);
            }
        }, 1);
        add_action('admin_notices', static function (): void {
            if (!current_user_can('manage_options') || !get_option('pixflow_design_private_resource_error')) return;
            $until = (int) get_user_meta(get_current_user_id(), self::DISMISS_UNTIL, true);
            if ($until > time() && $until <= time() + 28 * DAY_IN_SECONDS) return;
            $diagnostic = get_option('pixflow_design_private_resource_diagnostic', []);
            $reason = is_array($diagnostic) ? (string) ($diagnostic['reason'] ?? '') : '';
            echo '<div class="notice notice-error" style="position:relative;padding-right:38px"><p><strong>' . esc_html('Pixflow resource migration needs attention') . '</strong></p><p>' . esc_html($reason !== '' ? $reason : 'Private resource preparation has not completed. The next automatic attempt will record a specific diagnostic.') . '</p><p>' . esc_html('Your files have been kept, and bundled AI guidance remains available. Pixflow retries automatically after five minutes or when the storage configuration changes. Any old uploads/pixflow-design/resource-packs folder must remain protected from web access until migration completes.') . '</p>';
            echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '"><input type="hidden" name="action" value="pixflow_dismiss_resource_notice">';
            wp_nonce_field('pixflow_dismiss_resource_notice');
            echo '<button type="submit" class="notice-dismiss" title="' . esc_attr('Dismiss for 28 days') . '"><span class="screen-reader-text">' . esc_html('Dismiss for 28 days') . '</span></button></form></div>';
        });
    }

    /** Resolve old absolute database references without rewriting customer records. */
    public function resolve_record_path(string $path): string
    {
        $base = $this->base_dir();
        $legacy = $this->uploads_path(self::BASE_RELATIVE_DIR);
        $path = wp_normalize_path($path);
        $roots = [$legacy, $base];
        if ($this->encrypted_tree() !== null) $roots[] = $this->physical_uploads_path(self::BASE_RELATIVE_DIR);
        foreach ($roots as $root) {
            if (!str_starts_with($path, trailingslashit($root))) continue;
            $suffix = substr($path, strlen($root) + 1);
            if (preg_match('~[\x00-\x1f:]|(?:^|/)\.{1,2}(?:/|$)|//~', $suffix)) return '';
            $target = $base . '/' . $suffix;
            for ($current = $target; $current !== $base; $current = dirname($current)) {
                if (is_link($current) || dirname($current) === $current) return '';
            }
            return $target;
        }
        return '';
    }

    public function pack_version_dir(string $slug, string $version): string
    {
        return $this->base_dir() . '/' . $this->sanitize_slug($slug) . '/' . $this->sanitize_version($version);
    }

    public function staging_dir(string $slug, string $operation_id): string
    {
        return $this->base_dir() . '/_staging/' . $this->sanitize_slug($slug) . '-' . $this->sanitize_slug($operation_id);
    }

    public function pack_manifest_path(string $slug, string $version): string
    {
        return $this->pack_version_dir($slug, $version) . '/pixflow-pack.json';
    }

    public function ensure_base_dir(): void
    {
        wp_mkdir_p($this->base_dir());
    }

    public function remove_pack_version(string $slug, string $version): void
    {
        $target = wp_normalize_path($this->pack_version_dir($slug, $version));
        $base = trailingslashit(wp_normalize_path($this->base_dir()));

        if (!str_starts_with($target, $base) || !is_dir($target)) {
            return;
        }

        $this->remove_dir($target);
    }

    public function remove_staging(string $slug, string $operation_id): void
    {
        $target = wp_normalize_path($this->staging_dir($slug, $operation_id));
        $base = trailingslashit(wp_normalize_path($this->base_dir() . '/_staging'));

        if (!str_starts_with($target, $base) || !is_dir($target)) {
            return;
        }

        $this->remove_dir($target);
    }

    public function sanitize_slug(string $slug): string
    {
        return sanitize_key($slug);
    }

    public function sanitize_version(string $version): string
    {
        $version = preg_replace('/[^A-Za-z0-9._-]/', '-', $version);
        $version = is_string($version) ? trim($version, '.-_') : '';

        return $version !== '' ? $version : '0.0.0';
    }

    private function uploads_path(string $relative_path): string
    {
        $uploads = $this->uploads();

        return wp_normalize_path(trailingslashit((string) $uploads['basedir']) . $relative_path);
    }

    /** Hosting-managed aliases are resolved only at WordPress's configured root.
     * Every descendant still passes the encrypted store's no-links validation.
     */
    private function physical_uploads_path(string $relative): string
    {
        $uploads = $this->uploads();
        $root = realpath((string) $uploads['basedir']);
        if ($root === false || !is_dir($root)) throw new \RuntimeException('WordPress uploads storage is unavailable.');
        return wp_normalize_path($root) . '/' . $relative;
    }

    private function uploads(): array
    {
        $uploads = wp_upload_dir(null, false);
        if (!empty($uploads['error'])) {
            throw new \RuntimeException((string) $uploads['error']);
        }

        return $uploads;
    }

    private function remove_dir(string $dir): void
    {
        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::CHILD_FIRST
        );

        foreach ($iterator as $entry) {
            if (!$entry instanceof \SplFileInfo) {
                continue;
            }

            if ($entry->isDir()) {
                @rmdir($entry->getPathname());
            } else {
                @unlink($entry->getPathname());
            }
        }

        @rmdir($dir);
    }
}
