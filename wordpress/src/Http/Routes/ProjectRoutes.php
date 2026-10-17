<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Http\Routes;

use PixflowDesign\WordPress\Projects\ProjectService;
use PixflowDesign\WordPress\Projects\ProjectSyncToken;

if (!defined('ABSPATH')) {
    exit;
}

final class ProjectRoutes
{
    private const NAMESPACE = 'pixflow-design/v1';

    public function __construct(
        private readonly ProjectService $projects = new ProjectService(),
        private readonly ProjectSyncToken $sync_tokens = new ProjectSyncToken(),
    ) {
    }

    public function register(): void
    {
        register_rest_route(self::NAMESPACE, '/projects/(?P<uuid>[a-f0-9-]{36})/stored/(?P<file>.+)', [
            'methods' => 'GET',
            'callback' => [$this, 'download_stored_file'],
            'permission_callback' => [$this, 'can_use_projects'],
        ]);
        // Pixflow-owned: shared project sync endpoints back agency/team
        // workflows while the bridge remains the fast local execution layer.
        register_rest_route(self::NAMESPACE, '/projects', [
            [
                'methods' => 'GET',
                'callback' => [$this, 'list'],
                'permission_callback' => [$this, 'can_use_projects'],
            ],
            [
                'methods' => 'POST',
                'callback' => [$this, 'create'],
                'permission_callback' => [$this, 'can_use_projects'],
            ],
        ]);

        register_rest_route(self::NAMESPACE, '/projects/sync-token', [
            'methods' => 'POST',
            'callback' => [$this, 'sync_token'],
            'permission_callback' => [$this, 'can_issue_sync_token'],
        ]);

        register_rest_route(self::NAMESPACE, '/projects/(?P<uuid>[a-f0-9-]{36})', [
            [
                'methods' => 'GET',
                'callback' => [$this, 'detail'],
                'permission_callback' => [$this, 'can_use_projects'],
            ],
            [
                'methods' => 'DELETE',
                'callback' => [$this, 'archive'],
                'permission_callback' => [$this, 'can_use_projects'],
            ],
        ]);

        register_rest_route(self::NAMESPACE, '/projects/(?P<uuid>[a-f0-9-]{36})/versions', [
            'methods' => 'POST',
            'callback' => [$this, 'upload_version'],
            'permission_callback' => [$this, 'can_use_projects'],
        ]);

        register_rest_route(self::NAMESPACE, '/projects/(?P<uuid>[a-f0-9-]{36})/manifest', [
            'methods' => 'GET',
            'callback' => [$this, 'manifest'],
            'permission_callback' => [$this, 'can_use_projects'],
        ]);

        register_rest_route(self::NAMESPACE, '/projects/(?P<uuid>[a-f0-9-]{36})/lock', [
            [
                'methods' => 'GET',
                'callback' => [$this, 'lock_status'],
                'permission_callback' => [$this, 'can_use_projects'],
            ],
            [
                'methods' => 'POST',
                'callback' => [$this, 'acquire_lock'],
                'permission_callback' => [$this, 'can_use_projects'],
            ],
            [
                'methods' => 'DELETE',
                'callback' => [$this, 'release_lock'],
                'permission_callback' => [$this, 'can_use_projects'],
            ],
        ]);

        register_rest_route(self::NAMESPACE, '/projects/(?P<uuid>[a-f0-9-]{36})/versions/(?P<version>\d+)/download', [
            'methods' => 'GET',
            'callback' => [$this, 'download_version'],
            'permission_callback' => [$this, 'can_use_projects'],
        ]);

        register_rest_route(self::NAMESPACE, '/projects/(?P<uuid>[a-f0-9-]{36})/access', [
            [
                'methods' => 'POST',
                'callback' => [$this, 'grant_access'],
                'permission_callback' => [$this, 'can_use_projects'],
            ],
            [
                'methods' => 'DELETE',
                'callback' => [$this, 'revoke_access'],
                'permission_callback' => [$this, 'can_use_projects'],
            ],
        ]);
    }

    public function can_use_projects(?\WP_REST_Request $request = null): bool
    {
        if ($request !== null && !\PixflowDesign\WordPress\Modules\WorkspaceAccess::permits('projects', $request->get_method())) return false;
        return current_user_can('edit_posts') || $this->sync_tokens->authenticate();
    }

    public function can_issue_sync_token(): bool
    {
        return current_user_can('edit_posts');
    }

    public function sync_token(): \WP_REST_Response
    {
        return $this->response($this->sync_tokens->issue());
    }

    public function list(\WP_REST_Request $request): \WP_REST_Response
    {
        return $this->response($this->projects->list([
            'kind' => (string) $request->get_param('kind'),
            'status' => (string) $request->get_param('status'),
            'owner_user_id' => (int) $request->get_param('ownerUserId'),
            'limit' => (int) ($request->get_param('limit') ?: 30),
            'offset' => (int) $request->get_param('offset'),
        ]));
    }

    public function create(\WP_REST_Request $request): \WP_REST_Response
    {
        $body = $request->get_json_params();
        $body = is_array($body) ? $body : [];

        return $this->response($this->projects->create($body));
    }

    public function detail(\WP_REST_Request $request): \WP_REST_Response
    {
        return $this->response($this->projects->detail((string) $request->get_param('uuid')));
    }

    public function archive(\WP_REST_Request $request): \WP_REST_Response
    {
        return $this->response($this->projects->delete_project((string) $request->get_param('uuid')));
    }

    public function upload_version(\WP_REST_Request $request): \WP_REST_Response
    {
        $uuid = (string) $request->get_param('uuid');
        $prepared = $this->projects->prepare_version_paths(
            $uuid,
            $this->optional_int($request->get_param('versionNumber')),
            [
                // Pixflow-owned: conflict metadata lets shared project saves
                // warn when another user has uploaded a newer version.
                'expectedVersionNumber' => $this->optional_int($request->get_param('expectedVersionNumber')),
                'expectedFileHash' => (string) $request->get_param('expectedFileHash'),
                'lockSessionId' => (string) $request->get_param('lockSessionId'),
                'saveAsNewVersion' => $this->truthy($request->get_param('saveAsNewVersion')),
            ]
        );
        if (($prepared['ok'] ?? false) !== true) {
            return $this->response($prepared);
        }

        $files = $request->get_file_params();
        $archive = is_array($files['archive'] ?? null) ? $files['archive'] : null;
        if (!$archive || !$this->valid_uploaded_file($archive, 'zip', $this->max_project_archive_bytes())) {
            return $this->response([
                'ok' => false,
                'code' => 'invalid_archive',
                'message' => 'Upload a valid Pixflow project zip archive.',
                'status' => 400,
            ]);
        }

        $archive_path = (string) $prepared['archivePath'];
        $manifest_path = (string) $prepared['manifestPath'];
        $preview_path = '';

        try {
            $this->move_upload($archive, $archive_path);
            $this->write_manifest($request, $manifest_path);
        } catch (\Throwable $error) {
            $this->delete_if_exists($archive_path);
            $this->delete_if_exists($manifest_path);

            return $this->response([
                'ok' => false,
                'code' => 'upload_failed',
                'message' => 'Could not store the Pixflow project archive.',
                'status' => 500,
            ]);
        }

        $preview = is_array($files['preview'] ?? null) ? $files['preview'] : null;
        if ($preview && $this->valid_uploaded_file($preview, ['webp', 'jpg', 'jpeg', 'png'], 10 * MB_IN_BYTES)) {
            $preview_path = (string) $prepared['previewPath'];
            try {
                $this->move_upload($preview, $preview_path);
            } catch (\Throwable) {
                $preview_path = '';
            }
        }

        $result = $this->projects->record_version($uuid, [
            'version_number' => (int) $prepared['versionNumber'],
            'archive_path' => $archive_path,
            'manifest_path' => $manifest_path,
            'preview_path' => $preview_path,
            'file_hash' => hash_file('sha256', $archive_path) ?: '',
            'size_bytes' => filesize($archive_path) ?: 0,
            'summary' => sanitize_textarea_field((string) $request->get_param('summary')),
            'metadata' => $this->json_param($request, 'metadata'),
        ]);
        if (($result['ok'] ?? false) !== true) {
            // Pixflow-owned: never leave a failed shared-project upload staged
            // as if it were a valid version. The DB row is the commit point.
            $this->delete_if_exists($archive_path);
            $this->delete_if_exists($manifest_path);
            $this->delete_if_exists($preview_path);
        }

        return $this->response($result);
    }

    public function manifest(\WP_REST_Request $request): \WP_REST_Response
    {
        return $this->response($this->projects->manifest_for(
            (string) $request->get_param('uuid'),
            (int) $request->get_param('versionId')
        ));
    }

    public function lock_status(\WP_REST_Request $request): \WP_REST_Response
    {
        return $this->response($this->projects->lock_status((string) $request->get_param('uuid')));
    }

    public function acquire_lock(\WP_REST_Request $request): \WP_REST_Response
    {
        $body = $request->get_json_params();
        $body = is_array($body) ? $body : [];

        return $this->response($this->projects->acquire_lock((string) $request->get_param('uuid'), $body));
    }

    public function release_lock(\WP_REST_Request $request): \WP_REST_Response
    {
        $body = $request->get_json_params();
        $body = is_array($body) ? $body : [];

        return $this->response($this->projects->release_lock((string) $request->get_param('uuid'), $body));
    }

    public function download_version(\WP_REST_Request $request): void
    {
        $result = $this->projects->download_version(
            (string) $request->get_param('uuid'),
            (int) $request->get_param('version')
        );

        if (($result['ok'] ?? false) !== true) {
            $this->response($result)->send();
            exit;
        }

        $path = (string) $result['path'];
        nocache_headers();
        header('Content-Type: application/zip');
        header('X-Content-Type-Options: nosniff');
        header('Content-Security-Policy: sandbox');
        header('Referrer-Policy: no-referrer');
        header('Content-Length: ' . (string) ((int) $result['sizeBytes']));
        header('Content-Disposition: attachment; filename="' . sanitize_file_name((string) $result['filename']) . '"');
        readfile($path);
        exit;
    }

    public function download_stored_file(\WP_REST_Request $request): mixed
    {
        $result = $this->projects->stored_file((string) $request->get_param('uuid'), (string) $request->get_param('file'));
        if (($result['ok'] ?? false) !== true) return $this->response($result);
        nocache_headers();
        header('Cache-Control: private, no-store');
        header('Content-Security-Policy: sandbox');
        header('X-Content-Type-Options: nosniff');
        header('Referrer-Policy: no-referrer');
        // Active documents use the separately sandboxed workspace preview.
        $mime = match (strtolower(pathinfo($result['filename'], PATHINFO_EXTENSION))) {
            'png' => 'image/png', 'jpg', 'jpeg' => 'image/jpeg', 'webp' => 'image/webp',
            default => 'application/octet-stream',
        };
        header('Content-Type: ' . $mime);
        header('Content-Disposition: ' . ($mime === 'application/octet-stream' ? 'attachment' : 'inline') . '; filename="' . sanitize_file_name($result['filename']) . '"');
        header('Content-Length: ' . (string) $result['sizeBytes']);
        readfile($result['path']);
        exit;
    }

    public function grant_access(\WP_REST_Request $request): \WP_REST_Response
    {
        $body = $request->get_json_params();
        $body = is_array($body) ? $body : [];

        return $this->response($this->projects->grant_access(
            (string) $request->get_param('uuid'),
            (int) ($body['userId'] ?? $body['user_id'] ?? 0),
            (string) ($body['role'] ?? 'editor')
        ));
    }

    public function revoke_access(\WP_REST_Request $request): \WP_REST_Response
    {
        $body = $request->get_json_params();
        $body = is_array($body) ? $body : [];

        return $this->response($this->projects->revoke_access(
            (string) $request->get_param('uuid'),
            (int) ($body['userId'] ?? $body['user_id'] ?? $request->get_param('userId'))
        ));
    }

    private function response(array $payload): \WP_REST_Response
    {
        if (is_array($payload['project'] ?? null)) $payload['project'] = \PixflowDesign\WordPress\Od\ProjectAdapter::without_chat_backup($payload['project']);
        if (is_array($payload['projects'] ?? null)) $payload['projects'] = array_map([\PixflowDesign\WordPress\Od\ProjectAdapter::class, 'without_chat_backup'], $payload['projects']);
        return new \WP_REST_Response($payload, (int) ($payload['status'] ?? 200));
    }

    private function optional_int(mixed $value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }

        return max(1, (int) $value);
    }

    private function truthy(mixed $value): bool
    {
        if (is_bool($value)) {
            return $value;
        }

        return in_array(strtolower((string) $value), ['1', 'true', 'yes', 'on'], true);
    }

    private function json_param(\WP_REST_Request $request, string $key): array
    {
        $value = $request->get_param($key);
        if (is_array($value)) {
            return $value;
        }

        if (is_string($value) && trim($value) !== '') {
            $decoded = json_decode($value, true);
            return is_array($decoded) ? $decoded : [];
        }

        return [];
    }

    private function valid_uploaded_file(array $file, string|array $extensions, int $max_bytes = 0): bool
    {
        $extensions = (array) $extensions;
        $name = sanitize_file_name((string) ($file['name'] ?? ''));
        $tmp = (string) ($file['tmp_name'] ?? '');
        $error = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
        $extension = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        $size = (int) ($file['size'] ?? 0);

        return $error === UPLOAD_ERR_OK
            && $tmp !== ''
            && $size > 0
            && ($max_bytes <= 0 || $size <= $max_bytes)
            && in_array($extension, $extensions, true)
            && is_readable($tmp);
    }

    private function move_upload(array $file, string $destination): void
    {
        wp_mkdir_p(dirname($destination));
        $tmp = (string) ($file['tmp_name'] ?? '');
        $staged = $destination . '.tmp-' . wp_generate_uuid4();

        if (is_uploaded_file($tmp)) {
            $this->stage_native_upload($file, $staged);
        } elseif ($this->is_safe_upload_temp_path($tmp)) {
            // Pixflow-owned: REST sync tests and some hosts provide files from
            // PHP's temp directory without is_uploaded_file() metadata. Keep
            // the fallback constrained to temp files and stage atomically.
            if (!rename($tmp, $staged)) {
                throw new \RuntimeException('Could not stage the Pixflow project upload.');
            }
        } else {
            throw new \RuntimeException('Unsafe Pixflow project upload source.');
        }

        if (!rename($staged, $destination)) {
            @unlink($staged);
            throw new \RuntimeException('Could not commit the Pixflow project upload.');
        }
    }

    /** Native upload validation writes only to a private staged sibling, never the public media library. */
    private function stage_native_upload(array $file, string $staged): void
    {
        if (!function_exists('wp_handle_upload')) require_once ABSPATH . 'wp-admin/includes/file.php';
        $directory = realpath(dirname($staged));
        if ($directory === false) throw new \RuntimeException('The private project upload directory is unavailable.');
        if (file_exists($staged) || is_link($staged)) throw new \RuntimeException('The private project upload stage already exists.');
        $stageName = basename($staged);
        $privateUploads = static fn(array $uploads): array => [
            'path' => $directory, 'basedir' => $directory, 'subdir' => '',
            'url' => '', 'baseurl' => '', 'error' => false,
        ];
        $expectedStage = wp_normalize_path($directory . '/' . $stageName);
        $privateMove = static fn(mixed $pre, array $upload, string $target): mixed =>
            wp_normalize_path($target) === $expectedStage ? $pre : false;
        add_filter('upload_dir', $privateUploads, PHP_INT_MAX);
        add_filter('pre_move_uploaded_file', $privateMove, PHP_INT_MAX, 3);
        try {
            $result = wp_handle_upload($file, [
                // This authenticated REST route has no wp-admin form action.
                'test_form' => false,
                'mimes' => ['zip' => 'application/zip', 'webp' => 'image/webp', 'jpg|jpeg' => 'image/jpeg', 'png' => 'image/png'],
                'unique_filename_callback' => static fn(): string => $stageName,
            ]);
        } catch (\Throwable $error) {
            if (is_file($staged) && !is_link($staged)) wp_delete_file($staged);
            throw $error;
        } finally {
            remove_filter('upload_dir', $privateUploads, PHP_INT_MAX);
            remove_filter('pre_move_uploaded_file', $privateMove, PHP_INT_MAX);
        }
        // Other plugins may filter the upload result; accept only our exact
        // private stage. Never remove an unexpected path supplied by a filter.
        if (!is_array($result) || !empty($result['error']) || !is_string($result['file'] ?? null)
            || wp_normalize_path($result['file']) !== $expectedStage
            || !is_file($staged) || is_link($staged)) {
            if (is_file($staged) && !is_link($staged)) wp_delete_file($staged);
            throw new \RuntimeException('Could not stage the Pixflow project upload.');
        }
    }

    private function write_manifest(\WP_REST_Request $request, string $destination): void
    {
        $manifest = $request->get_param('manifest');
        if (is_string($manifest) && trim($manifest) !== '') {
            $decoded = json_decode($manifest, true);
            $manifest = is_array($decoded) ? $decoded : ['raw' => $manifest];
        }

        if (!is_array($manifest)) {
            $manifest = [
                'schema' => 1,
                'source' => 'pixflow-design',
                'createdAt' => gmdate('Y-m-d H:i:s'),
            ];
        }

        wp_mkdir_p(dirname($destination));
        file_put_contents($destination, wp_json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    }

    private function delete_if_exists(string $path): void
    {
        if ($path !== '' && is_file($path)) {
            unlink($path);
        }
    }

    private function max_project_archive_bytes(): int
    {
        // Pixflow-owned: keep shared project archives bounded by the site's
        // configured upload limit while allowing normal large generation runs.
        return max(1, (int) wp_max_upload_size());
    }

    private function is_safe_upload_temp_path(string $path): bool
    {
        if ($path === '' || !is_file($path) || !is_readable($path)) {
            return false;
        }

        $real_path = realpath($path);
        if ($real_path === false) {
            return false;
        }

        $temp_roots = array_filter([
            realpath(get_temp_dir()),
            realpath(sys_get_temp_dir()),
        ]);

        foreach ($temp_roots as $root) {
            $root = rtrim(wp_normalize_path((string) $root), '/');
            $candidate = wp_normalize_path($real_path);
            if ($candidate === $root || str_starts_with($candidate, $root . '/')) {
                return true;
            }
        }

        return false;
    }
}
