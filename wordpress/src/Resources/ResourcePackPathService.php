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

    public function base_dir(): string
    {
        return (new \PixflowDesign\WordPress\Storage\PrivateDirectory(
            'resource-packs', 'pixflow_design_private_resource_root', 'PIXFLOW_DESIGN_PRIVATE_RESOURCE_DIR'
        ))->directory();
    }

    public function base_url(): string
    {
        // Resources are delivered by authenticated, sandboxed registry routes.
        return '';
    }

    public static function register(): void
    {
        add_filter('rest_pre_dispatch', static function ($result, $server, $request) {
            if ($result !== null || !preg_match('~^/pixflow-design/v1/(?:resource-packs|od/(?:plugins|skills|design-templates|design-systems|prompt-templates|marketplaces))(?:/|$)~', $request->get_route())) return $result;
            // Skill readers enforce their own paths. A failed migration of old
            // design examples must not hide the self-contained Free catalogue.
            if (preg_match('~^/pixflow-design/v1/od/skills(?:/|$)~', $request->get_route())) return $result;
            if (preg_match('~^/pixflow-design/v1/od/plugins(?:$|/(?:od-default|web-clone)(?:/|$))~', $request->get_route())) return $result;
            try {
                (new self())->base_dir();
                BundledResources::prepare();
                delete_option('pixflow_design_private_resource_error');
                delete_transient(self::PREPARATION_RETRY);
            }
            catch (\Throwable) {
                update_option('pixflow_design_private_resource_error', true, false);
                return new \WP_Error('private_resources_unavailable', 'Private resources are unavailable. Ask the site administrator to check the Pixflow storage notice.', ['status'=>503]);
            }
            return $result;
        }, 10, 3);
        add_action('init', static function (): void {
            if (!BundledResources::needs_private_preparation()) {
                delete_option('pixflow_design_private_resource_error');
                delete_transient(self::PREPARATION_RETRY);
                return;
            }
            // An unwritable host cannot be repaired by retrying a migration on
            // every page/asset/REST request. Back off only automatic init work;
            // explicit resource operations still validate storage and fail closed.
            // A host configuration change retries immediately, without waiting.
            $context = hash('sha256', serialize([
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
                delete_option('pixflow_design_private_resource_error');
                delete_transient(self::PREPARATION_RETRY);
            } catch (\Throwable) {
                update_option('pixflow_design_private_resource_error', true, false);
                set_transient(self::PREPARATION_RETRY, ['context'=>$context, 'after'=>time() + 300], 300);
            }
        }, 1);
        add_action('admin_notices', static function (): void {
            if (!current_user_can('manage_options') || !get_option('pixflow_design_private_resource_error')) return;
            echo '<div class="notice notice-error"><p>' . esc_html('Some saved Pixflow resource files need attention from your hosting provider. Your files have been kept, and bundled AI guidance is still available. Ask your host to check Pixflow\'s private resource storage and prevent web access to any old uploads/pixflow-design/resource-packs folder.') . '</p></div>';
        });
    }

    /** Resolve old absolute database references without rewriting customer records. */
    public function resolve_record_path(string $path): string
    {
        $base = $this->base_dir();
        $legacy = $this->uploads_path(self::BASE_RELATIVE_DIR);
        $path = wp_normalize_path($path);
        foreach ([$legacy, $base] as $root) {
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
