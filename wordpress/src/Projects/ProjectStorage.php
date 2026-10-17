<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Projects;

if (!defined('ABSPATH')) {
    exit;
}

final class ProjectStorage
{
    private const BASE_DIR = 'pixflow-design/projects';
    private const ROOT_OPTION = 'pixflow_design_private_project_root';
    private ?string $ready_root = null;

    /** Upgrade all projects, including ones nobody has opened since upgrading. */
    public static function register(): void
    {
        add_filter('rest_pre_dispatch', static function ($result, $server, $request) {
            if ($result !== null || !preg_match('~^/pixflow-design/v1/(?:od/)?projects(?:/|$)~', $request->get_route())) return $result;
            try { (new self())->base_dir(); }
            catch (\Throwable) {
                update_option('pixflow_design_private_storage_error', true, false);
                return new \WP_Error('private_project_storage_unavailable', 'Private project storage is unavailable. Ask the site administrator to check the Pixflow storage notice.', ['status' => 503]);
            }
            return $result;
        }, 10, 3);
        add_action('init', static function (): void {
            $uploads = wp_upload_dir(null, false);
            if (!file_exists($uploads['basedir'] . '/' . self::BASE_DIR) && !get_option('pixflow_design_private_storage_error')) return;
            try {
                (new self())->base_dir();
                delete_option('pixflow_design_private_storage_error');
            } catch (\Throwable) {
                update_option('pixflow_design_private_storage_error', true, false);
            }
        }, 1);
        add_action('admin_notices', static function (): void {
            if (!current_user_can('manage_options') || !get_option('pixflow_design_private_storage_error')) return;
            echo '<div class="notice notice-error"><p>' . esc_html(
                'Pixflow could not secure legacy project files. Project storage is unavailable; existing uploads may still be public. Ask your host to configure PIXFLOW_DESIGN_PRIVATE_PROJECT_DIR outside every served directory, move the existing projects there, and deny web access to uploads/pixflow-design/projects. Do not delete your project files.'
            ) . '</p></div>';
        });
    }

    public function project_dir(string $uuid): string
    {
        return $this->base_dir() . '/' . $this->safe_uuid($uuid);
    }

    public function project_url(string $uuid): string
    {
        return rest_url('pixflow-design/v1/projects/' . $this->safe_uuid($uuid) . '/stored');
    }

    /**
     * WordPress-backed projects keep the editable workspace below a dedicated
     * files directory. Keeping it separate from versions/assets means a
     * generated file can be replaced without mutating an archived version.
     */
    public function files_dir(string $uuid): string
    {
        return $this->project_dir($uuid) . '/files';
    }

    public function ensure_files_dir(string $uuid): string
    {
        $dir = $this->files_dir($uuid);
        $this->make_directory($dir);

        return $dir;
    }

    public function version_dir(string $uuid, int $version_number): string
    {
        return $this->project_dir($uuid) . '/versions/' . $this->version_folder($version_number);
    }

    public function version_url(string $uuid, int $version_number): string
    {
        return $this->project_url($uuid) . '/versions/' . $this->version_folder($version_number);
    }

    public function ensure_project_dirs(string $uuid): array
    {
        $dirs = [
            'project' => $this->project_dir($uuid),
            'versions' => $this->project_dir($uuid) . '/versions',
            'assets' => $this->project_dir($uuid) . '/assets',
            'files' => $this->files_dir($uuid),
        ];

        foreach ($dirs as $dir) {
            $this->make_directory($dir);
        }

        return $dirs;
    }

    public function ensure_version_dir(string $uuid, int $version_number): string
    {
        $dir = $this->version_dir($uuid, $version_number);
        $this->make_directory($dir);

        return $dir;
    }

    public function relative_upload_path(string $absolute_path): string
    {
        $base = $this->base_dir();
        $path = wp_normalize_path($absolute_path);

        if (!str_starts_with($path, trailingslashit($base))) {
            return '';
        }

        return self::BASE_DIR . '/' . ltrim(substr($path, strlen($base)), '/');
    }

    public function absolute_upload_path(string $relative_path): string
    {
        $relative = $this->logical_suffix($relative_path);
        $path = $this->base_dir() . '/' . $relative;
        $this->assert_no_links($path);
        return $path;
    }

    public function upload_url(string $relative_path): string
    {
        $parts = explode('/', $this->logical_suffix($relative_path));
        $uuid = array_shift($parts);
        return add_query_arg('_wpnonce', wp_create_nonce('wp_rest'),
            $this->project_url($uuid) . '/' . implode('/', array_map('rawurlencode', $parts)));
    }

    private function base_dir(): string
    {
        if ($this->ready_root === null) {
            require_once __DIR__ . '/../Storage/PrivateDirectory.php';
            $this->ready_root = (new \PixflowDesign\WordPress\Storage\PrivateDirectory(
                'projects', self::ROOT_OPTION, 'PIXFLOW_DESIGN_PRIVATE_PROJECT_DIR'
            ))->directory();
        }
        return $this->ready_root;
    }

    private function logical_suffix(string $path): string
    {
        $path = wp_normalize_path($path);
        if (!str_starts_with($path, self::BASE_DIR . '/') || preg_match('~[\x00-\x1f:]|(?:^|/)\.{1,2}(?:/|$)|//~', $path)) {
            throw new \InvalidArgumentException('Invalid project storage path.');
        }
        $suffix = substr($path, strlen(self::BASE_DIR) + 1);
        foreach (explode('/', $suffix) as $part) {
            if ($part === '' || rtrim($part, '. ') !== $part) throw new \InvalidArgumentException('Invalid project path segment.');
        }
        $this->safe_uuid(explode('/', $suffix)[0]);
        return $suffix;
    }

    private function within(string $path, string $root): bool
    {
        if (PHP_OS_FAMILY === 'Windows') { $path = strtolower($path); $root = strtolower($root); }
        return rtrim($path, '/') === rtrim($root, '/') || str_starts_with($path, rtrim($root, '/') . '/');
    }

    private function assert_no_links(string $path): void
    {
        do {
            if (is_link($path)) throw new \RuntimeException('Linked project storage is not allowed.');
            $parent = dirname($path);
            if ($parent === $path) break;
            $path = $parent;
        } while ($path !== '.' && $path !== '');
    }

    private function make_directory(string $path): void
    {
        $this->assert_no_links($path);
        if (!is_dir($path) && !wp_mkdir_p($path)) throw new \RuntimeException('Could not create private project storage.');
        @chmod($path, 0700);
    }

    private function safe_uuid(string $uuid): string
    {
        $uuid = strtolower(trim($uuid));

        if (!preg_match('/^[a-f0-9-]{36}$/', $uuid)) {
            throw new \InvalidArgumentException('Invalid Pixflow project UUID.');
        }

        return $uuid;
    }

    private function version_folder(int $version_number): string
    {
        return str_pad((string) max(1, $version_number), 6, '0', STR_PAD_LEFT);
    }
}
