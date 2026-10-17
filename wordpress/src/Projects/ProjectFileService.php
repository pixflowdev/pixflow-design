<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Projects;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Small, permission-aware file adapter for WordPress-backed projects.
 *
 * The desktop daemon stores project files on disk. The embedded workspace has
 * the same contract, but its durable storage is outside the site's web root.
 * This service intentionally exposes only the project-relative files tree and
 * never accepts an arbitrary uploads path.
 */
final class ProjectFileService
{
    private const MAX_FILE_BYTES = 20 * 1024 * 1024;
    private const MAX_BATCH_FILES = 32;
    private const MAX_BATCH_BYTES = 40 * 1024 * 1024;

    public function __construct(
        private readonly ProjectRepository $projects = new ProjectRepository(),
        private readonly ProjectPermission $permissions = new ProjectPermission(),
        private readonly ProjectStorage $storage = new ProjectStorage(),
    ) {
    }

    public function list(string $uuid, bool $include_hashes = false): array|\WP_Error
    {
        $access = $this->project_access($uuid, false);
        if (is_wp_error($access)) return $access;
        $root = $this->storage->ensure_files_dir($uuid);
        $files = [];
        $folders = [];
        $this->walk($root, '', $files, $folders, $include_hashes);
        usort($files, static fn(array $a, array $b): int => strcmp($a['name'], $b['name']));
        usort($folders, static fn(array $a, array $b): int => strcmp($a['path'], $b['path']));

        return [
            'ok' => true,
            'files' => array_values($files),
            'folders' => array_values($folders),
        ];
    }

    public function folders(string $uuid): array|\WP_Error
    {
        $result = $this->list($uuid);
        if (is_wp_error($result)) return $result;

        return [
            'ok' => true,
            'folders' => $result['folders'] ?? [],
        ];
    }

    public function create_folder(string $uuid, string $name): array|\WP_Error
    {
        $access = $this->project_access($uuid, true);
        if (is_wp_error($access)) return $access;
        if (($error = $this->validate_write_name($name, true)) !== null) return $error;
        $relative = $this->safe_relative_path($name, true);
        if (is_wp_error($relative)) return $relative;
        $path = $this->safe_child_path($this->storage->ensure_files_dir($uuid), $relative);
        if ($path === null) return $this->error('invalid_project_path', 'Invalid project folder path.', 400);
        if (is_dir($path)) {
            return $this->folder_record($path, $relative);
        }
        if (!wp_mkdir_p($path)) {
            return $this->error('project_folder_create_failed', 'Could not create the project folder.', 500);
        }

        return $this->folder_record($path, $relative);
    }

    public function delete_folder(string $uuid, string $name): array|\WP_Error
    {
        $access = $this->project_access($uuid, true);
        if (is_wp_error($access)) return $access;
        $relative = $this->safe_relative_path($name, true);
        if (is_wp_error($relative)) return $relative;
        $root = $this->storage->ensure_files_dir($uuid);
        $path = $this->safe_child_path($root, $relative);
        if ($path === null) return $this->error('invalid_project_path', 'Invalid project folder path.', 400);
        if (!is_dir($path)) {
            return $this->error('project_folder_not_found', 'Project folder was not found.', 404);
        }
        if (!$this->remove_tree($path, $root)) {
            return $this->error('project_folder_delete_failed', 'Could not delete the project folder.', 500);
        }

        return ['ok' => true];
    }

    public function write(string $uuid, array $input, array $files = []): array|\WP_Error
    {
        $access = $this->project_access($uuid, true);
        if (is_wp_error($access)) return $access;
        $root = $this->storage->ensure_files_dir($uuid);
        $manifest = $input['artifactManifest'] ?? null;
        // Multipart form fields arrive as strings. Preserve the same
        // structured artifact metadata as the JSON file route when a bridge
        // sync sends a large binary with FormData.
        if (is_string($manifest) && $manifest !== '') {
            $decoded_manifest = json_decode($manifest, true);
            $manifest = is_array($decoded_manifest) ? $decoded_manifest : null;
        }
        $uploaded = $files['file'] ?? null;
        if (is_array($uploaded) && (string) ($uploaded['tmp_name'] ?? '') !== '') {
            $name = (string) ($input['name'] ?? $uploaded['name'] ?? '');
            $bytes = $this->read_upload($uploaded);
            if (is_wp_error($bytes)) return $bytes;
            return $this->commit($root, $name, $bytes, $manifest);
        }

        $name = (string) ($input['name'] ?? '');
        $content = $input['content'] ?? '';
        if (!is_string($content)) {
            return $this->error('invalid_project_file', 'Project file content must be text or base64.', 400);
        }
        if (($input['encoding'] ?? '') === 'base64') {
            $decoded = base64_decode($content, true);
            if ($decoded === false) {
                return $this->error('invalid_base64', 'Project file content is not valid base64.', 400);
            }
            $content = $decoded;
        }

        return $this->commit($root, $name, $content, $manifest);
    }

    public function write_batch(string $uuid, array $entries): array|\WP_Error
    {
        $access = $this->project_access($uuid, true);
        if (is_wp_error($access)) return $access;
        if (count($entries) > self::MAX_BATCH_FILES) {
            return $this->error('project_batch_too_large', 'Too many project files in one request.', 413);
        }
        $total_bytes = 0;
        foreach ($entries as $entry) {
            if (!is_array($entry)) continue;
            $content = $entry['content'] ?? '';
            if (!is_string($content)) {
                return $this->error('invalid_project_file', 'Project file content must be text or base64.', 400);
            }
            if (($entry['encoding'] ?? '') === 'base64') {
                $decoded = base64_decode($content, true);
                if ($decoded === false) {
                    return $this->error('invalid_base64', 'Project file content is not valid base64.', 400);
                }
                $total_bytes += strlen($decoded);
            } else {
                $total_bytes += strlen($content);
            }
            if ($total_bytes > self::MAX_BATCH_BYTES) {
                return $this->error('project_batch_too_large', 'Project file batch exceeds the size limit.', 413);
            }
        }
        $written = [];
        foreach ($entries as $entry) {
            if (!is_array($entry)) continue;
            $result = $this->write($uuid, $entry);
            if (is_wp_error($result)) return $result;
            $file = $result['file'] ?? null;
            if (is_array($file)) {
                $written[] = $file;
            }
        }

        return ['ok' => true, 'files' => $written];
    }

    public function read(string $uuid, string $name): array|\WP_Error
    {
        $access = $this->project_access($uuid, false);
        if (is_wp_error($access)) return $access;
        $relative = $this->safe_relative_path($name);
        if (is_wp_error($relative)) return $relative;
        $root = $this->storage->ensure_files_dir($uuid);
        $path = $this->safe_child_path($root, $relative);
        if ($path === null || !is_file($path) || !is_readable($path)) {
            return $this->error('project_file_not_found', 'Project file was not found.', 404);
        }
        $size = (int) filesize($path);
        if ($size > self::MAX_FILE_BYTES) {
            return $this->error('project_file_too_large', 'Project file exceeds the size limit.', 413);
        }

        return [
            'ok' => true,
            'path' => $path,
            'name' => $relative,
            'mime' => $this->mime($path),
            'size' => $size,
        ];
    }

    public function delete(string $uuid, string $name): array|\WP_Error
    {
        $access = $this->project_access($uuid, true);
        if (is_wp_error($access)) return $access;
        $relative = $this->safe_relative_path($name);
        if (is_wp_error($relative)) return $relative;
        $root = $this->storage->ensure_files_dir($uuid);
        $path = $this->safe_child_path($root, $relative);
        if ($path === null || !is_file($path)) {
            return $this->error('project_file_not_found', 'Project file was not found.', 404);
        }
        if (!unlink($path)) {
            return $this->error('project_file_delete_failed', 'Could not delete the project file.', 500);
        }

        return ['ok' => true];
    }

    public function rename(string $uuid, string $from, string $to): array|\WP_Error
    {
        $access = $this->project_access($uuid, true);
        if (is_wp_error($access)) return $access;
        if (($error = $this->validate_write_name($to)) !== null) return $error;
        $source = $this->safe_relative_path($from);
        $target = $this->safe_relative_path($to);
        if (is_wp_error($source)) return $source;
        if (is_wp_error($target)) return $target;
        $root = $this->storage->ensure_files_dir($uuid);
        $source_path = $this->safe_child_path($root, $source);
        $target_path = $this->safe_child_path($root, $target);
        if ($source_path === null || $target_path === null || !is_file($source_path)) {
            return $this->error('project_file_not_found', 'Project file was not found.', 404);
        }
        if (file_exists($target_path)) {
            return $this->error('project_file_exists', 'A project file already exists at the new path.', 409);
        }
        wp_mkdir_p(dirname($target_path));
        if (!rename($source_path, $target_path)) {
            return $this->error('project_file_rename_failed', 'Could not rename the project file.', 500);
        }

        $record = $this->file_record($target_path, $target);
        return ['ok' => true, 'file' => $record, 'oldName' => $source, 'newName' => $target];
    }

    private function project_access(string $uuid, bool $edit): array|\WP_Error
    {
        $project = $this->projects->find_by_uuid($uuid);
        if ($project === null) return $this->error('project_not_found', 'Pixflow project was not found.', 404);
        $allowed = $edit ? $this->permissions->can_edit($project) : $this->permissions->can_view($project);
        if (!$allowed) return $this->error('forbidden', 'You do not have permission to access this Pixflow project.', 403);

        return $project;
    }

    private function commit(string $root, string $name, string $bytes, mixed $manifest): array|\WP_Error
    {
        if (($error = $this->validate_write_name($name)) !== null) return $error;
        $relative = $this->safe_relative_path($name);
        if (is_wp_error($relative)) return $relative;
        if (strlen($bytes) > self::MAX_FILE_BYTES) {
            return $this->error('project_file_too_large', 'Project file exceeds the size limit.', 413);
        }
        $path = $this->safe_child_path($root, $relative);
        if ($path === null) return $this->error('invalid_project_file', 'Invalid project file path.', 400);
        wp_mkdir_p(dirname($path));
        $temporary = $path . '.tmp-' . (function_exists('wp_generate_uuid4') ? wp_generate_uuid4() : uniqid('', true));
        if (file_put_contents($temporary, $bytes, LOCK_EX) === false || !rename($temporary, $path)) {
            @unlink($temporary);
            return $this->error('project_file_write_failed', 'Could not save the project file.', 500);
        }

        return [
            'ok' => true,
            'file' => $this->file_record($path, $relative, $manifest),
        ];
    }

    private function walk(string $root, string $relative, array &$files, array &$folders, bool $include_hashes = false): void
    {
        $entries = @scandir($root);
        if (!is_array($entries)) return;
        foreach ($entries as $entry) {
            if ($entry === '.' || $entry === '..') continue;
            $path = $root . '/' . $entry;
            if (is_link($path)) continue;
            $child = $relative === '' ? $entry : $relative . '/' . $entry;
            if (is_dir($path)) {
                $folders[] = $this->folder_record($path, $child);
                $this->walk($path, $child, $files, $folders, $include_hashes);
            } elseif (is_file($path)) {
                $files[] = $this->file_record($path, $child, null, $include_hashes);
            }
        }
    }

    private function file_record(string $path, string $name, mixed $manifest = null, bool $include_hash = false): array
    {
        $record = [
            'name' => $name,
            'path' => $name,
            'type' => 'file',
            'size' => (int) filesize($path),
            'mtime' => (int) filemtime($path) * 1000,
            'kind' => $this->kind($path),
            'mime' => $this->mime($path),
        ];
        if ($include_hash) $record['sha256'] = hash_file('sha256', $path) ?: null;
        if (is_array($manifest)) $record['artifactManifest'] = $manifest;

        return $record;
    }

    private function folder_record(string $path, string $relative): array
    {
        return [
            'name' => basename($relative),
            'path' => $relative,
            'type' => 'dir',
            'size' => 0,
            'mtime' => (is_dir($path) ? (int) filemtime($path) : time()) * 1000,
        ];
    }

    private function read_upload(array $file): string|\WP_Error
    {
        if ((int) ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            return $this->error('invalid_upload', 'Project file upload failed.', 400);
        }
        $tmp = (string) ($file['tmp_name'] ?? '');
        $size = (int) ($file['size'] ?? 0);
        if ($tmp === '' || !is_readable($tmp) || $size <= 0 || $size > self::MAX_FILE_BYTES) {
            return $this->error('invalid_upload', 'Project file upload is empty or too large.', 413);
        }
        $bytes = file_get_contents($tmp);
        return is_string($bytes) ? $bytes : $this->error('invalid_upload', 'Could not read project file upload.', 400);
    }

    private function safe_relative_path(string $value, bool $directory = false): string|\WP_Error
    {
        $value = trim(str_replace('\\', '/', $value));
        if ($value === '' || str_starts_with($value, '/') || preg_match('#(^|/)\.\.?(/|$)#', $value)) {
            return $this->error('invalid_project_path', 'Project paths must stay inside the project files directory.', 400);
        }
        $parts = array_values(array_filter(explode('/', $value), static fn(string $part): bool => $part !== ''));
        if ($parts === []) return $this->error('invalid_project_path', 'Project path is required.', 400);
        $safe = [];
        foreach ($parts as $part) {
            $part = sanitize_file_name($part);
            if ($part === '' || $part === '.' || $part === '..') return $this->error('invalid_project_path', 'Project path contains an invalid name.', 400);
            $safe[] = substr($part, 0, 240);
        }
        $relative = implode('/', $safe);
        if (!$directory && strlen($relative) > 512) return $this->error('invalid_project_path', 'Project path is too long.', 400);

        return $relative;
    }

    /** Upload-backed workspaces are static artifacts, never server programs or configuration. */
    private function validate_write_name(string $name, bool $directory = false): ?\WP_Error
    {
        $parts = explode('/', str_replace('\\', '/', $name));
        foreach ($parts as $part) {
            if (str_starts_with(trim($part), '.') || str_contains($part, ':') || preg_match('/[\x00-\x1f]/', $part)
                || strtolower(trim($part)) === 'web.config'
                || preg_match('/\.(?:php\d*|phtml|pht|phar|shtml|shtm|cgi|fcgi|pl|py|rb|asp|aspx|ashx|asmx|jsp|jspx)(?:\.|$)/i', trim($part))) {
                return $this->error('unsafe_project_file', 'Server programs and server configuration cannot be stored in the WordPress workspace.', 400);
            }
        }
        $extension = strtolower(pathinfo(trim($name), PATHINFO_EXTENSION));
        if (!$directory && !in_array($extension, ['html', 'htm', 'css', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'json', 'map', 'md', 'txt', 'csv', 'xml', 'yaml', 'yml', 'svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'ico', 'mp4', 'webm', 'mov', 'mp3', 'wav', 'ogg', 'm4a', 'pdf', 'woff', 'woff2', 'ttf', 'otf', 'zip'], true)) {
            return $this->error('unsupported_project_file', 'This file type is not supported by the WordPress workspace.', 400);
        }
        return null;
    }

    private function safe_child_path(string $root, string $relative): ?string
    {
        $root = rtrim(wp_normalize_path($root), '/');
        $relative = wp_normalize_path($relative);
        if ($relative === '' || str_starts_with($relative, '/') || preg_match('#(^|/)\.\.?(/|$)|[\x00-\x1f:]#', $relative) || is_link($root)) return null;
        $path = $root;
        foreach (explode('/', $relative) as $part) {
            $path .= '/' . $part;
            if (is_link($path)) return null;
        }
        return $path;
    }

    private function remove_tree(string $path, string $root): bool
    {
        if ($path === $root || !str_starts_with(wp_normalize_path($path), rtrim(wp_normalize_path($root), '/') . '/')) return false;
        $entries = @scandir($path);
        if (is_array($entries)) foreach ($entries as $entry) {
            if ($entry === '.' || $entry === '..') continue;
            $child = $path . '/' . $entry;
            if (is_link($child) || is_file($child)) @unlink($child);
            elseif (is_dir($child)) $this->remove_tree($child, $root);
        }
        return @rmdir($path);
    }

    private function mime(string $path): string
    {
        $mime = function_exists('wp_check_filetype') ? (string) (wp_check_filetype($path)['type'] ?? '') : '';
        return $mime !== '' ? $mime : 'application/octet-stream';
    }

    private function kind(string $path): string
    {
        $mime = $this->mime($path);
        if (str_starts_with($mime, 'image/')) return 'image';
        if (str_starts_with($mime, 'video/')) return 'video';
        if (str_starts_with($mime, 'audio/')) return 'audio';
        if (in_array($mime, ['text/html', 'application/xhtml+xml'], true)) return 'html';
        if (str_starts_with($mime, 'text/')) return 'text';
        if (in_array($mime, ['application/pdf'], true)) return 'pdf';
        return 'binary';
    }

    private function error(string $code, string $message, int $status): \WP_Error
    {
        return new \WP_Error($code, $message, ['status' => $status]);
    }
}
